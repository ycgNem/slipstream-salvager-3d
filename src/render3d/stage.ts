// The 3D presentation of one encounter: reads the sim (positions in px, headings, speeds, tiers,
// lanes, events) and poses the world each frame, interpolating between the last two ticks with the
// loop's alpha (THREEJS-NOTES rule 1). It never writes to the sim. One Stage lives for the whole
// app; setWorld() swaps the encounter and disposes the old one's objects (rule 12).
import * as THREE from 'three';
import { RING } from '../data/arena';
import { C } from '../data/palette';
import { laneLength } from '../sim/arena';
import { laneOf } from '../sim/rammer';
import { revving } from '../sim/rip';
import { wrapAngle } from '../data/dirs';
import type { SimEvent } from '../sim/events';
import type { World } from '../sim/world';
import { Arena3D } from './arena3d';
import { CameraRig } from './camera';
import { ClawRig, Cable, Debris, PartView, PlayerRig, RammerView, mountOf } from './actors';
import { Lane, Shadows, SkidMarks } from './decals';
import type { ModelSet } from './models';
import { Particles } from './particles';
import { lerp, lerpAngle, pal, wx, wz } from './units';

/** Where things were at the previous tick, for interpolation. */
export interface Snap {
  px: number;
  py: number;
  ph: number;
  r: Map<number, { x: number; y: number; f: number }>;
  tow: { x: number; y: number } | null;
  k: Map<number, { x: number; y: number }>;
}

export function snapshot(w: World): Snap {
  const p = w.player;
  return {
    px: p.x,
    py: p.y,
    ph: p.heading,
    r: new Map(w.rammers.map((r) => [r.id, { x: r.x, y: r.y, f: r.face }])),
    tow: p.tow ? { x: p.tow.x, y: p.tow.y } : null,
    k: new Map(w.pickups.map((k) => [k.id, { x: k.x, y: k.y }])),
  };
}

export interface StageOpts {
  lookBack: boolean;
  /** the player's thrust input 0..1 (the plume) */
  thrust: number;
  /** seconds of the hurt flash left */
  hurt: number;
}

const _v = new THREE.Vector3();
/** how much longer the cable is drawn than the sim's (DECISIONS #23) */
const TOW_DRAW = 2;
const _w = new THREE.Vector3();

export class Stage {
  scene = new THREE.Scene();
  /** the claw, drawn after a depth clear so it never clips into walls */
  vm = new THREE.Scene();
  rig = new CameraRig();
  arena: Arena3D;
  particles = new Particles();
  debris = new Debris();
  skids = new SkidMarks();
  shadows = new Shadows();
  burnLane = new Lane('burn');
  gateLanes = new Map<string, Lane>();
  player: PlayerRig;
  claw: ClawRig;
  cable = new Cable();
  rammers = new Map<number, RammerView>();
  parts = new Map<number, PartView>();
  tow: PartView | null = null;
  private mountRear: THREE.Vector3;
  private world: World | null = null;
  /** sim ticks seen (for tick-rate effects) */
  private ticks = 0;
  /** the interpolated player, for the HUD, markers and sound */
  view = { x: 0, y: 0, heading: 0 };
  /**
   * The camera's lag behind a heading that jumped (a head-on clank reflects you, a charge throws you,
   * a crawl rip bounces you): the view swings through it in about a tenth of a second instead of
   * teleporting (DECISIONS #22). Steering never jumps, so this is zero in normal driving.
   */
  private yawLag = 0;
  private lastPh: number | null = null;

  constructor(private models: ModelSet) {
    this.scene.background = pal(C.ink);
    this.arena = new Arena3D(RING, models);
    this.scene.add(this.arena.group, this.particles.points, this.debris.mesh, this.skids.mesh, this.burnLane.mesh, this.cable.line);
    this.mountRear = mountOf(models.get('rammer'), 'mount_rear');
    this.player = new PlayerRig(models, this.shadows);
    this.scene.add(this.player.root);
    this.claw = new ClawRig(models);
    this.vm.add(this.claw.anchor);
    const hemi = new THREE.HemisphereLight(0xffffff, pal(C.plum), 1.7);
    const sun = new THREE.DirectionalLight(pal(C.peach), 2.6);
    sun.position.set(-6, 14, -9);
    this.vm.add(hemi, sun);
    for (const g of RING.gates) {
      const l = new Lane('gate');
      this.gateLanes.set(g.id, l);
      this.scene.add(l.mesh);
    }
  }

  get camera() {
    return this.rig.cam;
  }

  /** A new encounter: drop everything the last one made. */
  setWorld(w: World) {
    for (const v of this.rammers.values()) v.dispose();
    this.rammers.clear();
    for (const v of this.parts.values()) v.dispose();
    this.parts.clear();
    this.tow?.dispose();
    this.tow = null;
    this.particles.clear();
    this.debris.clear();
    this.skids.clear();
    for (const g of RING.gates) {
      this.arena.open[g.id] = 0;
      this.arena.warn[g.id] = 0;
    }
    this.world = w;
    this.lastPh = null;
    this.yawLag = 0;
  }

  /** Per sim tick: dust, skid marks, steam, smoke, crackle, the plume (the 2D ticked()). */
  ticked(w: World, scrub = false) {
    this.ticks++;
    const p = w.player, pt = this.particles, n = this.ticks;
    const fx = Math.cos(p.heading), fz = Math.sin(p.heading);
    const x = wx(p.x), z = wz(p.y);
    if (p.tier !== 'crawl' && n % 3 === 0) pt.emit('dust', x - fx * 0.4, 0.05, z - fz * 0.4, 1, -fx * 1, 0.4, -fz * 1, 0.5);
    // grit in the air ahead that rushes past: speed you can see in front of you, not only behind
    const grit = p.tier === 'slip' ? 2 : p.tier === 'cruise' ? 1 : 0;
    for (let i = 0; i < grit; i++) {
      const a = p.heading + (Math.random() - 0.5) * 1.6, d = 3 + Math.random() * 6;
      pt.emit(p.tier === 'slip' ? 'teal' : 'mote', x + Math.cos(a) * d, 0.08 + Math.random() * 0.9, z + Math.sin(a) * d, 1, 0, 0, 0, 0.05);
    }
    if (scrub && n % 2 === 0) {
      // a turn hard enough to scrub speed leaves marks, like the brake
      this.skids.add(p.x - Math.sin(p.heading) * 5, p.y + Math.cos(p.heading) * 5, p.heading);
      this.skids.add(p.x + Math.sin(p.heading) * 5, p.y - Math.cos(p.heading) * 5, p.heading);
    }
    if (p.brake && p.speed > 30) {
      this.skids.add(p.x - Math.sin(p.heading) * 5, p.y + Math.cos(p.heading) * 5, p.heading);
      this.skids.add(p.x + Math.sin(p.heading) * 5, p.y - Math.cos(p.heading) * 5, p.heading);
      if (n % 2 === 0) pt.emit('spark', x, 0.05, z, 1, -fx, 0.8, -fz, 1);
    }
    for (const r of w.rammers) {
      const rx = wx(r.x), rz = wz(r.y);
      const sp = Math.hypot(r.vx, r.vy);
      if (r.state === 'skid' && sp > 20) {
        this.skids.add(r.x + Math.sin(r.face) * 7, r.y - Math.cos(r.face) * 7, r.face);
        this.skids.add(r.x - Math.sin(r.face) * 7, r.y + Math.cos(r.face) * 7, r.face);
      }
      if (r.state === 'skid' && n % 3 === 0) pt.emit('steam', rx, 0.9, rz, 1, 0, 0.8, 0, 0.4);
      if (r.state === 'charge' && n % 2 === 0) pt.emit('dust', rx - Math.cos(r.face) * 0.5, 0.05, rz - Math.sin(r.face) * 0.5, 2, 0, 0.5, 0, 0.8);
      const v = this.rammers.get(r.id);
      if (v && r.booster && (r.state === 'charge' || (r.state === 'windup' && r.locked))) {
        v.nozzleWorld(_v);
        const bx = -Math.cos(r.face) * 3, bz = -Math.sin(r.face) * 3;
        pt.emit('plume', _v.x, _v.y, _v.z, r.state === 'charge' ? 3 : 1, bx, 0, bz, 0.6);
      }
      if (!r.booster && n % 9 === 0) pt.emit('smoke', rx - Math.cos(r.face) * 0.5, 0.6, rz - Math.sin(r.face) * 0.5, 1, 0, 0.6, 0, 0.2);
      // badly damaged: it crackles (faster at 1 HP), so "one more pass" reads without an HP bar
      if (r.hp <= 2 && n % (r.hp <= 1 ? 10 : 20) === 0) pt.emit('spark', rx + (Math.random() - 0.5) * 0.6, 0.7, rz + (Math.random() - 0.5) * 0.6, 3, 0, 2, 0, 1.5);
    }
    // the player's own booster plume (seen in the rear strip)
    if (p.part === 'booster' && (revving(w) || p.rip?.burn || p.speed > 60)) {
      this.player.nozzleWorld(_v);
      pt.emit('plume', _v.x, _v.y, _v.z, revving(w) || p.rip?.burn ? 3 : 1, -fx * 3, 0, -fz * 3, 0.5);
    }
    for (const k of w.pickups) if (k.cracked && n % 30 === 0) pt.emit('spark', wx(k.x), 0.3, wz(k.y), 2, 0, 1.5, 0, 1);
  }

  /** Sim events that are visible in the world. */
  onEvent(e: SimEvent, w: World) {
    const pt = this.particles, p = w.player;
    const fx = Math.cos(p.heading), fz = Math.sin(p.heading);
    const at = (x: number, y: number, h = 0.5) => [wx(x), h, wz(y)] as const;
    switch (e.k) {
      case 'hit': {
        const [x, y, z] = at(e.x, e.y);
        if (e.dmg === 0) pt.emit('spark', x, y, z, 6, fx, 1, fz, 2);
        else if (e.zone === 'front' && e.dmg < w.t.slipDamage) pt.emit('spark', x, y, z, 10, -fx * 3, 1, -fz * 3, 2.5);
        else {
          pt.emit('spark', x, y, z, 18, fx * 2, 1.5, fz * 2, 4);
          pt.emit('steel', x, y, z, 8, fx, 2, fz, 2.5);
        }
        const v = this.rammers.get(e.id);
        if (v) v.flash = e.dmg > 0 ? 0.08 : 0.04;
        break;
      }
      case 'joust': {
        const [x, y, z] = at(e.x, e.y);
        pt.emit('spark', x, y, z, 26, 0, 1.5, 0, 5);
        const v = this.rammers.get(e.id);
        if (v) v.flash = 0.12;
        break;
      }
      case 'shove': case 'bump': case 'slam': case 'clank': {
        const [x, y, z] = at(e.x, e.y, e.k === 'clank' ? 0.4 : 0.5);
        pt.emit('spark', x, y, z, e.k === 'slam' ? 12 : 6, 0, 1, 0, e.k === 'slam' ? 3 : 2);
        if (e.k === 'slam' || e.k === 'shove') pt.emit('dust', x, 0.1, z, 6, 0, 0.6, 0, 1.2);
        break;
      }
      case 'scrape': {
        const [x, y, z] = at(e.x, e.y, 0.3);
        pt.emit('spark', x, y, z, 2, 0, 1, 0, 1.5);
        break;
      }
      case 'tear': {
        const [x, y, z] = at(e.x, e.y);
        pt.emit('gold', x, y, z, 28, fx, 2.5, fz, 3.5);
        pt.emit('spark', x, y, z, 10, 0, 1, 0, 3);
        const v = this.rammers.get(e.id);
        if (v) v.flash = 0.1;
        break;
      }
      case 'wreck': {
        const [x, y, z] = at(e.x, e.y);
        pt.emit('steel', x, y, z, 24, 0, 2, 0, 3.5);
        pt.emit('spark', x, y, z, 14, 0, 2, 0, 4);
        for (let i = 0; i < 6; i++) pt.emit('smoke', x, 0.6, z, 1, 0, 1, 0, 0.6);
        this.debris.burst(new THREE.Vector3(x, 0, z), 12, [C.steel0, C.steel1, C.steel2, C.violet, C.sage]);
        if (e.lost) this.debris.burst(new THREE.Vector3(x, 0, z), 4, [C.gold, C.gold2, C.gold0]);
        break;
      }
      case 'shatter': case 'knock': {
        // your own part: it breaks behind you (the mirror sees it), never at eye height
        this.player.rearWorld(_v);
        _v.addScaledVector(new THREE.Vector3(-fx, 0, -fz), 0.3);
        pt.emit('shard', _v.x, _v.y, _v.z, e.k === 'knock' ? 12 : 22, -fx, 2, -fz, 3);
        if (e.k === 'shatter') this.debris.burst(new THREE.Vector3(_v.x - fx * 0.5, 0, _v.z - fz * 0.5), 5, [C.gold, C.gold2, C.gold0]);
        break;
      }
      case 'crush': {
        const [x, y, z] = at(e.x, e.y, 0.4);
        pt.emit('shard', x, y, z, 22, 0, 2, 0, 3);
        this.debris.burst(new THREE.Vector3(x, 0, z), 5, [C.gold, C.gold2, C.gold0]);
        break;
      }
      case 'hurt': {
        const [x, y, z] = at(e.x, e.y);
        pt.emit('spark', x, y, z, 12, 0, 1.5, 0, 3);
        break;
      }
      case 'draft': {
        const [x, , z] = at(e.x, e.y);
        for (let i = 0; i < 14; i++) pt.emit('teal', x + fx * (1 + i * 0.3), 0.2 + Math.random() * 0.8, z + fz * (1 + i * 0.3), 1, -fx * 6, 0, -fz * 6, 0.5);
        break;
      }
      case 'bolted': {
        this.player.rearWorld(_v);
        pt.emit('gold', _v.x, _v.y, _v.z, 12, 0, 1.5, 0, 1.5);
        break;
      }
      case 'bolt-tick': case 'bolt-start': {
        this.player.rearWorld(_v);
        pt.emit('spark', _v.x, _v.y + 0.1, _v.z, 5, 0, 1.5, 0, 1.5);
        break;
      }
      case 'gate': {
        this.arena.warn[e.gate] = w.t.gateWarn + 0.25;
        break;
      }
      case 'enter': {
        this.arena.open[e.gate] = 1;
        break;
      }
      case 'stun': {
        const [x, , z] = at(e.x, e.y);
        pt.emit('spark', x + fx * 0.5, 0.5, z + fz * 0.5, 14, -fx, 1, -fz, 2.5);
        break;
      }
    }
  }

  /** Pose everything for this frame. */
  sync(w: World, prev: Snap, alpha: number, dt: number, time: number, o: StageOpts) {
    const p = w.player, t = w.t;
    const px = lerp(prev.px, p.x, alpha), py = lerp(prev.py, p.y, alpha), ph = lerpAngle(prev.ph, p.heading, alpha);
    this.view = { x: px, y: py, heading: ph };

    // a heading that jumped this frame: the camera swings through it
    if (this.lastPh !== null) {
      const jump = wrapAngle(ph - this.lastPh);
      if (Math.abs(jump) > 0.4) this.yawLag = wrapAngle(this.yawLag - jump);
    }
    this.lastPh = ph;
    this.yawLag *= Math.exp(-dt / 0.07);
    if (Math.abs(this.yawLag) < 1e-3) this.yawLag = 0;
    const camH = ph + this.yawLag;

    // cameras
    if (this.rig.mode === 'fp') {
      const ahead = o.lookBack ? ph + Math.PI : ph;
      const reach = Math.max(0, wx(laneLength(w.arena, px, py, ahead, 24, 3)) - 0.12);
      this.rig.update({ x: px, y: py, heading: camH, speed: p.speed, slipAt: t.slipAt, topSpeed: t.topSpeed, revving: revving(w), burning: !!p.rip?.burn, lookBack: o.lookBack, stunned: p.stun > 0, reach }, dt, time);
    } else this.rig.orbit(wx(w.arena.w / 2), wz(w.arena.h / 2), time);
    this.rig.cam.updateMatrixWorld();

    // the player's own robot (rear strip) and the claw
    const thrust = Math.max(o.thrust, revving(w) ? 1 : 0, p.rip?.burn ? 1 : 0);
    this.player.root.visible = true;
    this.player.sync(px, py, ph, p.part === 'booster', p.partCracked, thrust, o.hurt, time);
    this.player.root.updateMatrixWorld(true);
    const lunge = p.rip ? p.rip.t / (p.rip.burn ? t.burnTime : t.ripTime) : 0;
    this.claw.sync(this.rig.cam, {
      tier: p.tier, lunge, burn: !!p.rip?.burn, revving: revving(w), bolt: p.bolt, boltTime: t.boltTime,
      omega: p.omega, speed01: p.speed / t.burnMax, hidden: this.rig.mode !== 'fp' || this.rig.look > 0.4, stunned: p.stun > 0,
      towSwing: p.tow ? wrapAngle(Math.atan2(p.tow.y - py, p.tow.x - px) - (ph + Math.PI)) * -1 : null,
    }, time, dt);

    // the Burn lane
    if (revving(w)) {
      // drawn from a metre ahead: a quad corner right under the eye projects to w = 0 and tears
      const len = laneLength(w.arena, px, py, ph, 420, t.playerRadius), skip = 20;
      if (len > skip) this.burnLane.set(px + Math.cos(ph) * skip, py + Math.sin(ph) * skip, ph, len - skip, t.playerRadius * 2, false, time);
      else this.burnLane.hide();
    } else this.burnLane.hide();

    // Rammers
    const live = new Set<number>();
    for (const r of w.rammers) {
      live.add(r.id);
      let v = this.rammers.get(r.id);
      if (!v) {
        v = new RammerView(r.id, this.models, this.shadows, this.mountRear);
        this.rammers.set(r.id, v);
        this.scene.add(v.root, v.lane.mesh);
      }
      const q = prev.r.get(r.id);
      const rx = q ? lerp(q.x, r.x, alpha) : r.x, ry = q ? lerp(q.y, r.y, alpha) : r.y, rf = q ? lerpAngle(q.f, r.face, alpha) : r.face;
      v.sync(r, rx, ry, rf, time, dt, r.state === 'windup' ? laneOf(w, r) : null);
    }
    for (const [id, v] of this.rammers)
      if (!live.has(id)) {
        v.dispose();
        this.rammers.delete(id);
      }

    // loose parts
    const kl = new Set<number>();
    for (const k of w.pickups) {
      kl.add(k.id);
      let v = this.parts.get(k.id);
      if (!v) {
        v = new PartView(this.models, this.shadows, k.id);
        this.parts.set(k.id, v);
        this.scene.add(v.root);
      }
      const q = prev.k.get(k.id);
      const kx = q ? lerp(q.x, k.x, alpha) : k.x, ky = q ? lerp(q.y, k.y, alpha) : k.y;
      v.sync(kx, ky, time * 0.8 + k.id, 0.22 + Math.sin(time * 3 + k.id) * 0.04, k.cracked, time);
    }
    for (const [id, v] of this.parts)
      if (!kl.has(id)) {
        v.dispose();
        this.parts.delete(id);
      }

    // the towed part and its cable
    if (p.tow) {
      if (!this.tow) {
        this.tow = new PartView(this.models, this.shadows, -1);
        this.scene.add(this.tow.root);
      }
      const q = prev.tow;
      // drawn about twice as far back as the sim's 14 px cable, so in the mirror a towed part trails
      // clearly behind you and never looks bolted on (presentation only; DECISIONS #23)
      const sx = q ? lerp(q.x, p.tow.x, alpha) : p.tow.x, sy = q ? lerp(q.y, p.tow.y, alpha) : p.tow.y;
      const tx = px + (sx - px) * TOW_DRAW, ty = py + (sy - py) * TOW_DRAW;
      // it trails nose-first toward you, swinging on the cable
      const yaw = -Math.atan2(py - ty, px - tx);
      this.tow.sync(tx, ty, yaw, 0.2 + Math.sin(time * 9) * 0.02, p.tow.cracked, time);
      this.tow.root.updateMatrixWorld(true);
      this.player.rearWorld(_v);
      this.tow.model.localToWorld(_w.set(0, 0, 0));
      this.cable.set(_v, _w);
    } else {
      this.tow?.dispose();
      this.tow = null;
      this.cable.line.visible = false;
    }

    // gates
    for (const g of w.arena.gates) {
      const lane = this.gateLanes.get(g.id)!;
      if (this.arena.warn[g.id] > 0) lane.set(g.spawn.x - g.dir.x * 14, g.spawn.y - g.dir.y * 14, Math.atan2(g.dir.y, g.dir.x), 100, 32, false, time);
      else lane.hide();
      if (this.arena.open[g.id] > 0) this.arena.open[g.id] = Math.max(0, this.arena.open[g.id] - dt / (t.enterTime + 0.8));
    }
    this.arena.update(dt, time);
    this.particles.update(dt);
    this.debris.update(dt);
  }

  /** The Rammer views for markers and sound. */
  rammerView(id: number) {
    return this.rammers.get(id);
  }
}
