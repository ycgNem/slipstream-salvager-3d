// The Rip and the Rammer (PLAN.md 4.2-4.3, DECISIONS #10, #30).
import { describe, expect, it } from 'vitest';
import { addRammer, createWorld, type World } from '../src/sim/world';
import { aimPoint, beginWindup } from '../src/sim/rammer';
import { IDLE, IN, openWorld, tick, until } from './helpers';

/** The player moving east at `speed`, with a Rammer `gap` px ahead facing `face`. */
function setup(speed: number, gap = 34, face = Math.PI, opts: { booster?: boolean; safety?: boolean } = {}) {
  const w = openWorld();
  w.player.x = 1000;
  w.player.y = 2000;
  w.player.heading = 0;
  w.player.speed = speed;
  const r = addRammer(w, 1000 + gap, 2000, face, opts);
  r.cd = 99;
  return { w, r };
}

const rip = (w: World) => tick(w, IN(1, 0, true));

describe('speed tiers', () => {
  it('Crawl: a clank, no damage, you bounce off', () => {
    const { w, r } = setup(60);
    const ev = [...rip(w), ...tick(w, IN(1, 0))];
    expect(ev.some((e) => e.k === 'clank' && !e.wall)).toBe(true);
    expect(r.hp).toBe(w.t.rammerHp);
    expect(w.stats.damageDealt).toBe(0);
  });

  it('Cruise: no damage, but it shoves the Rammer and cancels its windup', () => {
    const { w, r } = setup(150, 34);
    beginWindup(w, r, true);
    const x0 = r.x;
    const ev: string[] = [];
    for (let i = 0; i < 12; i++) ev.push(...(i === 0 ? rip(w) : tick(w, IN(1, 0))).map((e) => e.k));
    expect(ev).toContain('cancel');
    expect(r.hp).toBe(w.t.rammerHp);
    expect(r.state).not.toBe('windup');
    expect(r.x - x0).toBeGreaterThan(10);
  });

  it('Slipstream: 2 damage from the side, and you keep your speed', () => {
    const { w, r } = setup(220, 34, -Math.PI / 2);
    rip(w);
    for (let i = 0; i < 6; i++) tick(w, IN(1, 0));
    expect(r.hp).toBe(w.t.rammerHp - 2);
    expect(w.player.speed).toBeGreaterThan(200);
  });

  it('Slipstream into the front of a charge: the joust stops it, stuns it, and you are not hit (DECISIONS #56)', () => {
    const { w, r } = setup(220, 60, Math.PI);
    Object.assign(r, { state: 'charge', t: 0, travelled: 0 });
    const ev = [...rip(w)];
    for (let i = 0; i < 10; i++) ev.push(...tick(w, IN(1, 0)));
    expect(ev.some((e) => e.k === 'joust')).toBe(true);
    expect(r.state).toBe('skid');
    expect(r.slammed).toBe(true);
    expect(r.skidFor).toBe(w.t.joustStun);
    expect(r.hp).toBe(w.t.rammerHp - w.t.frontDamage);
    expect(w.player.hull).toBe(w.t.hull);
    expect(w.stats.hitsTaken).toBe(0);
  });

  it('locks the tier at the press: the lunge boost cannot turn Cruise into Slipstream', () => {
    const { w, r } = setup(170, 40);
    const ev = rip(w);
    expect(ev.find((e) => e.k === 'rip')).toMatchObject({ tier: 'cruise' });
    for (let i = 0; i < 10; i++) tick(w, IN(1, 0));
    expect(r.hp).toBe(w.t.rammerHp);
  });

  it('two Slipstream rips wreck a stripped Rammer', () => {
    const { w, r } = setup(230, 34, -Math.PI / 2, { booster: false });
    rip(w);
    for (let i = 0; i < 4; i++) tick(w, IN(1, 0));
    expect(r.hp).toBe(w.t.rammerHp - 2);
    Object.assign(w.player, { x: r.x - 34, y: r.y, heading: 0, speed: 230, ripCd: 0, prevRip: false, rip: null, pass: 0 });
    w.hitstop = 0;
    const ev = [...rip(w), ...tick(w, IN(1, 0)), ...tick(w, IN(1, 0))];
    expect(ev.some((e) => e.k === 'wreck')).toBe(true);
    expect(w.enemies.length).toBe(0);
  });
});

describe('the Rammer', () => {
  it('winds up quickly when you are close and slowly when you are far', () => {
    const w = createWorld({ sandbox: true });
    const near = addRammer(w, 320 + 60, 180, Math.PI);
    near.cd = 0;
    tick(w, IDLE);
    expect(near.state).toBe('windup');
    expect(near.windup).toBe(w.t.windupNear);
    const w2 = createWorld({ sandbox: true });
    const far = addRammer(w2, 320 + 150, 180, Math.PI);
    far.cd = 0;
    tick(w2, IDLE);
    expect(far.state).toBe('windup');
    expect(far.windup).toBe(w2.t.windupFar);
  });

  it('aims where the charge meets you (led by leadFrac), then locks the lane before charging', () => {
    const w = openWorld();
    Object.assign(w.player, { x: 1000, y: 2000, heading: Math.PI / 2, speed: 200 });
    const r = addRammer(w, 1150, 2000, Math.PI);
    beginWindup(w, r, false);
    const a = aimPoint(w, r);
    // the time to impact is the windup plus the flight to the led point itself (DECISIONS #48)
    const T = r.windup + Math.hypot(a.x - r.x, a.y - r.y) / w.t.chargeSpeed;
    expect(a.x).toBeCloseTo(w.player.x, 3);
    expect(a.y - w.player.y).toBeCloseTo(200 * T * w.t.leadFrac, 0); // ahead of you, down the screen
    let lockedAt = -1;
    for (let i = 0; i < 60; i++) {
      const ev = tick(w, IN(0, 1));
      if (ev.some((e) => e.k === 'lock')) lockedAt = i + 1;
      if (r.state === 'charge') break;
    }
    expect(lockedAt / 60).toBeCloseTo(w.t.windupFar - w.t.lockFar, 1);
  });

  it('reads a steady curve as well as a straight line', () => {
    const w = openWorld();
    // heading down the screen and curving clockwise on screen (toward the left)
    Object.assign(w.player, { x: 1000, y: 2000, heading: Math.PI / 2, speed: 200, omega: 1.5 });
    const r = addRammer(w, 1150, 2000, Math.PI);
    beginWindup(w, r, false);
    const a = aimPoint(w, r);
    expect(a.x).toBeLessThan(w.player.x - 20);
    expect(a.y).toBeGreaterThan(w.player.y);
  });

  it('rebounds off a pillar into the normal recovery (no long stun)', () => {
    const w = createWorld({ sandbox: true });
    const pr = w.arena.pillars[0];
    const r = addRammer(w, pr.x - 60, pr.y + pr.h / 2, 0);
    Object.assign(w.player, { x: 600, y: 330 });
    Object.assign(r, { state: 'charge', t: 0, travelled: 0 });
    const ev: string[] = [];
    for (let i = 0; i < 30 && r.state === 'charge'; i++) ev.push(...tick(w, IDLE).map((e) => e.k));
    expect(ev).toContain('slam');
    expect(r.state).toBe('skid');
    const n = until(w, IDLE, () => r.state !== 'skid', 200);
    expect(n / 60).toBeLessThanOrEqual(w.t.skidTime + 0.05);
  });

  it('two Rammers colliding in a charge both recover, with no damage', () => {
    const w = openWorld();
    Object.assign(w.player, { x: 300, y: 300 });
    const a = addRammer(w, 1000, 2000, 0), b = addRammer(w, 1040, 2000, Math.PI);
    a.state = 'charge';
    a.cd = b.cd = 99;
    const ev: string[] = [];
    for (let i = 0; i < 20; i++) ev.push(...tick(w, IDLE).map((e) => e.k));
    expect(ev).toContain('slam');
    expect(a.state).toBe('skid');
    expect(b.state).toBe('skid');
    expect(a.hp + b.hp).toBe(2 * w.t.rammerHp);
  });

  it('never has more than two winding up at once', () => {
    const w = createWorld({ sandbox: true });
    for (let i = 0; i < 4; i++) addRammer(w, 320 + Math.cos(i * 1.6) * 120, 180 + Math.sin(i * 1.6) * 100, 0).cd = 0;
    let max = 0;
    for (let i = 0; i < 120; i++) {
      tick(w, IDLE);
      max = Math.max(max, w.enemies.filter((r) => r.state === 'windup').length);
    }
    expect(max).toBeLessThanOrEqual(2);
  });

  it('a bump outside a rip starts its quick windup', () => {
    const w = openWorld();
    Object.assign(w.player, { x: 1000, y: 2000, heading: 0, speed: 100 });
    const r = addRammer(w, 1018, 2000, Math.PI);
    r.cd = 99;
    const ev = tick(w, IN(1, 0)).map((e) => e.k);
    expect(ev).toContain('bump');
    expect(r.state).toBe('windup');
    expect(r.windup).toBe(w.t.windupNear);
  });
});

describe('the slipstream (DECISIONS #61)', () => {
  it('a charge that just misses you lifts you to Slipstream', () => {
    const w = openWorld();
    Object.assign(w.player, { x: 1000, y: 2028, heading: Math.PI / 2, speed: 0 });
    const r = addRammer(w, 940, 2000, 0);
    Object.assign(r, { state: 'charge', t: 0, travelled: 0, cd: 99 });
    const ev: string[] = [];
    let top = 0;
    for (let i = 0; i < 20; i++) {
      ev.push(...tick(w, IDLE).map((e) => e.k));
      top = Math.max(top, w.player.speed);
    }
    expect(ev).toContain('draft');
    expect(ev).not.toContain('hurt');
    expect(top).toBeGreaterThanOrEqual(w.t.slipAt + w.t.draftBoost);
  });

  it('only once per charge, and never from a hit', () => {
    const w = openWorld();
    Object.assign(w.player, { x: 1000, y: 2000, heading: Math.PI / 2, speed: 0 });
    const r = addRammer(w, 940, 2000, 0);
    Object.assign(r, { state: 'charge', t: 0, travelled: 0, cd: 99 });
    const ev: string[] = [];
    for (let i = 0; i < 30; i++) ev.push(...tick(w, IDLE).map((e) => e.k));
    expect(ev).toContain('hurt');
    expect(ev).not.toContain('draft');
  });
});
