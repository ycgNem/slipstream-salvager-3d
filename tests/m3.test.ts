// Milestone 3 (PLAN.md section 8): the Snapper, the three mounts, and the new parts' behaviors.
import { describe, expect, it } from 'vitest';
import { addEnemy, addRammer, createWorld, giveBolted, type World } from '../src/sim/world';
import { chargeLength } from '../src/sim/rammer';
import { contacts } from '../src/sim/arena';
import { hitPlayer } from '../src/sim/salvage';
import { playerStats } from '../src/sim/body';
import { EAST, IDLE, IN, openWorld, tick, until } from './helpers';

const evs = (w: World, n: number, input = IDLE) => {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(...tick(w, typeof input === 'function' ? (input as any)(w) : input).map((e) => e.k));
  return out;
};

describe('the Snapper', () => {
  it('hunts you down, winds up a short snap and bites', () => {
    const w = openWorld();
    Object.assign(w.player, { x: 1000, y: 2000 });
    const s = addEnemy(w, 'snapper', 1200, 2000, Math.PI);
    s.cd = 0;
    const ev = evs(w, 240);
    expect(ev).toContain('windup');
    expect(ev).toContain('snap');
    expect(w.stats.hitsTaken).toBeGreaterThan(0);
  });

  it('power-slides round after a snap, side on, then hunts again', () => {
    const w = openWorld();
    Object.assign(w.player, { x: 1000, y: 2000, invuln: 99 });
    const s = addEnemy(w, 'snapper', 1060, 2000, Math.PI);
    Object.assign(s, { state: 'snap', t: 0, travelled: 0, cd: 99 });
    const states = new Set<string>();
    for (let i = 0; i < 80; i++) {
      tick(w, IDLE);
      states.add(s.state);
    }
    expect(states).toContain('slide');
    expect(s.state).toBe('hunt');
  });

  it('is slower than Slipstream: driving away at speed in a straight line, you outrun it', () => {
    const w = openWorld();
    Object.assign(w.player, { x: 1000, y: 2000, heading: 0, speed: 240 });
    const s = addEnemy(w, 'snapper', 960, 2000, 0);
    Object.assign(s, { speed: 175, cd: 99 });
    const d0 = Math.hypot(w.player.x - s.x, w.player.y - s.y);
    evs(w, 120, EAST);
    expect(Math.hypot(w.player.x - s.x, w.player.y - s.y)).toBeGreaterThan(d0 + 60);
  });

  it('a Slipstream hit on its side tears its treads off; then it limps', () => {
    const w = openWorld();
    Object.assign(w.player, { x: 1000, y: 2000, heading: 0, speed: 220 });
    const s = addEnemy(w, 'snapper', 1030, 2000, -Math.PI / 2);
    Object.assign(s, { state: 'slide', t: 0, skidFor: 9, speed: 0, cd: 99 });
    const ev = [...evs(w, 1, IN(1, 0, true)), ...evs(w, 4, EAST)];
    expect(ev).toContain('tear');
    expect(s.parts.sides).toBeUndefined();
    expect(w.player.tow?.part).toBe('treads');
    expect(s.hp).toBe(w.t.snapperHp);
  });

  it('its front glances for 1; its back wrecks it', () => {
    const w = openWorld();
    Object.assign(w.player, { x: 1000, y: 2000, heading: 0, speed: 220 });
    const a = addEnemy(w, 'snapper', 1030, 2000, Math.PI);
    a.cd = 99;
    evs(w, 1, IN(1, 0, true));
    evs(w, 4, EAST);
    expect(a.hp).toBe(w.t.snapperHp - w.t.frontDamage);
    const w2 = openWorld();
    Object.assign(w2.player, { x: 1000, y: 2000, heading: 0, speed: 220 });
    const b = addEnemy(w2, 'snapper', 1030, 2000, 0, { parts: [] });
    b.cd = 99;
    const ev = [...evs(w2, 1, IN(1, 0, true)), ...evs(w2, 4, EAST)];
    expect(ev).toContain('wreck');
  });
});

describe('three mounts', () => {
  it('a hit knocks off the part on the side it came from', () => {
    const w = openWorld();
    for (const id of ['booster', 'treads', 'jaws'] as const) giveBolted(w, id);
    w.player.heading = 0;
    hitPlayer(w, Math.PI); // thrown west: the hit came from the east, in front of you
    expect(w.player.parts.front).toBeUndefined();
    expect(w.player.parts.rear?.id).toBe('booster');
    w.player.invuln = 0;
    w.player.heading = 0;
    hitPlayer(w, 0); // from behind
    expect(w.player.parts.rear).toBeUndefined();
    expect(w.player.parts.sides?.id).toBe('treads');
    expect(w.player.hull).toBe(w.t.hull);
  });

  it('bolting a part puts it on its own mount; a part already there drops', () => {
    const w = openWorld();
    giveBolted(w, 'booster');
    w.player.tow = { part: 'treads', x: w.player.x - 14, y: w.player.y, vx: 0, vy: 0, cracked: false };
    tick(w, IN(0, 0, false, true));
    evs(w, 50);
    expect(w.player.parts.sides?.id).toBe('treads');
    expect(w.player.parts.rear?.id).toBe('booster');
    w.player.tow = { part: 'plow', x: w.player.x - 14, y: w.player.y, vx: 0, vy: 0, cracked: false };
    giveBolted(w, 'jaws');
    tick(w, IN(0, 0, false, true));
    evs(w, 50);
    expect(w.player.parts.front?.id).toBe('plow');
    expect(w.pickups.map((k) => k.part)).toContain('jaws');
  });
});

describe('Grip Treads', () => {
  it('turn the brake into a power-slide that keeps you at Slipstream through a reversal', () => {
    const w = openWorld();
    giveBolted(w, 'treads');
    until(w, EAST, () => false, 150);
    const ev = evs(w, 40, IN(-1, 0));
    expect(ev).toContain('slide');
    expect(ev).not.toContain('skid');
    expect(Math.cos(w.player.heading)).toBeLessThan(-0.95);
    expect(w.player.speed).toBeGreaterThanOrEqual(w.t.slipAt);
  });

  it('the base body brakes, stops and pivots instead', () => {
    const w = openWorld();
    until(w, EAST, () => false, 150);
    const ev = evs(w, 20, IN(-1, 0));
    expect(ev).toContain('skid');
    expect(w.player.speed).toBeLessThan(w.t.cruiseAt);
  });

  it('turn tighter, grip harder and cost top speed', () => {
    const w = openWorld();
    const bare = playerStats(w);
    giveBolted(w, 'treads');
    const st = playerStats(w);
    expect(st.turnHigh).toBeGreaterThan(bare.turnHigh * 1.2);
    expect(st.scrubLat).toBeGreaterThan(bare.scrubLat);
    expect(st.topSpeed).toBeLessThan(bare.topSpeed);
    expect(st.topSpeed).toBeGreaterThan(w.t.slipAt + 20);
  });
});

describe('the Plow', () => {
  it('makes driving into an enemy at Slipstream a hit, no button', () => {
    const w = openWorld();
    giveBolted(w, 'plow');
    Object.assign(w.player, { x: 1000, y: 2000, heading: 0, speed: 230 });
    const r = addRammer(w, 1040, 2000, -Math.PI / 2, { booster: false });
    r.cd = 99;
    const ev = evs(w, 10, EAST);
    expect(ev).toContain('ram');
    expect(r.hp).toBe(w.t.rammerHp - 2);
    expect(w.stats.hitsTaken).toBe(0);
  });

  it('blocks a charge that hits your front', () => {
    const w = openWorld();
    giveBolted(w, 'plow');
    Object.assign(w.player, { x: 1000, y: 2000, heading: 0, speed: 0 });
    const r = addRammer(w, 1060, 2000, Math.PI);
    Object.assign(r, { state: 'charge', t: 0, travelled: 0, cd: 99 });
    const ev = evs(w, 20);
    expect(ev).toContain('block');
    expect(w.stats.hitsTaken).toBe(0);
    expect(w.player.parts.front?.id).toBe('plow');
    expect(r.state).toBe('skid');
  });

  it("on a Plow Rammer, the front takes nothing, and the plow only comes off in a joust", () => {
    const w = openWorld();
    Object.assign(w.player, { x: 1000, y: 2000, heading: 0, speed: 220 });
    const r = addRammer(w, 1034, 2000, Math.PI, { parts: ['booster', 'plow'] });
    r.cd = 99;
    evs(w, 1, IN(1, 0, true));
    evs(w, 4, EAST);
    expect(r.hp).toBe(w.t.rammerHp);
    expect(r.parts.front).toBe('plow');
    const w2 = openWorld();
    Object.assign(w2.player, { x: 1000, y: 2000, heading: 0, speed: 220 });
    const r2 = addRammer(w2, 1060, 2000, Math.PI, { parts: ['booster', 'plow'] });
    Object.assign(r2, { state: 'charge', t: 0, travelled: 0, cd: 99 });
    const ev = [...evs(w2, 1, IN(1, 0, true)), ...evs(w2, 10, EAST)];
    expect(ev).toContain('joust');
    expect(ev).toContain('tear');
    expect(r2.parts.front).toBeUndefined();
    expect(w2.player.tow?.part).toBe('plow');
  });
});

describe('the Jaws', () => {
  it('a Slipstream hit bites on, whips you round and flings you back out the way you came, faster', () => {
    const w = openWorld();
    giveBolted(w, 'jaws');
    Object.assign(w.player, { x: 1000, y: 2000, heading: 0, speed: 220 });
    const r = addRammer(w, 1034, 2000, -Math.PI / 2, { booster: false });
    r.cd = 99;
    const ev = [...evs(w, 1, IN(1, 0, true)), ...evs(w, 30, IDLE)];
    expect(ev).toContain('latch');
    expect(ev).toContain('sling');
    expect(r.hp).toBe(w.t.rammerHp - 2);
    expect(Math.cos(w.player.heading)).toBeLessThan(-0.9);
    expect(w.player.x).toBeLessThan(r.x);
  });
});

describe("the critic's M3 fixes (DECISIONS #79)", () => {
  it("a back hit tears a Snapper's treads when nothing is on its rear (strip, don't wreck)", () => {
    const w = openWorld();
    Object.assign(w.player, { x: 1000, y: 2000, heading: 0, speed: 220 });
    const s = addEnemy(w, 'snapper', 1030, 2000, 0);
    s.cd = 99;
    const ev = [...evs(w, 1, IN(1, 0, true)), ...evs(w, 4, EAST)];
    expect(ev).toContain('tear');
    expect(ev).not.toContain('wreck');
    expect(s.parts.sides).toBeUndefined();
    expect(s.hp).toBe(w.t.snapperHp);
  });

  it('a charge runs chargeOver past where you were, within chargeMin..chargeMax', () => {
    const w = openWorld();
    const r = addRammer(w, 1000, 2000, 0);
    const at = (d: number) => {
      Object.assign(w.player, { x: 1000 + d, y: 2000 });
      return chargeLength(w, r);
    };
    expect(at(150)).toBe(150 + w.t.chargeOver);
    expect(at(20)).toBe(w.t.chargeMin);
    expect(at(400)).toBe(w.t.chargeMax);
  });

  it('a loose part never comes to rest inside a pillar', () => {
    const w = createWorld({ seed: 1 });
    const pr = w.arena.pillars[0];
    w.pickups.push({ id: 999, part: 'booster', x: pr.x + pr.w / 2, y: pr.y + pr.h / 2, vx: 0, vy: 0, age: 0, cracked: false });
    evs(w, 2);
    const k = w.pickups.find((q) => q.id === 999)!;
    expect(contacts(w.arena, k.x, k.y, 5)).toHaveLength(0);
  });

  it('a joust with the Jaws on stuns the charger without biting on', () => {
    const w = openWorld();
    giveBolted(w, 'jaws');
    Object.assign(w.player, { x: 1000, y: 2000, heading: 0, speed: 220 });
    const r = addRammer(w, 1060, 2000, Math.PI);
    Object.assign(r, { state: 'charge', t: 0, travelled: 0, cd: 99 });
    const ev = [...evs(w, 1, IN(1, 0, true)), ...evs(w, 10, EAST)];
    expect(ev).toContain('joust');
    expect(ev).not.toContain('latch');
  });
});
