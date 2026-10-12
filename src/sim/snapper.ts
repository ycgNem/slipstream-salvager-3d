// The Snapper (PLAN.md 8.3): a small, fast tread-bot that hunts in packs. It drives like you do
// (its own speed along its own line), cuts you off on an intercept, snaps from close with a short
// telegraph, and power-slides round on its treads to face you again, broadside: the opening where
// a Slipstream hit on its side tears the treads off. At Slipstream you outrun it; looping a pillar
// at Cruise, it catches you. Stripped of its treads it limps, turns slowly and can't slide.
import { wrapAngle } from '../data/dirs';
import { lineOfSight } from './arena';
import { aimPoint, pathGoal, turnToward } from './rammer';
import { DT, type Enemy, type World } from './world';

const deg = (d: number) => (d * Math.PI) / 180;
const halve = (v: number, half: number) => v * Math.pow(0.5, DT / half);

export function hasTreads(e: Enemy): boolean {
  return e.parts.sides === 'treads';
}

/** How many Snappers are winding up (at most maxSnaps at once). */
export function snapping(w: World): number {
  return w.enemies.filter((e) => e.kind === 'snapper' && e.state === 'windup').length;
}

export function beginSnap(w: World, e: Enemy) {
  const t = w.t;
  e.state = 'windup';
  e.t = 0;
  e.locked = false;
  e.windup = t.snapWindup;
  e.lock = t.snapLock;
  e.shove = false;
  w.events.push({ k: 'windup', id: e.id, near: true, shove: false });
}

/** Into the power-slide: it keeps sliding the way it was going while it swings round to face you. */
export function toSlide(w: World, e: Enemy, dur: number, carry: number) {
  e.state = 'slide';
  e.t = 0;
  e.skidFor = dur;
  e.speed = carry;
  e.slideDir = e.face;
}

/**
 * Where to drive: an intercept on your line while it closes in, round an obstacle in the way, and
 * once it's close and can't snap yet, round you in a circle ~70 px out (each Snapper its own way
 * round), side on to you: a pack circling, darting in to snap.
 */
function huntGoal(w: World, e: Enemy): { x: number; y: number } {
  const p = w.player, t = w.t;
  const g = pathGoal(w, e, t.snapperRadius + 8);
  if (g.x !== p.x || g.y !== p.y) return g;
  const d = Math.hypot(p.x - e.x, p.y - e.y);
  if (d < t.snapCircle + 30 && (e.cd > 0 || snapping(w) >= t.maxSnaps)) {
    const a = Math.atan2(e.y - p.y, e.x - p.x) + (e.id % 2 ? 0.7 : -0.7);
    return { x: p.x + Math.cos(a) * t.snapCircle, y: p.y + Math.sin(a) * t.snapCircle };
  }
  const T = Math.min(0.6, d / Math.max(120, w.t.snapperTop));
  const lx = p.x + Math.cos(p.heading) * p.speed * T, ly = p.y + Math.sin(p.heading) * p.speed * T;
  return lineOfSight(w.arena, e.x, e.y, lx, ly) ? { x: lx, y: ly } : p;
}

/**
 * One Snapper's brain for one tick: sets its facing and returns how fast it moves, and in which
 * direction (its facing, except while it slides, when it carries on along its old line).
 */
export function thinkSnapper(w: World, e: Enemy): { speed: number; dir: number } {
  const p = w.player, t = w.t;
  const treads = hasTreads(e);
  const top = treads ? t.snapperTop : t.snapperStrippedTop;
  const turn = treads ? t.snapperTurn : t.snapperStrippedTurn;
  const dx = p.x - e.x, dy = p.y - e.y, dist = Math.hypot(dx, dy);
  const toYou = Math.atan2(dy, dx);
  switch (e.state) {
    case 'enter':
      e.face = Math.atan2(e.enter.y, e.enter.x);
      e.speed = 120;
      if (e.t >= t.enterTime) { e.state = 'hunt'; e.t = 0; }
      return { speed: e.speed, dir: e.face };
    case 'hunt': {
      const goal = huntGoal(w, e);
      const want = Math.atan2(goal.y - e.y, goal.x - e.x);
      const off = Math.abs(wrapAngle(want - e.face));
      // you got behind it at speed: it power-slides round instead of turning in a wide arc
      if (treads && off > deg(120) && e.speed > 90) {
        toSlide(w, e, 0.4, e.speed * 0.8);
        w.events.push({ k: 'slide-e', id: e.id });
        return { speed: e.speed, dir: e.face };
      }
      e.face = turnToward(e.face, want, turn * DT);
      // it eases off in a hard turn, like you do
      const cap = off > deg(60) ? top * 0.6 : top;
      e.speed = e.speed < cap ? Math.min(cap, e.speed + t.snapperAcc * DT) : halve(e.speed, 0.15);
      const can = e.cd <= 0 && snapping(w) < t.maxSnaps && !w.result;
      if (can && dist < t.snapRange && Math.abs(wrapAngle(toYou - e.face)) < deg(t.snapConeDeg) && lineOfSight(w.arena, e.x, e.y, p.x, p.y)) beginSnap(w, e);
      return { speed: e.speed, dir: e.face };
    }
    case 'windup':
      // it plants itself, tracks you, then locks
      e.speed = halve(e.speed, 0.05);
      if (e.t < e.windup - e.lock) {
        const a = aimPoint(w, e);
        e.face = turnToward(e.face, Math.atan2(a.y - e.y, a.x - e.x), t.trackTurn * DT);
      } else if (!e.locked) {
        e.locked = true;
        w.events.push({ k: 'lock', id: e.id });
      }
      if (e.t >= e.windup) {
        e.state = 'snap';
        e.t = 0;
        e.travelled = 0;
        w.events.push({ k: 'snap', id: e.id });
      }
      return { speed: e.speed, dir: e.face };
    case 'snap':
      e.speed = t.snapSpeed;
      e.travelled += e.speed * DT;
      if (e.travelled >= t.snapDist) {
        if (treads) toSlide(w, e, t.snapSlide, t.snapSpeed * 0.45);
        else {
          e.state = 'hunt';
          e.t = 0;
          e.speed = 30;
          e.cd = w.rng.range(t.snapCdMin, t.snapCdMax);
        }
      }
      return { speed: e.speed, dir: e.face };
    case 'slide': {
      // carries on along its old line (dir), swinging round to face you: broadside on the way
      const dir = e.face;
      e.face = turnToward(e.face, toYou, (Math.PI / Math.max(0.2, e.skidFor)) * 1.1 * DT);
      e.speed = halve(e.speed, 0.18);
      if (e.t >= e.skidFor) {
        e.state = 'hunt';
        e.t = 0;
        e.cd = Math.max(e.cd, w.rng.range(t.snapCdMin, t.snapCdMax));
      }
      // the travel direction is the line it was on when the slide began
      return { speed: e.speed, dir: e.slideDir ?? dir };
    }
    case 'stunned':
      e.speed = halve(e.speed, 0.08);
      if (e.t >= e.skidFor) {
        e.state = 'hunt';
        e.t = 0;
        e.cd = w.rng.range(t.snapCdMin, t.snapCdMax);
      }
      return { speed: e.speed, dir: e.face };
    default:
      e.state = 'hunt';
      return { speed: e.speed, dir: e.face };
  }
}
