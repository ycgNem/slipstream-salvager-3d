// Floor decals (THREEJS-NOTES rule 5): flat quads 1 cm above the floor, depthWrite off, polygon
// offset, explicit renderOrder. The telegraph lanes are drawn by a shader on the sim's own pixel
// grid (1 texel = 1 sim px = 5 cm), so a lane looks exactly like the 2D one: two edge lines and a
// dither between them, dashed while it's still aiming, solid and flashing once locked. Enemy lanes
// are danger red, the player's Burn lane is speed teal, a gate warning is red chevrons.
import * as THREE from 'three';
import { C } from '../data/palette';
import { pal, wx, wz, modelYaw } from './units';
import { shadowTexture } from './textures';

const LANE_VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const LANE_FS = /* glsl */ `
precision highp float;
uniform float uLen;     // metres along the lane
uniform float uWidth;   // metres across
uniform float uMode;    // 0 enemy lane, 1 burn lane, 2 gate warning
uniform float uLocked;
uniform float uTime;
uniform vec3 uEdge;
uniform vec3 uFill;
uniform vec3 uHot;
varying vec2 vUv;
void main() {
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

export type LaneMode = 'enemy' | 'burn' | 'gate';

/** A lane on the floor from (x, y) along `angle`, in sim pixels. */
export class Lane {
  mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor(mode: LaneMode) {
    const colors = mode === 'burn' ? [C.speed3, C.speed1, C.speed4] : [C.danger3, C.danger1, C.dangerPink];
    this.mat = new THREE.ShaderMaterial({
      vertexShader: LANE_VS,
      fragmentShader: LANE_FS,
      uniforms: {
        uLen: { value: 1 },
        uWidth: { value: 1 },
        uMode: { value: mode === 'enemy' ? 0 : mode === 'burn' ? 1 : 2 },
        uLocked: { value: 0 },
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
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.name = `lane:${mode}`;
  }

  set(x: number, y: number, angle: number, lenPx: number, widthPx: number, locked: boolean, time: number) {
    const len = Math.max(0.05, wx(lenPx)), w = wx(widthPx);
    this.mesh.visible = lenPx > 1;
    this.mesh.position.set(wx(x), 0.012, wz(y));
    this.mesh.rotation.set(0, modelYaw(angle), 0);
    this.mesh.scale.set(len, 1, w);
    const u = this.mat.uniforms;
    u.uLen.value = len;
    u.uWidth.value = w;
    u.uLocked.value = locked ? 1 : 0;
    u.uTime.value = time;
  }

  hide() {
    this.mesh.visible = false;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.mesh.removeFromParent();
  }
}

/** Blob shadows: one shared texture and quad geometry. */
export class Shadows {
  private geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private mat: THREE.MeshBasicMaterial;
  constructor() {
    this.mat = new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, alphaTest: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, opacity: 1 });
  }
  make(diameter: number): THREE.Mesh {
    const m = new THREE.Mesh(this.geo, this.mat);
    m.scale.set(diameter, 1, diameter);
    m.position.y = 0.006;
    m.renderOrder = 1;
    m.name = 'shadow';
    return m;
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
