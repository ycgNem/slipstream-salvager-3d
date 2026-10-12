// The first-person input adapter (THREEJS-NOTES rule 11, PLAN.md "Steering is the second risk").
// The camera is bolted to the chassis, so the mouse never turns the view: it sets a *steer demand*,
// a heading the player wants, and the sim turns the body toward it at its own rate with its own
// scrub. A/D (and the stick) ask for a gentle turn, then a hard one if held. W thrusts, S
// brakes to a stop (without the 2D pivot); with the Grip Treads bolted on, a tap of S at speed is
// the treads' power-slide, a U-turn that keeps your speed, aimed by the mouse and keys while it
// swings (DECISIONS #31, #35). The output is the sim's
// ordinary stick vector:
// direction = the demanded heading, magnitude = thrust, so every movement rule applies untouched.
// Pure: no DOM, testable against the sim.
import { wrapAngle } from '../data/dirs';
import { hasBehavior, playerStats, turnRate } from '../sim/body';
import { laneLength } from '../sim/arena';
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
/** ...but the demand itself can: a mouse turn is kept whole up to this, and worked off (DECISIONS #23),
 *  as long as that is at most PEND_TIME of the body's own turning (so a flick never commits you to a
 *  long turn after your hand has stopped: 175° at rest, ~155° at Slipstream, ~103° at top speed) */
export const MAX_PEND = (175 * Math.PI) / 180;
export const PEND_TIME = 0.45;
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
/** net speed loss (px/s²) a turn has to cost before it's shown and heard as scrub */
const SCRUB_SHOWN = 30;
/** the Grip Treads' slide is aimed this far short of a full reversal, so the sim swings it round
 *  the side you chose (an exact reversal has no side); normal steering finishes the turn */
const SLIDE_SHORT = 0.12;
/** while it swings, the mouse and keys aim the slide's exit up to this far either side of the reversal */
export const SLIDE_AIM = (60 * Math.PI) / 180;
/** the room a slide needs to the side it swings out to (px): with less, it goes round the other way */
const SLIDE_ROOM = 60;

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
  /** the power-slide (the Grip Treads): where it's aimed while the sim slides, from the heading it
   *  started on (side-relative and unwrapped, so aiming past the reversal can't flip its direction) */
  private slide: { base: number; side: number; aim: number; turned: number } | null = null;
  private brakeWas = false;

  /** the power-slide's target (absolute), or null */
  get slideTarget(): number | null {
    return this.slide ? this.slide.base + this.slide.side * this.slide.aim : null;
  }

  reset(heading: number) {
    this.slide = null;
    this.brakeWas = false;
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

    // the Grip Treads: no brake; a tap of S at speed power-slides you round (2D PLAN.md 8.4). The
    // sim swings round toward the stick while it slides: the target starts just short of a full
    // reversal on the side you chose, and the mouse and keys aim it while you swing
    const treads = hasBehavior(w, 'brake', 'slide');
    const brakeEdge = s.brake && !this.brakeWas;
    this.brakeWas = s.brake;
    if (!p.slide && this.slide !== null && !brakeEdge) {
      // the slide is over: steering finishes the turn to where it was aimed
      this.demand = this.slideTarget!;
      this.slide = null;
    }
    const kSide = (s.right ? 1 : 0) - (s.left ? 1 : 0) + s.padX;
    if (treads && brakeEdge && !p.slide && p.speed > t.pivotSpeed + 5 && !p.rip && !revving(w) && p.knock <= 0 && p.stun <= 0) {
      // round the side you're steering (keys, stick, else the mouse's demand), else the side with
      // room to swing out into (you can't see a wall beside you from the seat), else toward the
      // nearest enemy behind you, else to the right
      let side = Math.abs(kSide) > 0.2 ? Math.sign(kSide) : Math.abs(this.off) > 0.05 ? Math.sign(this.off) : 0;
      if (!side) {
        const room = (d: number) => laneLength(w.arena, p.x, p.y, p.heading + d * Math.PI / 2, SLIDE_ROOM, t.playerRadius);
        const r = room(1), l = room(-1);
        if (r < SLIDE_ROOM && l > r) side = -1;
        else if (l < SLIDE_ROOM && r > l) side = 1;
      }
      if (!side) {
        let best = Infinity;
        for (const e of w.enemies) {
          const d = Math.hypot(e.x - p.x, e.y - p.y), b = wrapAngle(Math.atan2(e.y - p.y, e.x - p.x) - p.heading);
          if (Math.abs(b) > Math.PI / 2 && d < best) {
            best = d;
            side = b >= 0 ? 1 : -1;
          }
        }
      }
      this.slide = { base: p.heading, side: side || 1, aim: Math.PI - SLIDE_SHORT, turned: 0 };
      this.lastHeading = p.heading;
    }
    if (this.slide !== null) {
      const sl = this.slide;
      sl.turned += sl.side * wrapAngle(p.heading - this.lastHeading);
      // aim it live: more turn or less, either side of the reversal, never so far past the body that
      // the sim would swing back the other way
      const k = Math.max(-1, Math.min(1, kSide));
      const nudge = (cfg.invert ? -1 : 1) * s.mouseDx * cfg.sens + (Math.abs(k) < 0.2 ? 0 : k * KEY_RATE_HARD * DT);
      sl.aim = Math.max(Math.PI - SLIDE_AIM, Math.min(Math.PI + SLIDE_AIM, sl.aim + sl.side * nudge));
      sl.aim = Math.min(sl.aim, sl.turned + Math.PI - SLIDE_SHORT);
      // until the sim has started sliding, it must still read as a reversal
      if (!p.slide) sl.aim = Math.max(sl.aim, (t.brakeDeg * Math.PI) / 180 + 0.05);
      const target = this.slideTarget!;
      this.demand = target;
      this.off = wrapAngle(target - p.heading);
      this.expected = 0;
      this.scrub = false;
      this.lastHeading = p.heading;
      return { x: Math.cos(target), y: Math.sin(target) };
    }

    // S brakes only while it can't become the 2D pivot; below that it is just "no thrust", and the
    // controls still steer (you brake, then turn to face the Rammer). With the treads it never brakes.
    const braking = s.brake && !treads && p.speed > t.pivotSpeed + BRAKE_MARGIN;
    // the body can't follow a demand while a lunge, a Burn rev, a throw, a stun or a brake has it
    const locked = !!p.rip || revving(w) || p.knock > 0 || p.stun > 0 || braking;
    // the whole mouse turn is kept (up to MAX_PEND), so the same flick turns you the same amount at
    // any speed; the sim only ever sees MAX_OFF of it at a time
    const bodyRate = turnRate(playerStats(w), p.speed) * (p.bolt !== null ? t.boltSteerMul : 1);
    const pend = Math.max(MAX_OFF, Math.min(MAX_PEND, bodyRate * PEND_TIME));
    let off = wrapAngle(this.demand - p.heading) + (cfg.invert ? -1 : 1) * s.mouseDx * cfg.sens;
    off = Math.max(-pend, Math.min(pend, off));
    // a demand the body can't act on fades fast instead of snapping the view later
    if (locked) off *= Math.exp(-DT / 0.1);

    // keys and stick: a turn at a gentle rate, then (held) a hard one, carrying the demand along
    const k = Math.max(-1, Math.min(1, (s.right ? 1 : 0) - (s.left ? 1 : 0) + s.padX));
    const kd = Math.abs(k) < 0.2 ? 0 : Math.sign(k);
    this.keyHeld = kd !== 0 && kd === this.keyDir ? this.keyHeld + DT : 0;
    this.keyDir = kd;
    const hard = Math.max(0, Math.min(1, (this.keyHeld - KEY_HARD_AFTER) / KEY_HARD_RAMP));
    const keyRate = KEY_RATE + (KEY_RATE_HARD - KEY_RATE) * hard * Math.abs(k);
    const kOff = locked ? 0 : k * Math.min(bodyRate, keyRate) * DT;
    const want = Math.max(-pend, Math.min(pend, off + kOff));
    this.demand = p.heading + want;
    this.off = want;
    const target = p.heading + Math.max(-MAX_OFF, Math.min(MAX_OFF, want));

    let m = 0, dir = target;
    if (braking) {
      dir = p.heading + Math.PI;
      m = 1;
    } else if (s.thrust > 0.02 && (!s.brake || treads)) m = Math.min(1, s.thrust);
    // (with the treads S isn't a brake: held on after a slide it doesn't cut your thrust)
    else if (Math.abs(want) > 1e-3) m = COAST_STEER;

    // what the sim will do with it (body.ts steer(): no turn while locked, braking or idle; at rest it snaps)
    const ask = wrapAngle(target - p.heading);
    const lim = p.speed < 1 ? Infinity : bodyRate * DT;
    this.expected = locked || m <= 0.05 ? 0 : Math.max(-lim, Math.min(lim, ask));
    // scrub that thrust can't replace: at top speed a turn just over scrubLat is won straight back,
    // and warning about it would teach "never turn"
    const loss = t.scrubK * (p.speed * (Math.abs(this.expected) / DT) - t.scrubLat);
    // (thrust only pushes along the nose: a target far off it, like a mouse flick's, barely pushes)
    const gain = m > 0.05 && !braking ? t.accHigh * m * Math.max(0, Math.cos(ask - this.expected)) : 0;
    this.scrub = p.speed >= 1 && loss - gain > SCRUB_SHOWN;
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
