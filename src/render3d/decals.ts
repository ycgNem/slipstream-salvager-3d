// Floor decals (THREEJS-NOTES rule 5): flat quads 1 cm above the floor, depthWrite off, polygon
// offset, explicit renderOrder. The telegraph lanes are drawn by a shader on the sim's own pixel
// grid (1 texel = 1 sim px = 5 cm), so a lane looks exactly like the 2D one: two edge lines and a
// dither between them, dashed while it's still aiming, solid and flashing once locked. Enemy lanes
// are danger red, the player's Burn lane is speed teal, a gate warning is red chevrons, an open exit
// is gold chevrons pointing out through it (salvage gold: it's where the next part is).
import * as THREE from 'three';
import { C } from '../data/palette';
import { pal, wx, wz, modelYaw } from './units';

// every lane of a kind is one instance of one mesh (one draw call a pass, DECISIONS #35): its
// length, width and lock ride in a per-instance attribute
const LANE_VS = /* glsl */ `
attribute vec3 aLane;
varying vec2 vUv;
varying vec3 vLane;
void main() { vUv = uv; vLane = aLane; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`;

const LANE_FS = /* glsl */ `
precision highp float;
uniform float uMode;    // 0 enemy lane, 1 burn lane, 2 gate warning or exit
uniform float uTime;
uniform vec3 uEdge;
uniform vec3 uFill;
uniform vec3 uHot;
varying vec2 vUv;
varying vec3 vLane;     // metres along the lane, metres across, locked
void main() {
  float uLen = vLane.x, uWidth = vLane.y, uLocked = vLane.z;
  float px = 0.05;
  vec2 p = vec2(vUv.x * uLen, (vUv.y - 0.5) * uWidth);
  vec2 t = floor(p / px);
  float hw = floor(uWidth / px * 0.5);
  float ay = abs(t.y + 0.5);
  bool edge = ay >= hw - 1.0;
  bool cap = t.x >= floor(uLen / px) - 1.0;
  bool on = false;
  vec3 col = uFill;
  if (uMode < 0.5) {
    // the Rammer's lane
    float dash = mod(t.x - floor(uTime * 30.0), 8.0) < 5.0 ? 1.0 : 0.0;
    bool flash = uLocked > 0.5 && mod(floor(uTime * 12.0), 2.0) < 1.0;
    if (edge || cap) { on = uLocked > 0.5 || dash > 0.5; col = flash ? uHot : uEdge; }
    else {
      // the fill's dither is in screen pixels: on the 5 cm grid it moirés into bands past 4 m
      vec2 f = floor(gl_FragCoord.xy);
      bool dith = uLocked > 0.5 ? mod(f.x + f.y, 2.0) < 1.0 : (mod(f.x, 2.0) < 1.0 && mod(f.y, 2.0) < 1.0);
      // chevrons every 16 px pointing along the charge
      float cx = mod(t.x - ay, 16.0);
      bool chev = uLocked > 0.5 && cx < 2.0;
      on = dith || chev;
      col = chev ? (flash ? uHot : uEdge) : uFill;
    }
  } else if (uMode < 1.5) {
    // the player's Burn lane: teal, dashes streaming forward
    float dash = mod(t.x - floor(uTime * 60.0), 9.0) < 4.0 ? 1.0 : 0.0;
    if (edge) { on = dash > 0.5; col = uEdge; }
    else if (cap) { on = true; col = uEdge; }
    else {
      float cx = mod(t.x - ay - floor(uTime * 60.0), 18.0);
      vec2 f = floor(gl_FragCoord.xy);
      on = cx < 2.0 || (mod(f.x + f.y, 4.0) < 1.0 && mod(f.y, 2.0) < 1.0);
      col = cx < 2.0 ? uHot : uFill;
    }
  } else {
    // a gate warning: chevrons pointing into the Ring, flashing between two reds (never off, so a
    // glance always catches them)
    bool blink = mod(floor(uTime * 8.0), 2.0) < 1.0;
    float cx = mod(t.x - ay + floor(uTime * 20.0), 10.0);
    on = cx < 4.0;
    col = blink ? (cx < 2.0 ? uHot : uEdge) : uFill;
  }
  if (!on) discard;
  gl_FragColor = vec4(col, 1.0);
}`;

export type LaneMode = 'enemy' | 'burn' | 'gate' | 'exit';

/** Lanes of one kind on the floor, each from (x, y) along `angle` in sim pixels, all in one draw
 *  call: fill them each frame between begin() and end(). */
export class Lanes {
  mesh: THREE.InstancedMesh;
  private mat: THREE.ShaderMaterial;
  private data: THREE.InstancedBufferAttribute;
  private n = 0;
  private readonly dummy = new THREE.Object3D();

  constructor(mode: LaneMode, private max = 8) {
    const colors = mode === 'burn' ? [C.speed3, C.speed1, C.speed4] : mode === 'exit' ? [C.gold, C.gold0, C.gold3] : [C.danger3, C.danger1, C.dangerPink];
    this.mat = new THREE.ShaderMaterial({
      vertexShader: LANE_VS,
      fragmentShader: LANE_FS,
      uniforms: {
        uMode: { value: mode === 'enemy' ? 0 : mode === 'burn' ? 1 : 2 },
        uTime: { value: 0 },
        uEdge: { value: pal(colors[0]) },
        uFill: { value: pal(colors[1]) },
        uHot: { value: pal(colors[2]) },
      },
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    // a unit quad on the floor: x 0..1 along the lane, z -0.5..0.5 across
    const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0);
    this.data = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.data.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aLane', this.data);
    this.mesh = new THREE.InstancedMesh(g, this.mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.name = `lanes:${mode}`;
  }

  begin() {
    this.n = 0;
  }

  add(x: number, y: number, angle: number, lenPx: number, widthPx: number, locked: boolean) {
    if (this.n >= this.max || lenPx <= 1) return;
    const len = Math.max(0.05, wx(lenPx)), w = wx(widthPx);
    const d = this.dummy;
    d.position.set(wx(x), 0.012, wz(y));
    d.rotation.set(0, modelYaw(angle), 0);
    d.scale.set(len, 1, w);
    d.updateMatrix();
    this.mesh.setMatrixAt(this.n, d.matrix);
    this.data.setXYZ(this.n, len, w, locked ? 1 : 0);
    this.n++;
  }

  end(time: number) {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.data.needsUpdate = true;
    this.mat.uniforms.uTime.value = time;
  }

  /** One lane, or none (the Burn lane). */
  set(x: number, y: number, angle: number, lenPx: number, widthPx: number, locked: boolean, time: number) {
    this.begin();
    this.add(x, y, angle, lenPx, widthPx, locked);
    this.end(time);
  }

  hide() {
    this.begin();
    this.end(0);
  }
}

/** Skid marks: a ring buffer of small dark quads on the floor. */
export class SkidMarks {
  mesh: THREE.InstancedMesh;
  private next = 0;
  private dummy = new THREE.Object3D();
  constructor(private max = 400) {
    const g = new THREE.PlaneGeometry(0.1, 0.07).rotateX(-Math.PI / 2);
    const m = new THREE.MeshBasicMaterial({ color: pal(C.ink), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    this.mesh = new THREE.InstancedMesh(g, m, max);
    this.mesh.count = 0;
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'skids';
  }
  add(x: number, y: number, angle: number) {
    this.dummy.position.set(wx(x), 0.004, wz(y));
    this.dummy.rotation.set(0, modelYaw(angle), 0);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(this.next, this.dummy.matrix);
    this.next = (this.next + 1) % this.max;
    this.mesh.count = Math.min(this.max, this.mesh.count + 1);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() {
    this.mesh.count = 0;
    this.next = 0;
  }
}
