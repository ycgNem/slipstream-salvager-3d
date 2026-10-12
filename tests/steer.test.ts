// The first-person input adapter against the real sim: the body, not the mouse, decides how fast
// you turn; keys never trigger the sim's brake-and-pivot; S stops you without flipping you round.
import { describe, expect, it } from 'vitest';
import { step } from '../src/sim/tick';
import { createWorld, giveBolted, type World } from '../src/sim/world';
import { KEY_RATE, MAX_OFF, MAX_PEND, PEND_TIME, SLIDE_AIM, Steer, type SteerIn } from '../src/input3d/steer';
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

  it('a mouse flick is a demand the body works off at its own rate, never braking', () => {
    const w = world(), s = new Steer();
    drive(w, s, { thrust: 1 }, 120);
    const h0 = w.player.heading;
    drive(w, s, { thrust: 1, mouseDx: 2000 }, 1); // a huge flick right
    expect(s.off).toBeLessThanOrEqual(MAX_PEND + 1e-6);
    let braked = false;
    for (let i = 0; i < 90; i++) {
      drive(w, s, { thrust: 1 }, 1);
      braked ||= w.player.brake;
    }
    expect(braked).toBe(false);
    // the body arrived at the whole kept demand (past the 75° the sim sees at once, but no more than
    // PEND_TIME of its own turning at the speed it flicked at) and stopped there
    const turned = wrapAngle(w.player.heading - h0);
    expect(turned).toBeGreaterThan(MAX_OFF + 0.2);
    expect(turned).toBeLessThanOrEqual(w.t.turnHigh * PEND_TIME + 0.05);
    expect(Math.abs(s.off)).toBeLessThan(0.02);
  });

  it('a flick at rest is kept whole, up to 175°', () => {
    const w = world(), s = new Steer();
    const h0 = w.player.heading;
    drive(w, s, { mouseDx: 1200 }, 1); // 3 rad
    drive(w, s, {}, 30);
    expect(wrapAngle(w.player.heading - h0)).toBeCloseTo(3, 1);
  });

  it('a turn thrust wins straight back is not shown as scrub', () => {
    const w = world(), s = new Steer();
    drive(w, s, { thrust: 1 }, 150); // top speed
    let scrubbed = false;
    for (let i = 0; i < 12; i++) {
      drive(w, s, { thrust: 1, right: true }, 1); // a 0.2 s tap
      scrubbed ||= s.scrub;
    }
    expect(scrubbed).toBe(false);
  });

  it('the same flick turns you the same amount at rest and at speed', () => {
    const turned = (warm: number) => {
      const w = world(), s = new Steer();
      drive(w, s, { thrust: 1 }, warm);
      const h0 = w.player.heading;
      drive(w, s, { thrust: 1, mouseDx: 400 }, 1); // 1 rad
      drive(w, s, { thrust: 1 }, 90);
      return wrapAngle(w.player.heading - h0);
    };
    expect(turned(0)).toBeCloseTo(1, 1);
    expect(turned(120)).toBeCloseTo(1, 1);
  });

  it("S held at a crawl still lets A/D turn you (it only brakes while it can't pivot)", () => {
    const w = world(), s = new Steer();
    drive(w, s, { thrust: 1 }, 6);
    drive(w, s, { brake: true }, 60);
    const h0 = w.player.heading;
    drive(w, s, { brake: true, right: true }, 30);
    expect(wrapAngle(w.player.heading - h0)).toBeGreaterThan(1);
    expect(w.player.speed).toBeLessThan(w.t.pivotSpeed);
  });

  it('a held turn key ramps from a gentle turn to a hard one', () => {
    const w = world(), s = new Steer();
    drive(w, s, { thrust: 1 }, 14); // about 150 px/s, where the body can turn faster than 6.5 rad/s
    const h0 = w.player.heading;
    drive(w, s, { thrust: 1, right: true }, 12); // a 0.2 s tap: gentle
    expect(wrapAngle(w.player.heading - h0)).toBeLessThan(KEY_RATE * 0.2 + 0.02);
    drive(w, s, { thrust: 1, right: true }, 18);
    const h1 = w.player.heading;
    drive(w, s, { thrust: 1, right: true }, 6);
    expect(wrapAngle(w.player.heading - h1) / 0.1).toBeGreaterThan(KEY_RATE + 1);
  });

  it('a mouse flick at Slipstream that costs speed is shown as scrub', () => {
    const w = world(), s = new Steer();
    drive(w, s, { thrust: 1 }, 45);
    expect(w.player.speed).toBeGreaterThan(w.t.slipAt - 10);
    const v0 = w.player.speed;
    let scrubbed = false;
    drive(w, s, { thrust: 1, mouseDx: 600 }, 1);
    for (let i = 0; i < 20; i++) {
      drive(w, s, { thrust: 1 }, 1);
      scrubbed ||= s.scrub;
    }
    expect(scrubbed).toBe(true);
    expect(w.player.speed).toBeLessThan(v0);
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

describe('first-person steering with the Grip Treads (DECISIONS #31)', () => {
  it('a tap of S at top speed power-slides you round and keeps Slipstream', () => {
    const w = world(), s = new Steer();
    giveBolted(w, 'treads');
    drive(w, s, { thrust: 1 }, 120);
    const h0 = w.player.heading;
    drive(w, s, { brake: true }, 2);
    expect(w.player.slide).toBe(true);
    let n = 0;
    while (w.player.slide && n++ < 60) drive(w, s, { thrust: 1 }, 1);
    // round in about a third of a second, still at Slipstream (2D PLAN.md 8.4)
    expect(n / 60).toBeLessThan(0.45);
    expect(w.player.speed).toBeGreaterThan(w.t.slipAt);
    drive(w, s, { thrust: 1 }, 20);
    expect(Math.abs(wrapAngle(w.player.heading - h0))).toBeGreaterThan(2.9);
  });

  it('slides round the side you steer', () => {
    for (const side of [-1, 1]) {
      const w = world(), s = new Steer();
      giveBolted(w, 'treads');
      drive(w, s, { thrust: 1 }, 120);
      const h0 = w.player.heading;
      drive(w, s, { brake: true, left: side < 0, right: side > 0 }, 6);
      expect(Math.sign(wrapAngle(w.player.heading - h0))).toBe(side);
    }
  });

  it('holding S slides once, then just coasts', () => {
    const w = world(), s = new Steer();
    giveBolted(w, 'treads');
    drive(w, s, { thrust: 1 }, 120);
    let slides = 0;
    for (let i = 0; i < 90; i++) {
      const xy = s.update(w, { ...IDLE, brake: true }, cfg);
      step(w, { ...xy, rip: false, bolt: false });
      slides += w.events.filter((e) => e.k === 'slide').length;
      w.events.length = 0;
    }
    expect(slides).toBe(1);
  });

  it('the mouse aims the slide while it swings (DECISIONS #35)', () => {
    const exit = (mouseDx: number) => {
      const w = world(), s = new Steer();
      giveBolted(w, 'treads');
      drive(w, s, { thrust: 1 }, 120);
      const h0 = w.player.heading;
      drive(w, s, { brake: true, right: true }, 2);
      let n = 0;
      while (w.player.slide && n++ < 60) drive(w, s, { thrust: 1, mouseDx }, 1);
      drive(w, s, { thrust: 1 }, 30);
      return wrapAngle(w.player.heading - h0);
    };
    const straight = exit(0), more = exit(25), less = exit(-25);
    // sliding round to the right: mouse right turns it further round, mouse left stops it short
    expect(Math.abs(straight)).toBeGreaterThan(2.9);
    expect(wrapAngle(more - straight)).toBeGreaterThan(0.2);
    expect(wrapAngle(straight - less)).toBeGreaterThan(0.2);
    // never past the aim's reach either side of the reversal
    expect(Math.abs(wrapAngle(more - Math.PI))).toBeLessThan(SLIDE_AIM + 0.15);
    expect(Math.abs(wrapAngle(less - Math.PI))).toBeLessThan(SLIDE_AIM + 0.15);
  });

  it('with no side asked for, it slides round the side with room (not into a wall)', () => {
    const w = createWorld({ sandbox: true, arena: openArena(4000, 4000, { x: 200, y: 3955, heading: 0 }) }), s = new Steer();
    giveBolted(w, 'treads');
    drive(w, s, { thrust: 1 }, 120);
    const h0 = w.player.heading;
    drive(w, s, { brake: true }, 6);
    // the wall is on the right (+y): it swings left
    expect(Math.sign(wrapAngle(w.player.heading - h0))).toBe(-1);
  });

  it('S held on after a slide does not cut your thrust', () => {
    const w = world(), s = new Steer();
    giveBolted(w, 'treads');
    drive(w, s, { thrust: 1 }, 120);
    let n = 0;
    drive(w, s, { thrust: 1, brake: true }, 2);
    while (w.player.slide && n++ < 60) drive(w, s, { thrust: 1, brake: true }, 1);
    drive(w, s, { thrust: 1, brake: true }, 60);
    expect(w.player.speed).toBeGreaterThan(w.t.slipAt);
  });
});
