// The removal-test guards (PLAN.md section 2): scripted players on 8 seeds. Standing still must
// lose, brawling and waiting-to-counter must do worse than hit-and-run, and the Booster must flip
// which route is best. If one of these fails, the identity is slipping, not just a number.
import { describe, expect, it } from 'vitest';
import { createWorld, type World } from '../src/sim/world';
import { step } from '../src/sim/tick';
import { brawlerBot, camperBot, hitAndRunBot, lanerBot, looperBot, matadorBot, turretBot, type Bot } from '../src/sim/bots';
import { openArena } from './helpers';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

/** Play wave 1 for up to `secs`. */
function wave1(bot: Bot, seed: number, secs = 90): World {
  const w = createWorld({ seed });
  for (let i = 0; i < secs * 60 && !w.result && w.wave.index < 1; i++) {
    step(w, bot(w));
    w.events.length = 0;
  }
  return w;
}

function totals(mk: () => Bot) {
  const ws = SEEDS.map((s) => wave1(mk(), s));
  const sum = (f: (w: World) => number) => ws.reduce((a, w) => a + f(w), 0);
  return {
    dealt: sum((w) => w.stats.damageDealt),
    taken: sum((w) => w.stats.hitsTaken),
    perHit: sum((w) => w.stats.damageDealt) / Math.max(1, sum((w) => w.stats.hitsTaken)),
    cleared: ws.filter((w) => w.wave.index >= 1).length,
    scrapped: ws.filter((w) => w.result === 'scrapped').length,
  };
}

describe('removal-test guards', () => {
  const run = totals(hitAndRunBot);

  it('standing still and mashing the attack deals zero damage and loses', () => {
    const t = totals(turretBot);
    expect(t.dealt).toBe(0);
    expect(t.scrapped).toBe(SEEDS.length);
  });

  it('brawling at medium speed does worse than hit-and-run', () => {
    const t = totals(brawlerBot);
    expect(t.dealt).toBe(0); // Cruise never damages
    expect(t.perHit).toBeLessThan(run.perHit);
  });

  it('waiting for a charge and countering does worse than hit-and-run', () => {
    expect(totals(matadorBot).perHit).toBeLessThan(run.perHit);
  });

  it('hit-and-run clears wave 1 on most seeds, taking at most one hit on average', () => {
    // 6 of 8: the bot is a simple script that sometimes fails to get behind the wave 1 Rammer in
    // time (DECISIONS #34); a person does better
    expect(run.cleared).toBeGreaterThanOrEqual(6);
    expect(run.taken / SEEDS.length).toBeLessThanOrEqual(1);
    expect(run.scrapped).toBe(0);
  });
});

describe('the Booster changes how you play (route flip)', () => {
  /** share of 40 s spent at Slipstream driving a route in The Ring, and how often it hit a wall */
  function slipShare(bot: Bot, booster: boolean) {
    const w = createWorld({ seed: 1, sandbox: true });
    if (booster) w.player.part = 'booster';
    let clanks = 0;
    for (let i = 0; i < 2400; i++) {
      step(w, bot(w));
      clanks += w.events.filter((e) => e.k === 'clank').length;
      w.events.length = 0;
    }
    return { share: w.stats.tierTicks.slip / 2400, clanks };
  }
  const bl = slipShare(looperBot(), false), bn = slipShare(lanerBot(), false);
  const base = { loop: bl.share, lane: bn.share };
  const boost = { loop: slipShare(looperBot(), true).share, lane: slipShare(lanerBot(), true).share };

  it('on the base body, tight pillar loops beat long lanes', () => {
    expect(bl.clanks).toBe(0); // a clean loop, not one propped up by the walls
    expect(base.loop).toBeGreaterThan(base.lane + 0.15);
  });

  /**
   * The tightest circle a body can hold at Slipstream, in open floor (no walls to blame): drive a
   * circle of radius r at a steady 200 px/s and see if it holds both the radius and Slipstream.
   */
  function tightestSlipCircle(booster: boolean): number {
    for (let r = 24; r <= 160; r += 2) {
      const w = createWorld({ sandbox: true, arena: openArena() });
      if (booster) w.player.part = 'booster';
      const cx = 2000, cy = 2000;
      Object.assign(w.player, { x: cx, y: cy + r, heading: 0, speed: 200 });
      let ok = true;
      for (let i = 0; i < 300; i++) {
        const p = w.player, a = Math.atan2(p.y - cy, p.x - cx), d = Math.hypot(p.x - cx, p.y - cy);
        const want = a - Math.PI / 2 - Math.max(-1, Math.min(1, (d - r) * 0.08));
        const m = 200 / w.t.topSpeed / (booster ? w.t.boosterTopMul : 1);
        step(w, { x: Math.cos(want) * m, y: Math.sin(want) * m, rip: false, bolt: false });
        w.events.length = 0;
        if (i > 120 && (p.tier !== 'slip' || Math.abs(d - r) > 6)) ok = false;
      }
      if (ok) return r;
    }
    return Infinity;
  }

  it('the Booster widens the tightest circle you can hold at Slipstream', () => {
    const bare = tightestSlipCircle(false), boosted = tightestSlipCircle(true);
    expect(bare).toBeLessThanOrEqual(48); // round a pillar (DECISIONS #47)
    expect(boosted).toBeGreaterThanOrEqual(bare * 1.2);
  });

  it('with the Booster, long lanes beat tight loops', () => {
    expect(boost.lane).toBeGreaterThan(boost.loop);
    expect(boost.loop).toBeLessThan(base.loop - 0.15);
    expect(boost.lane).toBeGreaterThanOrEqual(base.lane);
  });
});

describe('the full slice (40 seeds, all three waves)', () => {
  function full(bot: Bot, seed: number) {
    const w = createWorld({ seed });
    let outside = false;
    const inside = (x: number, y: number, r: number) =>
      x >= w.arena.wall + r - 0.5 && y >= w.arena.wall + r - 0.5 && x <= w.arena.w - w.arena.wall - r + 0.5 && y <= w.arena.h - w.arena.wall - r + 0.5;
    for (let i = 0; i < 600 * 60 && !w.result; i++) {
      step(w, bot(w));
      w.events.length = 0;
      if (!inside(w.player.x, w.player.y, w.t.playerRadius) || w.rammers.some((r) => !inside(r.x, r.y, w.t.rammerRadius))) outside = true;
    }
    return { cleared: w.result === 'cleared', outside, wave: w.wave.index };
  }
  const seeds = Array.from({ length: 40 }, (_, i) => 300 + i);
  const hr = seeds.map((s) => full(hitAndRunBot(), s));
  const camp = seeds.map((s) => full(camperBot(), s));

  it("nobody is ever pushed out of the arena (the critic's softlock)", () => {
    expect([...hr, ...camp].filter((r) => r.outside).length).toBe(0);
  });

  it('circling one pillar and ripping whatever comes close does worse than hit-and-run', () => {
    // (the critic measured the camper clearing 21-23 of 40 against hit-and-run's 13; DECISIONS #49)
    const cleared = (rs: typeof hr) => rs.filter((r) => r.cleared).length;
    expect(cleared(camp)).toBeLessThan(cleared(hr) * 0.6);
  });
});
