// Particles: sparks, dust, steam, smoke, gold salvage bursts, steel debris dots and the booster
// plume, as one THREE.Points of square points (at 640x360 a square point is a pixel square, so they
// stay pixel art). Colors step through palette ramps over each particle's life; no alpha, no blur
// (STYLE: sparks are white, frost and orange, never gold; gold means salvage).
import * as THREE from 'three';
import { C } from '../data/palette';
import { pal } from './units';

export type Kind = 'spark' | 'dust' | 'steam' | 'smoke' | 'gold' | 'steel' | 'plume' | 'shard' | 'teal' | 'mote';

interface KindDef {
  ramp: number[];
  life: [number, number];
  size: [number, number];
  grow: number;
  gravity: number;
  drag: number;
  bounce: boolean;
}

const KINDS: Record<Kind, KindDef> = {
  spark: { ramp: [C.white, C.frost, C.peach, C.orange, C.rust1], life: [0.18, 0.4], size: [0.035, 0.05], grow: 0, gravity: 9, drag: 2, bounce: true },
  dust: { ramp: [C.taupe, C.dusk, C.mauve, C.slate], life: [0.35, 0.6], size: [0.09, 0.14], grow: 0.15, gravity: -0.4, drag: 4, bounce: false },
  steam: { ramp: [C.white, C.frost, C.mist, C.lilac], life: [0.5, 0.9], size: [0.1, 0.16], grow: 0.25, gravity: -1.2, drag: 3, bounce: false },
  smoke: { ramp: [C.slate, C.mauve, C.plum, C.ink], life: [0.7, 1.2], size: [0.14, 0.22], grow: 0.3, gravity: -0.8, drag: 2.5, bounce: false },
  gold: { ramp: [C.white, C.gold3, C.gold, C.gold2, C.gold0], life: [0.45, 0.85], size: [0.045, 0.07], grow: 0, gravity: 7, drag: 1.5, bounce: true },
  steel: { ramp: [C.steel2, C.steel1, C.violet, C.steel0], life: [0.5, 0.9], size: [0.05, 0.08], grow: 0, gravity: 8, drag: 1, bounce: true },
  plume: { ramp: [C.white, C.gold3, C.orange, C.rust1, C.slate], life: [0.08, 0.16], size: [0.06, 0.1], grow: -0.2, gravity: -1, drag: 6, bounce: false },
  shard: { ramp: [C.gold3, C.gold, C.mist, C.lilac], life: [0.5, 0.9], size: [0.04, 0.06], grow: 0, gravity: 8, drag: 1, bounce: true },
  teal: { ramp: [C.speed4, C.speed3, C.speed2, C.speed1], life: [0.15, 0.3], size: [0.012, 0.02], grow: 0, gravity: 0, drag: 3, bounce: false },
  mote: { ramp: [C.mist, C.lilac, C.mauve], life: [0.2, 0.4], size: [0.01, 0.016], grow: 0, gravity: 0, drag: 3, bounce: false },
};

const VS = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
uniform float uScale;
varying vec3 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(floor(aSize * uScale / max(0.05, -mv.z) + 0.5), 1.0, 7.0);
}`;

const FS = /* glsl */ `
precision highp float;
varying vec3 vColor;
void main() { gl_FragColor = vec4(vColor, 1.0); }`;

export class Particles {
  points: THREE.Points;
  private max: number;
  private n = 0;
  private pos: Float32Array;
  private vel: Float32Array;
  private age: Float32Array;
  private life: Float32Array;
  private size0: Float32Array;
  private kind: Uint8Array;
  private aPos: THREE.BufferAttribute;
  private aCol: THREE.BufferAttribute;
  private aSize: THREE.BufferAttribute;
  private kinds = Object.keys(KINDS) as Kind[];
  private ramps: THREE.Color[][];
  private mat: THREE.ShaderMaterial;
  private seed = 99;

  constructor(max = 1500) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.age = new Float32Array(max);
    this.life = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.kind = new Uint8Array(max);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('aColor', this.aCol);
    g.setAttribute('aSize', this.aSize);
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: { uScale: { value: 300 } } });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.name = 'particles';
    // point size follows whichever camera and target is drawing
    this.points.onBeforeRender = (renderer, _s, camera) => {
      const cam = camera as THREE.PerspectiveCamera;
      const h = renderer.getRenderTarget()?.height ?? 360;
      this.mat.uniforms.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    };
    this.ramps = this.kinds.map((k) => KINDS[k].ramp.map((c) => pal(c)));
  }

  private rnd() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  /** Emit `count` particles at a world point with a velocity (m/s) plus a random spread. */
  emit(kind: Kind, x: number, y: number, z: number, count: number, vx = 0, vy = 0, vz = 0, spread = 1) {
    const d = KINDS[kind];
    const ki = this.kinds.indexOf(kind);
    for (let c = 0; c < count; c++) {
      if (this.n >= this.max) return;
      const i = this.n++;
      this.pos[i * 3] = x;
      this.pos[i * 3 + 1] = y;
      this.pos[i * 3 + 2] = z;
      // a random direction in a sphere
      const u = this.rnd() * 2 - 1, th = this.rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u), s = spread * (0.3 + this.rnd() * 0.7);
      this.vel[i * 3] = vx + Math.cos(th) * r * s;
      this.vel[i * 3 + 1] = vy + u * s;
      this.vel[i * 3 + 2] = vz + Math.sin(th) * r * s;
      this.age[i] = 0;
      this.life[i] = d.life[0] + this.rnd() * (d.life[1] - d.life[0]);
      this.size0[i] = d.size[0] + this.rnd() * (d.size[1] - d.size[0]);
      this.kind[i] = ki;
    }
  }

  update(dt: number) {
    let i = 0;
    while (i < this.n) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        // swap-remove
        const j = --this.n;
        if (i !== j) {
          for (let k = 0; k < 3; k++) {
            this.pos[i * 3 + k] = this.pos[j * 3 + k];
            this.vel[i * 3 + k] = this.vel[j * 3 + k];
          }
          this.age[i] = this.age[j];
          this.life[i] = this.life[j];
          this.size0[i] = this.size0[j];
          this.kind[i] = this.kind[j];
        }
        continue;
      }
      const d = KINDS[this.kinds[this.kind[i]]];
      const damp = Math.exp(-d.drag * dt);
      this.vel[i * 3] *= damp;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * damp - d.gravity * dt;
      this.vel[i * 3 + 2] *= damp;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.01) {
        this.pos[i * 3 + 1] = 0.01;
        if (d.bounce) {
          this.vel[i * 3 + 1] *= -0.35;
          this.vel[i * 3] *= 0.6;
          this.vel[i * 3 + 2] *= 0.6;
        } else this.vel[i * 3 + 1] = 0;
      }
      i++;
    }
    // upload
    const P = this.aPos.array as Float32Array, Cc = this.aCol.array as Float32Array, S = this.aSize.array as Float32Array;
    for (let k = 0; k < this.n; k++) {
      const d = KINDS[this.kinds[this.kind[k]]];
      const f = this.age[k] / this.life[k];
      const ramp = this.ramps[this.kind[k]];
      const col = ramp[Math.min(ramp.length - 1, Math.floor(f * ramp.length))];
      P[k * 3] = this.pos[k * 3];
      P[k * 3 + 1] = this.pos[k * 3 + 1];
      P[k * 3 + 2] = this.pos[k * 3 + 2];
      Cc[k * 3] = col.r;
      Cc[k * 3 + 1] = col.g;
      Cc[k * 3 + 2] = col.b;
      S[k] = Math.max(0.01, this.size0[k] * (1 + d.grow * f * 4));
    }
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = true;
    this.points.geometry.setDrawRange(0, this.n);
  }

  clear() {
    this.n = 0;
    this.points.geometry.setDrawRange(0, 0);
  }

  get count() {
    return this.n;
  }
}
