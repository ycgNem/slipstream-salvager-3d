// The state of one encounter in The Ring. Pure data plus a constructor; the rules live in the
// other src/sim modules and run in a fixed order from tick.ts. No DOM, no audio, no Math.random.
import { Rng } from '../engine/rng';
import { RING, type ArenaDef, type Gate } from '../data/arena';
import { defaultTuning, type Tuning } from '../data/tuning';
import type { PartId } from '../data/parts';
import type { SimEvent } from './events';

export const DT = 1 / 60;

export type Tier = 'crawl' | 'cruise' | 'slip';

/** What the player is pressing this tick. x, y: the steering vector (|v| <= 1). */
export interface InputFrame {
  x: number;
  y: number;
  rip: boolean;
  bolt: boolean;
}
export const NO_INPUT: InputFrame = { x: 0, y: 0, rip: false, bolt: false };

export interface RipState {
  /** seconds left in the lunge (or the burn) */
  t: number;
  tier: Tier;
  burn: boolean;
  /** Rammers already hit by this rip */
  hits: number[];
}

export interface Player {
  x: number;
  y: number;
  /** direction of motion (rad) */
  heading: number;
  speed: number;
  /** 8-way facing index for the sprite (with hysteresis) */
  face: number;
  hull: number;
  /** seconds of: invulnerability after a hit, thrown without control, stunned */
  invuln: number;
  knock: number;
  stun: number;
  /** braking against your motion (hysteresis state) */
  brake: boolean;
  rip: RipState | null;
  ripCd: number;
  /** a Rip pressed a moment too early is kept this long (s) and fires when it can */
  ripBuf: number;
  /** revving the Burn (Booster): seconds held */
  rev: number | null;
  /** seconds left passing through bodies */
  pass: number;
  /** the part bolted on (one rear mount) */
  part: PartId | null;
  /** it was knocked loose once already: the next hit shatters it (DECISIONS #58) */
  partCracked: boolean;
  /** the part towed behind on the cable */
  tow: { part: PartId; x: number; y: number; vx: number; vy: number; cracked: boolean } | null;
  /** seconds into bolting, or null */
  bolt: number | null;
  prevRip: boolean;
  prevBolt: boolean;
  tier: Tier;
  /** how fast you've been turning lately (rad/s, signed, smoothed), so a Rammer can read a curve */
  omega: number;
  lastHeading: number;
}

export type RammerState = 'enter' | 'stalk' | 'windup' | 'charge' | 'skid';

export interface Rammer {
  id: number;
  x: number;
  y: number;
  /** facing (rad) */
  face: number;
  hp: number;
  booster: boolean;
  safety: boolean;
  state: RammerState;
  /** seconds in the current state */
  t: number;
  /** this attack's windup length and the locked part at its end */
  windup: number;
  lock: number;
  /** the current attack is the stripped shove, not the charge */
  shove: boolean;
  locked: boolean;
  travelled: number;
  /** seconds until it may wind up again */
  cd: number;
  /** extra velocity (shoves, skids, rebounds), decays */
  vx: number;
  vy: number;
  enter: { x: number; y: number };
  /** the charge ended against a wall, pillar or Rammer (or a joust): it's stunned */
  slammed: boolean;
  /** how long this skid lasts (s) */
  skidFor: number;
  /** this charge already gave the player its slipstream */
  drafted: boolean;
  /** Slipstream hits taken at 1 HP under the wave 1 safety net */
  shaken: number;
}

export interface Pickup {
  id: number;
  part: PartId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  /** knocked off you once already: shatters if it comes off again */
  cracked: boolean;
}

export type WavePhase = 'banner' | 'warn' | 'fight' | 'breather' | 'done';

export interface Stats {
  ticks: number;
  topSpeed: number;
  slipHits: number;
  cruiseHits: number;
  crawlHits: number;
  tears: number;
  wrecks: number;
  damageDealt: number;
  hitsTaken: number;
  hullLost: number;
  partsShattered: number;
  /** parts knocked loose by hits (they can be grabbed again) */
  partsKnocked: number;
  jousts: number;
  /** ticks spent at each tier (for the route tests) */
  tierTicks: Record<Tier, number>;
}

export interface World {
  t: Tuning;
  /** flat mode, the removal test A/B: speed doesn't change damage, and parts add damage instead of changing how you move */
  flat: boolean;
  rng: Rng;
  seed: number;
  tick: number;
  arena: ArenaDef;
  player: Player;
  rammers: Rammer[];
  pickups: Pickup[];
  nextId: number;
  wave: { index: number; phase: WavePhase; t: number; gates: Gate[] };
  /** ticks of hit-stop left: the sim is frozen, the renderer isn't */
  hitstop: number;
  events: SimEvent[];
  stats: Stats;
  result: null | 'cleared' | 'scrapped';
  /** run no waves (tests and the route bots set up their own Rammers) */
  sandbox: boolean;
}

export interface WorldOpts {
  seed?: number;
  tuning?: Partial<Tuning>;
  flat?: boolean;
  sandbox?: boolean;
  arena?: ArenaDef;
}

export function createWorld(opts: WorldOpts = {}): World {
  const t = { ...defaultTuning(), ...opts.tuning };
  const arena = opts.arena ?? RING;
  const seed = opts.seed ?? 1;
  const s = arena.playerStart;
  return {
    t,
    flat: !!opts.flat,
    rng: new Rng(seed),
    seed,
    tick: 0,
    arena,
    player: {
      x: s.x, y: s.y, heading: s.heading, speed: 0, face: 0,
      hull: t.hull, invuln: 0, knock: 0, stun: 0, brake: false,
      rip: null, ripCd: 0, ripBuf: 0, rev: null, pass: 0,
      part: null, partCracked: false, tow: null, bolt: null, prevRip: false, prevBolt: false, tier: 'crawl', omega: 0, lastHeading: s.heading,
    },
    rammers: [],
    pickups: [],
    nextId: 1,
    wave: { index: 0, phase: opts.sandbox ? 'done' : 'banner', t: 0, gates: [] },
    hitstop: 0,
    events: [],
    stats: {
      ticks: 0, topSpeed: 0, slipHits: 0, cruiseHits: 0, crawlHits: 0, tears: 0, wrecks: 0,
      damageDealt: 0, hitsTaken: 0, hullLost: 0, partsShattered: 0, partsKnocked: 0, jousts: 0,
      tierTicks: { crawl: 0, cruise: 0, slip: 0 },
    },
    result: null,
    sandbox: !!opts.sandbox,
  };
}

/** Add a Rammer (waves use this; so do tests in sandbox mode). */
export function addRammer(w: World, x: number, y: number, face = 0, opts: { booster?: boolean; safety?: boolean; state?: RammerState } = {}): Rammer {
  const r: Rammer = {
    id: w.nextId++, x, y, face, hp: w.t.rammerHp, booster: opts.booster ?? true, safety: !!opts.safety,
    state: opts.state ?? 'stalk', t: 0, windup: 0, lock: 0, shove: false, locked: false, travelled: 0,
    cd: w.rng.range(0.6, 1.2), vx: 0, vy: 0, enter: { x: Math.cos(face), y: Math.sin(face) }, slammed: false, skidFor: w.t.skidTime, drafted: false, shaken: 0,
  };
  w.rammers.push(r);
  return r;
}

/** The tier a speed falls in (absolute marks; PLAN.md 4.2). */
export function tierOf(t: Tuning, speed: number): Tier {
  return speed >= t.slipAt ? 'slip' : speed >= t.cruiseAt ? 'cruise' : 'crawl';
}
