// The first-person input adapter against the real sim: the body, not the mouse, decides how fast
// you turn; keys never trigger the sim's brake-and-pivot; S stops you without flipping you round.
import { describe, expect, it } from 'vitest';
import { step } from '../src/sim/tick';
import { createWorld, type World } from '../src/sim/world';
import { MAX_OFF, Steer, type SteerIn } from '../src/input3d/steer';
import { openArena } from './helpers';
import { wrapAngle } from '../src/data/dirs';

const IDLE: SteerIn = { left: false, right: false, thrust: 0, brake: false, mouseDx: 0, padX: 0 };
const cfg = { sens: 0.0025, invert: false };

function drive(w: World, s: Steer, input: Partial<SteerIn>, n: number) {
  for (let i = 0; i < n; i++) {
    const xy = s.update(w, { ...IDLE, ...input }, cfg);
    step(w, { ...xy, rip: false, bolt: false });
    w.events.length = 0;
  }
}

function world() {
  return createWorld({ sandbox: true, arena: openArena() });
}

describe('first-person steering', () => {
  it('W from rest reaches Slipstream in about the 2D time (~0.8 s)', () => {
    const w = world(), s = new Steer();
    let n = 0;
    while (w.player.speed < w.t.slipAt && n < 200) {
      drive(w, s, { thrust: 1 }, 1);
      n++;
    }
    expect(n / 60).toBeGreaterThan(0.6);
    expect(n / 60).toBeLessThan(1.0);
    expect(Math.abs(w.player.heading)).toBeLessThan(1e-6);
  });

  it('holding D at top speed turns at the body rate and never brakes', () => {
    const w = world(), s = new Steer();
    drive(w, s, { thrust: 1 }, 120);
    const h0 = w.player.heading;
    let braked = false;
    for (let i = 0; i < 30; i++) {
      drive(w, s, { thrust: 1, right: true }, 1);
      braked ||= w.player.brake;
    }
    const turned = wrapAngle(w.player.heading - h0);
    expect(braked).toBe(false);
    expect(turned).toBeGreaterThan(0.5 * w.t.turnHigh * 0.5); // turned right
    expect(turned).toBeLessThan(w.t.turnLow * 0.5 + 1e-6); // never faster than the body can
  });

  it('S brakes to a stop without the pivot (the heading stays put)', () => {
    const w = world(), s = new Steer();
    drive(w, s, { thrust: 1 }, 90);
    const h0 = w.player.heading;
    drive(w, s, { brake: true }, 90);
    expect(w.player.speed).toBeLessThan(5);
    expect(Math.abs(wrapAngle(w.player.heading - h0))).toBeLessThan(1e-6);
  });

  it('a mouse flick is a demand the body works off at its own rate, clamped short of a brake', () => {
    const w = world(), s = new Steer();
    drive(w, s, { thrust: 1 }, 120);
    const h0 = w.player.heading;
    drive(w, s, { thrust: 1, mouseDx: 2000 }, 1); // a huge flick right
    expect(s.off).toBeLessThanOrEqual(MAX_OFF + w.t.turnLow / 60 + 1e-6);
    expect(w.player.brake).toBe(false);
    drive(w, s, { thrust: 1 }, 60);
    // the body arrived at the clamped demand within a second and stopped there
    expect(Math.abs(wrapAngle(w.player.heading - h0 - MAX_OFF))).toBeLessThan(0.05);
  });

  it('a demand made during a lunge fades instead of snapping the view afterwards', () => {
    const w = world(), s = new Steer();
    drive(w, s, { thrust: 1 }, 90);
    const xy = s.update(w, { ...IDLE, thrust: 1 }, cfg);
    step(w, { ...xy, rip: true, bolt: false });
    expect(w.player.rip).not.toBeNull();
    for (let i = 0; i < 8; i++) drive(w, s, { thrust: 1, mouseDx: 40 }, 1);
    expect(Math.abs(s.off)).toBeLessThan(0.5);
  });
});
