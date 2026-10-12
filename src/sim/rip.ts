// The attack (PLAN.md 4.2, 4.4): the Rip lunge, the Booster's Burn, aim assist, and what a hit
// does at each speed tier. Only Slipstream does damage or tears parts off; Cruise shoves and
// cancels a windup; Crawl clanks. Flat mode drops the speed rule (the removal test A/B).
import { wrapAngle } from '../data/dirs';
import { attackMode } from './body';
import { cancelBolt, grabPart } from './salvage';
import { toSkid } from './rammer';
import type { Zone } from './events';
import { tierOf, type Rammer, type World } from './world';

const deg = (d: number) => (d * Math.PI) / 180;

/** Can the player start an attack this tick? */
function ready(w: World): boolean {
  const p = w.player;
  return p.ripCd <= 0 && !p.rip && p.rev === null && p.knock <= 0 && p.stun <= 0;
}

/** Rip pressed (or a buffered press fires): start the Rip, or start revving the Burn. */
export function tryAttack(w: World): boolean {
  if (!ready(w)) return false;
  const p = w.player;
  if (p.bolt !== null) cancelBolt(w);
  if (attackMode(w) === 'burn') {
    // a press starts the rev, but nothing locks until it's held past burnTapTime: a tap is a
    // plain Rip (DECISIONS #57)
    p.rev = 0;
    return true;
  }
  startRip(w);
  return true;
}

/** The plain Rip: a committed lunge at the tier you're in now. */
function startRip(w: World) {
  const p = w.player, t = w.t;
  const tier = tierOf(t, p.speed); // locked at the press: the lunge's own boost doesn't count
  aimAssist(w);
  p.speed += t.ripImpulse;
  p.rip = { t: t.ripTime, tier, burn: false, hits: [] };
  p.ripCd = t.ripCooldown;
  p.pass = t.ripTime + t.passThrough;
  w.events.push({ k: 'rip', tier, burn: false });
}

/** Revving for real: held past the tap window, so the heading is locked and the lane shows. */
export function revving(w: World): boolean {
  return w.player.rev !== null && w.player.rev >= w.t.burnTapTime;
}

/** Let go of the Burn (or touch an enemy while revving): lunge at the tier you reached. */
export function releaseBurn(w: World) {
  const p = w.player, t = w.t;
  if (p.rev === null) return;
  if (!revving(w)) {
    // a tap: the plain Rip
    p.rev = null;
    startRip(w);
    return;
  }
  const tier = tierOf(t, p.speed);
  p.rev = null;
  p.rip = { t: t.burnTime, tier, burn: true, hits: [] };
  p.ripCd = t.burnTime + t.burnCooldown;
  p.pass = t.burnTime + t.passThrough;
  w.events.push({ k: 'rip', tier, burn: true });
}

/** Up to aimAssistDeg toward the nearest enemy in a cone ahead, so 8-way sprites never cost a pass. */
function aimAssist(w: World) {
  const p = w.player, t = w.t;
  let best: Rammer | null = null, bestD = t.aimAssistRange;
  for (const r of w.rammers) {
    const d = Math.hypot(r.x - p.x, r.y - p.y);
    if (d > bestD) continue;
    const off = Math.abs(wrapAngle(Math.atan2(r.y - p.y, r.x - p.x) - p.heading));
    if (off > deg(t.aimAssistConeDeg)) continue;
    best = r;
    bestD = d;
  }
  if (!best) return;
  const off = wrapAngle(Math.atan2(best.y - p.y, best.x - p.x) - p.heading);
  const lim = deg(t.aimAssistDeg);
  p.heading = wrapAngle(p.heading + Math.max(-lim, Math.min(lim, off)));
}

/** Where the claw is (sim space, flat top-down). */
export function clawPos(w: World): { x: number; y: number } {
  const p = w.player;
  return { x: p.x + Math.cos(p.heading) * w.t.ripReach, y: p.y + Math.sin(p.heading) * w.t.ripReach };
}

function touches(w: World, r: Rammer): boolean {
  const p = w.player, t = w.t, c = clawPos(w);
  return Math.hypot(c.x - r.x, c.y - r.y) < t.ripRadius + t.rammerRadius || Math.hypot(p.x - r.x, p.y - r.y) < t.playerRadius + t.rammerRadius;
}

/** Revving into an enemy releases the Burn on the spot. */
export function autoRelease(w: World) {
  if (w.player.rev === null) return;
  if (w.rammers.some((r) => touches(w, r))) releaseBurn(w);
}

/** Count down the lunge. */
export function updateRip(w: World, dt: number) {
  const p = w.player;
  if (!p.rip) return;
  p.rip.t -= dt;
  if (p.rip.t <= 0) p.rip = null;
}

/** Resolve the claw against every Rammer it reaches this tick. */
export function resolveRipHits(w: World) {
  const p = w.player;
  if (!p.rip) return;
  for (const r of [...w.rammers]) {
    if (!p.rip) return;
    if (p.rip.hits.includes(r.id) || !touches(w, r)) continue;
    hitRammer(w, r);
  }
}

/** Is the player behind this Rammer (within rearArcDeg of straight behind it)? */
export function inRearArc(w: World, r: Rammer): boolean {
  return hitZone(w, r) === 'rear';
}

/**
 * Where the player is striking this enemy from: its armored front (within frontArcDeg of its
 * facing), its back (within rearArcDeg of straight behind), or a side (DECISIONS #55).
 */
export function hitZone(w: World, r: Rammer): Zone {
  const p = w.player;
  const off = Math.abs(wrapAngle(Math.atan2(p.y - r.y, p.x - r.x) - r.face));
  if (off >= Math.PI - deg(w.t.rearArcDeg)) return 'rear';
  if (off <= deg(w.t.frontArcDeg)) return 'front';
  return 'side';
}

function hitRammer(w: World, r: Rammer) {
  const p = w.player, t = w.t, rip = p.rip!;
  rip.hits.push(r.id);
  const hx = (p.x + r.x) / 2, hy = (p.y + r.y) / 2;
  const zone = hitZone(w, r);

  if (w.flat) {
    // the removal test: speed doesn't matter, and a bolted part is just a bigger number (the
    // front armor stays: where you hit isn't about speed)
    if (r.booster && zone === 'rear') tear(w, r, hx, hy);
    else damage(w, r, (zone === 'front' ? t.frontDamage : t.flatDamage) + (p.part ? t.flatPartDamage : 0), zone, hx, hy);
    w.hitstop = Math.max(w.hitstop, t.hitstopCruise);
    return;
  }

  switch (rip.tier) {
    case 'crawl': {
      // too slow: a clank, you bounce off and stop
      w.stats.crawlHits++;
      w.events.push({ k: 'clank', x: hx, y: hy, wall: false });
      p.heading = Math.atan2(p.y - r.y, p.x - r.x);
      p.speed = 50;
      p.rip = null;
      p.pass = 0.1;
      w.hitstop = Math.max(w.hitstop, t.hitstopCrawl);
      break;
    }
    case 'cruise': {
      // no damage: a shove that cancels its windup
      w.stats.cruiseHits++;
      const push = (t.cruiseShove * Math.LN2) / 0.08;
      r.vx += Math.cos(p.heading) * push;
      r.vy += Math.sin(p.heading) * push;
      if (r.state === 'windup') {
        r.state = 'stalk';
        r.t = 0;
        r.cd = 0.8;
        w.events.push({ k: 'cancel', id: r.id });
      }
      w.events.push({ k: 'shove', id: r.id, x: hx, y: hy });
      p.speed *= t.cruiseKeep;
      w.hitstop = Math.max(w.hitstop, t.hitstopCruise);
      break;
    }
    case 'slip': {
      w.stats.slipHits++;
      if (r.booster && zone === 'rear') {
        tear(w, r, hx, hy);
        w.hitstop = Math.max(w.hitstop, t.hitstopTear);
        break;
      }
      // the joust: a Slipstream Rip into the front of a charge stops it dead and stuns it, back
      // exposed (DECISIONS #56)
      const joust = r.state === 'charge' && zone === 'front' && Math.abs(wrapAngle(p.heading - r.face - Math.PI)) <= deg(t.joustDeg);
      const dealt = damage(w, r, zone === 'front' ? t.frontDamage : zone === 'rear' ? t.rearDamage : t.slipDamage, zone, hx, hy);
      if (joust && w.rammers.includes(r)) {
        toSkid(w, r, true, t.joustStun);
        w.stats.jousts++;
        w.events.push({ k: 'joust', id: r.id, x: hx, y: hy });
        w.hitstop = Math.max(w.hitstop, t.hitstopTear);
      } else {
        // a hit the wave 1 safety net absorbs gets a lighter hit-stop: it shouldn't feel like damage
        w.hitstop = Math.max(w.hitstop, dealt > 2 ? t.hitstopTear : dealt > 1 ? t.hitstopSlip : dealt > 0 ? t.hitstopCruise + 1 : t.hitstopCruise);
      }
      break;
    }
  }
}

/** A tearing hit does no damage: everything goes into the part, which the claw keeps hold of. */
function tear(w: World, r: Rammer, x: number, y: number) {
  r.booster = false;
  w.stats.tears++;
  w.events.push({ k: 'tear', id: r.id, part: 'booster', x, y });
  grabPart(w, 'booster', r.x, r.y);
}

/** Returns the damage actually dealt (0 when the wave 1 safety net holds). */
function damage(w: World, r: Rammer, n: number, zone: Zone, x: number, y: number): number {
  const tier = 'slip';
  if (r.safety && r.booster && r.hp <= 1) {
    // the wave 1 safety net's own way out: hit it hard enough times and the booster shakes loose
    // onto the floor (DECISIONS #33), so nobody is stuck in wave 1
    r.shaken++;
    w.events.push({ k: 'hit', tier, id: r.id, x, y, dmg: 0, zone });
    if (r.shaken >= 2) {
      r.booster = false;
      w.pickups.push({ id: w.nextId++, part: 'booster', x: r.x - Math.cos(r.face) * 14, y: r.y - Math.sin(r.face) * 14, vx: -Math.cos(r.face) * 70, vy: -Math.sin(r.face) * 70, age: 0, cracked: false });
      w.events.push({ k: 'drop', part: 'booster', x: r.x, y: r.y });
    }
    return 0;
  }
  const before = r.hp;
  r.hp = r.safety && r.booster ? Math.max(1, r.hp - n) : r.hp - n;
  const dealt = before - r.hp;
  w.stats.damageDealt += dealt;
  w.events.push({ k: 'hit', tier, id: r.id, x, y, dmg: dealt, zone });
  if (r.hp <= 0) {
    w.rammers.splice(w.rammers.indexOf(r), 1);
    w.stats.wrecks++;
    w.events.push({ k: 'wreck', id: r.id, x: r.x, y: r.y, lost: r.booster ? 'booster' : null });
  }
  return dealt;
}
