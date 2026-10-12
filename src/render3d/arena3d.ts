// A yard in 3D, built from src/data/arena (the same rectangles the sim collides with): the floor,
// the walls (one instanced segment model), the obstacles (pillars, posts, towers, low barriers,
// scrap blocks: each kind one instanced model), four gates with sliding doors and warning lamps,
// and outside the walls a skyline of scrap heaps and floodlight masts under a dusk sky. Static
// except the gate doors and lamps: red while a gate warns, gold and wide open once it's an exit
// (DECISIONS #30). One directional light plus one hemisphere light. One Arena3D per yard; the
// stage disposes it when the run moves on.
import * as THREE from 'three';
import type { ArenaDef, Gate } from '../data/arena';
import { C } from '../data/palette';
import { type ModelSet, meshesOf } from './models';
import { pal, wx, wz } from './units';
import { floorSeams, skyTexture } from './textures';

interface InstancedPart {
  mesh: THREE.InstancedMesh;
  rel: THREE.Matrix4;
}

/** Every mesh under a model root as an InstancedMesh, one instance per placement. */
function instanced(root: THREE.Object3D, placements: THREE.Matrix4[], node?: string): InstancedPart[] {
  root.updateMatrixWorld(true);
  const src = node ? root.getObjectByName(node) : root;
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const out: InstancedPart[] = [];
  for (const m of meshesOf(src)) {
    const rel = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
    const im = new THREE.InstancedMesh(m.geometry, m.material, placements.length);
    im.name = `${root.name}:${m.name}`;
    placements.forEach((p, i) => im.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(p, rel)));
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    out.push({ mesh: im, rel });
  }
  return out;
}

/** the layer only the main camera draws (cosmetic things the mirror can skip) */
export const LAYER_MAIN = 2;

const place = (x: number, z: number, yaw = 0, sx = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(sx, 1, 1));

export class Arena3D {
  group = new THREE.Group();
  /** both doors of every gate in one instanced mesh (the right door is the left door's mesh) */
  private doorMesh: THREE.InstancedMesh | null = null;
  private doors: { gate: Gate; index: number; side: -1 | 1; base: THREE.Matrix4; rel: THREE.Matrix4 }[] = [];
  private lamps: InstancedPart[] = [];
  private gates: Gate[];
  /** per gate: 0 closed .. 1 open */
  open: Record<string, number> = {};
  /** per gate: seconds left of the warning blink */
  warn: Record<string, number> = {};
  /** per gate: it's an open exit to the next yard */
  exit: Record<string, boolean> = {};

  constructor(private arena: ArenaDef, models: ModelSet) {
    this.gates = arena.gates;
    this.group.name = 'arena';
    this.buildFloor(models);
    this.buildWalls(models);
    this.buildObstacles(models);
    this.buildGates(models);
    this.buildBackdrop();
    this.buildLights();
  }

  private buildFloor(models: ModelSet) {
    const a = this.arena;
    const src = meshesOf(models.get('floor'))[0];
    const srcMat = src?.material as THREE.MeshLambertMaterial | undefined;
    const tile = 1.6;
    let mat: THREE.Material;
    if (srcMat?.map) {
      const map = srcMat.map.clone();
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(wx(a.w) / tile, wz(a.h) / tile);
      map.needsUpdate = true;
      // the floor is the calmest, darkest thing in the Ring, so everything that moves pops (STYLE)
      const seams = floorSeams();
      seams.repeat.copy(map.repeat);
      mat = new THREE.MeshLambertMaterial({ map, color: new THREE.Color(0.36, 0.34, 0.4), emissive: 0xffffff, emissiveMap: seams });
      // the yard outside the walls: the same ground, darker
      const out = srcMat.map.clone();
      out.wrapS = out.wrapT = THREE.RepeatWrapping;
      out.repeat.set(160 / tile, 160 / tile);
      out.needsUpdate = true;
      const yard = new THREE.Mesh(new THREE.PlaneGeometry(160, 160).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: out, color: new THREE.Color(0.16, 0.14, 0.18) }));
      yard.position.set(wx(a.w / 2), -0.02, wz(a.h / 2));
      yard.name = 'yard';
      this.group.add(yard);
    } else {
      mat = new THREE.MeshLambertMaterial({ color: pal(C.floor0) });
      const yard = new THREE.Mesh(new THREE.PlaneGeometry(160, 160).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: pal(C.ink) }));
      yard.position.set(wx(a.w / 2), -0.02, wz(a.h / 2));
      this.group.add(yard);
    }
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(wx(a.w), wz(a.h)).rotateX(-Math.PI / 2), mat);
    floor.position.set(wx(a.w / 2), 0, wz(a.h / 2));
    floor.name = 'floor';
    this.group.add(floor);
  }

  /** Wall segments 16 px (0.8 m) long, tiled round the Ring with the gate openings left out. */
  private buildWalls(models: ModelSet) {
    const a = this.arena, T = a.wall, seg = 16;
    const gaps = (orient: 'h' | 'v', at: number) => a.gates.filter((g) => g.orient === orient && (orient === 'h' ? g.rect.y : g.rect.x) === at).map((g) => (orient === 'h' ? [g.rect.x, g.rect.x + g.rect.w] : [g.rect.y, g.rect.y + g.rect.h]));
    const runs = (from: number, to: number, holes: number[][]) => {
      // split [from, to] by the holes, then tile each piece with segments scaled to fit exactly
      const cuts = [[from, to]];
      for (const [h0, h1] of holes) {
        for (let i = cuts.length - 1; i >= 0; i--) {
          const [c0, c1] = cuts[i];
          if (h1 <= c0 || h0 >= c1) continue;
          cuts.splice(i, 1, ...[[c0, h0], [h1, c1]].filter(([p, q]) => q - p > 0.5));
        }
      }
      const out: { c: number; len: number }[] = [];
      for (const [c0, c1] of cuts) {
        const n = Math.max(1, Math.round((c1 - c0) / seg));
        const len = (c1 - c0) / n;
        for (let i = 0; i < n; i++) out.push({ c: c0 + len * (i + 0.5), len });
      }
      return out;
    };
    const P: THREE.Matrix4[] = [];
    for (const yTop of [0, a.h - T])
      for (const s of runs(0, a.w, gaps('h', yTop))) P.push(place(wx(s.c), wz(yTop + T / 2), 0, s.len / seg));
    for (const xSide of [0, a.w - T])
      for (const s of runs(T, a.h - T, gaps('v', xSide))) P.push(place(wx(xSide + T / 2), wz(s.c), Math.PI / 2, s.len / seg));
    for (const p of instanced(models.get('wall'), P)) this.group.add(p.mesh);
  }

  /**
   * The obstacles by footprint (2D data/arena.ts): 32x32 a pillar, 16x16 a post, 48x48 a tower, a
   * 16 px wide run a low barrier (Long Lanes' walls: below the eye, so you see the next lane over
   * it), anything else a scrap block (Jaw Yard's corners), each kind one instanced model.
   */
  private buildObstacles(models: ModelSet) {
    const by: Record<'pillar' | 'post' | 'tower' | 'block' | 'barrier', THREE.Matrix4[]> = { pillar: [], post: [], tower: [], block: [], barrier: [] };
    for (const r of this.arena.pillars) {
      const cx = wx(r.x + r.w / 2), cz = wz(r.y + r.h / 2);
      if (r.w === 32 && r.h === 32) by.pillar.push(place(cx, cz));
      else if (r.w === 16 && r.h === 16) by.post.push(place(cx, cz));
      else if (r.w === 48 && r.h === 48) by.tower.push(place(cx, cz));
      else if (r.w === 16 || r.h === 16) {
        // tiled with 16 px segments along its length, like the walls
        const along = r.w > r.h, len = along ? r.w : r.h, n = Math.max(1, Math.round(len / 16)), seg = len / n;
        for (let i = 0; i < n; i++) {
          const c = (along ? r.x : r.y) + seg * (i + 0.5);
          by.barrier.push(along ? place(wx(c), cz, 0, seg / 16) : place(cx, wz(c), Math.PI / 2, seg / 16));
        }
      } else {
        // the block model is 112x64 px; any other size stretches to fit (long side along X)
        const along = r.w >= r.h;
        const m = place(cx, cz, along ? 0 : Math.PI / 2);
        m.multiply(new THREE.Matrix4().makeScale((along ? r.w : r.h) / 112, 1, (along ? r.h : r.w) / 64));
        by.block.push(m);
      }
    }
    for (const [name, P] of Object.entries(by) as [keyof typeof by, THREE.Matrix4[]][]) {
      if (!P.length) continue;
      for (const p of instanced(models.get(name), P)) this.group.add(p.mesh);
    }
  }

  private gatePlace(g: Gate) {
    const cx = g.rect.x + g.rect.w / 2, cy = g.rect.y + g.rect.h / 2;
    // the model's opening runs along X; side gates turn 90 degrees. Rotated so its inside faces the floor.
    const yaw = g.orient === 'h' ? (g.id === 'n' ? 0 : Math.PI) : g.id === 'w' ? Math.PI / 2 : -Math.PI / 2;
    return place(wx(cx), wz(cy), yaw);
  }

  private buildGates(models: ModelSet) {
    const root = models.get('gate');
    const P = this.gates.map((g) => this.gatePlace(g));
    for (const p of instanced(root, P, 'frame')) this.group.add(p.mesh);
    // the doors: one draw call for all eight leaves
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const left = meshesOf(root.getObjectByName('door_l'))[0], right = meshesOf(root.getObjectByName('door_r'))[0];
    if (left && right) {
      const im = new THREE.InstancedMesh(left.geometry, left.material, P.length * 2);
      im.name = 'gate:doors';
      const relL = new THREE.Matrix4().multiplyMatrices(inv, left.matrixWorld);
      const relR = new THREE.Matrix4().multiplyMatrices(inv, right.matrixWorld);
      this.gates.forEach((g, i) => {
        this.doors.push({ gate: g, index: i, side: -1, base: P[i], rel: relL });
        this.doors.push({ gate: g, index: i + P.length, side: 1, base: P[i], rel: relR });
      });
      this.doorMesh = im;
      this.group.add(im);
    }
    // lamps: unlit, per-instance color so each gate blinks on its own
    for (const part of instanced(root, P, 'lamp')) {
      part.mesh.material = new THREE.MeshBasicMaterial({ color: 0xffffff });
      for (let i = 0; i < P.length; i++) part.mesh.setColorAt(i, pal(C.danger0));
      part.mesh.instanceColor!.needsUpdate = true;
      this.lamps.push(part);
      this.group.add(part.mesh);
    }
    for (const g of this.gates) {
      this.open[g.id] = 0;
      this.warn[g.id] = 0;
      this.exit[g.id] = false;
    }
  }

  /** Scrap heaps, a crane and floodlight masts outside the walls, merged into one vertex-colored mesh. */
  private buildBackdrop() {
    const a = this.arena;
    const cx = wx(a.w / 2), cz = wz(a.h / 2);
    const geos: THREE.BufferGeometry[] = [];
    let s = 1234;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const paint = (g: THREE.BufferGeometry, c: number, jitter: number[] = []) => {
      const n = g.getAttribute('position').count;
      const col = new Float32Array(n * 3);
      const base = pal(c);
      for (let i = 0; i < n; i++) {
        const k = jitter.length ? pal(jitter[Math.floor(rnd() * jitter.length)]) : base;
        col[i * 3] = k.r;
        col[i * 3 + 1] = k.g;
        col[i * 3 + 2] = k.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return g;
    };
    // heaps: low-poly cones squashed and turned, in a ring 22-55 m out
    for (let i = 0; i < 46; i++) {
      const ang = (i / 46) * Math.PI * 2 + rnd() * 0.12;
      const dist = 24 + rnd() * 30;
      const h = 3 + rnd() * 7, r = 4 + rnd() * 7;
      const g = new THREE.ConeGeometry(r, h, 5 + Math.floor(rnd() * 3), 1).toNonIndexed();
      g.rotateY(rnd() * Math.PI);
      g.scale(1, 1, 0.6 + rnd() * 0.6);
      g.translate(cx + Math.cos(ang) * dist * 1.25, h / 2 - 0.3, cz + Math.sin(ang) * dist);
      geos.push(paint(g, C.plum, [C.plum, C.plum, C.ink, C.slate, C.olive0, C.mauve]));
    }
    // floodlight masts at the four corners, just outside the walls
    for (const [x, z] of [[-3, -3], [wx(a.w) + 3, -3], [-3, wz(a.h) + 3], [wx(a.w) + 3, wz(a.h) + 3]]) {
      const pole = new THREE.BoxGeometry(0.3, 12, 0.3).toNonIndexed().translate(x, 6, z);
      geos.push(paint(pole, C.slate));
      const head = new THREE.BoxGeometry(1.6, 0.6, 0.6).toNonIndexed().translate(x, 12.2, z);
      geos.push(paint(head, C.ink));
    }
    // a crane on the north side
    const crane = [
      new THREE.BoxGeometry(0.8, 16, 0.8).translate(cx + 12, 8, -26),
      new THREE.BoxGeometry(18, 0.8, 0.8).translate(cx + 6, 16, -26),
      new THREE.BoxGeometry(0.15, 6, 0.15).translate(cx - 1, 13, -26),
      new THREE.BoxGeometry(2.4, 1.2, 1.2).translate(cx - 1, 9.6, -26),
    ];
    for (const g of crane) geos.push(paint(g.toNonIndexed(), C.ink));
    const merged = mergeNonIndexed(geos);
    const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    mesh.name = 'backdrop';
    this.group.add(mesh);
    // the floodlights' lamps
    const lampGeo = mergeNonIndexed(
      [[-3, -3], [wx(a.w) + 3, -3], [-3, wz(a.h) + 3], [wx(a.w) + 3, wz(a.h) + 3]].map(([x, z]) => new THREE.BoxGeometry(1.2, 0.3, 0.7).toNonIndexed().translate(x, 11.85, z)),
    );
    const lamps = new THREE.Mesh(lampGeo, new THREE.MeshBasicMaterial({ color: pal(C.gold3) }));
    lamps.name = 'floodlights';
    // the main view only: the mirror looks low and back, and every draw call there counts
    lamps.layers.set(LAYER_MAIN);
    this.group.add(lamps);
    // the sky
    const sky = new THREE.Mesh(new THREE.CylinderGeometry(120, 120, 70, 24, 1, true), new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }));
    sky.position.set(cx, 22, cz);
    (sky.material as THREE.MeshBasicMaterial).map!.wrapS = THREE.RepeatWrapping;
    (sky.material as THREE.MeshBasicMaterial).map!.repeat.set(3, 1);
    sky.name = 'sky';
    this.group.add(sky);
    // no cap over the cylinder: the scene's background is the same ink, and it saves a draw call a pass
  }

  private buildLights() {
    const hemi = new THREE.HemisphereLight(pal(C.frost), pal(C.plum), 1.9);
    this.group.add(hemi);
    const sun = new THREE.DirectionalLight(pal(C.peach), 2.6);
    // light from the upper left (STYLE): from the north-west, high
    sun.position.set(-6, 14, -9);
    sun.target.position.set(0, 0, 0);
    this.group.add(sun, sun.target);
  }

  /** Doors slide open while an enemy comes through, and for good once the gate is an exit; lamps
   *  blink red during the warning and gold on an exit. */
  update(dt: number, time: number) {
    for (const g of this.gates) if (this.exit[g.id]) this.open[g.id] = Math.min(1, this.open[g.id] + dt * 2.5);
    for (const d of this.doors) {
      const o = this.open[d.gate.id];
      const m = new THREE.Matrix4().multiplyMatrices(d.base, new THREE.Matrix4().makeTranslation(d.side * o * 0.78, 0, 0)).multiply(d.rel);
      this.doorMesh!.setMatrixAt(d.index, m);
    }
    if (this.doorMesh) {
      this.doorMesh.instanceMatrix.needsUpdate = true;
      this.doorMesh.computeBoundingSphere();
    }
    for (const part of this.lamps) {
      this.gates.forEach((g, i) => {
        const w = this.warn[g.id];
        const on = w > 0 && Math.floor(time * 8) % 2 === 0;
        const exit = this.exit[g.id], blink = Math.floor(time * 3) % 2 === 0;
        part.mesh.setColorAt(i, pal(exit ? (blink ? C.gold3 : C.gold) : on ? C.danger3 : this.open[g.id] > 0.05 ? C.danger1 : C.danger0));
      });
      part.mesh.instanceColor!.needsUpdate = true;
    }
    for (const g of this.gates) this.warn[g.id] = Math.max(0, this.warn[g.id] - dt);
  }
}

/** Free what an Arena3D made for itself (its instance buffers, the floor, the backdrop and sky);
 *  the models' own geometry and materials are shared and stay. */
export function disposeArena(a: Arena3D) {
  a.group.traverse((o) => {
    const im = o as THREE.InstancedMesh;
    if (im.isInstancedMesh) {
      im.dispose();
      return;
    }
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        const mm = mat as THREE.MeshLambertMaterial;
        mm.map?.dispose();
        mm.emissiveMap?.dispose();
        mm.dispose();
      }
    }
  });
  a.group.removeFromParent();
}

/** Merge non-indexed geometries that share attributes (position, normal, uv?, color). */
export function mergeNonIndexed(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const names = ['position', 'normal', 'color'].filter((n) => geos.every((g) => g.getAttribute(n)));
  const out = new THREE.BufferGeometry();
  for (const n of names) {
    const size = geos[0].getAttribute(n).itemSize;
    const total = geos.reduce((s, g) => s + g.getAttribute(n).count, 0);
    const arr = new Float32Array(total * size);
    let o = 0;
    for (const g of geos) {
      const a = g.getAttribute(n) as THREE.BufferAttribute;
      arr.set(a.array as Float32Array, o);
      o += a.count * size;
    }
    out.setAttribute(n, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  return out;
}
