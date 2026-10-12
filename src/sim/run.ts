// A run (PLAN.md 8.1): five yards in a row. The Ring first, three of the four middle yards chosen
// by driving out through one of two exit gates, The Heap last. Your hull, your bolted parts and
// the part on your cable carry from yard to yard; loose parts stay behind. Pure and deterministic
// (seeded), so bots can play whole runs headless.
import { Rng } from '../engine/rng';
import type { Gate } from '../data/arena';
import type { MountSlot } from '../data/mounts';
import type { PartId } from '../data/parts';
import type { Tuning } from '../data/tuning';
import { MIDDLE, RUN_LENGTH, YARDS, wavesAt, type YardId } from '../data/yards';
import { createWorld, tierOf, type Bolted, type World } from './world';

export interface Loadout {
  hull: number;
  parts: Partial<Record<MountSlot, Bolted>>;
  tow: { part: PartId; cracked: boolean } | null;
}

export interface RunTotals {
  ticks: number;
  tears: number;
  wrecks: number;
  slipHits: number;
  hitsTaken: number;
  jousts: number;
  partsShattered: number;
  topSpeed: number;
}

export interface Run {
  seed: number;
  rng: Rng;
  /** which yard of the run (1 = The Ring .. RUN_LENGTH = The Heap) */
  depth: number;
  yard: YardId;
  /** the yards visited so far, this one included */
  path: YardId[];
  /** where this yard's exits lead: one option per exit gate (none in the last yard) */
  options: YardId[];
  /** the gate you came in by (null in the first yard) */
  entry: Gate['id'] | null;
  loadout: Loadout | null;
  totals: RunTotals;
  over: null | 'won' | 'scrapped';
}

/** The exit gates for the options, left and right (one option: the east gate). */
const EXIT_GATES: Gate['id'][][] = [[], ['e'], ['w', 'e']];
const OPPOSITE: Record<Gate['id'], Gate['id']> = { w: 'e', e: 'w', n: 's', s: 'n' };

function nextOptions(run: Run): YardId[] {
  if (run.depth >= RUN_LENGTH) return [];
  if (run.depth + 1 === RUN_LENGTH) return ['heap'];
  const left = MIDDLE.filter((y) => !run.path.includes(y));
  return run.rng.shuffle([...left]).slice(0, 2);
}

export function newRun(seed: number, start: YardId = 'ring'): Run {
  const run: Run = {
    seed, rng: new Rng(seed ^ 0x5eed), depth: start === 'ring' ? 1 : start === 'heap' ? RUN_LENGTH : 2, yard: start, path: [start], options: [], entry: null, loadout: null,
    totals: { ticks: 0, tears: 0, wrecks: 0, slipHits: 0, hitsTaken: 0, jousts: 0, partsShattered: 0, topSpeed: 0 },
    over: null,
  };
  run.options = nextOptions(run);
  return run;
}

/** The world for the run's current yard, with your loadout carried in. */
export function yardWorld(run: Run, opts: { tuning?: Partial<Tuning>; flat?: boolean } = {}): World {
  const y = YARDS[run.yard];
  const gates = EXIT_GATES[run.options.length];
  const w = createWorld({
    seed: (run.seed * 31 + run.depth * 7919) >>> 0,
    tuning: opts.tuning,
    flat: opts.flat,
    arena: y.arena,
    waves: wavesAt(y, run.depth),
    exits: run.options.map((_, i) => ({ gate: gates[i], option: i })),
  });
  const p = w.player, L = run.loadout;
  if (L) {
    p.hull = L.hull;
    p.parts = { ...L.parts };
    if (L.tow) p.tow = { part: L.tow.part, x: p.x, y: p.y, vx: 0, vy: 0, cracked: L.tow.cracked };
  }
  if (run.entry) {
    // you drive in through the gate opposite the one you left by, still moving
    const g = y.arena.gates.find((q) => q.id === run.entry)!;
    Object.assign(p, { x: g.spawn.x + g.dir.x * 6, y: g.spawn.y + g.dir.y * 6, heading: Math.atan2(g.dir.y, g.dir.x), speed: 150 });
    p.lastHeading = p.heading;
    // the gauge and the claw show the tier you come in at, not Crawl for the first frames
    p.tier = tierOf(w.t, p.speed);
    if (p.tow) Object.assign(p.tow, { x: p.x - g.dir.x * 14, y: p.y - g.dir.y * 14 });
  }
  return w;
}

/** Fold a finished yard into the run: the totals, then the next yard or the end. */
export function finishYard(run: Run, w: World) {
  const s = w.stats, T = run.totals;
  T.ticks += s.ticks;
  T.tears += s.tears;
  T.wrecks += s.wrecks;
  T.slipHits += s.slipHits;
  T.hitsTaken += s.hitsTaken;
  T.jousts += s.jousts;
  T.partsShattered += s.partsShattered;
  T.topSpeed = Math.max(T.topSpeed, s.topSpeed);
  const p = w.player;
  run.loadout = { hull: p.hull, parts: { ...p.parts }, tow: p.tow ? { part: p.tow.part, cracked: p.tow.cracked } : null };
  if (w.result === 'scrapped') {
    run.over = 'scrapped';
    return;
  }
  if (w.result !== 'exit' || w.exitChoice === null) {
    run.over = 'won';
    return;
  }
  const exitGate = w.exits.find((e) => e.option === w.exitChoice)!.gate;
  run.yard = run.options[w.exitChoice];
  run.depth++;
  run.path.push(run.yard);
  run.entry = OPPOSITE[exitGate];
  run.options = nextOptions(run);
}
