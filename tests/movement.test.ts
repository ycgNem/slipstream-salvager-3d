// The movement model's numbers (PLAN.md 4.2, DECISIONS #29).
import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/sim/world';
import { playerStats, turnRate } from '../src/sim/body';
import { EAST, IDLE, IN, openWorld, stateHash, tick, until } from './helpers';

describe('acceleration', () => {
  it('gets moving at once but takes a run-up to reach Slipstream (~0.8 s, ~90 px)', () => {
    const w = openWorld();
    const x0 = w.player.x;
    const toMove = until(w, EAST, (w) => w.player.speed >= 60);
    expect(toMove).toBeLessThanOrEqual(5);
    const w2 = openWorld();
    const n = until(w2, EAST, (w) => w.player.speed >= w.t.slipAt);
    expect(n / 60).toBeGreaterThan(0.7);
    expect(n / 60).toBeLessThan(0.9);
    expect(w2.player.x - x0).toBeGreaterThan(75);
    expect(w2.player.x - x0).toBeLessThan(110);
  });

  it('reaches Cruise quickly and tops out at top speed', () => {
    const w = openWorld();
    expect(until(w, EAST, (w) => w.player.speed >= w.t.cruiseAt) / 60).toBeLessThan(0.45);
    until(w, EAST, () => false, 180);
    expect(w.player.speed).toBeCloseTo(w.t.topSpeed, 3);
  });
});

describe('coasting and braking', () => {
  it('coasts about 100 px from top speed when you let go (responsive, not Asteroids)', () => {
    const w = openWorld();
    until(w, EAST, () => false, 180);
    const x0 = w.player.x;
    until(w, IDLE, (w) => w.player.speed === 0, 600);
    expect(w.player.x - x0).toBeGreaterThan(80);
    expect(w.player.x - x0).toBeLessThan(125);
  });

  it('brakes when you push hard against your motion, then pivots', () => {
    const w = openWorld();
    until(w, EAST, () => false, 120);
    const ev = tick(w, IN(-1, 0));
    expect(ev.some((e) => e.k === 'skid')).toBe(true);
    expect(w.player.brake).toBe(true);
    const n = until(w, IN(-1, 0), (w) => Math.cos(w.player.heading) < -0.99, 60);
    expect(n).toBeGreaterThan(0);
    expect(n / 60).toBeLessThan(0.3);
  });

  it("doesn't flicker between braking and turning on a keyboard back-diagonal", () => {
    const w = openWorld();
    until(w, EAST, () => false, 120);
    const d = IN(-Math.SQRT1_2, Math.SQRT1_2); // 135° from east: under the 150° brake threshold
    let flips = 0, last = w.player.brake;
    for (let i = 0; i < 30; i++) {
      tick(w, d);
      if (w.player.brake !== last) flips++;
      last = w.player.brake;
    }
    expect(flips).toBe(0);
    expect(w.player.brake).toBe(false);
  });
});

describe('turning', () => {
  it('turns tightly at low speed and wide at top speed (circle ~60 px at top)', () => {
    const w = createWorld();
    const st = playerStats(w);
    expect(turnRate(st, 0)).toBe(w.t.turnLow);
    const radius = st.topSpeed / turnRate(st, st.topSpeed);
    expect(radius).toBeGreaterThan(50);
    expect(radius).toBeLessThan(70);
  });

  it('scrubs speed in a tight orbit, so you fall out of Slipstream', () => {
    const w = openWorld();
    until(w, EAST, () => false, 120);
    expect(w.player.tier).toBe('slip');
    // orbit a point 30 px to the right of the robot: steer tangentially, always turning hard
    const cx = w.player.x, cy = w.player.y + 30;
    for (let i = 0; i < 90; i++) {
      const a = Math.atan2(w.player.y - cy, w.player.x - cx);
      tick(w, IN(Math.cos(a - Math.PI / 2 - 0.6), Math.sin(a - Math.PI / 2 - 0.6)));
    }
    expect(w.player.speed).toBeLessThan(w.t.slipAt);
  });
});

describe('walls', () => {
  it('slides along a wall on a glancing hit and clanks to a stop head-on', () => {
    const w = openWorld();
    w.player.x = 60;
    w.player.y = 2000;
    w.player.heading = Math.PI;
    w.player.speed = 200;
    let ev: string[] = [];
    for (let i = 0; i < 30; i++) ev.push(...tick(w, IN(-1, 0)).map((e) => e.k));
    expect(ev).toContain('clank');
    const g = openWorld();
    g.player.x = 60;
    g.player.y = 2000;
    g.player.heading = Math.PI - 0.35; // 20° off parallel... into the left wall at a shallow angle
    g.player.heading = Math.PI * 0.5 + 0.35; // heading mostly down, drifting left into the wall
    g.player.speed = 200;
    ev = [];
    for (let i = 0; i < 30; i++) ev.push(...tick(g, IN(Math.cos(g.player.heading), Math.sin(g.player.heading))).map((e) => e.k));
    expect(ev).not.toContain('clank');
    expect(g.player.speed).toBeGreaterThan(150);
  });
});

describe('determinism', () => {
  it('replays an input log to the same state', () => {
    const log = Array.from({ length: 900 }, (_, i) => IN(Math.cos(i / 40), Math.sin(i / 55), i % 47 === 0, i % 300 === 150));
    const a = createWorld({ seed: 7 }), b = createWorld({ seed: 7 });
    for (const f of log) { tick(a, f); tick(b, f); }
    expect(stateHash(a)).toBe(stateHash(b));
    expect(a.rammers.length + a.stats.wrecks).toBeGreaterThan(0);
  });
});
