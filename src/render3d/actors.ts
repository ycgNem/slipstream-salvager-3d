// The things that move: Rammers (body, booster, eyes as rigid parts, with every state the 2D sprites
// had: stalk, crouched windup, leaning charge, skid, stunned, stripped limp, crackling when hurt),
// loose and towed boosters, the player's own robot (seen only by the rear camera), the tow cable,
// wreck debris, and the claw view model in the lower middle of the first-person view.
import * as THREE from 'three';
import { C } from '../data/palette';
import type { Rammer, Tier } from '../sim/world';
import { type ModelSet, instance, disposeInstance, materialsOf } from './models';
import { pal, wx, wz, modelYaw, lerp, clamp01 } from './units';
import { Lane, type Shadows } from './decals';

/** the layer only the rear camera draws: the player's own body */
export const LAYER_SELF = 1;

/** A model's mount point in the model's own space (the empty may carry any rotation; only its position counts). */
export function mountOf(model: THREE.Object3D, name: string): THREE.Vector3 {
  model.updateMatrixWorld(true);
  const m = model.getObjectByName(name);
  if (!m) return new THREE.Vector3();
  return model.worldToLocal(m.getWorldPosition(new THREE.Vector3()));
}

/**
 * Make a glowing part exactly one palette color: no lighting, no texture, emissive at 1. Glows
 * change by switching palette colors, never by intensity (an over-driven emissive snaps to some
 * other palette entry: lime became pale yellow, red became salmon).
 */
export function setGlow(mats: THREE.MeshLambertMaterial[], c: number) {
  for (const m of mats) {
    if (m.map) {
      m.map = null;
      m.emissiveMap = null;
      m.needsUpdate = true;
    }
    m.color.setRGB(0, 0, 0);
    m.emissive.copy(pal(c));
    m.emissiveIntensity = 1;
  }
}

function setEmissive(mats: THREE.MeshLambertMaterial[], c: THREE.Color, k: number) {
  for (const m of mats) {
    m.emissive.copy(c);
    m.emissiveIntensity = k;
  }
}

// ---------------------------------------------------------------- Rammer

export class RammerView {
  root = new THREE.Group();
  tilt = new THREE.Group();
  model: THREE.Group;
  booster: THREE.Group;
  shadow: THREE.Mesh;
  lane = new Lane('enemy');
  private bodyMats: THREE.MeshLambertMaterial[];
  private eyeMats: THREE.MeshLambertMaterial[];
  private shellMats: THREE.MeshLambertMaterial[];
  private nozzleMats: THREE.MeshLambertMaterial[];
  flash = 0;
  /** world position (for sound and markers) */
  pos = new THREE.Vector3();
  face = 0;

  constructor(public id: number, models: ModelSet, shadows: Shadows, mountRear: THREE.Vector3) {
    this.model = instance(models.get('rammer'));
    this.booster = instance(models.get('booster'));
    this.booster.position.copy(mountRear);
    this.model.add(this.booster);
    this.tilt.add(this.model);
    this.root.add(this.tilt);
    this.shadow = shadows.make(1.5);
    this.root.add(this.shadow);
    this.root.name = `rammer:${id}`;
    this.bodyMats = materialsOf(this.model.getObjectByName('body'));
    this.eyeMats = materialsOf(this.model.getObjectByName('eyes'));
    this.shellMats = materialsOf(this.booster.getObjectByName('shell'));
    this.nozzleMats = materialsOf(this.booster.getObjectByName('nozzle_glow'));
    for (const m of [...this.bodyMats, ...this.shellMats]) m.emissive = new THREE.Color(0);
  }

  /** Pose the Rammer from the sim (interpolated position and facing). */
  sync(r: Rammer, x: number, y: number, face: number, time: number, dt: number, laneInfo: { angle: number; len: number; width: number } | null) {
    this.flash = Math.max(0, this.flash - dt);
    this.face = face;
    this.root.position.set(wx(x), 0, wz(y));
    this.root.rotation.y = modelYaw(face);
    this.pos.set(wx(x), 0.5, wz(y));
    const tl = this.tilt;
    tl.position.set(0, 0, 0);
    tl.rotation.set(0, 0, 0);
    tl.scale.set(1, 1, 1);
    const stripped = !r.booster;
    let eye: number = C.danger3, nozzle = 0, glint = 0;
    switch (r.state) {
      case 'enter':
      case 'stalk': {
        const pace = stripped ? 5 : 9;
        tl.position.y = Math.abs(Math.sin(time * pace + this.id)) * 0.012;
        // stripped: it limps
        if (stripped) tl.rotation.x = Math.sin(time * pace * 0.5 + this.id) * 0.06;
        break;
      }
      case 'windup': {
        const k = clamp01(r.t / Math.max(0.01, r.windup - r.lock));
        tl.position.y = -0.04 * k;
        tl.scale.y = 1 - 0.07 * k;
        tl.rotation.z = -0.05 * k; // nose down, coiled
        const j = r.locked ? 0.014 : 0.007;
        tl.position.x = (Math.sin(time * 71 + this.id) * 0.5) * j;
        tl.position.z = (Math.sin(time * 53 + this.id * 3) * 0.5) * j;
        eye = r.locked && Math.floor(time * 12) % 2 ? C.dangerPink : C.danger3;
        nozzle = r.locked ? 1.5 : 0.6 * k;
        glint = r.locked ? 1 : 0;
        break;
      }
      case 'charge':
        tl.rotation.z = -0.13;
        tl.position.y = 0.01;
        eye = C.dangerPink;
        nozzle = r.shove ? 0.5 : 2;
        glint = 1;
        break;
      case 'skid': {
        const k = 1 - clamp01(r.t / r.skidFor);
        tl.rotation.z = 0.07 * k;
        if (r.slammed) {
          // stunned: it wobbles, eyes flicker
          tl.rotation.x = Math.sin(time * 14) * 0.08 * (0.4 + k);
          eye = Math.floor(time * 10) % 3 === 0 ? C.danger0 : C.danger1;
        } else eye = C.danger1;
        glint = 1;
        break;
      }
    }
    if (r.hp <= 1 && Math.floor(time * 7 + this.id) % 4 === 0) eye = C.danger0;
    // the booster: present until torn off; it glints gold while the back is open (DECISIONS 2D #60)
    this.booster.visible = r.booster;
    setGlow(this.eyeMats, eye);
    setEmissive(this.nozzleMats, pal(C.orange), 0.4 + nozzle);
    const g = glint ? 0.35 + 0.35 * (Math.floor(time * 10) % 2) : 0;
    setEmissive(this.shellMats, pal(C.gold), g);
    if (this.flash > 0) setEmissive(this.bodyMats, pal(C.white), 1.4);
    else setEmissive(this.bodyMats, pal(C.ink), 0);
    // the telegraph lane
    if (laneInfo && r.state === 'windup') this.lane.set(x, y, laneInfo.angle, laneInfo.len, laneInfo.width, r.locked, time);
    else this.lane.hide();
  }

  /** Where the booster's nozzle is in the world (plume particles). */
  nozzleWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.booster.localToWorld(out.set(-0.5, 0, 0));
  }

  dispose() {
    disposeInstance(this.model);
    this.lane.dispose();
    this.root.removeFromParent();
  }
}

// ---------------------------------------------------------------- loose and towed parts

export class PartView {
  root = new THREE.Group();
  model: THREE.Group;
  shadow: THREE.Mesh;
  private shellMats: THREE.MeshLambertMaterial[];

  constructor(models: ModelSet, shadows: Shadows, public id: number) {
    this.model = instance(models.get('booster'));
    // centre the thruster over its own origin (its origin is the mount flange)
    this.model.position.x = 0.25;
    this.root.add(this.model);
    this.shadow = shadows.make(0.7);
    this.root.add(this.shadow);
    this.root.name = `part:${id}`;
    this.shellMats = materialsOf(this.model);
  }

  /** On the floor (bobbing, turning slowly, glinting gold) or swinging on the cable. */
  sync(x: number, y: number, yaw: number, lift: number, cracked: boolean, time: number) {
    this.root.position.set(wx(x), 0, wz(y));
    this.model.position.y = lift;
    this.root.rotation.y = yaw;
    const glint = Math.floor(time * 3 + this.id) % 6 === 0 ? 0.5 : 0.08;
    for (const m of this.shellMats) {
      if (m.userData.glow) continue;
      m.emissive.copy(pal(C.gold));
      m.emissiveIntensity = glint;
      m.color.copy(cracked ? pal(C.mist) : new THREE.Color(1, 1, 1));
    }
  }

  dispose() {
    disposeInstance(this.model);
    this.root.removeFromParent();
  }
}

/** The cable from the robot's back to the towed part: a 1-px line (at 640x360) that sags. */
export class Cable {
  line: THREE.LineSegments;
  private pts = new Float32Array(9 * 2 * 2 * 3);
  constructor() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pts, 3));
    // two strands a couple of centimetres apart, so it reads two pixels thick in the mirror
    this.line = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: pal(C.gold2) }));
    this.line.frustumCulled = false;
    this.line.name = 'cable';
  }
  set(a: THREE.Vector3, b: THREE.Vector3) {
    const n = 10, len = a.distanceTo(b);
    const sag = Math.max(0, 1.2 - len) * 0.2 + 0.05;
    const at = (t: number, dy: number, out: number) => {
      this.pts[out] = lerp(a.x, b.x, t);
      this.pts[out + 1] = lerp(a.y, b.y, t) - Math.sin(t * Math.PI) * sag + dy;
      this.pts[out + 2] = lerp(a.z, b.z, t);
    };
    let o = 0;
    for (const dy of [0, -0.025])
      for (let i = 0; i < n - 1; i++) {
        at(i / (n - 1), dy, o);
        at((i + 1) / (n - 1), dy, o + 3);
        o += 6;
      }
    (this.line.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.line.visible = true;
  }
}

// ---------------------------------------------------------------- the player's own robot

export class PlayerRig {
  root = new THREE.Group();
  body: THREE.Group;
  booster: THREE.Group;
  shadow: THREE.Mesh;
  mountRear: THREE.Vector3;
  private bodyMats: THREE.MeshLambertMaterial[];
  private nozzleMats: THREE.MeshLambertMaterial[];
  private shellMats: THREE.MeshLambertMaterial[];

  constructor(models: ModelSet, shadows: Shadows) {
    this.body = instance(models.get('scrapper'));
    this.mountRear = mountOf(models.get('scrapper'), 'mount_rear');
    this.booster = instance(models.get('booster'));
    this.booster.position.copy(this.mountRear);
    this.body.add(this.booster);
    this.root.add(this.body);
    this.shadow = shadows.make(1.0);
    this.root.add(this.shadow);
    this.root.name = 'player';
    this.bodyMats = materialsOf(this.body).filter((m) => !this.boosterMats().includes(m));
    this.nozzleMats = materialsOf(this.booster.getObjectByName('nozzle_glow'));
    this.shellMats = materialsOf(this.booster.getObjectByName('shell'));
    // only the rear camera sees your own body; the shadow is fine from both
    this.body.traverse((o) => o.layers.set(LAYER_SELF));
  }

  private boosterMats() {
    return materialsOf(this.booster);
  }

  sync(x: number, y: number, heading: number, part: boolean, cracked: boolean, thrust: number, hurt: number, time: number) {
    this.root.position.set(wx(x), 0, wz(y));
    this.root.rotation.y = modelYaw(heading);
    this.booster.visible = part;
    setEmissive(this.nozzleMats, pal(C.orange), 0.3 + thrust * 1.5);
    for (const m of this.shellMats) m.color.copy(cracked ? pal(C.mist) : new THREE.Color(1, 1, 1));
    if (hurt > 0) setEmissive(this.bodyMats, pal(C.danger3), 1.2);
    else setEmissive(this.bodyMats, pal(C.ink), 0);
    // treads rumble
    this.body.position.y = Math.sin(time * 40) * 0.004 * Math.min(1, thrust + 0.2);
  }

  /** The rear mount in the world, for the cable and the plume. */
  rearWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.body.localToWorld(out.copy(this.mountRear));
  }
  nozzleWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.booster.localToWorld(out.set(-0.5, 0, 0));
  }
}

// ---------------------------------------------------------------- wreck debris

export class Debris {
  mesh: THREE.InstancedMesh;
  private items: { p: THREE.Vector3; v: THREE.Vector3; r: THREE.Euler; w: THREE.Vector3; age: number; s: number }[] = [];
  private dummy = new THREE.Object3D();
  constructor(private max = 96) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ flatShading: true }), max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'debris';
  }
  burst(at: THREE.Vector3, n: number, colors: number[]) {
    for (let i = 0; i < n && this.items.length < this.max; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 3;
      this.items.push({
        p: at.clone().add(new THREE.Vector3(0, 0.3 + Math.random() * 0.3, 0)),
        v: new THREE.Vector3(Math.cos(a) * sp, 2 + Math.random() * 3, Math.sin(a) * sp),
        r: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        w: new THREE.Vector3(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5),
        age: 0,
        s: 0.08 + Math.random() * 0.14,
      });
      this.mesh.setColorAt(this.items.length - 1, pal(colors[i % colors.length]));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt: number) {
    for (const d of this.items) {
      d.age += dt;
      d.v.y -= 9 * dt;
      d.p.addScaledVector(d.v, dt);
      if (d.p.y < d.s / 2) {
        d.p.y = d.s / 2;
        d.v.y *= -0.3;
        d.v.x *= 0.6;
        d.v.z *= 0.6;
        d.w.multiplyScalar(0.6);
      }
      d.r.x += d.w.x * dt;
      d.r.y += d.w.y * dt;
      d.r.z += d.w.z * dt;
    }
    // they lie there a while, then sink into the floor
    this.items = this.items.filter((d) => d.age < 6);
    this.items.forEach((d, i) => {
      const sink = Math.max(0, d.age - 4.5) * 0.15;
      this.dummy.position.set(d.p.x, d.p.y - sink, d.p.z);
      this.dummy.rotation.copy(d.r);
      this.dummy.scale.setScalar(d.s);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    });
    this.mesh.count = this.items.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() {
    this.items = [];
    this.mesh.count = 0;
  }
}

// ---------------------------------------------------------------- the claw (view model)

const TIER_GLOW: Record<Tier, number> = { crawl: C.mist, cruise: C.cruiseHi, slip: C.speed3 };

export interface ClawPose {
  tier: Tier;
  /** 0..1 through a lunge (1 = just pressed) */
  lunge: number;
  burn: boolean;
  revving: boolean;
  /** seconds into bolting, or null */
  bolt: number | null;
  boltTime: number;
  /** signed turn rate (rad/s) for the sway */
  omega: number;
  speed01: number;
  /** hidden while looking back */
  hidden: boolean;
  stunned: boolean;
  /** towing: how far the part has swung off straight-behind (rad, + = to your right), else null */
  towSwing: number | null;
}

export class ClawRig {
  anchor = new THREE.Group();
  pivot = new THREE.Group();
  model: THREE.Group;
  private arm?: THREE.Object3D;
  private jawL?: THREE.Object3D;
  private jawR?: THREE.Object3D;
  private jl0 = 0;
  private jr0 = 0;
  private glowMats: THREE.MeshLambertMaterial[];
  private halo: THREE.Points;
  private haloMat: THREE.PointsMaterial;
  private sway = 0;
  private swing = 0;
  private twist = 0;
  private open = 0.4;
  private kick = 0;
  /** the tow cable whipping into the lower frame when the part swings wide on a turn */
  private tether: THREE.Line;
  private tetherPts = new Float32Array(8 * 3);
  private swingSide = 0;

  constructor(models: ModelSet) {
    this.model = instance(models.get('claw'));
    // the model faces +X; in camera space forward is -Z
    this.model.rotation.y = Math.PI / 2;
    // yaw first, then roll about the claw's own long axis (the bolt's wrench twist)
    this.model.rotation.order = 'YXZ';
    this.model.scale.setScalar(0.85);
    this.pivot.add(this.model);
    this.pivot.position.set(0.0, -0.27, -0.2);
    this.anchor.add(this.pivot);
    this.arm = this.model.getObjectByName('arm');
    this.jawL = this.model.getObjectByName('jaw_l');
    this.jawR = this.model.getObjectByName('jaw_r');
    this.jl0 = this.jawL?.rotation.y ?? 0;
    this.jr0 = this.jawR?.rotation.y ?? 0;
    this.glowMats = materialsOf(this.model.getObjectByName('glow'));
    // the tier ring: a few pixel squares round the jaws
    const n = 10;
    const pts = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    this.haloMat = new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, color: pal(C.speed3) });
    this.halo = new THREE.Points(g, this.haloMat);
    this.halo.frustumCulled = false;
    this.model.add(this.halo);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.tetherPts, 3));
    this.tether = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: pal(C.gold2) }));
    this.tether.frustumCulled = false;
    this.tether.visible = false;
    this.anchor.add(this.tether);
    this.anchor.name = 'claw-anchor';
  }

  /** Follow the camera and animate the rigid parts. */
  sync(cam: THREE.Camera, pose: ClawPose, time: number, dt: number) {
    this.anchor.position.copy(cam.position);
    this.anchor.quaternion.copy(cam.quaternion);
    this.anchor.visible = !pose.hidden;
    // sway against the turn, settle back
    this.sway = lerp(this.sway, Math.max(-1, Math.min(1, -pose.omega * 0.12)), 1 - Math.exp(-dt / 0.08));
    // the bolt: the arm dips to the bottom edge (the view stays clear while you drive away) and
    // twists like a ratchet wrench, one click per third of the bolt, then comes back up
    let swingT = 0, twist = 0;
    if (pose.bolt !== null) {
      const f = pose.bolt / pose.boltTime;
      swingT = Math.min(1, f / 0.15);
      const clicks = Math.floor(f * 3);
      const within = f * 3 - clicks;
      twist = (clicks + Math.min(1, within * 4)) * 0.5;
    }
    this.swing = lerp(this.swing, swingT, 1 - Math.exp(-dt / 0.05));
    this.twist = lerp(this.twist, twist, 1 - Math.exp(-dt / 0.02));
    // lunge / burn / rev: the arm thrusts or coils
    let reach = 0;
    if (pose.revving) reach = -0.07 + Math.sin(time * 190) * 0.004;
    else if (pose.burn && pose.lunge > 0) reach = 0.17;
    else if (pose.lunge > 0) reach = 0.15 * Math.sin(Math.min(1, (1 - pose.lunge) * 1.4) * Math.PI);
    this.kick = lerp(this.kick, reach, 1 - Math.exp(-dt / 0.025));
    const shudder = pose.speed01 > 0.55 ? Math.sin(time * 97) * 0.0025 * pose.speed01 : 0;
    this.pivot.position.set(this.sway * 0.05 + this.swing * 0.05, -0.27 + shudder - (pose.stunned ? 0.04 : 0) - this.swing * 0.05, -0.2 - this.kick);
    // pitched up so the jaws and the tier glow sit in the lower middle of the view
    this.pivot.rotation.set(0.32 - this.swing * 0.2, 0, this.sway * 0.25 + (pose.stunned ? Math.sin(time * 12) * 0.1 : 0));
    this.model.rotation.x = this.twist;
    // jaws: open while revving or about to strike, snap shut in the lunge
    const want = pose.revving ? 0.55 : pose.lunge > 0 ? (pose.lunge > 0.6 ? 0.6 : -0.12) : pose.bolt !== null ? -0.1 : 0.12 + pose.speed01 * 0.1;
    this.open = lerp(this.open, want, 1 - Math.exp(-dt / 0.03));
    if (this.jawL) this.jawL.rotation.y = this.jl0 + this.open * 0.5;
    if (this.jawR) this.jawR.rotation.y = this.jr0 - this.open * 0.5;
    // the tier glow (THREEJS-NOTES rule 8: second only to the FOV)
    const c = pal(TIER_GLOW[pose.tier]);
    // at Slipstream it flickers between the two brightest teals; revving, it strobes to white
    const glow = pose.revving ? (Math.floor(time * 30) % 2 ? C.white : C.speed4) : pose.tier === 'slip' && Math.floor(time * 12) % 3 === 0 ? C.speed4 : TIER_GLOW[pose.tier];
    setGlow(this.glowMats, glow);
    // the ring round the jaws, brighter and wider with speed
    const pts = (this.halo.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    const n = pts.length / 3;
    const rad = pose.tier === 'slip' ? 0.075 : 0.06;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + time * (pose.tier === 'slip' ? 6 : 2);
      pts[i * 3] = 0.47 + this.kick * 0;
      pts[i * 3 + 1] = Math.sin(a) * rad * 0.7;
      pts[i * 3 + 2] = Math.cos(a) * rad;
    }
    (this.halo.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.haloMat.color.copy(c);
    this.halo.visible = pose.tier !== 'crawl' || pose.revving;
    // the tether: the cable from your back runs past you; when the towed part swings wide on a turn
    // it whips into the bottom corner of the view on that side (THREEJS-NOTES / M1 step 3)
    const swingWant = pose.towSwing === null ? 0 : Math.max(-1, Math.min(1, pose.towSwing / 0.45));
    this.swingSide = lerp(this.swingSide, swingWant, 1 - Math.exp(-dt / 0.06));
    const k = Math.max(0, Math.abs(this.swingSide) - 0.25) / 0.75;
    this.tether.visible = pose.towSwing !== null && k > 0.01 && !pose.hidden;
    if (this.tether.visible) {
      const side = Math.sign(this.swingSide);
      const n = this.tetherPts.length / 3;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        // from behind the camera, low, out to the corner and into the frame as the swing grows
        const x = side * (0.55 - t * 0.2 * k), y = -0.5 + t * (0.2 + 0.08 * k) - Math.sin(t * Math.PI) * 0.05;
        const z = 0.35 - t * (0.6 + 0.3 * k) + Math.sin(time * 23 + t * 6) * 0.004;
        this.tetherPts[i * 3] = x;
        this.tetherPts[i * 3 + 1] = y;
        this.tetherPts[i * 3 + 2] = z;
      }
      (this.tether.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }
  }
}
