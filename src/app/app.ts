// The app: one canvas, WebGL for the world (src/render3d/view.ts: 640x360, whole-number scale,
// letterboxed), a 640x360 2D layer for text and menus drawn with the UI kit, the fixed 60 Hz loop,
// and the screens (title, play, settings). The title is a live attract mode: a strategy bot plays
// the real sim in one of the run's yards under a slow orbit camera, behind "Slipstream Salvager 3D /
// first person".
import { C } from '../data/palette';
import { GameLoop } from '../engine/loop';
import { ACTION_LABELS, DEBUG_KEYS, Input, keyLabel, type Action } from '../engine/input';
import { Audio } from '../engine/audio/audio';
import type { World } from '../sim/world';
import { newRun, yardWorld } from '../sim/run';
import type { YardId } from '../data/yards';
import { step } from '../sim/tick';
import { hitAndRunBot, type Bot } from '../sim/bots';
import { UI } from '../ui/ui';
import { textWidth } from '../ui/font';
import { View, VIEW_H, VIEW_W } from '../render3d/view';
import { loadModels, type ModelSet } from '../render3d/models';
import { Stage, snapshot, type Snap } from '../render3d/stage';
import { Play } from './play';
import { loadBest, loadSettings, saveSettings, type Settings } from './settings';
import { scene, SCENES, type SceneName } from './debug';

export { VIEW_W, VIEW_H };

type Screen = 'loading' | 'title' | 'play' | 'settings';

export class App {
  canvas: HTMLCanvasElement;
  view: View;
  input = new Input();
  ui = new UI();
  settings: Settings = loadSettings();
  audio = new Audio(this.settings, this.settings.musicOn);
  loop: GameLoop;
  screen: Screen = 'loading';
  private settingsFrom: Screen = 'title';
  play: Play | null = null;
  stage!: Stage;
  models!: ModelSet;
  time = 0;
  /** the title's attract mode */
  private demo: { world: World; bot: Bot; prev: Snap } | null = null;
  private alpha = 0;
  error: string | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.view = new View(canvas);
    this.view.snap = this.settings.palette;
    this.input.attach(canvas);
    this.input.onGesture = () => this.audio.unlock();
    this.ui.sfx = (id) => this.audio.sfx(id);
    window.addEventListener('resize', () => this.view.resize());
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== this.canvas && this.play && this.screen === 'play') this.play.lockLost();
    });
    this.loop = new GameLoop(() => this.tick(), (dt, alpha) => this.frame(dt, alpha));
    this.loop.start();
    (window as any).__app = this;
    loadModels()
      .then((m) => {
        this.models = m;
        this.stage = new Stage(m);
        this.toTitle();
      })
      .catch((e) => {
        this.error = String(e?.message ?? e);
        console.error(e);
      });
  }

  // ---------------- pointer lock (the mouse steers only while it's locked) ----------------

  lockPointer() {
    if (document.pointerLockElement === this.canvas) return;
    try {
      const r = (this.canvas.requestPointerLock as any)({ unadjustedMovement: false });
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch {
      // no pointer lock here (headless, an iframe without permission): keys still work
    }
  }

  unlockPointer() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  // ---------------- the loop ----------------

  private tick() {
    if (this.screen === 'play' && this.play) this.play.tick();
    else if (this.demo && (this.screen === 'title' || (this.screen === 'settings' && !this.play))) {
      const d = this.demo;
      d.prev = snapshot(d.world);
      if (step(d.world, d.bot(d.world))) this.stage.ticked(d.world);
      for (const e of d.world.events) this.stage.onEvent(e, d.world);
      d.world.events.length = 0;
      if (d.world.result || d.world.stats.ticks > 60 * 150) this.newDemo();
    }
  }

  private frame(dt: number, alpha: number) {
    this.time += dt;
    this.alpha = alpha;
    this.input.pollPad();
    if (this.input.wasPressed('music')) this.toggleMusic();
    const v = this.view;
    v.begin();
    const m = v.toLogical(this.input.mouse.x, this.input.mouse.y);
    const inPlay = this.screen === 'play' && this.play;
    this.ui.begin(v.uictx, this.input, m.x, m.y, dt, !inPlay || this.play!.paused || this.play!.over || this.play!.tuning.open);
    let post = { edge: 0, flashColor: C.ink as number, flash: 0, whiteout: 0, rear: false };
    if (this.screen === 'loading' || !this.stage) {
      this.ui.fill(0, 0, VIEW_W, VIEW_H, C.ink);
      this.ui.text(this.error ? 'COULD NOT START: ' + this.error.toUpperCase().slice(0, 60) : 'LOADING THE YARD...', 320, 176, this.error ? C.danger2 : C.mist, { align: 'center' });
    } else if (this.screen === 'title') {
      this.renderDemo(dt);
      this.drawTitle();
    } else if (this.screen === 'settings') {
      if (this.settingsFrom === 'play' && this.play) {
        this.play.render(1, 0, this.time);
        post = this.play.post();
        post.edge = 0;
        this.play.drawUI(this.ui, 0);
      } else this.renderDemo(dt);
      this.drawSettings();
    } else if (this.play) {
      this.play.update(dt);
      this.play.render(alpha, dt, this.time);
      post = this.play.post();
      this.play.drawUI(this.ui, dt);
    }
    this.ui.end();
    this.audio.update();
    if (this.screen !== 'play') this.audio.engine(0, false, false);
    v.present(post, this.time);
    this.input.endFrame();
  }

  private renderDemo(dt: number) {
    if (!this.demo) this.newDemo();
    const d = this.demo!;
    this.stage.rig.mode = 'orbit';
    this.stage.sync(d.world, d.prev, this.alpha, dt, this.time, { lookBack: false, thrust: 1, hurt: 0 });
    this.view.renderMain(this.stage.scene, this.stage.camera);
  }

  private newDemo() {
    // a different yard each time round
    const yards: YardId[] = ['ring', 'kennel', 'lanes', 'pit', 'jaws', 'heap'];
    const seed = (Math.random() * 1e9) | 0;
    const world = yardWorld(newRun(seed, yards[seed % yards.length]));
    world.player.hull = 99;
    this.demo = { world, bot: hitAndRunBot(), prev: snapshot(world) };
    this.stage.setWorld(world);
  }

  /** Put the game in a scripted state and freeze it (e2e/shots.mjs). */
  scene(name: SceneName) {
    scene(this, name);
  }

  get scenes() {
    return SCENES;
  }

  startPlay(seed?: number, yard?: YardId) {
    this.demo = null;
    this.play = new Play(this, seed, yard);
    this.screen = 'play';
    this.lockPointer();
  }

  toTitle() {
    this.play = null;
    this.unlockPointer();
    this.screen = 'title';
    this.newDemo();
  }

  openSettings() {
    this.settingsFrom = this.screen;
    this.screen = 'settings';
    this.unlockPointer();
  }

  toggleMusic() {
    this.settings.musicOn = !this.settings.musicOn;
    this.applySettings();
  }

  applySettings() {
    saveSettings(this.settings);
    this.audio.applySettings(this.settings, this.settings.musicOn);
    this.view.snap = this.settings.palette;
    if (this.play) this.play.hints.enabled = this.settings.hints;
  }

  // ---------------- screens ----------------

  private drawTitle() {
    const ui = this.ui;
    ui.fill(0, 30, VIEW_W, 104, C.ink);
    ui.text('SLIPSTREAM', 320, 36, C.speed4, { align: 'center', scale: 5, shadow: C.speed0 });
    const sw = textWidth('SALVAGER') * 4, dw = textWidth('3D') * 4, x0 = Math.round(320 - (sw + 16 + dw) / 2);
    ui.text('SALVAGER', x0, 84, C.cruiseHi, { scale: 4, shadow: C.rust0 });
    ui.text('3D', x0 + sw + 16, 84, C.gold3, { scale: 4, shadow: C.rust0 });
    ui.text('FIRST PERSON', 320, 120, C.frost, { align: 'center', shadow: C.ink });
    if (ui.button('t-play', 260, 176, 120, 22, 'PLAY')) this.startPlay();
    if (ui.button('t-settings', 260, 204, 120, 18, 'SETTINGS')) this.openSettings();
    const pad = this.input.usingPad;
    const lines = pad
      ? ['STICK  STEER    RT  THRUST    LT  BRAKE', 'A  RIP (HOLD WITH A BOOSTER)    Y  BOLT ON', 'LB  LOOK BACK    START  PAUSE']
      : ['MOUSE OR A/D  STEER    W  THRUST    S  BRAKE', `CLICK / ${keyLabel(this.input.binds.rip[0]).toUpperCase()}  RIP (HOLD WITH A BOOSTER)    E  BOLT ON`, 'Q  LOOK BACK    H  HIDE HUD    ESC  PAUSE    N  MUSIC'];
    ui.fill(80, 238, 480, lines.length * 11 + 6, C.ink);
    lines.forEach((l, i) => ui.text(l, 320, 242 + i * 11, C.mist, { align: 'center' }));
    const b = loadBest();
    if (b.runs) {
      const t = b.wins
        ? `RUNS ${b.runs}   WINS ${b.wins}   BEST WIN ${Math.floor(b.bestWinTicks / 3600)}:${String(Math.floor((b.bestWinTicks / 60) % 60)).padStart(2, '0')}`
        : `RUNS ${b.runs}   BEST: ${b.bestYards} YARD${b.bestYards === 1 ? '' : 'S'} CLEARED`;
      ui.fill(160, 286, 320, 13, C.ink);
      ui.text(t, 320, 289, C.lilac, { align: 'center' });
    }
    ui.fill(0, 334, VIEW_W, 26, C.ink);
    ui.text('A RUN OF FIVE YARDS - TEAR PARTS OFF, BOLT THEM ON', 320, 340, C.slate, { align: 'center' });
    if (DEBUG_KEYS) ui.text('` TUNING IN PLAY', 636, 350, C.slate, { align: 'right' });
  }

  private drawSettings() {
    const ui = this.ui, s = this.settings;
    ui.dim();
    const x = 196, y = 34, w = 248, h = 298;
    ui.panel(x, y, w, h, 'dark');
    ui.text('SETTINGS', x + w / 2, y + 10, C.white, { align: 'center', scale: 2 });
    const before = JSON.stringify(s);
    s.master = ui.slider('s-master', x + 16, y + 38, w - 32, 'VOLUME', s.master);
    s.music = ui.slider('s-music', x + 16, y + 54, w - 32, 'MUSIC', s.music);
    s.sfx = ui.slider('s-sfx', x + 16, y + 70, w - 32, 'SOUNDS', s.sfx);
    s.sens = ui.slider('s-sens', x + 16, y + 86, w - 32, 'MOUSE STEER', s.sens);
    s.musicOn = ui.toggle('s-musicon', x + 16, y + 106, w - 32, 'MUSIC ON (N)', s.musicOn);
    s.shake = ui.toggle('s-shake', x + 16, y + 120, w - 32, 'SCREEN SHAKE', s.shake);
    s.hints = ui.toggle('s-hints', x + 16, y + 134, w - 32, 'HINTS', s.hints);
    s.invert = ui.toggle('s-invert', x + 16, y + 148, w - 32, 'INVERT MOUSE STEER', s.invert);
    s.gauge = ui.toggle('s-gauge', x + 16, y + 162, w - 32, 'SPEED GAUGE', s.gauge);
    s.palette = ui.toggle('s-palette', x + 16, y + 176, w - 32, 'PIXEL PALETTE FILTER', s.palette);
    if (JSON.stringify(s) !== before) this.applySettings();
    // the controls, read-only in the slice
    const acts: Action[] = ['up', 'down', 'rip', 'bolt', 'look', 'hud', 'pause'];
    acts.forEach((a, i) => {
      ui.text(ACTION_LABELS[a].toUpperCase(), x + 16, y + 196 + i * 11, C.lilac);
      ui.text(this.input.binds[a].map(keyLabel).join(' / ').toUpperCase(), x + w - 16, y + 196 + i * 11, C.mist, { align: 'right' });
    });
    if (ui.button('s-back', x + w / 2 - 50, y + h - 24, 100, 16, 'BACK') || this.input.wasPressed('back')) {
      this.input.consume('back');
      this.input.consume('pause');
      this.screen = this.settingsFrom;
      if (this.screen === 'title' && !this.demo) this.newDemo();
    }
  }
}
