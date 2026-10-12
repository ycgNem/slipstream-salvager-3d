// The run (PLAN.md 8.1): five yards, exits you drive out through, the loadout carried between yards.
import { signLayout } from '../src/ui/signs';
import { describe, expect, it } from 'vitest';
import { finishYard, newRun, yardWorld } from '../src/sim/run';
import { step } from '../src/sim/tick';
import { drafterBot, exitInput, hitAndRunBot } from '../src/sim/bots';
import { giveBolted } from '../src/sim/world';
import { MIDDLE, RUN_LENGTH, YARDS, wavesAt, type YardId } from '../src/data/yards';
import { PARTS } from '../src/data/parts';

describe('the run', () => {
  it('starts in The Ring with two middle yards on offer, and ends in The Heap', () => {
    const r = newRun(5);
    expect(r.yard).toBe('ring');
    expect(r.options.length).toBe(2);
    for (const o of r.options) expect(MIDDLE).toContain(o);
    const w = yardWorld(r);
    expect(w.exitPlan.map((e) => e.gate).sort()).toEqual(['e', 'w']);
  });

  it('a cleared yard opens its exits; driving out picks the next yard and carries your loadout', () => {
    const r = newRun(7);
    const w = yardWorld(r);
    giveBolted(w, 'booster');
    w.player.hull = 3;
    // skip to the end of the last wave
    w.wave.index = w.waves.length - 1;
    w.wave.phase = 'fight';
    step(w, { x: 0, y: 0, rip: false, bolt: false });
    expect(w.wave.phase).toBe('exit');
    expect(w.player.hull).toBe(4); // patched up a pip
    for (let i = 0; i < 1200 && !w.result; i++) step(w, exitInput(w, 1)!);
    expect(w.result).toBe('exit');
    expect(w.exitChoice).toBe(1);
    const next = r.options[1];
    finishYard(r, w);
    expect(r.yard).toBe(next);
    expect(r.depth).toBe(2);
    const w2 = yardWorld(r);
    expect(w2.player.hull).toBe(4);
    expect(w2.player.parts.rear?.id).toBe('booster');
    expect(w2.arena).toBe(YARDS[next].arena);
    // you came in by the gate opposite the one you left by, still moving
    expect(w2.player.speed).toBeGreaterThan(100);
    expect(w2.player.x).toBeLessThan(80);
  });

  it('visits three of the four middle yards, then The Heap, with no repeats', () => {
    const r = newRun(11);
    while (r.depth < RUN_LENGTH) {
      const w = yardWorld(r);
      w.result = 'exit';
      w.exits = w.exitPlan;
      w.exitChoice = 0;
      finishYard(r, w);
    }
    expect(r.yard).toBe('heap');
    expect(new Set(r.path).size).toBe(RUN_LENGTH);
    expect(r.options).toEqual([]);
  });

  it('later middle yards send more enemies in their last wave (composition, not a clock)', () => {
    const y = YARDS.kennel;
    const n = (d: number) => wavesAt(y, d).at(-1)!.enemies.length;
    expect(n(3)).toBe(n(2) + 1);
    expect(n(4)).toBe(n(2) + 2);
  });

  it('every yard fits its gates and every enemy part is a real part on its own mount', () => {
    for (const y of Object.values(YARDS))
      for (const wv of y.waves)
        for (const e of wv.enemies) for (const id of e.parts ?? []) expect(PARTS[id]).toBeTruthy();
  });

  it('bots play every yard on many seeds without breaking the sim or leaving the arena', () => {
    let dealt = 0;
    const yards = Object.keys(YARDS) as (keyof typeof YARDS)[];
    for (let seed = 1; seed <= 12; seed++) {
      const r = newRun(seed, yards[seed % yards.length]);
      let guard = 0;
      while (!r.over && guard++ < 6) {
        const w = yardWorld(r);
        const bot = seed % 3 ? drafterBot(seed % 2) : hitAndRunBot(seed % 2);
        for (let i = 0; i < 240 * 60 && !w.result; i++) {
          step(w, bot(w));
          w.events.length = 0;
          const p = w.player;
          expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
          if (!w.exits.length) {
            expect(p.x).toBeGreaterThanOrEqual(w.arena.wall + w.t.playerRadius - 1);
            expect(p.x).toBeLessThanOrEqual(w.arena.w - w.arena.wall - w.t.playerRadius + 1);
          }
          for (const e of w.enemies) expect(Number.isFinite(e.x) && Number.isFinite(e.y)).toBe(true);
        }
        // a yard the bot can't finish in 4 minutes counts as lost (the bots aren't players)
        dealt += w.stats.damageDealt + w.stats.tears;
        if (!w.result) w.result = 'scrapped';
        finishYard(r, w);
      }
      expect(r.over).not.toBeNull();
    }
    expect(dealt).toBeGreaterThan(0);
  });
});

describe('exit signs (DECISIONS #80)', () => {
  it('never cover a wall, a block or a post, in any yard, for any destination and depth', () => {
    const hits: string[] = [];
    for (const here of Object.values(YARDS))
      for (const g of here.arena.gates.filter((q) => q.id === 'w' || q.id === 'e'))
        for (const dest of Object.keys(YARDS) as YardId[])
          for (let depth = 2; depth <= RUN_LENGTH; depth++) {
            const s = signLayout(g, dest, depth);
            if (s.w > 104) hits.push(`${dest} sign is ${s.w} px wide`);
            if (s.x < here.arena.wall || s.x + s.w > here.arena.w - here.arena.wall) hits.push(`${here.id} ${g.id}: off the floor`);
            for (const r of here.arena.pillars)
              if (s.x < r.x + r.w + 2 && s.x + s.w > r.x - 2 && s.y < r.y + r.h + 2 && s.y + s.h > r.y - 2) hits.push(`${here.id} ${g.id} -> ${dest} @${depth}: covers ${JSON.stringify(r)}`);
          }
    expect([...new Set(hits)]).toEqual([]);
  });
});
