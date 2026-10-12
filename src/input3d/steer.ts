// The first-person input adapter (THREEJS-NOTES rule 11, PLAN.md "Steering is the second risk").
// The camera is bolted to the chassis, so the mouse never turns the view: it sets a *steer demand*,
// a heading the player wants, and the sim turns the body toward it at its own rate with its own
// scrub. A/D (and the stick) ask for a turn at a rate that never outruns the body. W thrusts, S
// brakes to a stop (without the 2D pivot). The output is the sim's ordinary stick vector:
// direction = the demanded heading, magnitude = thrust, so every movement rule applies untouched.
// Pure: no DOM, testable against the sim.
import { wrapAngle } from '../data/dirs';
import { playerStats, turnRate } from '../sim/body';
import { revving } from '../sim/rip';
import type { InputFrame, World } from '../sim/world';
import { DT } from '../sim/world';

export interface SteerIn {
  /** A / D (or arrows) held */
  left: boolean;
  right: boolean;
  /** 0..1 (W = 1; the pad's stick-up or right trigger is analog) */
  thrust: number;
  /** S held (or the stick pulled back / LT) */
  brake: boolean;
  /** pointer-lock mouse movement since the last tick (px) */
  mouseDx: number;
  /** the pad's stick X, -1..1 */
  padX: number;
}

export interface SteerCfg {
  /** radians of demand per mouse pixel */
  sens: number;
  invert: boolean;
}

/** The demand never runs further than this ahead of the body (below the sim's 150° brake angle). */
export const MAX_OFF = (75 * Math.PI) / 180;
/** keys and the stick turn the demand at most this fast (rad/s): the body may turn faster at rest */
export const KEY_RATE = 4.2;
/** with no thrust, a tiny stick magnitude lets the body turn while it coasts */
const COAST_STEER = 0.06;
/** stop asking to brake this far above the pivot speed, so S never flips the robot round */
const BRAKE_MARGIN = 20;

export class Steer {
  /** the demanded heading, absolute (rad, sim space) */
  demand = 0;
  /** the demand's offset from the body this tick (rad, + = right), for the reticle */
  off = 0;
  private init = false;
  private lastHeading = 0;
  /** how far the sim will turn the body this tick if nothing else moves it */
  private expected = 0;

  reset(heading: number) {
    this.demand = heading;
    this.off = 0;
    this.lastHeading = heading;
    this.expected = 0;
    this.init = true;
  }

  /** One tick: read the controls, return the sim's input (x, y only; the caller adds rip and bolt). */
  update(w: World, s: SteerIn, cfg: SteerCfg): Pick<InputFrame, 'x' | 'y'> {
    const p = w.player, t = w.t;
    if (!this.init) this.reset(p.heading);
    // any turn the controls didn't ask for (a wall slide, a throw, aim assist) carries the demand
    // with it, so the body never steers back into a wall it just glanced off
    this.demand += wrapAngle(wrapAngle(p.heading - this.lastHeading) - this.expected);

    // the body can't follow a demand while a lunge, a Burn rev, a throw or a stun has it
    const locked = !!p.rip || revving(w) || p.knock > 0 || p.stun > 0;
    let off = wrapAngle(this.demand - p.heading) + (cfg.invert ? -1 : 1) * s.mouseDx * cfg.sens;
    off = Math.max(-MAX_OFF, Math.min(MAX_OFF, off));
    // a demand the body can't act on fades fast instead of snapping the view later
    if (locked) off *= Math.exp(-DT / 0.1);

    // keys and stick: a turn at the body's own rate (capped), which carries the demand along
    const bodyRate = turnRate(playerStats(w), p.speed) * (p.bolt !== null ? t.boltSteerMul : 1);
    const k = Math.max(-1, Math.min(1, (s.right ? 1 : 0) - (s.left ? 1 : 0) + s.padX));
    const kOff = locked ? 0 : k * Math.min(bodyRate, KEY_RATE) * DT;
    const target = p.heading + off + kOff;
    this.demand = target;
    this.off = off + kOff;

    let m = 0, dir = target, braking = false;
    if (s.brake) {
      if (p.speed > t.pivotSpeed + BRAKE_MARGIN) {
        dir = p.heading + Math.PI;
        m = 1;
        braking = true;
      }
    } else if (s.thrust > 0.02) m = Math.min(1, s.thrust);
    else if (Math.abs(off + kOff) > 1e-3) m = COAST_STEER;

    // what the sim will do with it (body.ts steer(): no turn while locked, braking or idle; at rest it snaps)
    const ask = wrapAngle(target - p.heading);
    const lim = p.speed < 1 ? Infinity : bodyRate * DT;
    this.expected = locked || braking || m <= 0.05 ? 0 : Math.max(-lim, Math.min(lim, ask));
    this.lastHeading = p.heading;
    return { x: Math.cos(dir) * m, y: Math.sin(dir) * m };
  }

  /** Tell the adapter the sim didn't advance (hit-stop): nothing it expected happened. */
  held() {
    this.expected = 0;
  }
}

/** Mouse sensitivity setting (0..1) to radians per pixel: 0.5 is about 0.0024 rad/px. */
export function sensFromSetting(v: number): number {
  return 0.0006 * Math.pow(2, v * 4);
}
