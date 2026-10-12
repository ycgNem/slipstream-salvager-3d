// Scripted scenes for the screenshot sweep (e2e/shots.mjs): each one starts a seeded encounter,
// replays a fixed input log through the real sim (and the real presentation, tick by tick), and
// freezes there, so every first-person state can be looked at and compared between runs.
import { addRammer, NO_INPUT, type InputFrame, type World } from '../sim/world';
import { beginWindup } from '../sim/rammer';
import { step } from '../sim/tick';
import { snapshot } from '../render3d/stage';
import type { App } from './app';
import type { Play } from './play';

export const SCENES = [
  // Milestone 0's five
  'rest', 'slip-pass', 'charged-behind', 'wall-clank', 'cleared',
  // every state Milestone 1 adds
  'title', 'settings', 'play', 'crawl', 'cruise', 'slip', 'telegraph-track', 'telegraph-lock', 'hitstop',
  'tear', 'towing', 'bolting', 'booster', 'burn', 'burn-stun', 'skid', 'stripped', 'gate-warn', 'wreck', 'joust',
  'hurt', 'scrapped', 'pause', 'tuning', 'flat', 'hud-hidden', 'look-back',
] as const;
export type SceneName = (typeof SCENES)[number];

const F = (x: number, y: number, rip = false, bolt = false): InputFrame => ({ x, y, rip, bolt });
const EAST = F(1, 0);

/** Run the sim n ticks with an input, through the whole presentation, as play does. */
function run(play: Play, app: App, n: number, input: InputFrame | ((w: World) => InputFrame) = NO_INPUT) {
  const w = play.world;
  for (let i = 0; i < n; i++) {
    play.prev = snapshot(w);
    if (step(w, typeof input === 'function' ? input(w) : input)) app.stage.ticked(w);
    for (const e of w.events) play.handle(e);
    w.events.length = 0;
    play.time += 1 / 60;
    app.stage.sync(w, play.prev, 1, 1 / 60, play.time, { lookBack: false, thrust: 1, hurt: 0 });
    play.effects(1 / 60);
  }
}

/** Past the wave 1 banner with no enemies yet. */
function quiet(play: Play) {
  const w = play.world;
  w.sandbox = true;
  w.wave.phase = 'fight';
  play.overlay.banner = null;
}

function place(play: Play, x: number, y: number, heading: number, speed: number) {
  Object.assign(play.world.player, { x, y, heading, speed, lastHeading: heading });
  play.steer.reset(heading);
}

export function scene(app: App, name: SceneName) {
  app.settings.hints = true;
  if (name === 'title') return app.toTitle();
  if (name === 'settings') {
    app.toTitle();
    return app.openSettings();
  }
  app.startPlay(3);
  const play = app.play!;
  const w = play.world;
  play.hints.seen = { speed: true, tear: true, bolt: true, burn: true };
  switch (name) {
    case 'play':
      play.hints.seen = {};
      run(play, app, 200);
      break;
    case 'rest': {
      // at rest, facing a Rammer across the Ring
      quiet(play);
      place(play, 120, 180, 0, 0);
      const r = addRammer(w, 330, 180, Math.PI);
      r.cd = 99;
      run(play, app, 30);
      break;
    }
    case 'slip-pass': {
      // at Slipstream, mid-pass through a skidding Rammer's back
      quiet(play);
      place(play, 60, 180, 0, 0);
      const r = addRammer(w, 300, 180, 0, { state: 'skid' });
      r.skidFor = 99;
      run(play, app, 50, EAST);
      run(play, app, 2, F(1, 0, true));
      break;
    }
    case 'charged-behind': {
      // a Rammer behind you locks its lane and charges: the rear strip and an edge marker show it
      quiet(play);
      place(play, 300, 180, 0, 0);
      const r = addRammer(w, 130, 190, 0);
      beginWindup(w, r, false);
      run(play, app, 40, F(0.15, 0));
      break;
    }
    case 'wall-clank':
      quiet(play);
      place(play, 470, 180, 0, 0);
      run(play, app, 46, EAST);
      break;
    case 'crawl':
      quiet(play);
      place(play, 200, 260, 0, 0);
      run(play, app, 5, EAST);
      break;
    case 'cruise':
      quiet(play);
      place(play, 120, 260, 0, 0);
      run(play, app, 26, EAST);
      break;
    case 'slip':
      quiet(play);
      place(play, 40, 300, 0, 0);
      run(play, app, 70, EAST);
      break;
    case 'telegraph-track':
    case 'telegraph-lock': {
      quiet(play);
      place(play, 470, 300, Math.PI, 0);
      const r = addRammer(w, 300, 300, 0);
      beginWindup(w, r, false);
      run(play, app, name === 'telegraph-lock' ? 36 : 12);
      break;
    }
    case 'hitstop': {
      quiet(play);
      place(play, 262, 300, 0, 230);
      const r = addRammer(w, 300, 300, Math.PI);
      r.cd = 99;
      run(play, app, 4, F(1, 0, true));
      break;
    }
    case 'tear': {
      quiet(play);
      place(play, 230, 200, 0, 230);
      const r = addRammer(w, 290, 200, 0, { state: 'skid' });
      r.skidFor = 99;
      run(play, app, 8, F(1, 0, true));
      break;
    }
    case 'towing':
    case 'bolting': {
      quiet(play);
      place(play, 200, 300, -0.15, 150);
      w.player.tow = { part: 'booster', x: 186, y: 302, vx: 0, vy: 0, cracked: false };
      const r = addRammer(w, 520, 80, Math.PI, { booster: false });
      r.cd = 99;
      run(play, app, 24, F(1, -0.15));
      if (name === 'bolting') run(play, app, 18, F(1, -0.1, false, true));
      break;
    }
    case 'booster':
      quiet(play);
      w.player.part = 'booster';
      place(play, 80, 300, 0, 0);
      run(play, app, 70, EAST);
      break;
    case 'burn':
      quiet(play);
      w.player.part = 'booster';
      place(play, 60, 180, 0, 0);
      run(play, app, 30, F(1, 0, true));
      break;
    case 'burn-stun':
      quiet(play);
      w.player.part = 'booster';
      place(play, 470, 180, 0, 0);
      run(play, app, 40, F(1, 0, true));
      break;
    case 'skid': {
      quiet(play);
      place(play, 160, 180, 0, 0);
      const r = addRammer(w, 360, 180, 0, { state: 'skid' });
      r.vx = 120;
      r.skidFor = 99;
      run(play, app, 14);
      break;
    }
    case 'stripped': {
      quiet(play);
      place(play, 200, 180, 0, 0);
      const r = addRammer(w, 300, 190, Math.PI * 0.8, { booster: false });
      r.hp = 1;
      r.cd = 99;
      run(play, app, 40);
      break;
    }
    case 'gate-warn':
      // wave 1's banner, then the warning at the gate farthest from you: ahead
      place(play, 320, 300, -Math.PI / 2, 0);
      run(play, app, 100);
      break;
    case 'wreck': {
      quiet(play);
      place(play, 180, 200, 0, 230);
      const r = addRammer(w, 250, 200, 0, { booster: false, state: 'skid' });
      r.hp = 1;
      r.skidFor = 99;
      run(play, app, 14, F(1, 0, true));
      break;
    }
    case 'joust': {
      quiet(play);
      place(play, 220, 200, 0, 230);
      const r = addRammer(w, 300, 200, Math.PI, { state: 'charge' });
      r.travelled = 0;
      run(play, app, 6, F(1, 0, true));
      break;
    }
    case 'hurt': {
      quiet(play);
      place(play, 300, 200, 0, 60);
      const r = addRammer(w, 230, 200, 0, { state: 'charge' });
      run(play, app, 14, F(0.2, 0));
      break;
    }
    case 'pause':
      run(play, app, 120);
      play.paused = true;
      break;
    case 'tuning':
      quiet(play);
      play.tuning.open = true;
      run(play, app, 2);
      break;
    case 'flat':
      quiet(play);
      w.flat = true;
      play.tuning.open = true;
      run(play, app, 2);
      break;
    case 'hud-hidden':
      quiet(play);
      place(play, 40, 300, 0, 0);
      play.hudHidden = true;
      run(play, app, 70, EAST);
      break;
    case 'look-back': {
      quiet(play);
      place(play, 300, 180, 0, 0);
      addRammer(w, 160, 180, 0).cd = 99;
      run(play, app, 20, F(0.3, 0));
      play.forceLook = true;
      app.stage.rig.look = 1;
      break;
    }
    case 'cleared':
    case 'scrapped':
      run(play, app, 30);
      play.overlay.banner = null;
      w.result = name;
      play.endT = 2;
      w.stats.ticks = 6123;
      w.stats.tears = 2;
      w.stats.slipHits = 9;
      w.stats.topSpeed = 288;
      if (name === 'scrapped') w.player.hull = 0;
      break;
  }
  play.frozen = true;
}
