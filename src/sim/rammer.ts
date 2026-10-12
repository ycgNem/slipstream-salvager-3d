// The Rammer (PLAN.md 4.3, DECISIONS #30): a slow but fast-turning stalker with a telegraphed lane
// charge. It leads your movement, locks the lane before it goes, skids helplessly afterwards (the
// opening), rebounds off walls and pillars, and once stripped of its booster only does a short
// shove. At most maxWindups wind up at once. Movement, collisions and contacts shared with the
// Snapper live in enemies.ts.
import { dirAngle, dirOf, wrapAngle } from '../data/dirs';
import { lineOfSight } from './arena';
import { DT, hasBooster, radiusOf, type Enemy, type World } from './world';

export const PUSH_HALF = 0.08;

export function turnToward(a: number, target: number, maxStep: number): number {
  const d = wrapAngle(target - a);
  return wrapAngle(a + Math.max(-maxStep, Math.min(maxStep, d)));
}

/** How many Rammers are winding up (at most maxWindups at once). */
export function windingUp(w: World): number {
  return w.enemies.filter((r) => r.kind === 'rammer' && r.state === 'windup').length;
}

/** Start a windup: near ones are quick, far ones slow, a stripped Rammer only shoves. */
export function beginWindup(w: World, r: Enemy, near: boolean) {
  const t = w.t;
  r.shove = !hasBooster(r);
  r.state = 'windup';
  r.t = 0;
  r.locked = false;
  r.chargeLen = 0;
  r.windup = r.shove ? t.shoveWindup : near ? t.windupNear : t.windupFar;
  r.drafted = false;
  r.lock = r.shove ? t.shoveLock : near ? t.lockNear : t.lockFar;
  w.events.push({ k: 'windup', id: r.id, near, shove: r.shove });
}

/** Where you'd be after T seconds if you held your speed and your current turn (an arc or a line). */
function ahead(w: World, T: number): { x: number; y: number } {
  const p = w.player, h = p.heading, om = p.omega, v = p.speed;
  if (Math.abs(om) < 0.05) return { x: p.x + Math.cos(h) * v * T, y: p.y + Math.sin(h) * v * T };
  const R = v / om;
  return { x: p.x + R * (Math.sin(h + om * T) - Math.sin(h)), y: p.y - R * (Math.cos(h + om * T) - Math.cos(h)) };
}

/** How fast this enemy's lunge flies (px/s). */
export function lungeSpeed(w: World, r: Enemy): number {
  const t = w.t;
  return r.kind === 'snapper' ? t.snapSpeed : r.shove ? t.shoveSpeed : t.chargeSpeed;
}

/**
 * The point it aims at: leadFrac of the way to where you'll be when the lunge gets there, if you
 * keep your speed and your turn, so a steady line *or* a steady loop gets clipped and a juke clears
 * it. The time to impact is the rest of the windup plus the lunge's flight to the led point
 * (solved by iteration; dividing the distance to where you are now undershot, so a straight line
 * was never caught; DECISIONS #48).
 */
export function aimPoint(w: World, r: Enemy): { x: number; y: number } {
  const p = w.player, t = w.t;
  const speed = lungeSpeed(w, r);
  const wait = Math.max(0, r.windup - r.t);
  const led = (T: number) => {
    const a = ahead(w, T);
    return { x: p.x + (a.x - p.x) * t.leadFrac, y: p.y + (a.y - p.y) * t.leadFrac };
  };
  let T = wait + Math.hypot(p.x - r.x, p.y - r.y) / speed;
  for (let i = 0; i < 8; i++) {
    const a = led(T);
    T = wait + Math.hypot(a.x - r.x, a.y - r.y) / speed;
  }
  return led(T);
}

/** Into the recovery skid (stunned if it slammed into something), for `dur` seconds. */
export function toSkid(w: World, r: Enemy, slammed: boolean, dur = w.t.skidTime) {
  const t = w.t;
  r.state = 'skid';
  r.t = 0;
  r.slammed = slammed;
  r.skidFor = dur;
  // its facing snaps to its sprite's direction, so the rear you see is the rear the game uses
  r.face = dirAngle(dirOf(r.face));
  const fx = Math.cos(r.face), fy = Math.sin(r.face);
  if (slammed) {
    const v = (t.reboundDist * Math.LN2) / PUSH_HALF;
    r.vx = -fx * v;
    r.vy = -fy * v;
  } else {
    const v = (r.shove ? t.shoveSpeed : t.chargeSpeed) * 0.3;
    r.vx = fx * v;
    r.vy = fy * v;
  }
}

/**
 * Where an enemy walks to reach you: straight at you if it can see you, otherwise round the
 * obstacle in the way, via the corner (pushed out a little) that makes the shorter trip.
 */
export function pathGoal(w: World, r: Enemy, margin: number): { x: number; y: number } {
  const p = w.player, a = w.arena, rr = radiusOf(w, r);
  if (lineOfSight(a, r.x, r.y, p.x, p.y)) return p;
  const m = margin;
  let best = { x: p.x, y: p.y }, bd = Infinity;
  for (const pr of a.pillars)
    for (let [cx, cy] of [[pr.x - m, pr.y - m], [pr.x + pr.w + m, pr.y - m], [pr.x - m, pr.y + pr.h + m], [pr.x + pr.w + m, pr.y + pr.h + m]]) {
      // a corner it can't stand on (past the ring wall) is moved to where it can
      cx = Math.max(a.wall + rr + 1, Math.min(a.w - a.wall - rr - 1, cx));
      cy = Math.max(a.wall + rr + 1, Math.min(a.h - a.wall - rr - 1, cy));
      if (Math.hypot(cx - r.x, cy - r.y) < 8 || !lineOfSight(a, r.x, r.y, cx, cy)) continue;
      // a corner that can't see you is a poor bet: without this it dithered between two corners
      // and stalled (DECISIONS #79)
      const d = Math.hypot(cx - r.x, cy - r.y) + Math.hypot(p.x - cx, p.y - cy) + (lineOfSight(a, cx, cy, p.x, p.y) ? 0 : 150);
      if (d < bd) { bd = d; best = { x: cx, y: cy }; }
    }
  return best;
}

/** How far a charge locked now would run: past you by chargeOver, within chargeMin..chargeMax. */
export function chargeLength(w: World, r: Enemy): number {
  const t = w.t;
  return Math.max(t.chargeMin, Math.min(t.chargeMax, Math.hypot(w.player.x - r.x, w.player.y - r.y) + t.chargeOver));
}

/** One Rammer's brain for one tick; returns how fast it moves along its facing. */
export function thinkRammer(w: World, r: Enemy): number {
  const p = w.player, t = w.t;
  const dist = Math.hypot(p.x - r.x, p.y - r.y);
  const booster = hasBooster(r);
  switch (r.state) {
    case 'enter':
      r.face = Math.atan2(r.enter.y, r.enter.x);
      if (r.t >= t.enterTime) { r.state = 'stalk'; r.t = 0; }
      return t.stalkSpeed * 1.5;
    case 'stalk': {
      const goal = pathGoal(w, r, t.rammerRadius + 6);
      r.face = turnToward(r.face, Math.atan2(goal.y - r.y, goal.x - r.x), (booster ? t.stalkTurn : t.strippedTurn) * DT);
      const can = r.cd <= 0 && windingUp(w) < t.maxWindups && !w.result;
      const range = booster ? t.chargeRange : t.shoveRange;
      if (can && dist < range && lineOfSight(w.arena, r.x, r.y, p.x, p.y)) beginWindup(w, r, dist <= t.nearDist);
      return dist > t.playerRadius + t.rammerRadius + 6 ? (booster ? t.stalkSpeed : t.strippedSpeed) : 0;
    }
    case 'windup':
      if (r.t < r.windup - r.lock) {
        const a = aimPoint(w, r);
        r.face = turnToward(r.face, Math.atan2(a.y - r.y, a.x - r.x), t.trackTurn * DT);
      } else if (!r.locked) {
        r.locked = true;
        r.chargeLen = chargeLength(w, r);
        w.events.push({ k: 'lock', id: r.id });
      }
      if (r.t >= r.windup) {
        r.state = 'charge';
        r.t = 0;
        r.travelled = 0;
        w.events.push({ k: 'charge', id: r.id, shove: r.shove });
      }
      return 0;
    case 'charge': {
      const sp = r.shove ? t.shoveSpeed : t.chargeSpeed;
      // a charge that never locked (forced by a test or a scene) measures itself now
      if (!r.chargeLen) r.chargeLen = chargeLength(w, r);
      r.travelled += sp * DT;
      if (r.travelled >= (r.shove ? t.shoveDist : r.chargeLen)) toSkid(w, r, false);
      return sp;
    }
    case 'skid':
      if (r.t >= r.skidFor) {
        r.state = 'stalk';
        r.t = 0;
        r.cd = w.rng.range(t.chargeCdMin, t.chargeCdMax);
      }
      return 0;
    default:
      r.state = 'stalk';
      return 0;
  }
}
