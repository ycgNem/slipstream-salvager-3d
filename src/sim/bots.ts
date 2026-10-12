// Scripted players for the removal-test guards (PLAN.md section 2). Each bot turns the world into
// an input frame every tick. They aren't meant to be good players, only typical of a strategy:
// standing still, brawling at medium speed, waiting and countering, hit-and-run, and two routes
// (tight pillar loops vs long straight lanes) for the Booster's route-flip check.
import { wrapAngle } from '../data/dirs';
import { laneOf } from './rammer';
import { laneLength, lineOfSight } from './arena';
import type { InputFrame, Rammer, World } from './world';

export type Bot = (w: World) => InputFrame;

const toward = (w: World, x: number, y: number, m = 1): { x: number; y: number } => {
  const dx = x - w.player.x, dy = y - w.player.y, d = Math.hypot(dx, dy) || 1;
  return { x: (dx / d) * m, y: (dy / d) * m };
};

function nearest(w: World): Rammer | null {
  let best: Rammer | null = null, bd = Infinity;
  for (const r of w.rammers) {
    const d = Math.hypot(r.x - w.player.x, r.y - w.player.y);
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}

/** Is the player in a winding-up Rammer's lane? Returns the dodge direction, or null. */
function dodge(w: World, margin = 10): { x: number; y: number } | null {
  const p = w.player;
  for (const r of w.rammers) {
    if (r.state !== 'windup' && r.state !== 'charge') continue;
    const l = laneOf(w, r);
    const cx = Math.cos(l.angle), cy = Math.sin(l.angle);
    const rx = p.x - r.x, ry = p.y - r.y;
    const u = rx * cx + ry * cy, v = rx * -cy + ry * cx;
    if (u < -10 || u > l.len + 20) continue;
    if (Math.abs(v) > l.width / 2 + w.t.playerRadius + margin) continue;
    const side = v >= 0 ? 1 : -1;
    const ex = -cy * side, ey = cx * side;
    if (p.speed < 120) return { x: ex, y: ey };
    // at speed, swerve (at most ~45° off your line) instead of turning square to the lane: a
    // full-lock turn scrubs Slipstream away (DECISIONS #47), and a swerve clears the lane anyway
    const off = wrapAngle(Math.atan2(ey, ex) - p.heading);
    const a = p.heading + Math.max(-0.8, Math.min(0.8, off));
    return { x: Math.cos(a), y: Math.sin(a) };
  }
  return null;
}

/** Never moves; mashes the attack. Must deal zero damage and lose. */
export function turretBot(): Bot {
  let i = 0;
  return () => ({ x: 0, y: 0, rip: i++ % 12 === 0, bolt: false });
}

/** Stays on top of the nearest Rammer at medium speed and taps the attack whenever it's close. */
export function brawlerBot(): Bot {
  return (w) => {
    const r = nearest(w);
    if (!r) return { x: 0, y: 0, rip: false, bolt: false };
    const d = Math.hypot(r.x - w.player.x, r.y - w.player.y);
    const s = toward(w, r.x, r.y, 0.68); // a partial tilt holds you at Cruise
    return { ...s, rip: d < 40, bolt: false };
  };
}

/** Waits at a distance for a charge, sidesteps it, then drives in and attacks while it skids. */
export function matadorBot(): Bot {
  return (w) => {
    const p = w.player;
    const r = nearest(w);
    if (!r) return { x: 0, y: 0, rip: false, bolt: false };
    const dg = dodge(w, 6);
    if (dg) return { ...dg, rip: false, bolt: false };
    const d = Math.hypot(r.x - p.x, r.y - p.y);
    if (r.state === 'skid') return { ...toward(w, r.x, r.y), rip: d < 45, bolt: !!p.tow };
    // otherwise hold position about 120 px away
    if (d < 100) return { ...toward(w, p.x * 2 - r.x, p.y * 2 - r.y), rip: false, bolt: !!p.tow };
    return { x: 0, y: 0, rip: false, bolt: !!p.tow };
  };
}

/** Is a point open floor (inside the walls, clear of pillars by a margin)? */
function open(w: World, x: number, y: number, m = 24): boolean {
  const a = w.arena;
  if (x < a.wall + m || y < a.wall + m || x > a.w - a.wall - m || y > a.h - a.wall - m) return false;
  return !a.pillars.some((p) => x > p.x - m && x < p.x + p.w + m && y > p.y - m && y < p.y + p.h + m);
}

/**
 * Hit-and-run: always moving, never parked. Circles the nearest Rammer about 140 px out at speed (a
 * wide arc costs no speed; a hairpin would), swerves past its charges, and cuts in for one pass
 * when it's open: at its back while it skids (that's where the booster comes off), or head-on into
 * a stalking one when it has HP to lose. Rips only when fast, close and lined up, carries straight
 * on through, and bolts on what it tore off when clear.
 */
export function hitAndRunBot(): Bot {
  let dir = 1;
  let flipCd = 0;
  let passT = 0;
  let striking = false;
  return (w) => {
    const p = w.player, t = w.t;
    flipCd = Math.max(0, flipCd - 1);
    if (passT > 0) {
      passT--;
      return { x: Math.cos(p.heading), y: Math.sin(p.heading), rip: false, bolt: false };
    }
    const dg = dodge(w);
    if (dg) {
      striking = false;
      return { ...dg, rip: false, bolt: false };
    }
    const r = nearest(w);
    const center = { x: w.arena.w / 2, y: w.arena.h / 2 };
    if (!r) return { ...toward(w, center.x + Math.cos(w.tick / 40) * 120, center.y + Math.sin(w.tick / 40) * 90), rip: false, bolt: !!p.tow && w.tick % 20 === 0 };
    const dx = r.x - p.x, dy = r.y - p.y, d = Math.hypot(dx, dy);
    const los = lineOfSight(w.arena, p.x, p.y, r.x, r.y);
    const bolt = !!p.tow && p.bolt === null && (d > 90 || r.state === 'skid') && w.tick % 10 === 0;
    const committed = r.state === 'skid' || r.state === 'charge' || (r.state === 'windup' && r.locked);
    // under the wave 1 safety net only a tear helps, so only its back is worth a pass
    const capped = r.booster && r.safety && r.hp <= 1;
    const skidOpen = r.state === 'skid' && r.t < r.skidFor - 0.35 && d < 230;
    // its front is armored (DECISIONS #55): only cut in on a stalking one when its flank is turned
    const flank = Math.abs(wrapAngle(Math.atan2(p.y - r.y, p.x - r.x) - r.face)) > 1.2;
    const headOn = r.state === 'stalk' && !capped && flank && d > 90 && d < 200;
    // chase its tail: once a charge has gone past, follow it at full throttle, so you're at
    // Slipstream behind it when it skids
    const behind = Math.abs(wrapAngle(Math.atan2(p.y - r.y, p.x - r.x) - r.face)) > Math.PI - 1.1;
    const chase = r.state === 'charge' && behind && d < 260;
    if (!striking && los && (chase || (p.speed >= t.slipAt - 15 && (skidOpen || headOn)))) striking = true;
    if (striking) {
      let tx = r.x, ty = r.y;
      if (committed) {
        // aim behind it: that's where the booster comes off, and away from the armored front
        tx = r.x - Math.cos(r.face) * 20;
        ty = r.y - Math.sin(r.face) * 20;
      }
      const off = Math.abs(wrapAngle(Math.atan2(ty - p.y, tx - p.x) - p.heading));
      if (p.part && !w.flat) {
        // with the Booster the button is the Burn: rev in a straight line at it, and let go just
        // before (or let the touch release it); never rev at a wall behind it
        if (p.rev !== null) {
          if (d > 28 && off < 0.5) return { x: Math.cos(p.heading), y: Math.sin(p.heading), rip: true, bolt: false };
          passT = 24;
          striking = false;
          return { x: Math.cos(p.heading), y: Math.sin(p.heading), rip: false, bolt: false };
        }
        const room = laneLength(w.arena, p.x, p.y, p.heading, 400, t.playerRadius);
        if (p.ripCd <= 0 && off < 0.3 && d > 40 && d < 200 && room > d + 50)
          return { x: Math.cos(p.heading), y: Math.sin(p.heading), rip: true, bolt: false };
        // the Booster can't turn in at full speed: ease off to tighten the turn, then rev
        if (off > 0.35) return { ...toward(w, tx, ty, 0.45), rip: false, bolt };
      } else if (p.speed >= t.slipAt && d < 46 && off < 0.6) {
        passT = 16;
        striking = false;
        return { x: Math.cos(p.heading), y: Math.sin(p.heading), rip: true, bolt: false };
      }
      const stale = capped && r.state !== 'skid' && r.state !== 'charge';
      // too close and too slow to hurt it: peel off and come round again (unless it's still
      // charging away, when following keeps the run-up going)
      const tooSlow = d < 70 && p.speed < t.slipAt && r.state !== 'charge';
      // (turning in from the circle starts ~90° off, so only give up past ~115°)
      if (tooSlow || off > 2.0 || !los || stale) striking = false;
      else return { ...toward(w, tx, ty), rip: false, bolt };
    }
    // a part on the floor (knocked loose, or torn off and dropped): go and get it while it's safe
    if (!p.tow && !committed) {
      const k = w.pickups.find((k) => Math.hypot(k.x - p.x, k.y - p.y) < 220 && Math.hypot(k.x - r.x, k.y - r.y) > 70);
      if (k) return { ...toward(w, k.x, k.y), rip: false, bolt };
    }
    // circle it ~140 px out, a little ahead on the circle (pure pursuit); go the other way round,
    // or wider or tighter, when a wall or pillar is in the way
    const a = Math.atan2(p.y - r.y, p.x - r.x);
    for (const flip of [1, -1])
      for (const R of [140, 110, 170]) {
        const g = a + dir * flip * 0.6;
        const gx = r.x + Math.cos(g) * R, gy = r.y + Math.sin(g) * R;
        if (!open(w, gx, gy)) continue;
        if (flip < 0) {
          if (flipCd > 0) continue;
          dir = -dir;
          flipCd = 45;
        }
        return { ...toward(w, gx, gy), rip: false, bolt };
      }
    return { ...toward(w, center.x, center.y), rip: false, bolt };
  };
}

/**
 * The degenerate "camper" the critic found: circles one pillar forever and rips whatever wanders
 * into the claw. Must lose to hit-and-run (the Rammer reads a steady loop; DECISIONS #49).
 */
export function camperBot(pillar = 0, radius = 44): Bot {
  return (w) => {
    const p = w.player, pr = w.arena.pillars[pillar];
    const cx = pr.x + pr.w / 2, cy = pr.y + pr.h / 2;
    const ahead = Math.atan2(p.y - cy, p.x - cx) + 0.55;
    let rip = false;
    for (const r of w.rammers) {
      const d = Math.hypot(r.x - p.x, r.y - p.y);
      const off = Math.abs(wrapAngle(Math.atan2(r.y - p.y, r.x - p.x) - p.heading));
      if (p.speed >= w.t.slipAt && d < 50 && off < 0.6 && p.ripCd <= 0) rip = true;
    }
    return { ...toward(w, cx + Math.cos(ahead) * radius, cy + Math.sin(ahead) * radius), rip, bolt: !!p.tow };
  };
}

/** Loops tightly around one pillar (the base Scrapper's natural route). */
export function looperBot(radius = 44): Bot {
  return (w) => {
    const p = w.player, pr = w.arena.pillars[0];
    const cx = pr.x + pr.w / 2, cy = pr.y + pr.h / 2;
    // aim a little ahead on the circle (pure pursuit)
    const ahead = Math.atan2(p.y - cy, p.x - cx) + 0.55;
    return { ...toward(w, cx + Math.cos(ahead) * radius, cy + Math.sin(ahead) * radius), rip: false, bolt: false };
  };
}

/**
 * Drives the long middle corridor end to end, braking and pivoting at each end. With the Booster
 * it revs a Burn down each straight and releases it before the wall.
 */
export function lanerBot(): Bot {
  let dir = 1;
  return (w) => {
    const p = w.player, a = w.arena;
    const y = a.h / 2;
    const end = dir > 0 ? a.w - a.wall - 40 : a.wall + 40;
    if ((dir > 0 && p.x > end) || (dir < 0 && p.x < end)) dir = -dir;
    const s = { x: dir, y: (y - p.y) / 40 };
    const m = Math.hypot(s.x, s.y);
    const burning = p.part === 'booster' && !w.flat;
    // rev while lined up and well short of the end; release ~90 px before it
    const toEnd = Math.abs((dir > 0 ? a.w - a.wall - 40 : a.wall + 40) - p.x);
    const aligned = Math.cos(p.heading) * dir > 0.97;
    const rip = burning && aligned && toEnd > 170 && p.ripCd <= 0;
    return { x: s.x / m, y: s.y / m, rip, bolt: false };
  };
}
