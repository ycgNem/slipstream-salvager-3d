// Salvage and the Booster (PLAN.md 4.4, DECISIONS #12-#15, #32-#33).
import { describe, expect, it } from 'vitest';
import { addRammer, type World } from '../src/sim/world';
import { hitPlayer } from '../src/sim/salvage';
import { playerStats } from '../src/sim/body';
import { revving } from '../src/sim/rip';
import { IN, openWorld, tick, until } from './helpers';

/** Player moving east at speed toward a Rammer 34 px ahead facing `face` (0 = away from us). */
function setup(speed: number, face: number, opts: { safety?: boolean } = {}) {
  const w = openWorld();
  Object.assign(w.player, { x: 1000, y: 2000, heading: 0, speed });
  const r = addRammer(w, 1034, 2000, face, opts);
  r.cd = 99;
  return { w, r };
}
const rip = (w: World) => tick(w, IN(1, 0, true));

describe('tearing a part off', () => {
  it('a Slipstream hit on its back tears the booster off, does no damage, and the claw keeps it', () => {
    const { w, r } = setup(220, 0);
    const ev = [...rip(w), ...tick(w, IN(1, 0))].map((e) => e.k);
    expect(ev).toContain('tear');
    expect(ev).toContain('grab');
    expect(r.booster).toBe(false);
    expect(r.hp).toBe(w.t.rammerHp);
    expect(w.player.tow?.part).toBe('booster');
  });

  it('a Cruise hit on its back does not tear it off', () => {
    const { w, r } = setup(150, 0);
    rip(w);
    tick(w, IN(1, 0));
    expect(r.booster).toBe(true);
    expect(w.player.tow).toBeNull();
  });

  it('a Slipstream hit on its front glances off its armor for 1 instead (DECISIONS #55)', () => {
    const { w, r } = setup(220, Math.PI);
    const ev = [...rip(w), ...tick(w, IN(1, 0))];
    expect(r.booster).toBe(true);
    expect(r.hp).toBe(w.t.rammerHp - w.t.frontDamage);
    expect(ev.find((e) => e.k === 'hit')).toMatchObject({ zone: 'front', dmg: 1 });
  });

  it('a Slipstream hit on its side damages it for 2, and leaves the booster on', () => {
    const { w, r } = setup(220, -Math.PI / 2);
    rip(w);
    tick(w, IN(1, 0));
    expect(r.booster).toBe(true);
    expect(r.hp).toBe(w.t.rammerHp - 2);
  });

  it('wrecking a Rammer wrecks its booster', () => {
    const { w, r } = setup(220, -Math.PI / 2);
    r.hp = 2;
    const ev = [...rip(w), ...tick(w, IN(1, 0))];
    expect(ev.find((e) => e.k === 'wreck')).toMatchObject({ lost: 'booster' });
    expect(w.pickups.length).toBe(0);
    expect(w.player.tow).toBeNull();
  });

  it("wave 1's Rammer can't be wrecked while it has its booster, and shakes it loose after two hits at 1 HP", () => {
    const { w, r } = setup(220, -Math.PI / 2, { safety: true });
    for (let n = 0; n < 4; n++) {
      Object.assign(w.player, { x: r.x - 34, y: r.y, heading: 0, speed: 220, ripCd: 0, prevRip: false, invuln: 99, rip: null, pass: 0 });
      w.hitstop = 0;
      Object.assign(r, { face: -Math.PI / 2, state: 'skid' });
      rip(w);
      tick(w, IN(1, 0));
    }
    expect(w.rammers).toContain(r);
    expect(r.hp).toBe(1);
    expect(r.booster).toBe(false);
    expect(w.pickups.length).toBe(1);
  });
});

describe('bolting on', () => {
  function towing() {
    const w = openWorld();
    w.player.tow = { part: 'booster', x: w.player.x - 14, y: w.player.y, vx: 0, vy: 0, cracked: false };
    return w;
  }

  it('a tap starts a 0.7 s bolt that works while moving', () => {
    const w = towing();
    tick(w, IN(1, 0, false, true));
    expect(w.player.bolt).not.toBeNull();
    const n = until(w, IN(1, 0), (w) => w.player.part === 'booster', 120);
    expect((n + 1) / 60).toBeCloseTo(w.t.boltTime, 1);
    expect(w.player.tow).toBeNull();
    expect(w.player.speed).toBeGreaterThan(100);
  });

  it('a Rip cancels bolting', () => {
    const w = towing();
    tick(w, IN(1, 0, false, true));
    tick(w, IN(1, 0));
    const ev = tick(w, IN(1, 0, true)).map((e) => e.k);
    expect(ev).toContain('bolt-cancel');
    expect(w.player.bolt).toBeNull();
    expect(w.player.part).toBeNull();
  });

  it('a hit cancels bolting and knocks the towed part loose', () => {
    const w = towing();
    tick(w, IN(1, 0, false, true));
    hitPlayer(w, 0);
    expect(w.player.bolt).toBeNull();
    expect(w.player.tow).toBeNull();
    expect(w.pickups.length).toBe(1);
  });
});

describe('parts are armor', () => {
  it('a hit knocks the bolted part loose, cracked, before it touches the hull (DECISIONS #58)', () => {
    const w = openWorld();
    w.player.part = 'booster';
    hitPlayer(w, 0);
    expect(w.events.some((e) => e.k === 'knock')).toBe(true);
    expect(w.player.part).toBeNull();
    expect(w.player.hull).toBe(w.t.hull);
    expect(w.pickups).toMatchObject([{ part: 'booster', cracked: true }]);
    w.player.invuln = 0;
    hitPlayer(w, 0);
    expect(w.player.hull).toBe(w.t.hull - 1);
  });

  it('a cracked part shatters on the next hit', () => {
    const w = openWorld();
    w.player.part = 'booster';
    w.player.partCracked = true;
    hitPlayer(w, 0);
    expect(w.events.some((e) => e.k === 'shatter')).toBe(true);
    expect(w.pickups.length).toBe(0);
    expect(w.player.hull).toBe(w.t.hull);
  });

  it('a cracked part stays cracked through grabbing and bolting', () => {
    const w = openWorld();
    w.player.part = 'booster';
    hitPlayer(w, 0);
    const k = w.pickups[0];
    Object.assign(k, { x: w.player.x, y: w.player.y, vx: 0, vy: 0, age: 1 });
    Object.assign(w.player, { knock: 0, speed: 0 });
    tick(w, IN(0, 0));
    expect(w.player.tow).toMatchObject({ part: 'booster', cracked: true });
    tick(w, IN(0, 0, false, true));
    for (let i = 0; i < 50; i++) tick(w, IN(0, 0));
    expect(w.player.part).toBe('booster');
    expect(w.player.partCracked).toBe(true);
  });

  it('a charging Rammer crushes a loose part it runs over', () => {
    const w = openWorld();
    w.pickups.push({ id: 99, part: 'booster', x: 1100, y: 2000, vx: 0, vy: 0, age: 1, cracked: false });
    const r = addRammer(w, 1040, 2000, 0);
    Object.assign(r, { state: 'charge', t: 0, travelled: 0, cd: 99 });
    const ev: string[] = [];
    for (let i = 0; i < 20; i++) ev.push(...tick(w, IN(0, 0)).map((e) => e.k));
    expect(ev).toContain('crush');
    expect(w.pickups.length).toBe(0);
  });
});

describe("the Burn (the Booster turns the Rip into the Rammer's charge)", () => {
  it('from rest, revving reaches Slipstream in about 0.6 s, in a locked line', () => {
    const w = openWorld();
    w.player.part = 'booster';
    const h0 = w.player.heading;
    // held past the tap window the heading locks: steering down after that does nothing
    const n = until(w, (w) => IN(revving(w) ? 0 : 1, revving(w) ? 1 : 0, true), (w) => w.player.speed >= w.t.slipAt, 120);
    expect(n / 60).toBeGreaterThan(0.45);
    expect(n / 60).toBeLessThan(0.7);
    expect(w.player.heading).toBe(h0);
    expect(w.player.rev).not.toBeNull();
  });

  it('a tap is a plain Rip, not a Burn (DECISIONS #57)', () => {
    const w = openWorld();
    w.player.part = 'booster';
    Object.assign(w.player, { speed: 200 });
    const ev = [...tick(w, IN(1, 0, true)), ...tick(w, IN(1, 0, true)), ...tick(w, IN(1, 0, false))];
    expect(ev.filter((e) => e.k === 'rip')).toEqual([{ k: 'rip', tier: 'slip', burn: false }]);
    expect(ev.some((e) => e.k === 'rev')).toBe(false);
    expect(w.player.rev).toBeNull();
  });

  it('releasing burns through at the tier you reached, piercing', () => {
    const w = openWorld();
    w.player.part = 'booster';
    Object.assign(w.player, { x: 1000, y: 2000 });
    until(w, IN(1, 0, true), (w) => w.player.speed >= 250, 120);
    const a = addRammer(w, w.player.x + 40, 2000, Math.PI), b = addRammer(w, w.player.x + 80, 2000, Math.PI);
    a.cd = b.cd = 99;
    const ev = tick(w, IN(1, 0, false));
    expect(ev.find((e) => e.k === 'rip')).toMatchObject({ burn: true, tier: 'slip' });
    for (let i = 0; i < 24; i++) tick(w, IN(1, 0));
    expect(a.hp).toBe(w.t.rammerHp - w.t.frontDamage);
    expect(b.hp).toBe(w.t.rammerHp - w.t.frontDamage);
  });

  it('revving into a wall stuns you, like a Rammer', () => {
    const w = openWorld();
    w.player.part = 'booster';
    Object.assign(w.player, { x: 150, y: 2000, heading: Math.PI });
    const ev: string[] = [];
    for (let i = 0; i < 90; i++) ev.push(...tick(w, IN(-1, 0, true)).map((e) => e.k));
    expect(ev).toContain('stun');
  });

  it('flat mode keeps the plain Rip with the Booster (the removal test A/B)', () => {
    const w = openWorld({ flat: true });
    w.player.part = 'booster';
    const ev = tick(w, IN(1, 0, true)).map((e) => e.k);
    expect(ev).toContain('rip');
    expect(w.player.rev).toBeNull();
  });

  it('in flat mode a part never changes how you move; it adds damage (DECISIONS #50)', () => {
    const w = openWorld({ flat: true });
    const bare = playerStats(w);
    w.player.part = 'booster';
    expect(playerStats(w)).toEqual(bare);
    const r = addRammer(w, w.player.x + 20, w.player.y, -Math.PI / 2);
    r.cd = 99;
    tick(w, IN(1, 0, true));
    for (let i = 0; i < 12 && r.hp === w.t.rammerHp; i++) tick(w, IN(1, 0));
    expect(w.t.rammerHp - r.hp).toBe(w.t.flatDamage + w.t.flatPartDamage);
  });
});
