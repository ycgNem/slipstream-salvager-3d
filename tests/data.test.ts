// Content is data: every reference is valid, and every part changes how you play. Plus the engine
// pieces that run in Node.
import { describe, expect, it } from 'vitest';
import { PARTS } from '../src/data/parts';
import { DEFAULT_TUNING, TUNING_GROUPS } from '../src/data/tuning';
import { WAVES } from '../src/data/waves';
import { RING } from '../src/data/arena';
import { PALETTE } from '../src/data/palette';
import { allSpriteNames, spriteSpec } from '../src/render/names';
import { DIRS, dirHyst, dirOf, wrapAngle } from '../src/data/dirs';
import { applyDeadzone } from '../src/engine/gamepad';
import { Rng } from '../src/engine/rng';
import { SONGS } from '../src/engine/audio/songs';

describe('data', () => {
  it('every part declares a behavior change, not only stat multipliers (DECISIONS #21)', () => {
    for (const p of Object.values(PARTS)) {
      expect(Object.keys(p.behavior).length, p.id).toBeGreaterThan(0);
      for (const key of Object.values(p.stats)) expect(DEFAULT_TUNING).toHaveProperty(key!);
    }
  });

  it('every tuning-panel key exists', () => {
    for (const g of TUNING_GROUPS) for (const [k] of g.keys) expect(DEFAULT_TUNING).toHaveProperty(k);
  });

  it('waves fit the arena, and wave 1 has the safety net', () => {
    for (const w of WAVES) expect(w.rammers).toBeLessThanOrEqual(RING.gates.length);
    expect(WAVES[0].safety).toBe(true);
  });

  it('the palette is Resurrect 64', () => {
    expect(PALETTE.length).toBe(64);
    expect(new Set(PALETTE).size).toBe(64);
  });

  it('every sprite name is unique and has a size and anchor', () => {
    const names = allSpriteNames();
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(() => spriteSpec(n)).not.toThrow();
    for (const p of Object.keys(PARTS)) for (const d of DIRS) expect(names).toContain(`part:${p}:${d}`);
  });
});

describe('engine', () => {
  it('rng is deterministic', () => {
    const a = new Rng(42), b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('directions: nearest, hysteresis and wrap', () => {
    expect(dirOf(0)).toBe(0);
    expect(dirOf(Math.PI / 2)).toBe(2); // south: y points down
    expect(dirOf(-Math.PI / 2)).toBe(6);
    expect(dirHyst((24 * Math.PI) / 180, 0)).toBe(0); // just past the boundary: stays
    expect(dirHyst((32 * Math.PI) / 180, 0)).toBe(1);
    expect(Math.abs(wrapAngle(3 * Math.PI))).toBeCloseTo(Math.PI);
  });

  it('gamepad deadzone is radial and rescaled', () => {
    expect(applyDeadzone(0.1, 0.1)).toEqual({ x: 0, y: 0 });
    expect(applyDeadzone(1, 0).x).toBeCloseTo(1);
    const d = applyDeadzone(0.6, 0.6);
    expect(Math.hypot(d.x, d.y)).toBeLessThanOrEqual(1);
    expect(d.x).toBeCloseTo(d.y);
  });

  it('the music loop compiles', () => {
    expect(SONGS.length).toBeGreaterThan(0);
    for (const s of SONGS) {
      expect(s.events.length).toBeGreaterThan(50);
      expect(s.length).toBeGreaterThan(0);
    }
  });
});
