// The first-person input adapter (THREEJS-NOTES rule 11, PLAN.md "Steering is the second risk").
// The camera is bolted to the chassis, so the mouse never turns the view: it sets a *steer demand*,
// a heading the player wants, and the sim turns the body toward it at its own rate with its own
// scrub. A/D (and the stick) ask for a gentle turn, then a hard one if held. W thrusts, S
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

/** The direction sent to the sim never runs further than this ahead of the body (below its 150° brake). */
export const MAX_OFF = (75 * Math.PI) / 180;
/** ...but the demand itself can: a mouse turn is kept whole up to this, and worked off (DECISIONS #23) */
export const MAX_PEND = (175 * Math.PI) / 180;
/** keys and the stick turn the demand at most this fast (rad/s) at first: a tap never scrubs */
export const KEY_RATE = 4.2;
/** held longer than KEY_HARD_AFTER, they ramp up to this (or the body's own rate, if lower), which
 *  scrubs at speed like a hard mouse turn (the 2D rule: tight turns cost speed) */
export const KEY_RATE_HARD = 6.5;
const KEY_HARD_AFTER = 0.25, KEY_HARD_RAMP = 0.15;
/** with no thrust, a tiny stick magnitude lets the body turn while it coasts */
const COAST_STEER = 0.06;
/** stop asking to brake this far above the pivot speed, so S never flips the robot round (the sim's
 *  brake sheds 15 px/s a tick, and pivots at or below pivotSpeed) */
const BRAKE_MARGIN = 20;

export class Steer {
  /** the demanded heading, absolute (rad, sim space) */
  demand = 0;
  /** the demand's offset from the body this tick (rad, + = right), for the reticle */
  off = 0;
  /** the body is turning hard enough to scrub speed this tick */
  scrub = false;
  private init = false;
  private lastHeading = 0;
  /** how far the sim will turn the body this tick if nothing else moves it */
  private expected = 0;
  /** how long a turn key (or the stick) has been held one way (s) */
  private keyHeld = 0;
  private keyDir = 0;

  reset(heading: number) {
    this.demand = heading;
    this.off = 0;
    this.scrub = false;
    this.lastHeading = heading;
    this.expected = 0;
    this.keyHeld = 0;
    this.keyDir = 0;
    this.init = true;
  }

  /** One tick: read the controls, return the sim's input (x, y only; the caller adds rip and bolt). */
  update(w: World, s: SteerIn, cfg: SteerCfg): Pick<InputFrame, 'x' | 'y'> {
    const p = w.player, t = w.t;
    if (!this.init) this.reset(p.heading);
    // any turn the controls didn't ask for (a wall slide, a throw, aim assist) carries the demand
    // with it, so the body never steers back into a wall it just glanced off
    this.demand += wrapAngle(wrapAngle(p.heading - this.lastHeading) - this.expected);

    // S brakes only while it can't become the 2D pivot; below that it is just "no thrust", and the
    // controls still steer (you brake, then turn to face the Rammer)
    const braking = s.brake && p.speed > t.pivotSpeed + BRAKE_MARGIN;
    // the body can't follow a demand while a lunge, a Burn rev, a throw, a stun or a brake has it
    const locked = !!p.rip || revving(w) || p.knock > 0 || p.stun > 0 || braking;
    // the whole mouse turn is kept (up to MAX_PEND), so the same flick turns you the same amount at
    // any speed; the sim only ever sees MAX_OFF of it at a time
    let off = wrapAngle(this.demand - p.heading) + (cfg.invert ? -1 : 1) * s.mouseDx * cfg.sens;
    off = Math.max(-MAX_PEND, Math.min(MAX_PEND, off));
    // a demand the body can't act on fades fast instead of snapping the view later
    if (locked) off *= Math.exp(-DT / 0.1);

    // keys and stick: a turn at a gentle rate, then (held) a hard one, carrying the demand along
    const bodyRate = turnRate(playerStats(w), p.speed) * (p.bolt !== null ? t.boltSteerMul : 1);
    const k = Math.max(-1, Math.min(1, (s.right ? 1 : 0) - (s.left ? 1 : 0) + s.padX));
    const kd = Math.abs(k) < 0.2 ? 0 : Math.sign(k);
    this.keyHeld = kd !== 0 && kd === this.keyDir ? this.keyHeld + DT : 0;
    this.keyDir = kd;
    const hard = Math.max(0, Math.min(1, (this.keyHeld - KEY_HARD_AFTER) / KEY_HARD_RAMP));
    const keyRate = KEY_RATE + (KEY_RATE_HARD - KEY_RATE) * hard * Math.abs(k);
    const kOff = locked ? 0 : k * Math.min(bodyRate, keyRate) * DT;
    const want = Math.max(-MAX_PEND, Math.min(MAX_PEND, off + kOff));
    this.demand = p.heading + want;
    this.off = want;
    const target = p.heading + Math.max(-MAX_OFF, Math.min(MAX_OFF, want));

    let m = 0, dir = target;
    if (braking) {
      dir = p.heading + Math.PI;
      m = 1;
    } else if (s.thrust > 0.02 && !s.brake) m = Math.min(1, s.thrust);
    else if (Math.abs(want) > 1e-3) m = COAST_STEER;

    // what the sim will do with it (body.ts steer(): no turn while locked, braking or idle; at rest it snaps)
    const ask = wrapAngle(target - p.heading);
    const lim = p.speed < 1 ? Infinity : bodyRate * DT;
    this.expected = locked || m <= 0.05 ? 0 : Math.max(-lim, Math.min(lim, ask));
    this.scrub = p.speed >= 1 && p.speed * (Math.abs(this.expected) / DT) > t.scrubLat;
    this.lastHeading = p.heading;
    return { x: Math.cos(dir) * m, y: Math.sin(dir) * m };
  }

  /** Tell the adapter the sim didn't advance (hit-stop): nothing it expected happened. */
  held() {
    this.expected = 0;
    this.scrub = false;
  }
}

/** Mouse sensitivity setting (0..1) to radians per pixel: 0.5 is about 0.0024 rad/px. */
export function sensFromSetting(v: number): number {
  return 0.0006 * Math.pow(2, v * 4);
}
