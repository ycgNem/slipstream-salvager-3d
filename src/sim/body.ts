// The movement model (PLAN.md 4.2): velocity = heading × speed. Two-stage acceleration, a turn
// rate that falls with speed, turn scrub, coasting, brake-skid-pivot, overspeed decay, and how the
// robot meets walls (glancing slides, head-on clanks).
import { clamp, lerp } from '../engine/rng';
import { dirHyst, wrapAngle } from '../data/dirs';
import { PARTS, type AttackMode, type StatKey } from '../data/parts';
import { contacts } from './arena';
import { DT, tierOf, type InputFrame, type World } from './world';

export interface BodyStats {
  topSpeed: number;
  turnLow: number;
  turnHigh: number;
}

/**
 * The chassis numbers with the bolted part's multipliers applied. Flat mode ignores them: there a
 * part never changes how you move (it adds damage instead; DECISIONS #50).
 */
export function playerStats(w: World): BodyStats {
  const t = w.t;
  const s: BodyStats = { topSpeed: t.topSpeed, turnLow: t.turnLow, turnHigh: t.turnHigh };
  const part = w.player.part && !w.flat ? PARTS[w.player.part] : null;
  if (part) for (const [k, key] of Object.entries(part.stats) as [StatKey, keyof typeof t][]) s[k] *= t[key];
  return s;
}

/** How the Rip button attacks right now: the part's mode, or the plain Rip (always in flat mode). */
export function attackMode(w: World): AttackMode {
  if (w.flat || !w.player.part) return 'rip';
  return PARTS[w.player.part].behavior.attack ?? 'rip';
}

/** Turn rate (rad/s) at a speed. */
export function turnRate(st: BodyStats, speed: number): number {
  return lerp(st.turnLow, st.turnHigh, clamp(speed / st.topSpeed, 0, 1));
}

const halve = (v: number, half: number) => v * Math.pow(0.5, DT / Math.max(1e-3, half));

/** Steering and thrust for one tick while the player has control. */
export function steer(w: World, input: InputFrame) {
  const p = w.player, t = w.t;
  const st = playerStats(w);
  const m = Math.min(1, Math.hypot(input.x, input.y));

  if (p.rev !== null && p.rev >= t.burnTapTime) {
    // revving the Burn: heading locked, thrust climbs past top speed toward burnMax
    const a = p.speed < t.accSplit ? t.accLow : t.burnAccel;
    if (p.speed < t.burnMax) p.speed = Math.min(t.burnMax, p.speed + a * DT);
    return;
  }
  if (p.rip) {
    // a committed lunge: no steering, no thrust; overspeed falls back on its own
    decayOverspeed(w, st);
    return;
  }

  if (m > 0.05) {
    const target = Math.atan2(input.y, input.x);
    const delta = wrapAngle(target - p.heading);
    const ad = Math.abs(delta);
    const brakeAt = (t.brakeDeg * Math.PI) / 180;
    const hyst = (t.brakeHystDeg * Math.PI) / 180;
    if (p.brake) {
      if (ad < brakeAt - hyst) p.brake = false;
    } else if (ad > brakeAt && p.speed > t.pivotSpeed) {
      p.brake = true;
      w.events.push({ k: 'skid' });
    }
    if (p.brake) {
      p.speed = Math.max(0, p.speed - t.brakeDecel * DT);
      if (p.speed <= t.pivotSpeed) {
        p.heading = target;
        p.brake = false;
      }
    } else {
      if (p.speed < 1) p.heading = target;
      else {
        const rate = turnRate(st, p.speed) * (p.bolt !== null ? t.boltSteerMul : 1);
        const turn = clamp(delta, -rate * DT, rate * DT);
        p.heading = wrapAngle(p.heading + turn);
        // turn scrub: a turn that pulls harder than scrubLat sideways (speed × turn rate) bleeds
        // speed, at every speed, so tight turns drop you out of Slipstream (DECISIONS #47)
        const lateral = p.speed * (Math.abs(turn) / DT);
        if (lateral > t.scrubLat) p.speed = Math.max(0, p.speed - t.scrubK * (lateral - t.scrubLat) * DT);
      }
      const along = Math.max(0, Math.cos(wrapAngle(target - p.heading))) * m;
      const cap = st.topSpeed * m;
      if (p.speed < cap) {
        const a = p.speed < t.accSplit ? t.accLow : t.accHigh;
        p.speed = Math.min(cap, p.speed + a * along * DT);
      } else if (p.speed > st.topSpeed) decayOverspeed(w, st);
      else if (p.speed > cap) p.speed = cap + halve(p.speed - cap, t.coastHalf);
    }
  } else {
    p.brake = false;
    p.speed = halve(p.speed, t.coastHalf);
    if (p.speed < 0.5) p.speed = 0;
  }
}

function decayOverspeed(w: World, st: BodyStats) {
  const p = w.player;
  if (p.speed > st.topSpeed) p.speed = st.topSpeed + halve(p.speed - st.topSpeed, w.t.overspeedHalf);
}

/** Thrown by a hit or stunned: no control, speed bleeds off fast. */
export function drift(w: World) {
  const p = w.player;
  p.speed = halve(p.speed, p.stun > 0 ? 0.05 : 0.15);
  if (p.speed < 0.5) p.speed = 0;
}

/** Move the player one tick and resolve wall and pillar contacts. */
export function movePlayer(w: World) {
  const p = w.player, t = w.t;
  p.x += Math.cos(p.heading) * p.speed * DT;
  p.y += Math.sin(p.heading) * p.speed * DT;
  for (let pass = 0; pass < 2; pass++) {
    for (const c of contacts(w.arena, p.x, p.y, t.playerRadius)) {
      p.x += c.nx * c.depth;
      p.y += c.ny * c.depth;
      let vx = Math.cos(p.heading) * p.speed, vy = Math.sin(p.heading) * p.speed;
      const vn = vx * c.nx + vy * c.ny;
      if (vn >= 0) continue;
      const headOn = -vn / Math.max(p.speed, 1e-6);
      if (headOn > t.clankCos && p.speed > 40) {
        w.events.push({ k: 'clank', x: p.x - c.nx * t.playerRadius, y: p.y - c.ny * t.playerRadius, wall: true });
        if ((p.rev !== null && p.rev >= t.burnTapTime) || p.rip?.burn) {
          // you inherit the Rammer's weakness: burning into a wall stuns you
          p.rev = null;
          p.rip = null;
          p.ripCd = Math.max(p.ripCd, t.burnCooldown);
          p.stun = t.burnWallStun;
          p.speed = 0;
          w.events.push({ k: 'stun', x: p.x, y: p.y });
          continue;
        }
        if (p.rip) p.rip = null;
        vx -= 2 * vn * c.nx;
        vy -= 2 * vn * c.ny;
        p.heading = Math.atan2(vy, vx);
        p.speed *= t.clankKeep;
      } else {
        if (-vn > 40) w.events.push({ k: 'scrape', x: p.x - c.nx * t.playerRadius, y: p.y - c.ny * t.playerRadius });
        vx -= vn * c.nx;
        vy -= vn * c.ny;
        const s = Math.hypot(vx, vy);
        if (s > 0.01) p.heading = Math.atan2(vy, vx);
        p.speed = s;
      }
    }
  }
}

/** Update the 8-way facing and the speed tier after moving. */
export function settleFacing(w: World, input: InputFrame) {
  const p = w.player;
  // smoothed turn rate (half-life ~0.12 s): what a Rammer reads to lead a curve
  const k = 1 - Math.pow(0.5, DT / 0.12);
  p.omega += (wrapAngle(p.heading - p.lastHeading) / DT - p.omega) * k;
  p.lastHeading = p.heading;
  if (p.speed > 5) p.face = dirHyst(p.heading, p.face);
  else if (Math.hypot(input.x, input.y) > 0.3 && p.knock <= 0 && p.stun <= 0) p.face = dirHyst(Math.atan2(input.y, input.x), p.face);
  const tier = tierOf(w.t, p.speed);
  if (tier !== p.tier) {
    w.events.push({ k: 'tier', tier, prev: p.tier });
    p.tier = tier;
  }
}
