// Salvage (PLAN.md 4.4): the towed part on its cable, loose parts on the floor, bolting on, and
// parts as armor (a hit knocks the bolted part loose instead of costing hull; a part knocked
// loose twice shatters; DECISIONS #58).
import { PARTS, type PartId } from '../data/parts';
import type { MountSlot } from '../data/mounts';
import { wrapAngle } from '../data/dirs';
import { DT, type World } from './world';
import { pushOut } from './arena';

/** The claw keeps hold of a torn-off part; a part already towed drops to the floor. */
export function grabPart(w: World, part: PartId, x: number, y: number, cracked = false) {
  const p = w.player;
  if (p.tow) dropTow(w);
  p.tow = { part, x, y, vx: 0, vy: 0, cracked };
  w.events.push({ k: 'grab', part });
}

/** The towed part comes loose and lands nearby. */
export function dropTow(w: World, kick = 60) {
  const p = w.player;
  if (!p.tow) return;
  const a = w.rng.range(0, Math.PI * 2);
  w.pickups.push({ id: w.nextId++, part: p.tow.part, x: p.tow.x, y: p.tow.y, vx: Math.cos(a) * kick, vy: Math.sin(a) * kick, age: 0, cracked: p.tow.cracked });
  w.events.push({ k: 'drop', part: p.tow.part, x: p.tow.x, y: p.tow.y });
  p.tow = null;
}

/** The cable: a trailing point on a spring behind the robot. */
export function updateTow(w: World) {
  const p = w.player, tw = p.tow;
  if (!tw) return;
  const len = w.t.towLen;
  const tx = p.x - Math.cos(p.heading) * len, ty = p.y - Math.sin(p.heading) * len;
  tw.vx += (tx - tw.x) * 90 * DT;
  tw.vy += (ty - tw.y) * 90 * DT;
  tw.vx *= 0.86;
  tw.vy *= 0.86;
  tw.x += tw.vx * DT;
  tw.y += tw.vy * DT;
  // the cable never stretches past 1.6x its length
  const dx = tw.x - p.x, dy = tw.y - p.y, d = Math.hypot(dx, dy), max = len * 1.6;
  if (d > max) {
    tw.x = p.x + (dx / d) * max;
    tw.y = p.y + (dy / d) * max;
  }
}

/** Loose parts slide to a stop; drive over one with an empty cable to grab it. */
export function updatePickups(w: World) {
  const p = w.player, t = w.t;
  for (const k of [...w.pickups]) {
    k.age += DT;
    k.x += k.vx * DT;
    k.y += k.vy * DT;
    k.vx *= 0.9;
    k.vy *= 0.9;
    const a = w.arena;
    k.x = Math.max(a.wall + 6, Math.min(a.w - a.wall - 6, k.x));
    k.y = Math.max(a.wall + 6, Math.min(a.h - a.wall - 6, k.y));
    // and out of pillars, low walls and blocks, where it couldn't be reached
    Object.assign(k, pushOut(a, k.x, k.y, 6));
    if (!p.tow && k.age > 0.4 && Math.hypot(k.x - p.x, k.y - p.y) < t.playerRadius + t.pickupRadius) {
      w.pickups.splice(w.pickups.indexOf(k), 1);
      p.tow = { part: k.part, x: k.x, y: k.y, vx: 0, vy: 0, cracked: k.cracked };
      w.events.push({ k: 'pickup', part: k.part });
    }
  }
}

/** Bolt on pressed: start bolting the towed part. */
export function startBolt(w: World) {
  const p = w.player;
  if (!p.tow || p.bolt !== null || p.rip || p.rev !== null) return;
  p.bolt = 0;
  w.events.push({ k: 'bolt-start' });
}

export function cancelBolt(w: World) {
  if (w.player.bolt === null) return;
  w.player.bolt = null;
  w.events.push({ k: 'bolt-cancel' });
}

/** Three ratchet clicks, then the part is on its mount. A part already there drops (a swap). */
export function updateBolt(w: World) {
  const p = w.player, t = w.t;
  if (p.bolt === null) return;
  if (!p.tow) {
    p.bolt = null;
    return;
  }
  const before = p.bolt;
  p.bolt += DT;
  for (const n of [1, 2]) if (before < (t.boltTime * n) / 3 && p.bolt >= (t.boltTime * n) / 3) w.events.push({ k: 'bolt-tick', n });
  if (p.bolt < t.boltTime) return;
  const part = p.tow.part, mount = PARTS[part].mount, old = p.parts[mount];
  if (old) {
    w.pickups.push({ id: w.nextId++, part: old.id, x: p.x, y: p.y, vx: -Math.cos(p.heading) * 80, vy: -Math.sin(p.heading) * 80, age: 0, cracked: old.cracked });
    w.events.push({ k: 'drop', part: old.id, x: p.x, y: p.y });
  }
  p.parts[mount] = { id: part, cracked: p.tow.cracked };
  p.tow = null;
  p.bolt = null;
  w.events.push({ k: 'bolted', part });
}

/**
 * Which bolted part takes a hit coming from `from` (the direction the hit came from, rad): the one
 * on that side of you (behind: rear, a side: the treads, in front: the front part), else the next
 * in the order sides, rear, front (PLAN.md 8.2).
 */
export function armorFor(w: World, from: number): MountSlot | null {
  const p = w.player;
  const off = Math.abs(wrapAngle(from - p.heading));
  const facing: MountSlot = off <= Math.PI / 3 ? 'front' : off >= (Math.PI * 2) / 3 ? 'rear' : 'sides';
  if (p.parts[facing]) return facing;
  return (['sides', 'rear', 'front'] as MountSlot[]).find((m) => p.parts[m]) ?? null;
}

/**
 * A hit lands on the player, thrown along `angle` (so it came from the opposite way). A bolted part
 * takes it: it's knocked loose onto the floor, cracked, and a cracked part shatters instead. With
 * nothing bolted on it costs a hull pip. Any hit knocks the towed part loose.
 */
export function hitPlayer(w: World, angle: number, fling = 1) {
  const p = w.player, t = w.t;
  if (p.invuln > 0) return;
  w.stats.hitsTaken++;
  const mount = armorFor(w, angle + Math.PI);
  const b = mount ? p.parts[mount] : undefined;
  if (mount && b && (b.cracked || t.partLives <= 1)) {
    w.events.push({ k: 'shatter', part: b.id, x: p.x, y: p.y });
    w.stats.partsShattered++;
    delete p.parts[mount];
  } else if (mount && b) {
    // thrown off to the side of the hit, so it lands clear of the lane you're thrown along
    const side = w.rng.next() < 0.5 ? 1 : -1, a = angle + side * (Math.PI / 2 + w.rng.range(-0.4, 0.4));
    w.pickups.push({ id: w.nextId++, part: b.id, x: p.x, y: p.y, vx: Math.cos(a) * t.knockLooseKick, vy: Math.sin(a) * t.knockLooseKick, age: 0, cracked: true });
    w.events.push({ k: 'knock', part: b.id, x: p.x, y: p.y });
    w.stats.partsKnocked++;
    delete p.parts[mount];
  } else {
    p.hull -= 1;
    w.stats.hullLost++;
    w.events.push({ k: 'hurt', x: p.x, y: p.y });
  }
  if (p.tow) dropTow(w, 90);
  cancelBolt(w);
  p.rip = null;
  p.rev = null;
  p.brake = false;
  p.slide = false;
  p.latch = null;
  p.heading = angle;
  p.speed = t.knockSpeed * fling;
  p.knock = t.knockTime;
  p.invuln = t.invulnTime;
  if (p.hull <= 0 && !w.result) {
    w.result = 'scrapped';
    w.events.push({ k: 'scrapped' });
  }
}
