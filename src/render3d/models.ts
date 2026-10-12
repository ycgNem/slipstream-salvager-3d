// The models (THREEJS-NOTES rule 9): built by script in Blender (art/<family>/build_*.py) into
// public/models/*.glb. Node names are the API (art/README.md): the renderer finds parts by name and
// moves them as rigid pieces. Every material becomes a MeshLambertMaterial with its pixel texture
// nearest-filtered; the emissive ones (eyes, glows, lamps) keep their color as emissive. If a .glb is
// missing, a code-built placeholder with the same node names stands in, so the game always runs.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { C } from '../data/palette';
import { pal } from './units';
import { pixelate } from './textures';

export const MODEL_NAMES = [
  'rammer', 'booster', 'scrapper', 'claw', 'pillar', 'wall', 'gate', 'floor',
  // Milestone 3: the Snapper, the three new parts, and the yards' obstacles
  'snapper', 'treads', 'plow', 'jaws', 'post', 'tower', 'block', 'barrier',
] as const;
export type ModelName = (typeof MODEL_NAMES)[number];

export interface ModelSet {
  get(name: ModelName): THREE.Group;
  /** where each model came from (e2e/coverage.mjs) */
  source: Record<ModelName, 'glb' | 'placeholder'>;
}

const EMISSIVE = /glow|eyes|lamp/i;

/** Lambert everything, pixel-filter every texture, keep emissive parts emissive. */
function convert(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const out = mats.map((m) => {
      const src = m as THREE.MeshStandardMaterial;
      const map = src.map ? pixelate(src.map) : null;
      const glow = EMISSIVE.test(src.name ?? '') || EMISSIVE.test(mesh.name);
      const lm = new THREE.MeshLambertMaterial({
        name: src.name,
        map,
        color: map ? new THREE.Color(1, 1, 1) : (src.color?.clone() ?? new THREE.Color(1, 1, 1)),
        flatShading: true,
      });
      if (glow) {
        lm.emissive = src.emissive && src.emissive.getHex() !== 0 ? src.emissive.clone() : (src.color?.clone() ?? new THREE.Color(1, 1, 1));
        lm.emissiveIntensity = 1;
        if (map) lm.emissiveMap = map;
        lm.userData.glow = true;
      }
      m.dispose();
      return lm;
    });
    mesh.material = Array.isArray(mesh.material) ? out : out[0];
  });
}

async function loadGlb(loader: GLTFLoader, name: ModelName): Promise<THREE.Group | null> {
  try {
    const res = await fetch(`./models/${name}.glb`);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    // a dev server answers a missing file with index.html: only a real glb starts with "glTF"
    if (buf.byteLength < 12 || new TextDecoder().decode(new Uint8Array(buf, 0, 4)) !== 'glTF') return null;
    const gltf = await loader.parseAsync(buf, './models/');
    const root = gltf.scene.getObjectByName(name) ?? gltf.scene;
    const g = new THREE.Group();
    g.name = name;
    // keep the root's own transform (it should be identity)
    g.add(root);
    convert(g);
    return g;
  } catch (e) {
    console.info(`model ${name}: using the placeholder (${(e as Error).message})`);
    return null;
  }
}

export async function loadModels(): Promise<ModelSet> {
  const loader = new GLTFLoader();
  const out = {} as Record<ModelName, THREE.Group>;
  const source = {} as Record<ModelName, 'glb' | 'placeholder'>;
  await Promise.all(
    MODEL_NAMES.map(async (n) => {
      const g = await loadGlb(loader, n);
      out[n] = g ?? PLACEHOLDERS[n]();
      source[n] = g ? 'glb' : 'placeholder';
    }),
  );
  return { get: (n) => out[n], source };
}

/** A deep copy sharing geometry; materials are cloned so per-instance colors can change. */
export function instance(src: THREE.Object3D, cloneMaterials = true): THREE.Group {
  const g = src.clone(true) as THREE.Group;
  if (cloneMaterials)
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone();
    });
  return g;
}

/** Dispose the per-instance materials made by instance(). Geometry is shared and kept. */
export function disposeInstance(g: THREE.Object3D) {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
  });
  g.removeFromParent();
}

/** All meshes under a node (a GLB node with several materials is a group of meshes). */
export function meshesOf(o: THREE.Object3D | undefined): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  o?.traverse((x) => {
    if ((x as THREE.Mesh).isMesh) out.push(x as THREE.Mesh);
  });
  return out;
}

/** Every Lambert material under a node. */
export function materialsOf(o: THREE.Object3D | undefined): THREE.MeshLambertMaterial[] {
  const out: THREE.MeshLambertMaterial[] = [];
  for (const m of meshesOf(o)) for (const x of Array.isArray(m.material) ? m.material : [m.material]) out.push(x as THREE.MeshLambertMaterial);
  return out;
}

/** Put a whole subtree on one layer (layers are per object, not inherited). */
export function setLayer(o: THREE.Object3D, layer: number) {
  o.traverse((x) => x.layers.set(layer));
}

// ---------------------------------------------------------------- placeholders
// Blocky stand-ins with the right names, sizes and colors (STYLE color language), used until the
// Blender models exist. Blender +X/+Y/+Z = three +X/-Z/+Y; these are built directly in three axes.

function lam(c: number, emissive = false): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ color: pal(c), flatShading: true, name: emissive ? 'glow' : '' });
  if (emissive) {
    m.emissive = pal(c);
    m.userData.glow = true;
  }
  return m;
}

function box(name: string, w: number, h: number, d: number, c: number, x = 0, y = 0, z = 0, emissive = false): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(c, emissive));
  m.name = name;
  m.position.set(x, y, z);
  return m;
}

function group(name: string, ...kids: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  for (const k of kids) g.add(k);
  return g;
}

function empty(name: string, x: number, y: number, z: number): THREE.Object3D {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(x, y, z);
  return o;
}

const PLACEHOLDERS: Record<ModelName, () => THREE.Group> = {
  rammer: () => {
    const body = group('body',
      box('hull', 1.0, 0.55, 0.95, C.steel1, -0.05, 0.42, 0),
      box('tracks', 1.1, 0.22, 1.05, C.steel0, 0, 0.11, 0),
      box('ram', 0.22, 0.5, 1.0, C.steel2, 0.5, 0.36, 0),
      box('stripe', 0.04, 0.08, 0.9, C.danger2, 0.62, 0.5, 0),
      box('back', 0.1, 0.4, 0.7, C.violet, -0.56, 0.45, 0),
    );
    const eyes = group('eyes', box('eye_l', 0.06, 0.07, 0.16, C.danger3, 0.47, 0.66, 0.2, true), box('eye_r', 0.06, 0.07, 0.16, C.danger3, 0.47, 0.66, -0.2, true));
    return group('rammer', body, eyes, empty('mount_rear', -0.55, 0.5, 0));
  },
  booster: () => {
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.16, 0.5, 8), lam(C.gold));
    shell.name = 'shell';
    shell.rotation.z = Math.PI / 2;
    shell.position.x = -0.25;
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 8), lam(C.orange, true));
    nozzle.name = 'nozzle_glow';
    nozzle.rotation.z = Math.PI / 2;
    nozzle.position.x = -0.5;
    return group('booster', shell, nozzle);
  },
  scrapper: () =>
    group('scrapper',
      box('body', 0.62, 0.36, 0.56, C.rust2, 0, 0.32, 0),
      box('tread_l', 0.8, 0.22, 0.14, C.plum, 0, 0.11, -0.3),
      box('tread_r', 0.8, 0.22, 0.14, C.plum, 0, 0.11, 0.3),
      empty('mount_rear', -0.4, 0.35, 0),
      empty('claw_root', 0.3, 0.35, 0),
    ),
  claw: () => {
    const arm = group('arm', box('arm_mesh', 0.38, 0.09, 0.1, C.rust2, 0.19, 0, 0), box('piston', 0.24, 0.04, 0.04, C.frost, 0.16, 0.07, 0));
    const jl = group('jaw_l', box('jl', 0.17, 0.05, 0.035, C.mist, 0.085, 0, 0));
    jl.position.set(0.38, 0, -0.05);
    jl.rotation.y = 0.2;
    const jr = group('jaw_r', box('jr', 0.17, 0.05, 0.035, C.mist, 0.085, 0, 0));
    jr.position.set(0.38, 0, 0.05);
    jr.rotation.y = -0.2;
    const glow = box('glow', 0.06, 0.03, 0.08, C.mist, 0.33, 0.06, 0, true);
    return group('claw', arm, jl, jr, glow);
  },
  pillar: () => group('pillar', box('pillar', 1.6, 2.0, 1.6, C.taupe, 0, 1.0, 0)),
  wall: () => group('wall', box('wall', 0.8, 1.2, 0.8, C.dusk, 0, 0.6, 0)),
  gate: () => {
    const frame = group('frame', box('post_a', 0.2, 1.5, 0.8, C.slate, -0.9, 0.75, 0), box('post_b', 0.2, 1.5, 0.8, C.slate, 0.9, 0.75, 0), box('lintel', 2.0, 0.25, 0.8, C.slate, 0, 1.47, 0));
    const dl = box('door_l', 0.8, 1.2, 0.1, C.lilac, -0.4, 0.6, 0);
    const dr = box('door_r', 0.8, 1.2, 0.1, C.lilac, 0.4, 0.6, 0);
    const lamp = box('lamp', 0.16, 0.12, 0.16, C.danger3, 0, 1.66, 0, true);
    return group('gate', frame, dl, dr, lamp);
  },
  floor: () => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6).rotateX(-Math.PI / 2), lam(C.floor0));
    m.name = 'floor';
    return group('floor', m);
  },
  // the Snapper: a small, low tread-bot with a snout, drawn without its treads (they're the part)
  snapper: () =>
    group('snapper',
      group('body', box('hull', 0.62, 0.22, 0.4, 51, -0.04, 0.2, 0), box('snout', 0.22, 0.14, 0.26, 50, 0.3, 0.16, 0), box('axle', 0.5, 0.08, 0.5, C.ink, 0, 0.06, 0)),
      group('eyes', box('eye_l', 0.04, 0.05, 0.08, C.danger3, 0.39, 0.22, -0.08, true), box('eye_r', 0.04, 0.05, 0.08, C.danger3, 0.39, 0.22, 0.08, true)),
      empty('mount_front', 0.42, 0.1, 0),
    ),
  // the Grip Treads: two gold tread guards either side of a body's footprint
  treads: () => group('treads', box('treads', 0.78, 0.26, 0.14, C.gold, 0, 0.13, -0.3), box('treads_r', 0.78, 0.26, 0.14, C.gold, 0, 0.13, 0.3)),
  // the Plow: a gold blade; origin at the mount (its back edge), the blade reaching +X
  plow: () => group('plow', box('blade', 0.16, 0.42, 0.95, C.gold, 0.08, 0.21, 0)),
  // the Jaws: two gold mandibles hinged at the mount, reaching +X
  jaws: () => {
    const l = group('jaw_l', box('jl', 0.34, 0.1, 0.07, C.gold, 0.17, 0, 0));
    l.position.set(0, 0.16, -0.12);
    const r = group('jaw_r', box('jr', 0.34, 0.1, 0.07, C.gold, 0.17, 0, 0));
    r.position.set(0, 0.16, 0.12);
    return group('jaws', l, r);
  },
  post: () => group('post', box('post', 0.8, 1.5, 0.8, C.taupe, 0, 0.75, 0)),
  tower: () => group('tower', box('tower', 2.4, 2.8, 2.4, C.taupe, 0, 1.4, 0)),
  // a scrap block for Jaw Yard's corners: 5.6 x 3.2 m
  block: () => group('block', box('block', 5.6, 1.8, 3.2, C.dusk, 0, 0.9, 0)),
  // a low barrier segment (Long Lanes' walls): 0.8 m long, below the eye, tiles along X
  barrier: () => group('barrier', box('barrier', 0.8, 0.5, 0.8, C.dusk, 0, 0.25, 0)),
};
