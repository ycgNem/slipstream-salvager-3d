// One encounter in first person: runs the vendored sim from the first-person input adapter, turns
// its events into sound (positional for anything in the arena), effects in the world and on the 2D
// layer, and draws the HUD, hints, markers, the pause and the results.
import * as THREE from 'three';
import { C } from '../data/palette';
import { wrapAngle } from '../data/dirs';
import { DEBUG_KEYS, keyLabel, type Input } from '../engine/input';
import type { Audio } from '../engine/audio/audio';
import { createWorld, type InputFrame, type World } from '../sim/world';
import { step } from '../sim/tick';
import { revving } from '../sim/rip';
import type { SimEvent } from '../sim/events';
import { Steer, sensFromSetting } from '../input3d/steer';
import { snapshot, type Snap, type Stage } from '../render3d/stage';
import type { PostFx, View } from '../render3d/view';
import { wx, wz } from '../render3d/units';
import { drawHud } from '../ui3d/hud';
import { Hints } from '../ui3d/hints';
import { Overlay, drawMarkers, drawMirrorFrame } from '../ui3d/overlay';
import type { UI } from '../ui/ui';
import { LIVE, TuningPanel } from './tuning';
import { loadBest, loadSeenHints, saveBest, saveSeenHints, type Settings } from './settings';

export interface PlayHost {
  input: Input;
  audio: Audio;
  settings: Settings;
  stage: Stage;
  view: View;
  toTitle(): void;
  openSettings(): void;
  lockPointer(): void;
  unlockPointer(): void;
}

/** Events that happen at a Rammer: their sound comes from it. */
const AT_RAMMER = new Set(['windup', 'lock', 'charge', 'cancel', 'slam', 'shove', 'bump', 'joust', 'wreck', 'hit', 'tear']);

export class Play {
  world: World;
  steer = new Steer();
  prev: Snap;
  hints: Hints;
  tuning = new TuningPanel();
  overlay = new Overlay();
  paused = false;
  endT = 0;
  private ripLatch = false;
  private boltLatch = false;
  time = 0;
  frozen = false;
  /** events from the last ticks (e2e inspection) */
  recent: SimEvent[] = [];
  autopilot: ((w: World) => InputFrame) | null = null;
  /** hides the whole HUD (H): the "can you tell your speed" playtest */
  hudHidden = false;
  /** hold the look-back (the screenshot sweep) */
  forceLook = false;
  /** effects state for the composite */
  private hurt = 0;
  private edge = { color: C.danger3 as number, t: 0, k: 0 };
  private white = 0;
  private lockLostAt = -1;
  /** the last tick's thrust input, for the plume */
  private thrust = 0;
  /** the mirror's frame flashes gold this long: a Rammer behind you just opened its back (DECISIONS #23) */
  private mirrorGold = 0;
  private rstate = new Map<number, string>();
  /** turn scrub: the squeal's cooldown */
  private scrubbing = false;

  constructor(private host: PlayHost, seed = (Math.random() * 1e9) | 0) {
    this.world = createWorld({ seed, tuning: LIVE.t, flat: LIVE.flat });
    if (LIVE.booster) this.world.player.part = 'booster';
    this.prev = snapshot(this.world);
    this.steer.reset(this.world.player.heading);
    this.hints = new Hints(loadSeenHints(), host.settings.hints);
    this.hints.onSeen = saveSeenHints;
    host.stage.setWorld(this.world);
    host.stage.rig.mode = 'fp';
  }

  get keys() {
    const pad = this.host.input.usingPad;
    const b = this.host.input.binds;
    return { rip: pad ? 'A' : keyLabel(b.rip[0]).toUpperCase(), bolt: pad ? 'Y' : keyLabel(b.bolt[0]).toUpperCase(), look: pad ? 'LB' : keyLabel(b.look[0]).toUpperCase() };
  }

  /** One fixed tick. */
  tick() {
    if (this.paused || this.frozen) return;
    const input = this.host.input, w = this.world;
    let frame: InputFrame;
    if (this.autopilot) frame = this.autopilot(w);
    else {
      const pad = input.pad;
      const locked = input.look.locked;
      const thrust = input.isDown('up') ? 1 : Math.max(pad.rt, pad.y < -0.25 ? -pad.y : 0);
      const brake = input.isDown('down') || pad.lt > 0.3 || pad.y > 0.5;
      this.thrust = thrust;
      const xy = this.steer.update(w, {
        left: input.isDown('left'),
        right: input.isDown('right'),
        thrust,
        brake,
        mouseDx: this.tuning.open ? 0 : input.takeLook(),
        padX: Math.abs(pad.x) > 0.05 ? pad.x : 0,
      }, { sens: sensFromSetting(this.host.settings.sens), invert: this.host.settings.invert });
      frame = {
        ...xy,
        rip: input.isDown('rip') || (locked && input.mouse.down[0]) || this.ripLatch,
        bolt: input.isDown('bolt') || (locked && input.mouse.down[2]) || this.boltLatch,
      };
    }
    this.prev = snapshot(w);
    const advanced = step(w, frame);
    if (advanced) {
      this.ripLatch = false;
      this.boltLatch = false;
      this.host.stage.ticked(w, this.steer.scrub);
      // a hard turn scrubbing speed squeals (once per turn), so the cost of the mouse flick is heard
      if (this.steer.scrub && !this.scrubbing) this.host.audio.sfx('skid', 0.45, 1.3);
      this.scrubbing = this.steer.scrub;
      // a Rammer behind you that goes into its skid has its back to you: the tear is on
      for (const r of w.rammers) {
        if (r.state === 'skid' && this.rstate.get(r.id) === 'charge' && this.outOfView(r.id)) this.mirrorGold = 0.7;
        this.rstate.set(r.id, r.state);
      }
    } else this.steer.held();
    for (const e of w.events) this.handle(e);
    this.recent.push(...w.events);
    if (this.recent.length > 200) this.recent.splice(0, this.recent.length - 200);
    w.events.length = 0;
  }

  /** Whether a Rammer is outside the main view (behind or beside you). */
  private outOfView(id: number): boolean {
    const v = this.host.stage.rammerView(id)?.pos;
    if (!v) return false;
    const n = v.clone().project(this.host.stage.camera);
    return !(n.z < 1 && Math.abs(n.x) < 0.97 && Math.abs(n.y) < 0.97);
  }

  private rammerPos(id: number): THREE.Vector3 | null {
    const r = this.world.rammers.find((x) => x.id === id);
    return r ? new THREE.Vector3(wx(r.x), 0.5, wz(r.y)) : null;
  }

  private flashEdge(color: number, k: number, t = 0.18) {
    this.edge = { color, k, t };
  }

  /** Sim events: sound, effects, hints. */
  handle(e: SimEvent) {
    const a = this.host.audio, w = this.world, stage = this.host.stage, ov = this.overlay, rig = stage.rig;
    this.hints.event(e);
    stage.onEvent(e, w);
    // sounds that happen at a Rammer come from it
    const id = 'id' in e ? (e as { id: number }).id : -1;
    const src = AT_RAMMER.has(e.k) ? this.rammerPos(id) ?? ('x' in e ? new THREE.Vector3(wx((e as { x: number }).x), 0.5, wz((e as { y: number }).y)) : null) : null;
    const sfx = (name: string, v = 1, pitch = 1) => (src ? a.sfxAt(name, 'r' + id, src, v, pitch) : a.sfx(name, v, pitch));
    const at = (x: number, y: number, h = 1.1) => new THREE.Vector3(wx(x), h, wz(y));
    switch (e.k) {
      case 'rip':
        a.sfx(e.burn ? 'burn' : `rip_${e.tier}`);
        if (e.burn) rig.addShake(1);
        break;
      case 'rev': a.sfx('rev'); break;
      case 'hit':
        if (e.dmg === 0) {
          ov.text('HIT ITS BACK!', C.white, at(e.x, e.y));
          rig.addShake(1);
          sfx('clank');
          break;
        }
        if (e.zone === 'front' && e.dmg < w.t.slipDamage) {
          ov.text('GLANCED', C.mist, at(e.x, e.y));
          rig.addShake(1);
          sfx('hit', 0.7, 0.8);
          sfx('clank', 0.5);
          break;
        }
        ov.text(e.zone === 'rear' ? 'WRECKING HIT!' : 'HIT!', C.white, at(e.x, e.y));
        rig.addShake(2);
        this.white = 0.05;
        sfx('hit');
        break;
      case 'draft':
        ov.text('SLIPSTREAM!', C.speed4, null, 320, 230);
        this.flashEdge(C.speed3, 0.5);
        a.sfx('slipstream');
        break;
      case 'joust':
        // a joust is also a front hit: its GLANCED gives way to the joust
        ov.texts = ov.texts.filter((x) => x.text !== 'GLANCED');
        ov.text('JOUST!', C.white, at(e.x, e.y));
        rig.addShake(3);
        this.white = 0.08;
        sfx('slam');
        sfx('hit', 1, 1.2);
        break;
      case 'shove': rig.addShake(1); sfx('shove'); break;
      case 'clank':
        rig.addShake(1);
        a.sfx(e.wall ? 'clank' : 'rip_crawl');
        break;
      case 'scrape': a.sfx('scrape', 0.6); break;
      case 'tear':
        ov.text('TORN OFF!', C.gold3, at(e.x, e.y));
        rig.addShake(3);
        this.flashEdge(C.gold, 0.45);
        sfx('tear');
        break;
      case 'wreck':
        if (e.lost) ov.text('PART WRECKED', C.lilac, at(e.x, e.y));
        rig.addShake(3);
        sfx('wreck');
        break;
      case 'windup': sfx(e.near || e.shove ? 'windup_near' : 'windup'); break;
      case 'lock': sfx('lock'); break;
      case 'charge': sfx('charge', e.shove ? 0.6 : 1); break;
      case 'cancel': sfx('cancel'); break;
      case 'slam': rig.addShake(2); sfx('slam'); break;
      case 'bump': sfx('bump'); break;
      case 'hurt':
        this.hurt = 0.12;
        this.flashEdge(C.danger3, 0.9, 0.3);
        rig.addShake(3);
        a.sfx('hurt');
        break;
      case 'shatter':
        ov.text('SHATTERED', C.gold2, null, 320, 240);
        this.flashEdge(C.danger3, 0.8, 0.3);
        this.hurt = 0.1;
        rig.addShake(3);
        a.sfx('shatter');
        break;
      case 'knock':
        ov.text('KNOCKED LOOSE', C.gold2, null, 320, 240);
        this.flashEdge(C.danger3, 0.7, 0.25);
        this.hurt = 0.1;
        rig.addShake(3);
        a.sfx('drop');
        a.sfx('bump');
        break;
      case 'crush':
        ov.text('CRUSHED', C.lilac, at(e.x, e.y, 0.6));
        a.sfxAt('shatter', 'crush', at(e.x, e.y, 0.3), 0.7);
        break;
      case 'stun': a.sfx('stun'); rig.addShake(2); break;
      case 'skid': a.sfx('skid'); break;
      case 'tier':
        if (e.tier === 'slip' && e.prev !== 'slip') {
          a.sfx('slipstream');
          this.flashEdge(C.speed3, 0.35, 0.15);
        }
        break;
      case 'grab': a.sfx('grab'); break;
      case 'pickup': a.sfx('pickup'); break;
      case 'drop': a.sfx('drop'); break;
      case 'bolt-start': a.sfx('bolt_tick'); break;
      case 'bolt-tick': a.sfx('bolt_tick', 1, 1 + e.n * 0.15); break;
      case 'bolted':
        ov.text('BOLTED ON!', C.gold3, null, 320, 236);
        this.flashEdge(C.gold, 0.4);
        a.sfx('bolted');
        break;
      case 'bolt-cancel': a.sfx('bolt_cancel'); break;
      case 'wave':
        ov.showBanner(`WAVE ${e.n}`, e.n === 1 ? 'TEAR OFF A BOOSTER, BOLT IT ON' : e.n === 3 ? 'LAST WAVE' : '', w.t.bannerTime);
        a.sfx('wave');
        break;
      case 'gate': {
        const g = w.arena.gates.find((x) => x.id === e.gate)!;
        a.sfxAt('gate', 'gate' + g.id, new THREE.Vector3(wx(g.spawn.x), 1, wz(g.spawn.y)));
        break;
      }
      case 'enter': break;
      case 'cleared': a.sfx('cleared'); this.recordClear(); break;
      case 'scrapped': a.sfx('scrapped'); break;
      default: {
        // every sim event has a first-person answer (DECISIONS #15): a new event kind is a type error here
        const unhandled: never = e;
        void unhandled;
      }
    }
  }

  private recordClear() {
    const b = loadBest(), w = this.world;
    b.clears++;
    if (!b.bestTicks || w.stats.ticks < b.bestTicks) b.bestTicks = w.stats.ticks;
    b.bestHull = Math.max(b.bestHull, w.player.hull);
    saveBest(b);
  }

  /** Pointer lock went away (Esc, alt-tab): pause, unless a menu is already up. */
  lockLost() {
    this.lockLostAt = this.time;
    if (!this.paused && !this.world.result && !this.tuning.open && !this.frozen) this.paused = true;
  }

  /** Per frame: pause, the tuning panel, effects, hints, sound. */
  update(dt: number) {
    const input = this.host.input;
    const locked = input.look.locked;
    if (input.wasPressed('rip') || (locked && input.mouse.pressed[0])) this.ripLatch = true;
    if (input.wasPressed('bolt') || (locked && input.mouse.pressed[2])) this.boltLatch = true;
    if (input.wasPressed('hud')) this.hudHidden = !this.hudHidden;
    if (DEBUG_KEYS && input.wasPressed('debug')) {
      this.tuning.open = !this.tuning.open;
      if (this.tuning.open) this.host.unlockPointer();
    }
    if (input.wasPressed('pause') && !this.world.result && this.time - this.lockLostAt > 0.3) {
      this.paused = !this.paused;
      input.consume('pause');
      input.consume('back');
      if (this.paused) this.host.unlockPointer();
    }
    // a click on the view (not on a menu) takes the mouse for steering
    if (!locked && !this.paused && !this.world.result && !this.tuning.open && !this.frozen && input.mouse.pressed[0]) this.host.lockPointer();
    this.host.audio.setDuck(this.paused);
    this.time += dt;
    if (!this.paused && !this.frozen) this.effects(dt);
    if (this.world.result) this.endT += dt;
    const p = this.world.player;
    const a = this.host.audio;
    a.engine(p.speed / this.world.t.burnMax, revving(this.world), !this.paused && !this.world.result);
    // the listener rides the camera; each Rammer's sounds follow it
    const cam = this.host.stage.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    a.setListener(cam.position, fwd);
    for (const r of this.world.rammers) a.place('r' + r.id, { x: wx(r.x), y: 0.5, z: wz(r.y) });
  }

  /** Age the 2D effects, flashes and hints (per frame in play; per tick in the scripted scenes). */
  effects(dt: number) {
    const p = this.world.player;
    this.overlay.update(dt, p.tier === 'slip' ? Math.max(0, Math.min(1, (p.speed - this.world.t.slipAt) / 60 + 0.35)) : 0);
    const behind = this.world.rammers.some((r) => r.state === 'windup' && this.outOfView(r.id));
    if (this.host.input.isDown('look')) this.hints.looked();
    this.hints.update(this.world, dt, behind);
    this.mirrorGold = Math.max(0, this.mirrorGold - dt);
    this.hurt = Math.max(0, this.hurt - dt);
    this.edge.t = Math.max(0, this.edge.t - dt);
    this.white = Math.max(0, this.white - dt);
  }

  /** Pose the stage and draw the 3D passes. */
  render(alpha: number, dt: number, time: number) {
    const host = this.host, stage = host.stage;
    const a = this.paused || this.frozen ? 1 : alpha;
    stage.rig.shakeOn = host.settings.shake;
    const look = this.forceLook || (!this.paused && host.input.isDown('look'));
    stage.sync(this.world, this.prev, a, this.paused || this.frozen ? 0 : dt, time, { lookBack: look, thrust: this.thrust, hurt: this.hurt });
    host.view.renderMain(stage.scene, stage.camera, stage.vm);
    host.view.renderRear(stage.scene, stage.rig.rear);
  }

  /** The composite's effects this frame. */
  post(): PostFx {
    const p = this.world.player, t = this.world.t;
    const edge = p.speed > t.slipAt ? Math.min(1, 0.35 + (p.speed - t.slipAt) / 120) : 0;
    return {
      edge: this.paused ? 0 : edge,
      flashColor: this.edge.color,
      flash: this.edge.t > 0 ? this.edge.k * Math.min(1, this.edge.t / 0.1) : 0,
      whiteout: this.white > 0 ? 0.35 : 0,
      rear: true,
    };
  }

  drawUI(ui: UI, dt: number) {
    const w = this.world, stage = this.host.stage, s = this.host.settings;
    const showHud = !this.hudHidden && !w.result && !this.paused;
    this.overlay.draw(ui, stage.camera, w, {
      // against the sim's heading, not the interpolated one, so a key turn doesn't make it flicker
      reticle: showHud && !this.autopilot ? wrapAngle(this.steer.demand - w.player.heading) : null,
      scrub: this.steer.scrub,
      hfov: stage.rig.hfov,
      stun: w.player.stun > 0,
      time: this.time,
      rear: true,
    });
    if (!w.result && !this.paused) {
      if (this.mirrorGold > 0 && Math.floor(this.mirrorGold * 10) % 2 === 0) drawMirrorFrame(ui, C.gold2);
      drawMarkers(ui, stage.camera, stage.rig.rear, w, (id) => stage.rammerView(id)?.pos ?? null, this.time);
      this.hints.draw(ui, w, stage.camera, this.keys, true);
    }
    if (showHud) drawHud(ui, w, { gauge: s.gauge, keys: this.keys, boltHint: this.hints.current === 'bolt' });
    if (DEBUG_KEYS) this.tuning.draw(ui, w.t, (on) => (w.flat = on), (on) => (w.player.part = on ? 'booster' : null), dt);
    if (w.flat) ui.text('FLAT MODE', 6, 80, C.white, { shadow: C.ink });
    if (!this.host.input.look.locked && !this.paused && !w.result && !this.tuning.open && !this.frozen && !this.autopilot)
      ui.text('CLICK TO STEER WITH THE MOUSE', 320, 300, C.mist, { align: 'center', shadow: C.ink });
    if (this.paused) this.drawPause(ui);
    else if (w.result && this.endT > 1.2) this.drawResults(ui);
  }

  restart() {
    const fresh = new Play(this.host);
    Object.assign(this, { world: fresh.world, prev: fresh.prev, steer: fresh.steer, hints: fresh.hints, overlay: fresh.overlay, paused: false, endT: 0, time: 0, recent: [], hurt: 0, white: 0, mirrorGold: 0, rstate: new Map(), scrubbing: false });
    this.host.lockPointer();
  }

  private drawPause(ui: UI) {
    ui.dim();
    const x = 250, y = 110, w = 140, h = 136;
    ui.panel(x, y, w, h, 'dark');
    ui.text('PAUSED', x + w / 2, y + 10, C.white, { align: 'center', scale: 2 });
    if (ui.button('p-resume', x + 15, y + 36, 110, 18, 'RESUME')) {
      this.paused = false;
      this.host.lockPointer();
    }
    if (ui.button('p-restart', x + 15, y + 60, 110, 18, 'RESTART')) this.restart();
    if (ui.button('p-settings', x + 15, y + 84, 110, 18, 'SETTINGS')) this.host.openSettings();
    if (ui.button('p-title', x + 15, y + 108, 110, 18, 'TITLE')) this.host.toTitle();
    // how first person works, in a few lines (nothing else teaches the reticle or the brake)
    const k = this.keys;
    const lines = [
      'W THRUST    S BRAKE (IT NEVER REVERSES OR FLIPS YOU)',
      'MOUSE OR A/D STEER: THE BODY TURNS AT ITS OWN RATE',
      'THE RETICLE IS WHERE YOU ASKED TO GO; HARD TURNS COST SPEED',
      `${k.rip} RIP    ${k.bolt} BOLT ON    ${k.look} LOOK BACK    H HIDE HUD`,
      'THE MIRROR AT THE TOP IS BEHIND YOU',
    ];
    const ly = y + h + 8;
    ui.panel(150, ly, 340, lines.length * 12 + 10, 'dark');
    lines.forEach((t, i) => ui.text(t, 320, ly + 6 + i * 12, i === 4 ? C.frost : C.mist, { align: 'center' }));
  }

  private drawResults(ui: UI) {
    const w = this.world, s = w.stats, cleared = w.result === 'cleared';
    ui.dim();
    const x = 220, y = 84, pw = 200, ph = 196;
    ui.panel(x, y, pw, ph, 'dark');
    ui.text(cleared ? 'YARD CLEARED' : 'SCRAPPED', x + pw / 2, y + 10, cleared ? C.white : C.danger2, { align: 'center', scale: 2 });
    const secs = s.ticks / 60;
    const rows: [string, string][] = [
      ['TIME', `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`],
      ['HULL LEFT', `${Math.max(0, w.player.hull)}/${w.t.hull}`],
      ['BOOSTERS TORN OFF', String(s.tears)],
      ['SLIPSTREAM HITS', String(s.slipHits)],
      ['TOP SPEED', String(Math.round(s.topSpeed))],
    ];
    rows.forEach(([k, v], i) => {
      ui.text(k, x + 16, y + 40 + i * 13, C.mist);
      ui.text(v, x + pw - 16, y + 40 + i * 13, C.white, { align: 'right' });
    });
    const b = loadBest();
    if (b.clears) ui.text(`BEST CLEAR ${Math.floor(b.bestTicks / 3600)}:${String(Math.floor((b.bestTicks / 60) % 60)).padStart(2, '0')}`, x + pw / 2, y + 112, C.lilac, { align: 'center' });
    if (ui.button('r-again', x + 16, y + 130, pw - 32, 20, 'AGAIN')) this.restart();
    if (ui.button('r-title', x + 16, y + 156, pw - 32, 20, 'TITLE')) this.host.toTitle();
  }
}
