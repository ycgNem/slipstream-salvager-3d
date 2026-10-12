// Shared test helpers: open arenas, input frames, event capture.
import type { ArenaDef } from '../src/data/arena';
import { step } from '../src/sim/tick';
import type { SimEvent } from '../src/sim/events';
import { createWorld, type InputFrame, type World, type WorldOpts } from '../src/sim/world';

/** A big empty arena (walls only, far away) for straight-line measurements. */
export function openArena(w = 4000, h = 4000, start = { x: 200, y: 2000, heading: 0 }): ArenaDef {
  const T = 16;
  return {
    id: 'open', w, h, wall: T,
    solids: [
      { x: 0, y: 0, w, h: T }, { x: 0, y: h - T, w, h: T }, { x: 0, y: 0, w: T, h }, { x: w - T, y: 0, w: T, h },
    ],
    pillars: [],
    gates: [],
    playerStart: start,
  };
}

export function openWorld(opts: WorldOpts = {}): World {
  return createWorld({ sandbox: true, arena: openArena(), ...opts });
}

export const IN = (x: number, y: number, rip = false, bolt = false): InputFrame => ({ x, y, rip, bolt });
export const EAST = IN(1, 0);
export const IDLE = IN(0, 0);

/** Step once and return the events. */
export function tick(w: World, input: InputFrame): SimEvent[] {
  step(w, input);
  const ev = w.events.slice();
  w.events.length = 0;
  return ev;
}

/** Step until pred is true or n ticks pass; returns the tick count (or -1). */
export function until(w: World, input: InputFrame | ((w: World) => InputFrame), pred: (w: World) => boolean, n = 2000): number {
  for (let i = 0; i < n; i++) {
    if (pred(w)) return i;
    tick(w, typeof input === 'function' ? input(w) : input);
  }
  return pred(w) ? n : -1;
}

/** A stable hash of the parts of the world state that matter, for determinism checks. */
export function stateHash(w: World): string {
  const r = (v: number) => Math.round(v * 1000);
  const p = w.player;
  const parts = [w.tick, r(p.x), r(p.y), r(p.heading), r(p.speed), p.hull, Object.values(p.parts).map((b) => b!.id).join('+') || '-', p.tow?.part ?? '-'];
  for (const m of w.enemies) parts.push(m.id, m.kind, r(m.x), r(m.y), r(m.face), m.hp, m.state, Object.values(m.parts).join('+'));
  return parts.join(',');
}
