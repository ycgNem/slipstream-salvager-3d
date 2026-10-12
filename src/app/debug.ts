// Scripted scenes for the screenshot sweep (e2e/shots.mjs): each one starts a seeded run in a yard,
// replays a fixed input log through the real sim (and the real presentation, tick by tick), and
// freezes there, so every first-person state can be looked at and compared between runs. Scenes
// never touch the best record.
import { addEnemy, addRammer, giveBolted, NO_INPUT, type InputFrame, type World } from '../sim/world';
import { beginWindup } from '../sim/rammer';
import { beginSnap, toSlide } from '../sim/snapper';
import { step } from '../sim/tick';
import type { YardId } from '../data/yards';
import { snapshot } from '../render3d/stage';
import type { App } from './app';
import type { Play } from './play';

export const SCENES = [
  // Milestone 0's five
  'rest', 'slip-pass', 'charged-behind', 'wall-clank', 'cleared',
  // every state Milestone 1 adds
  'title', 'settings', 'play', 'crawl', 'cruise', 'slip', 'telegraph-track', 'telegraph-lock', 'hitstop',
  'tear', 'towing', 'tow-swing', 'bolting', 'booster', 'burn', 'burn-stun', 'skid', 'stripped', 'gate-warn', 'wreck', 'joust',
  'hurt', 'scrapped', 'pause', 'tuning', 'flat', 'hud-hidden', 'look-back',
  // Milestone 3: the yards, the Snapper, the new parts, the exits and the run
  'yard-kennel', 'yard-lanes', 'yard-pit', 'yard-jaws', 'yard-heap',
  'snapper-hunt', 'snapper-windup', 'snapper-slide', 'snapper-stripped', 'snapper-behind',
  'plow-rammer', 'clang', 'jaw-snapper',
  'treads-on', 'treads-slide', 'plow-on', 'plow-ram', 'block', 'jaws-on', 'latch', 'hud-parts',
  'exits', 'exits-away', 'wipe', 'enter-yard',
] as const;
export type SceneName = (typeof SCENES)[number];

const F = (x: number, y: number, rip = false, bolt = false): InputFrame => ({ x, y, rip, bolt });
const EAST = F(1, 0);

/** Run the sim n ticks with an input, through the whole presentation, as play does. */
function run(play: Play, app: App, n: number, input: InputFrame | ((w: World) => InputFrame) = NO_INPUT) {
  for (let i = 0; i < n; i++) {
    const w = play.world;
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

/** The yard's last wave is done: the exits open (and the YARD CLEARED banner). */
function clearYard(play: Play, app: App) {
  const w = play.world;
  w.sandbox = false;
  w.enemies.length = 0;
  w.wave.index = w.waves.length - 1;
  w.wave.phase = 'fight';
  run(play, app, 2);
}

const YARD_OF: Partial<Record<SceneName, YardId>> = {
  'yard-kennel': 'kennel', 'yard-lanes': 'lanes', 'yard-pit': 'pit', 'yard-jaws': 'jaws', 'yard-heap': 'heap',
  'snapper-hunt': 'kennel', 'snapper-windup': 'kennel', 'snapper-slide': 'kennel', 'snapper-stripped': 'kennel', 'snapper-behind': 'kennel',
  'plow-rammer': 'pit', clang: 'pit', block: 'pit', 'jaw-snapper': 'jaws', latch: 'jaws', 'jaws-on': 'jaws',
  cleared: 'heap',
};

export function scene(app: App, name: SceneName) {
  app.settings.hints = true;
  if (name === 'title') return app.toTitle();
  if (name === 'settings') {
    app.toTitle();
    return app.openSettings();
  }
  app.startPlay(3, YARD_OF[name] ?? 'ring');
  const play = app.play!;
  play.record = false;
  const w = play.world;
  const seenAll = { speed: true, tear: true, bolt: true, burn: true, mirror: true, exit: true, treads: true, plow: true, jaws: true, snapper: true, plowfoe: true, jawfoe: true };
  play.hints.seen = { ...seenAll };
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
    case 'tow-swing': {
      // towing through a hard left turn: the part swings wide and its cable whips into view
      quiet(play);
      place(play, 80, 310, 0, 200);
      w.player.tow = { part: 'booster', x: 66, y: 310, vx: 0, vy: 0, cracked: false };
      run(play, app, 20, EAST);
      run(play, app, 14, (w) => F(Math.cos(w.player.heading - 1.2), Math.sin(w.player.heading - 1.2)));
      break;
    }
    case 'booster':
      quiet(play);
      giveBolted(w, 'booster');
      place(play, 80, 300, 0, 0);
      run(play, app, 70, EAST);
      break;
    case 'burn':
      quiet(play);
      giveBolted(w, 'booster');
      place(play, 60, 180, 0, 0);
      run(play, app, 30, F(1, 0, true));
      break;
    case 'burn-stun':
      quiet(play);
      giveBolted(w, 'booster');
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
      // wave 1's banner, then the warning at the gate farthest from you (the west one): ahead
      place(play, 560, 180, Math.PI, 0);
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
      r.chargeLen = 260;
      run(play, app, 6, F(1, 0, true));
      break;
    }
    case 'hurt': {
      quiet(play);
      place(play, 300, 200, 0, 60);
      const r = addRammer(w, 230, 200, 0, { state: 'charge' });
      r.chargeLen = 260;
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

    // ---------------- Milestone 3 ----------------
    case 'yard-kennel': {
      // the post forest, two Snappers coming round the posts
      quiet(play);
      place(play, 80, 180, 0, 0);
      addEnemy(w, 'snapper', 300, 150, Math.PI).cd = 99;
      addEnemy(w, 'snapper', 330, 220, Math.PI).cd = 99;
      run(play, app, 30, F(0.3, 0));
      break;
    }
    case 'yard-lanes': {
      // down the middle lane, a Rammer at the far end, another seen over the low wall
      quiet(play);
      place(play, 60, 184, 0, 0);
      addRammer(w, 520, 184, Math.PI).cd = 99;
      addRammer(w, 420, 300, Math.PI).cd = 99;
      run(play, app, 30, F(0.3, 0));
      break;
    }
    case 'yard-pit': {
      // the bowl round the tower, a Plow Rammer beside it
      quiet(play);
      place(play, 320, 300, -Math.PI / 2, 0);
      addRammer(w, 230, 140, 0.4, { parts: ['booster', 'plow'] }).cd = 99;
      run(play, app, 30);
      break;
    }
    case 'yard-jaws': {
      // the open cross, the corner blocks, a Jaw Snapper in the middle
      quiet(play);
      place(play, 60, 184, 0, 0);
      addEnemy(w, 'snapper', 330, 184, Math.PI, { parts: ['treads', 'jaws'] }).cd = 99;
      run(play, app, 30, F(0.2, 0));
      break;
    }
    case 'yard-heap': {
      // the finale: a broken ring of scrap, one of everything
      quiet(play);
      place(play, 60, 184, 0, 0);
      addRammer(w, 400, 140, Math.PI).cd = 99;
      addRammer(w, 420, 230, Math.PI, { parts: ['booster', 'plow'] }).cd = 99;
      addEnemy(w, 'snapper', 260, 150, Math.PI).cd = 99;
      addEnemy(w, 'snapper', 270, 225, Math.PI, { parts: ['treads', 'jaws'] }).cd = 99;
      run(play, app, 24, F(0.2, 0));
      break;
    }
    case 'snapper-hunt': {
      quiet(play);
      place(play, 80, 140, 0, 0);
      const s = addEnemy(w, 'snapper', 330, 140, Math.PI);
      s.cd = 99;
      run(play, app, 40);
      break;
    }
    case 'snapper-windup': {
      // planted, crouched, its short lane locked on you
      quiet(play);
      place(play, 330, 140, Math.PI, 0);
      const s = addEnemy(w, 'snapper', 268, 142, 0);
      beginSnap(w, s);
      run(play, app, 22);
      break;
    }
    case 'snapper-slide': {
      // power-sliding round to face you, broadside: its side is open
      quiet(play);
      place(play, 160, 140, 0, 0);
      const s = addEnemy(w, 'snapper', 290, 130, Math.PI / 2);
      s.speed = 160;
      toSlide(w, s, 9, 160);
      run(play, app, 12);
      break;
    }
    case 'snapper-stripped': {
      quiet(play);
      place(play, 160, 140, 0, 0);
      const s = addEnemy(w, 'snapper', 270, 150, Math.PI * 0.9, { parts: [] });
      s.hp = 1;
      s.cd = 99;
      run(play, app, 30);
      break;
    }
    case 'snapper-behind': {
      // a Snapper behind you winding up: the mirror and the arrow
      quiet(play);
      place(play, 330, 140, 0, 0);
      const s = addEnemy(w, 'snapper', 280, 142, 0);
      beginSnap(w, s);
      run(play, app, 20, F(0.15, 0));
      break;
    }
    case 'plow-rammer': {
      quiet(play);
      place(play, 120, 268, 0, 0);
      const r = addRammer(w, 330, 268, Math.PI, { parts: ['booster', 'plow'] });
      r.cd = 99;
      run(play, app, 30);
      break;
    }
    case 'clang': {
      // a Slipstream hit on a plowed front: nothing gets through
      quiet(play);
      place(play, 150, 268, 0, 235);
      const r = addRammer(w, 230, 268, Math.PI, { parts: ['booster', 'plow'] });
      r.cd = 99;
      run(play, app, 8, F(1, 0, true));
      break;
    }
    case 'jaw-snapper': {
      // a Jaw Snapper winding up: its jaws gape
      quiet(play);
      place(play, 330, 184, Math.PI, 0);
      const s = addEnemy(w, 'snapper', 265, 184, 0, { parts: ['treads', 'jaws'] });
      beginSnap(w, s);
      run(play, app, 20);
      break;
    }
    case 'treads-on':
      quiet(play);
      giveBolted(w, 'treads');
      place(play, 40, 300, 0, 0);
      run(play, app, 70, EAST);
      break;
    case 'treads-slide':
      // mid power-slide round with the Grip Treads
      quiet(play);
      giveBolted(w, 'treads');
      place(play, 120, 300, 0, 0);
      run(play, app, 60, EAST);
      run(play, app, 9, F(-1, -0.05));
      break;
    case 'plow-on':
      quiet(play);
      giveBolted(w, 'plow');
      place(play, 40, 300, 0, 0);
      run(play, app, 90, EAST);
      break;
    case 'plow-ram': {
      // driving the Plow into a Snapper's side at Slipstream
      quiet(play);
      giveBolted(w, 'plow');
      place(play, 160, 200, 0, 235);
      const s = addEnemy(w, 'snapper', 230, 200, Math.PI / 2);
      s.cd = 99;
      run(play, app, 10, EAST);
      break;
    }
    case 'block': {
      // a charge into your Plow is blocked
      quiet(play);
      giveBolted(w, 'plow');
      place(play, 160, 268, 0, 60);
      const r = addRammer(w, 280, 268, Math.PI, { state: 'charge' });
      r.chargeLen = 260;
      run(play, app, 14, F(0.3, 0));
      break;
    }
    case 'jaws-on':
      quiet(play);
      giveBolted(w, 'jaws');
      place(play, 60, 184, 0, 0);
      run(play, app, 70, EAST);
      break;
    case 'latch': {
      // the Jaws bite a Snapper's side and swing you round it
      quiet(play);
      giveBolted(w, 'jaws');
      place(play, 230, 184, 0, 235);
      const s = addEnemy(w, 'snapper', 290, 184, Math.PI / 2);
      s.cd = 99;
      // drive in until the bite, then stop mid-swing
      for (let i = 0; i < 40 && !w.player.latch; i++) run(play, app, 1, F(1, 0, true));
      run(play, app, 4);
      break;
    }
    case 'hud-parts':
      // every slot full, one cracked, towing a fourth
      quiet(play);
      giveBolted(w, 'booster');
      giveBolted(w, 'treads', true);
      giveBolted(w, 'jaws');
      place(play, 200, 300, -0.15, 150);
      w.player.tow = { part: 'plow', x: 186, y: 302, vx: 0, vy: 0, cracked: false };
      run(play, app, 24, F(1, -0.15));
      break;
    case 'exits':
      // the yard is cleared: facing the east exit, its sign over it
      place(play, 380, 190, 0, 0);
      clearYard(play, app);
      run(play, app, 60);
      play.overlay.banner = null;
      break;
    case 'exits-away':
      // cleared, facing north: both exits are out of view
      place(play, 320, 180, -Math.PI / 2, 0);
      clearYard(play, app);
      run(play, app, 60);
      play.overlay.banner = null;
      break;
    case 'wipe':
    case 'enter-yard':
      // drive out the east exit; the wipe covers the swap to the next yard
      place(play, 560, 176, 0, 0);
      clearYard(play, app);
      run(play, app, 90, EAST);
      play.update(0.42);
      if (name === 'enter-yard') {
        play.update(0.4);
        run(play, app, 30, EAST);
      }
      break;
    case 'cleared':
    case 'scrapped':
      run(play, app, 30);
      play.overlay.banner = null;
      giveBolted(w, 'booster');
      giveBolted(w, 'jaws', true);
      w.result = name;
      w.stats.ticks = 6123;
      w.stats.tears = 2;
      w.stats.slipHits = 9;
      w.stats.topSpeed = 288;
      if (name === 'scrapped') w.player.hull = 0;
      play.update(0);
      play.endT = 2;
      break;
  }
  play.frozen = true;
}
