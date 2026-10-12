// The state of one encounter in The Ring. Pure data plus a constructor; the rules live in the
// other src/sim modules and run in a fixed order from tick.ts. No DOM, no audio, no Math.random.
import { Rng } from '../engine/rng';
import { RING, type ArenaDef, type Gate } from '../data/arena';
import { defaultTuning, type Tuning } from '../data/tuning';
import { WAVES, type WaveDef } from '../data/waves';
import { PARTS, type EnemyKind, type PartId } from '../data/parts';
import { MOUNTS, type MountSlot } from '../data/mounts';
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
  /** a ram hit with the Plow (contact, not the button) */
  plow?: boolean;
  /** enemies already hit by this rip */
  hits: number[];
}

/** A part bolted onto one of your mounts. */
export interface Bolted {
  id: PartId;
  /** it was knocked loose once already: the next hit shatters it (DECISIONS #58) */
  cracked: boolean;
}

/** Swinging round a bitten enemy with the Jaws. */
export interface Latch {
  id: number;
  t: number;
  /** the swing's center (the enemy when bitten), radius, start angle and direction */
  cx: number;
  cy: number;
  r: number;
  a0: number;
  dir: 1 | -1;
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
  /** the parts bolted on, one per mount (PLAN.md 8.2) */
  parts: Partial<Record<MountSlot, Bolted>>;
  /** power-sliding round with the Grip Treads instead of braking */
  slide: boolean;
  /** swinging round a bitten enemy with the Jaws */
  latch: Latch | null;
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

/** Rammer: enter, stalk, windup, charge, skid. Snapper: enter, hunt, windup, snap, slide, stunned. */
export type EnemyState = 'enter' | 'stalk' | 'windup' | 'charge' | 'skid' | 'hunt' | 'snap' | 'slide' | 'stunned';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  /** facing (rad) */
  face: number;
  hp: number;
  /** the parts it wears, on the same mounts as yours */
  parts: Partial<Record<MountSlot, PartId>>;
  safety: boolean;
  state: EnemyState;
  /** seconds in the current state */
  t: number;
  /** this attack's windup length and the locked part at its end */
  windup: number;
  lock: number;
  /** the current attack is the stripped shove, not the charge */
  shove: boolean;
  locked: boolean;
  travelled: number;
  /** how far the current charge runs, fixed when its lane locks */
  chargeLen: number;
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
  /** its own speed along its facing (a Snapper drives like you do) */
  speed: number;
  /** a sliding Snapper's line of travel (it faces round while it slides) */
  slideDir?: number;
}
/** The slice's name for an enemy; every enemy is a Rammer or a Snapper. */
export type Rammer = Enemy;

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

export type WavePhase = 'banner' | 'warn' | 'fight' | 'breather' | 'exit' | 'done';

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
  waves: WaveDef[];
  player: Player;
  enemies: Enemy[];
  pickups: Pickup[];
  nextId: number;
  wave: { index: number; phase: WavePhase; t: number; gates: Gate[] };
  /** ticks of hit-stop left: the sim is frozen, the renderer isn't */
  hitstop: number;
  events: SimEvent[];
  stats: Stats;
  /** cleared: the last yard (or a lone encounter) is done; exit: you drove out to the next yard */
  result: null | 'cleared' | 'scrapped' | 'exit';
  /** run no waves (tests and the route bots set up their own Rammers) */
  sandbox: boolean;
  /** in a run: the exit gates that open once the yard is cleared, each leading to a next-yard option */
  exitPlan: { gate: Gate['id']; option: number }[];
  /** the exits open now (the yard is cleared and you can drive out) */
  exits: { gate: Gate['id']; option: number }[];
  /** the option whose exit the player drove out through */
  exitChoice: number | null;
}

export interface WorldOpts {
  seed?: number;
  tuning?: Partial<Tuning>;
  flat?: boolean;
  sandbox?: boolean;
  arena?: ArenaDef;
  waves?: WaveDef[];
  /** in a run: the exit gates that open when the yard is cleared (none: the yard just ends) */
  exits?: { gate: Gate['id']; option: number }[];
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
    waves: opts.waves ?? WAVES,
    player: {
      x: s.x, y: s.y, heading: s.heading, speed: 0, face: 0,
      hull: t.hull, invuln: 0, knock: 0, stun: 0, brake: false,
      rip: null, ripCd: 0, ripBuf: 0, rev: null, pass: 0,
      parts: {}, slide: false, latch: null, tow: null, bolt: null, prevRip: false, prevBolt: false, tier: 'crawl', omega: 0, lastHeading: s.heading,
    },
    enemies: [],
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
    exitPlan: opts.exits ?? [],
    exits: [],
    exitChoice: null,
  };
}

export interface EnemyOpts {
  /** the parts it wears; default: its kind's own part (a Rammer's booster, a Snapper's treads) */
  parts?: PartId[];
  safety?: boolean;
  state?: EnemyState;
}

/** Add an enemy (waves use this; so do tests in sandbox mode). */
export function addEnemy(w: World, kind: EnemyKind, x: number, y: number, face = 0, opts: EnemyOpts = {}): Enemy {
  const parts: Partial<Record<MountSlot, PartId>> = {};
  for (const id of opts.parts ?? [kind === 'rammer' ? 'booster' : 'treads']) parts[PARTS[id].mount] = id;
  const e: Enemy = {
    id: w.nextId++, kind, x, y, face, hp: kind === 'rammer' ? w.t.rammerHp : w.t.snapperHp, parts, safety: !!opts.safety,
    state: opts.state ?? (kind === 'rammer' ? 'stalk' : 'hunt'), t: 0, windup: 0, lock: 0, shove: false, locked: false, travelled: 0, chargeLen: 0,
    cd: w.rng.range(0.6, 1.2), vx: 0, vy: 0, enter: { x: Math.cos(face), y: Math.sin(face) }, slammed: false, skidFor: w.t.skidTime, drafted: false, shaken: 0,
    speed: 0,
  };
  w.enemies.push(e);
  return e;
}

/** Add a Rammer, with its booster unless `booster: false` (the slice's tests). */
export function addRammer(w: World, x: number, y: number, face = 0, opts: { booster?: boolean; safety?: boolean; state?: EnemyState; parts?: PartId[] } = {}): Enemy {
  return addEnemy(w, 'rammer', x, y, face, { parts: opts.parts ?? (opts.booster === false ? [] : ['booster']), safety: opts.safety, state: opts.state });
}

/** Does this Rammer still have its booster (so it can charge)? */
export function hasBooster(e: Enemy): boolean {
  return e.parts.rear === 'booster';
}

export function hasAnyPart(e: Enemy): boolean {
  return MOUNTS.some((m) => !!e.parts[m]);
}

/** The player's bolted part with this id, if any. */
export function bolted(p: Player, id: PartId): Bolted | undefined {
  for (const m of MOUNTS) if (p.parts[m]?.id === id) return p.parts[m];
  return undefined;
}

/** Bolt a part straight onto its mount (tests, debug, the tuning panel). */
export function giveBolted(w: World, id: PartId, cracked = false) {
  w.player.parts[PARTS[id].mount] = { id, cracked };
}

export function boltedCount(p: Player): number {
  return MOUNTS.filter((m) => !!p.parts[m]).length;
}

/** Collision radius by kind. */
export function radiusOf(w: World, e: Enemy): number {
  return e.kind === 'rammer' ? w.t.rammerRadius : w.t.snapperRadius;
}

/** The tier a speed falls in (absolute marks; PLAN.md 4.2). */
export function tierOf(t: Tuning, speed: number): Tier {
  return speed >= t.slipAt ? 'slip' : speed >= t.cruiseAt ? 'cruise' : 'crawl';
}
