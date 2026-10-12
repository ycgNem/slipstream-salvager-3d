// Enemies and loose parts, drawn as instanced batches (THREEJS-NOTES rule 13, DECISIONS #29). As
// separate meshes a Rammer cost five draw calls a pass (body, eyes, booster shell, nozzle, shadow),
// and The Heap's last wave sends six enemies; here each model piece is one InstancedMesh for every
// body that wears it, filled from the sim each frame. Per-instance color carries what used to be
// per material: the glows (eyes, nozzles: exact palette colors, unlit), the hit flash, the gold
// glint of an open back, a cracked part's grey.
//
// Every state the 2D sprites had: a Rammer stalks, crouches in its windup, leans into its charge,
// skids, wobbles stunned, limps stripped; a Snapper rumbles round you, plants and crouches for its
// snap, lunges, power-slides broadside (leaning out), wobbles stunned, limps on bare axles once its
// treads are torn off. A Jaw Snapper's jaws gape in the windup and slam shut on the snap.
import * as THREE from 'three';
import { C } from '../data/palette';
import type { PartId } from '../data/parts';
import type { Enemy, World } from '../sim/world';
import { laneOf } from '../sim/enemies';
import { type ModelSet, meshesOf } from './models';
import { Lane } from './decals';
import { shadowTexture } from './textures';
import { clamp01, pal, wx, wz, modelYaw } from './units';

/** instances per piece (The Heap's last wave is six enemies; loose parts and the tow share them) */
const MAX = 48;

const _m = new THREE.Matrix4();
/** Piece.add's own scratch (callers may pass _m) */
const _pm = new THREE.Matrix4();
const _n = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const WHITE = new THREE.Color(1, 1, 1);

/** A model node's meshes as instanced meshes, one per material, posed per instance. */
class Piece {
  private parts: { mesh: THREE.InstancedMesh; node: THREE.Matrix4; inner: THREE.Matrix4 }[] = [];
  n = 0;

  /** `node`: the rigid piece (its pivot is where `local` turns it); null: the whole model */
  constructor(root: THREE.Object3D, node: string | null, glow: boolean, parent: THREE.Object3D, name: string, mat?: THREE.Material) {
    root.updateMatrixWorld(true);
    const src = node ? root.getObjectByName(node) : root;
    if (!src) return;
    const invRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const nodeRel = new THREE.Matrix4().multiplyMatrices(invRoot, src.matrixWorld);
    const invNode = new THREE.Matrix4().copy(src.matrixWorld).invert();
    for (const m of meshesOf(src)) {
      const material = mat ?? (glow ? new THREE.MeshBasicMaterial({ color: 0xffffff }) : (m.material as THREE.Material).clone());
      const im = new THREE.InstancedMesh(m.geometry, material, MAX);
      im.name = `batch:${name}:${m.name}`;
      im.count = 0;
      im.visible = false;
      im.frustumCulled = false;
      // allocate the color buffer now, so the program is compiled with instance colors from the start
      for (let i = 0; i < MAX; i++) im.setColorAt(i, WHITE);
      parent.add(im);
      this.parts.push({ mesh: im, node: nodeRel, inner: new THREE.Matrix4().multiplyMatrices(invNode, m.matrixWorld) });
    }
  }

  get meshes() {
    return this.parts.map((p) => p.mesh);
  }

  begin() {
    this.n = 0;
  }

  /** One instance: the body's matrix, then (optionally) a turn about the piece's own pivot. */
  add(body: THREE.Matrix4, color: THREE.Color = WHITE, local?: THREE.Matrix4) {
    if (this.n >= MAX) return;
    for (const p of this.parts) {
      _pm.multiplyMatrices(body, p.node);
      if (local) _pm.multiply(local);
      _pm.multiply(p.inner);
      p.mesh.setMatrixAt(this.n, _pm);
      p.mesh.setColorAt(this.n, color);
    }
    this.n++;
  }

  end() {
    for (const p of this.parts) {
      p.mesh.count = this.n;
      p.mesh.visible = this.n > 0;
      p.mesh.instanceMatrix.needsUpdate = true;
      if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
    }
  }

  dispose() {
    for (const p of this.parts) {
      p.mesh.removeFromParent();
      p.mesh.dispose();
      (p.mesh.material as THREE.Material).dispose();
    }
  }
}

/**
 * A glowing node (eyes, a nozzle's core) as small boxes in the model's own space: one box per
 * cluster of its vertices either side of the model's centreline (eyes come in pairs). All glows of
 * every kind share one instanced unit box (one draw call a pass for every eye and nozzle).
 */
function glowBoxes(model: THREE.Object3D, node: string, split: boolean): THREE.Matrix4[] {
  model.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const boxes = [new THREE.Box3(), new THREE.Box3()];
  for (const m of meshesOf(model.getObjectByName(node))) {
    const pos = m.geometry.getAttribute('position');
    const toRoot = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(toRoot);
      boxes[split && v.z > 0 ? 1 : 0].expandByPoint(v);
    }
  }
  return boxes.filter((b) => !b.isEmpty()).map((b) => {
    const c = b.getCenter(new THREE.Vector3()), sz = b.getSize(new THREE.Vector3());
    return new THREE.Matrix4().compose(c, new THREE.Quaternion(), sz.max(new THREE.Vector3(0.01, 0.01, 0.01)));
  });
}

/** Mirror across the model's own XY plane (left <-> right): the right jaw is the left one mirrored. */
const MIRROR = new THREE.Matrix4().makeScale(1, 1, -1);

/** A model's mount empty in its own space. */
function mount(model: THREE.Object3D, name: string, fallback: THREE.Vector3): THREE.Vector3 {
  model.updateMatrixWorld(true);
  const m = model.getObjectByName(name);
  if (!m) return fallback.clone();
  return model.worldToLocal(m.getWorldPosition(new THREE.Vector3()));
}

/** Per enemy: presentation state the sim doesn't keep. */
interface Look {
  flash: number;
  /** world position at body height (sound, markers, hints) */
  pos: THREE.Vector3;
  face: number;
  lastFace: number | null;
  /** smoothed turn rate (rad/s) for the lean */
  omega: number;
  lane: Lane | null;
}

const tint = (r: number, g: number, b: number) => new THREE.Color(r, g, b);
const FLASH = tint(3, 3, 3);
const CRACKED = tint(0.62, 0.66, 0.72);
const GLINT = tint(1.7, 1.4, 0.75);

export class EnemyBatch {
  group = new THREE.Group();
  private looks = new Map<number, Look>();
  private rBody: Piece;
  private sBody: Piece;
  private bShell: Piece;
  private treads: Piece;
  private plow: Piece;
  /** both jaws: the right one is the left one mirrored (DoubleSide; flat shading lights it right) */
  private jaw: Piece;
  /** every glow: eyes and nozzles, as boxes */
  private glow: Piece;
  private shadow: Piece;
  private rEyes: THREE.Matrix4[];
  private sEyes: THREE.Matrix4[];
  private nozzle: THREE.Matrix4[];
  private all: Piece[];
  private rammerRear: THREE.Vector3;
  private snapFront: THREE.Vector3;
  private readonly rammerFront = new THREE.Vector3(0.6, 0.02, 0);

  constructor(models: ModelSet, private scene: THREE.Scene) {
    const g = this.group;
    g.name = 'enemies';
    const rammer = models.get('rammer'), snapper = models.get('snapper'), booster = models.get('booster'), jaws = models.get('jaws');
    this.rBody = new Piece(rammer, 'body', false, g, 'rammer');
    this.sBody = new Piece(snapper, 'body', false, g, 'snapper');
    this.bShell = new Piece(booster, 'shell', false, g, 'booster');
    this.treads = new Piece(models.get('treads'), null, false, g, 'treads');
    this.plow = new Piece(models.get('plow'), null, false, g, 'plow');
    this.jaw = new Piece(jaws, 'jaw_l', false, g, 'jaw');
    for (const m of this.jaw.meshes) (m.material as THREE.Material).side = THREE.DoubleSide;
    const unit = new THREE.Group();
    const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    cube.name = 'glow';
    unit.add(cube);
    this.glow = new Piece(unit, null, true, g, 'glow');
    this.rEyes = glowBoxes(rammer, 'eyes', true);
    this.sEyes = glowBoxes(snapper, 'eyes', true);
    this.nozzle = glowBoxes(booster, 'nozzle_glow', false);
    const sq = new THREE.Group();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
    quad.name = 'shadow';
    sq.add(quad);
    this.shadow = new Piece(sq, null, false, g, 'shadow', new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, alphaTest: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    for (const m of this.shadow.meshes) m.renderOrder = 1;
    this.all = [this.rBody, this.sBody, this.bShell, this.treads, this.plow, this.jaw, this.glow, this.shadow];
    this.rammerRear = mount(rammer, 'mount_rear', new THREE.Vector3(-0.55, 0.5, 0));
    this.snapFront = mount(snapper, 'mount_front', new THREE.Vector3(0.42, 0.1, 0));
  }

  /** Where an enemy is (body height), for sound, markers and hints. */
  pos(id: number): THREE.Vector3 | null {
    return this.looks.get(id)?.pos ?? null;
  }

  flash(id: number, t: number) {
    const l = this.looks.get(id);
    if (l) l.flash = Math.max(l.flash, t);
  }

  clear() {
    for (const l of this.looks.values()) l.lane?.dispose();
    this.looks.clear();
    for (const p of this.all) {
      p.begin();
      p.end();
    }
  }

  begin() {
    for (const p of this.all) p.begin();
  }

  end() {
    for (const p of this.all) p.end();
  }

  /** Drop the looks of enemies that are gone. */
  prune(live: Set<number>) {
    for (const [id, l] of this.looks)
      if (!live.has(id)) {
        l.lane?.dispose();
        this.looks.delete(id);
      }
  }

  private shadowAt(x: number, z: number, d: number) {
    _m.compose(_p.set(x, 0.006, z), _q.identity(), _s.set(d, 1, d));
    this.shadow.add(_m);
  }

  /** Pose one enemy from the sim (interpolated position and facing). */
  enemy(w: World, e: Enemy, x: number, y: number, face: number, time: number, dt: number) {
    let l = this.looks.get(e.id);
    if (!l) {
      l = { flash: 0, pos: new THREE.Vector3(), face, lastFace: null, omega: 0, lane: null };
      this.looks.set(e.id, l);
    }
    l.flash = Math.max(0, l.flash - dt);
    if (l.lastFace !== null && dt > 0) {
      let d = face - l.lastFace;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      l.omega += (d / dt - l.omega) * (1 - Math.exp(-dt / 0.12));
    }
    l.lastFace = face;
    l.face = face;
    const wxp = wx(x), wzp = wz(y);
    l.pos.set(wxp, e.kind === 'rammer' ? 0.5 : 0.3, wzp);

    // the tilt: the state's pose of the whole body
    let tx = 0, ty = 0, tz = 0, rx = 0, rz = 0, sy = 1, sx = 1;
    let eye: number = C.danger3, nozzle: number = C.rust1, glint = false, jawOpen = 0.12;
    const id = e.id;
    if (e.kind === 'rammer') {
      const stripped = e.parts.rear !== 'booster';
      switch (e.state) {
        case 'enter':
        case 'stalk': {
          const pace = stripped ? 5 : 9;
          ty = Math.abs(Math.sin(time * pace + id)) * 0.012;
          // stripped: it limps
          if (stripped) rx = Math.sin(time * pace * 0.5 + id) * 0.06;
          break;
        }
        case 'windup': {
          const k = clamp01(e.t / Math.max(0.01, e.windup - e.lock));
          ty = -0.04 * k;
          sy = 1 - 0.07 * k;
          rz = -0.05 * k; // nose down, coiled
          const j = e.locked ? 0.014 : 0.007;
          tx = Math.sin(time * 71 + id) * 0.5 * j;
          tz = Math.sin(time * 53 + id * 3) * 0.5 * j;
          eye = e.locked && Math.floor(time * 12) % 2 ? C.dangerPink : C.danger3;
          nozzle = e.locked ? C.rust3 : k > 0.5 ? C.orange : C.rust2;
          glint = e.locked;
          break;
        }
        case 'charge':
          rz = -0.13;
          ty = 0.01;
          eye = C.dangerPink;
          nozzle = e.shove ? C.orange : C.rust3;
          glint = true;
          break;
        case 'skid': {
          const k = 1 - clamp01(e.t / e.skidFor);
          rz = 0.07 * k;
          if (e.slammed) {
            // stunned: it wobbles, eyes flicker
            rx = Math.sin(time * 14) * 0.08 * (0.4 + k);
            eye = Math.floor(time * 10) % 3 === 0 ? C.danger0 : C.danger1;
          } else eye = C.danger1;
          glint = true;
          break;
        }
      }
    } else {
      const stripped = e.parts.sides !== 'treads';
      const moving = Math.min(1, e.speed / 120);
      // it leans into its turns, like a kart
      rx = Math.max(-0.12, Math.min(0.12, -l.omega * 0.025)) * moving;
      switch (e.state) {
        case 'enter':
        case 'hunt':
          ty = Math.abs(Math.sin(time * (stripped ? 6 : 16) + id)) * (stripped ? 0.02 : 0.008) * (0.3 + moving);
          if (stripped) {
            rx += Math.sin(time * 4 + id) * 0.08;
            ty -= 0.02;
          }
          break;
        case 'windup': {
          const k = clamp01(e.t / Math.max(0.01, e.windup - e.lock));
          ty = -0.03 * k;
          sy = 1 - 0.1 * k;
          rz = -0.08 * k;
          const j = e.locked ? 0.012 : 0.006;
          tx = Math.sin(time * 83 + id) * j;
          tz = Math.sin(time * 61 + id * 3) * j;
          eye = e.locked && Math.floor(time * 14) % 2 ? C.dangerPink : C.danger3;
          jawOpen = 0.12 + 0.5 * k;
          break;
        }
        case 'snap':
          rz = -0.12;
          sx = 1.08;
          eye = C.dangerPink;
          jawOpen = e.travelled < w.t.snapDist * 0.6 ? 0.62 : -0.05;
          break;
        case 'slide':
          // broadside: it leans out of the slide, its side to you
          rx = (l.omega > 0 ? 1 : -1) * 0.14;
          eye = C.danger1;
          break;
        case 'stunned':
          rx = Math.sin(time * 15) * 0.1;
          eye = Math.floor(time * 10) % 3 === 0 ? C.danger0 : C.danger1;
          break;
      }
    }
    const maxHp = e.kind === 'rammer' ? w.t.rammerHp : w.t.snapperHp;
    if (e.hp <= 1 && maxHp > 1 && Math.floor(time * 7 + id) % 4 === 0) eye = C.danger0;

    // body = root (position, facing) x tilt
    _m.compose(_p.set(wxp, 0, wzp), _q.setFromAxisAngle(_s.set(0, 1, 0), modelYaw(face)), _s.set(1, 1, 1));
    _n.compose(_p.set(tx, ty, tz), _q.setFromEuler(_e.set(rx, 0, rz, 'XYZ')), _s.set(sx, sy, 1));
    const body = new THREE.Matrix4().multiplyMatrices(_m, _n);
    const flash = l.flash > 0 ? FLASH : WHITE;
    const eyeColor = pal(eye);
    if (e.kind === 'rammer') {
      this.rBody.add(body, flash);
      for (const b of this.rEyes) this.glow.add(new THREE.Matrix4().multiplyMatrices(body, b), eyeColor);
      this.shadowAt(wxp, wzp, 1.5);
    } else {
      this.sBody.add(body, flash);
      for (const b of this.sEyes) this.glow.add(new THREE.Matrix4().multiplyMatrices(body, b), eyeColor);
      this.shadowAt(wxp, wzp, 1.0);
    }
    // the parts it wears, on the same mounts as yours
    if (e.parts.rear === 'booster') {
      const at = new THREE.Matrix4().multiplyMatrices(body, _m.makeTranslation(this.rammerRear.x, this.rammerRear.y, this.rammerRear.z));
      // it glints gold while the back is open (2D DECISIONS #60)
      this.bShell.add(at, glint && Math.floor(time * 10) % 2 ? GLINT : WHITE);
      for (const b of this.nozzle) this.glow.add(new THREE.Matrix4().multiplyMatrices(at, b), pal(nozzle));
    }
    if (e.parts.sides === 'treads') this.treads.add(body, flash);
    const front = e.kind === 'rammer' ? this.rammerFront : this.snapFront;
    if (e.parts.front === 'plow') this.plow.add(new THREE.Matrix4().multiplyMatrices(body, _m.makeTranslation(front.x, front.y, front.z)), flash);
    if (e.parts.front === 'jaws') {
      const at = new THREE.Matrix4().multiplyMatrices(body, _m.makeTranslation(front.x, front.y, front.z));
      this.jaws(at, flash, jawOpen * 0.8);
    }

    // the telegraph lane on the floor
    if (e.state === 'windup') {
      if (!l.lane) {
        l.lane = new Lane('enemy');
        this.scene.add(l.lane.mesh);
      }
      const info = laneOf(w, e);
      l.lane.set(x, y, info.angle, info.len, info.width, e.locked, time);
    } else l.lane?.hide();
  }

  /**
   * A loose part (on the floor, bobbing and turning, glinting gold now and then) or the towed one
   * (swinging on the cable). Every part is centred over (x, y).
   */
  part(id: PartId, x: number, y: number, yaw: number, lift: number, cracked: boolean, glint: boolean, shadow = true) {
    const c = cracked ? CRACKED : glint ? GLINT : WHITE;
    _m.compose(_p.set(wx(x), 0, wz(y)), _q.setFromAxisAngle(_s.set(0, 1, 0), yaw), _s.set(1, 1, 1));
    const at = (dx: number) => new THREE.Matrix4().multiplyMatrices(_m, new THREE.Matrix4().makeTranslation(dx, lift, 0));
    switch (id) {
      case 'booster': {
        // its origin is the mount flange; the thruster reaches back 0.5 m
        const m = at(0.25);
        this.bShell.add(m, c);
        for (const b of this.nozzle) this.glow.add(new THREE.Matrix4().multiplyMatrices(m, b), pal(C.rust0));
        break;
      }
      case 'treads':
        this.treads.add(at(0), c);
        break;
      case 'plow':
        this.plow.add(at(-0.08), c);
        break;
      case 'jaws': {
        this.jaws(at(-0.17), c, 0.3);
        break;
      }
    }
    if (shadow) this.shadowAt(wx(x), wz(y), 0.75);
  }

  /** A pair of jaws at a mount, opened by `open` (rad). */
  private jaws(at: THREE.Matrix4, c: THREE.Color, open: number) {
    const turn = new THREE.Matrix4().makeRotationY(open);
    this.jaw.add(at, c, turn);
    this.jaw.add(new THREE.Matrix4().multiplyMatrices(at, MIRROR), c, turn);
  }

  /** Every instanced mesh (perf and coverage inspection). */
  get meshes(): THREE.InstancedMesh[] {
    return this.all.flatMap((p) => p.meshes);
  }
}
