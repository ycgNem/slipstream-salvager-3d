// A run in first person (2D PLAN.md 8.1): runs the current yard's vendored sim from the
// first-person input adapter, turns its events into sound (positional for anything in the arena),
// effects in the world and on the 2D layer, draws the HUD, hints, markers and the exit signs, wipes
// from yard to yard as you drive out through an exit, and shows the pause and the run's results.
import * as THREE from 'three';
import { C } from '../data/palette';
import { wrapAngle } from '../data/dirs';
import { MOUNTS } from '../data/mounts';
import { PARTS } from '../data/parts';
import { RUN_LENGTH, YARDS, type YardId } from '../data/yards';
import { DEBUG_KEYS, keyLabel, type Input } from '../engine/input';
import type { Audio } from '../engine/audio/audio';
import { DT, giveBolted, type Bolted, type InputFrame, type World } from '../sim/world';
import { finishYard, newRun, yardWorld, type Run } from '../sim/run';
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
import { drawExitSigns, type SignBox } from '../ui3d/signs3d';
import { partIcon } from '../ui3d/icons';
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

/** Events that happen at an enemy: their sound comes from it. */
const AT_ENEMY = new Set(['windup', 'lock', 'charge', 'cancel', 'slam', 'shove', 'bump', 'joust', 'wreck', 'hit', 'tear', 'snap', 'slide-e', 'block', 'latch', 'ram']);

/** seconds the wipe between yards takes */
const WIPE = 0.8;
/** how much of the screen the wipe covers, 0..1, t seconds in */
const wipeCover = (t: number) => (t / WIPE < 0.5 ? (t / WIPE) * 2 : (1 - t / WIPE) * 2);

/** ?yard=kennel (debug builds): start a run in that yard, for testing and the screenshot sweep */
function startYard(): YardId {
  if (!DEBUG_KEYS || typeof location === 'undefined') return 'ring';
  const y = new URLSearchParams(location.search).get('yard');
  return y && y in YARDS ? (y as YardId) : 'ring';
}

export class Play {
  run: Run;
  world: World;
  steer = new Steer();
  prev: Snap;
  hints: Hints;
  tuning = new TuningPanel();
  overlay = new Overlay();
  paused = false;
  endT = 0;
  /** the wipe between yards: seconds in, and whether the next yard is in yet */
  wipe: { t: number; swapped: boolean } | null = null;
  /** the run's end has been recorded */
  private runDone = false;
  /** this run counts toward the best record (the screenshot scenes turn it off) */
  record = true;
  /** the run has been counted (on its first tick) */
  private counted = false;
  private ripLatch = false;
  private boltLatch = false;
  /** a bolt press that the sim refused (mid-lunge, right after the tear) is retried this long (s) */
  private boltPend = 0;
  private boltSent = false;
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
  /** where the exit signs were drawn this frame */
  private signBoxes: SignBox[] = [];

  constructor(private host: PlayHost, seed = (Math.random() * 1e9) | 0, start: YardId = startYard()) {
    this.run = newRun(seed, start);
    this.world = yardWorld(this.run, { tuning: LIVE.t, flat: LIVE.flat });
    for (const id of LIVE.parts) giveBolted(this.world, id);
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
    return {
      rip: pad ? 'A' : keyLabel(b.rip[0]).toUpperCase(),
      bolt: pad ? 'Y' : keyLabel(b.bolt[0]).toUpperCase(),
      look: pad ? 'LB' : keyLabel(b.look[0]).toUpperCase(),
      brake: pad ? 'LT' : keyLabel(b.down[0]).toUpperCase(),
    };
  }

  /** The next yard: fold this one into the run and build the next world (mid-wipe). */
  private nextYard() {
    finishYard(this.run, this.world);
    this.world = yardWorld(this.run, { tuning: LIVE.t, flat: LIVE.flat });
    this.prev = snapshot(this.world);
    this.steer.reset(this.world.player.heading);
    this.host.stage.setWorld(this.world);
    this.overlay.texts = [];
    this.overlay.banner = null;
    this.rstate.clear();
    this.endT = 0;
  }

  /** The run is over (won or scrapped): fold in the last yard and record the best. */
  private endRun() {
    if (this.runDone) return;
    this.runDone = true;
    finishYard(this.run, this.world);
    if (!this.record) return;
    const b = loadBest(), r = this.run;
    const yards = r.over === 'won' ? RUN_LENGTH : r.depth - 1;
    b.bestYards = Math.max(b.bestYards, yards);
    if (r.over === 'won') {
      b.wins++;
      if (!b.bestWinTicks || r.totals.ticks < b.bestWinTicks) b.bestWinTicks = r.totals.ticks;
    }
    saveBest(b);
  }

  /** One fixed tick. */
  tick() {
    if (this.paused || this.frozen || this.wipe) return;
    if (!this.counted) {
      // a run counts once it's actually played
      this.counted = true;
      if (this.record) {
        const b = loadBest();
        b.runs++;
        saveBest(b);
      }
    }
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
      let bolt = input.isDown('bolt') || (locked && input.mouse.down[2]) || this.boltLatch;
      // the sim reads the bolt on its press edge and refuses it during the lunge: a reflex press
      // right after TORN OFF! is pressed again for it, every other tick, until it takes
      if (this.boltPend > 0 && w.player.tow && w.player.bolt === null) bolt = !this.boltSent;
      frame = {
        ...xy,
        rip: input.isDown('rip') || (locked && input.mouse.down[0]) || this.ripLatch,
        bolt,
      };
    }
    this.prev = snapshot(w);
    const advanced = step(w, frame);
    if (advanced) {
      this.ripLatch = false;
      this.boltLatch = false;
      this.boltSent = frame.bolt;
      this.boltPend = w.player.bolt !== null ? 0 : Math.max(0, this.boltPend - DT);
      this.host.stage.ticked(w, this.steer.scrub);
      // a hard turn scrubbing speed squeals (once per turn), so the cost of the mouse flick is heard
      if (this.steer.scrub && !this.scrubbing) this.host.audio.sfx('skid', 0.45, 1.3);
      this.scrubbing = this.steer.scrub;
      // a Rammer behind you that goes into its skid has its back to you: the tear is on
      for (const r of w.enemies) {
        // (not the one that just hit you: red and gold at once says nothing)
        if (r.kind === 'rammer' && r.parts.rear === 'booster' && r.state === 'skid' && this.rstate.get(r.id) === 'charge' && this.outOfView(r.id) && this.hurt <= 0) this.mirrorGold = 0.7;
        this.rstate.set(r.id, r.state);
      }
    } else this.steer.held();
    for (const e of w.events) this.handle(e);
    this.recent.push(...w.events);
    if (this.recent.length > 200) this.recent.splice(0, this.recent.length - 200);
    w.events.length = 0;
  }

  /** Whether an enemy is outside the main view (behind or beside you). */
  private outOfView(id: number): boolean {
    return !this.inCam(id, this.host.stage.camera);
  }

  private inCam(id: number, cam: THREE.Camera): boolean {
    const v = this.host.stage.enemyPos(id);
    if (!v) return false;
    const n = v.clone().project(cam);
    return n.z < 1 && n.z > -1 && Math.abs(n.x) < 0.97 && Math.abs(n.y) < 0.97;
  }

  private enemyPos(id: number): THREE.Vector3 | null {
    const r = this.world.enemies.find((x) => x.id === id);
    return r ? new THREE.Vector3(wx(r.x), r.kind === 'rammer' ? 0.5 : 0.3, wz(r.y)) : null;
  }

  private flashEdge(color: number, k: number, t = 0.18) {
    this.edge = { color, k, t };
  }

  /** Sim events: sound, effects, hints. */
  handle(e: SimEvent) {
    const a = this.host.audio, w = this.world, stage = this.host.stage, ov = this.overlay, rig = stage.rig;
    this.hints.event(e);
    stage.onEvent(e, w);
    // sounds that happen at an enemy come from it
    const id = 'id' in e ? (e as { id: number }).id : -1;
    const src = AT_ENEMY.has(e.k) ? this.enemyPos(id) ?? ('x' in e ? new THREE.Vector3(wx((e as { x: number }).x), 0.5, wz((e as { y: number }).y)) : null) : null;
    const sfx = (name: string, v = 1, pitch = 1) => (src ? a.sfxAt(name, 'r' + id, src, v, pitch) : a.sfx(name, v, pitch));
    const at = (x: number, y: number, h = 1.1) => new THREE.Vector3(wx(x), h, wz(y));
    switch (e.k) {
      case 'rip':
        a.sfx(e.burn ? 'burn' : `rip_${e.tier}`);
        if (e.burn) rig.addShake(1);
        break;
      case 'rev': a.sfx('rev'); break;
      case 'hit':
        if (e.clang) {
          // a plowed front: nothing gets through
          ov.text('CLANG! JOUST IT', C.mist, at(e.x, e.y));
          rig.addShake(2);
          sfx('clank');
          sfx('slam', 0.5);
          break;
        }
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
      case 'ram':
        // the Plow: driving into one is a hit (the hit itself follows)
        rig.addShake(e.tier === 'slip' ? 2 : 1);
        sfx('shove', 0.8, 0.8);
        break;
      case 'block':
        ov.texts = ov.texts.filter((x) => x.text !== 'GLANCED');
        ov.text('BLOCKED!', C.white, at(e.x, e.y));
        rig.addShake(3);
        this.white = 0.06;
        sfx('slam');
        sfx('clank', 0.7);
        break;
      case 'latch':
        // the Jaws bite on: the view whips round it (stage.ts)
        rig.addShake(2);
        sfx('bolt_tick', 1, 0.7);
        sfx('hit', 0.6, 1.4);
        break;
      case 'sling':
        ov.text('SLUNG!', C.speed4, null, 320, 230);
        this.flashEdge(C.speed3, 0.45);
        a.sfx('slipstream', 0.7, 1.2);
        break;
      case 'slide':
        // your power-slide on the Grip Treads
        rig.addShake(1);
        a.sfx('skid', 0.8, 1.3);
        break;
      case 'slide-e': sfx('skid', 0.5, 1.6); break;
      case 'snap': sfx('charge', 0.5, 1.6); break;
      case 'joust':
        // a joust is also a front hit: its GLANCED gives way to the joust
        ov.texts = ov.texts.filter((x) => x.text !== 'GLANCED' && x.text !== 'CLANG! JOUST IT');
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
        if (e.lost.length) ov.text(e.lost.length > 1 ? 'PARTS WRECKED' : 'PART WRECKED', C.lilac, at(e.x, e.y));
        rig.addShake(e.kind === 'rammer' ? 3 : 2);
        sfx('wreck', e.kind === 'rammer' ? 1 : 0.8, e.kind === 'rammer' ? 1 : 1.2);
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
        ov.text(`${PARTS[e.part].name.toUpperCase()} KNOCKED LOOSE`, C.gold2, null, 320, 240);
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
      case 'wave': {
        const r = this.run, y = YARDS[r.yard], last = e.n === w.waves.length;
        if (e.n === 1) ov.showBanner(y.name, r.yard === 'ring' ? 'TEAR OFF A BOOSTER, BOLT IT ON' : `YARD ${r.depth} OF ${RUN_LENGTH}`, w.t.bannerTime + 0.4);
        else ov.showBanner(`WAVE ${e.n}`, last ? 'LAST WAVE' : '', w.t.bannerTime);
        a.sfx('wave');
        break;
      }
      case 'gate': {
        const g = w.arena.gates.find((x) => x.id === e.gate)!;
        a.sfxAt('gate', 'gate' + g.id, new THREE.Vector3(wx(g.spawn.x), 1, wz(g.spawn.y)));
        break;
      }
      case 'enter': break;
      case 'yard-clear':
        ov.showBanner('YARD CLEARED', e.patched ? '+1 HULL   DRIVE OUT THROUGH A GATE' : 'DRIVE OUT THROUGH A GATE', 2.4);
        this.flashEdge(C.gold, 0.3, 0.2);
        a.sfx('cleared');
        break;
      case 'exit': a.sfx('wave', 0.8, 1.2); break;
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
    if (!this.record) return;
    const b = loadBest(), w = this.world;
    b.clears++;
    if (!b.bestTicks || w.stats.ticks < b.bestTicks) b.bestTicks = w.stats.ticks;
    b.bestHull = Math.max(b.bestHull, w.player.hull);
    saveBest(b);
  }

  /** Pointer lock went away (Esc, alt-tab): pause, unless a menu is already up. */
  lockLost() {
    this.lockLostAt = this.time;
    if (!this.paused && !this.over && !this.tuning.open && !this.frozen) this.paused = true;
  }

  /** The run has ended (won or scrapped); a yard driven out of is not an end. */
  get over(): boolean {
    return this.world.result === 'cleared' || this.world.result === 'scrapped';
  }

  /** Per frame: pause, the tuning panel, the wipe, effects, hints, sound. */
  update(dt: number) {
    const input = this.host.input;
    const locked = input.look.locked;
    if (input.wasPressed('rip') || (locked && input.mouse.pressed[0])) this.ripLatch = true;
    if (input.wasPressed('bolt') || (locked && input.mouse.pressed[2])) {
      this.boltLatch = true;
      this.boltPend = 0.4;
    }
    if (input.wasPressed('hud')) this.hudHidden = !this.hudHidden;
    if (DEBUG_KEYS && input.wasPressed('debug')) {
      this.tuning.open = !this.tuning.open;
      if (this.tuning.open) this.host.unlockPointer();
    }
    if (input.wasPressed('pause') && !this.over && this.time - this.lockLostAt > 0.3) {
      this.paused = !this.paused;
      input.consume('pause');
      input.consume('back');
      if (this.paused) this.host.unlockPointer();
    }
    // a click on the view (not on a menu) takes the mouse for steering
    if (!locked && !this.paused && !this.over && !this.tuning.open && !this.frozen && input.mouse.pressed[0]) this.host.lockPointer();
    this.host.audio.setDuck(this.paused);
    this.time += dt;
    // drove out through an exit: wipe to the next yard
    if (this.world.result === 'exit' && !this.wipe && !this.frozen) this.wipe = { t: 0, swapped: false };
    if (this.wipe && !this.frozen && !this.paused) {
      this.wipe.t += dt;
      if (!this.wipe.swapped && this.wipe.t >= WIPE / 2) {
        this.nextYard();
        this.wipe.swapped = true;
      }
      if (this.wipe.t >= WIPE) this.wipe = null;
    }
    if (this.over) this.endRun();
    if (!this.paused && !this.frozen) this.effects(dt);
    if (this.over) this.endT += dt;
    const p = this.world.player;
    const a = this.host.audio;
    a.engine(p.speed / this.world.t.burnMax, revving(this.world), !this.paused && !this.over);
    // the listener rides the camera; each enemy's sounds follow it
    const cam = this.host.stage.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    a.setListener(cam.position, fwd);
    for (const r of this.world.enemies) a.place('r' + r.id, { x: wx(r.x), y: r.kind === 'rammer' ? 0.5 : 0.3, z: wz(r.y) });
  }

  /** Age the 2D effects, flashes and hints (per frame in play; per tick in the scripted scenes). */
  effects(dt: number) {
    const p = this.world.player;
    this.overlay.update(dt, p.tier === 'slip' ? Math.max(0, Math.min(1, (p.speed - this.world.t.slipAt) / 60 + 0.35)) : 0);
    // the mirror hint only when the mirror really shows it (beside you only the arrow does)
    const behind = this.world.enemies.some((r) => r.state === 'windup' && this.outOfView(r.id) && this.inCam(r.id, this.host.stage.rig.rear));
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
    const still = this.paused || this.frozen || !!this.wipe;
    const a = still ? 1 : alpha;
    stage.rig.shakeOn = host.settings.shake;
    const look = this.forceLook || (!this.paused && host.input.isDown('look'));
    stage.sync(this.world, this.prev, a, still ? 0 : dt, time, { lookBack: look, thrust: this.thrust, hurt: this.hurt });
    host.view.renderMain(stage.scene, stage.camera, stage.vm);
    host.view.renderRear(stage.scene, stage.rig.rear);
  }

  /** The composite's effects this frame. */
  post(): PostFx {
    const p = this.world.player, t = this.world.t;
    const edge = p.speed > t.slipAt ? Math.min(1, 0.35 + (p.speed - t.slipAt) / 120) : 0;
    return {
      edge: this.paused || this.wipe ? 0 : edge,
      flashColor: this.edge.color,
      flash: this.edge.t > 0 ? this.edge.k * Math.min(1, this.edge.t / 0.1) : 0,
      whiteout: this.white > 0 ? 0.35 : 0,
      rear: true,
    };
  }

  drawUI(ui: UI, dt: number) {
    const w = this.world, stage = this.host.stage, s = this.host.settings;
    // while the wipe covers the screen, only the yard's name shows
    const covered = !!this.wipe && wipeCover(this.wipe.t) >= 0.83;
    const showHud = !this.hudHidden && !this.over && !this.paused && !covered;
    if (!covered) {
      this.signBoxes = !this.paused && !this.over ? drawExitSigns(ui, stage.camera, w, this.run, this.time, true) : [];
      this.overlay.draw(ui, stage.camera, w, {
        // against the sim's heading, not the interpolated one, so a key turn doesn't make it flicker
        reticle: showHud && !this.autopilot && !w.result ? wrapAngle(this.steer.demand - w.player.heading) : null,
        scrub: this.steer.scrub,
        hfov: stage.rig.hfov,
        stun: w.player.stun > 0,
        time: this.time,
        rear: true,
      });
      if (!w.result && !this.paused) {
        if (this.mirrorGold > 0 && Math.floor(this.mirrorGold * 10) % 2 === 0) drawMirrorFrame(ui, C.gold2);
        drawMarkers(ui, stage.camera, stage.rig.rear, w, (id) => stage.enemyPos(id), this.time);
        this.hints.draw(ui, w, stage.camera, this.keys, true, [...this.overlay.drawn, ...this.signBoxes]);
      }
      if (showHud) drawHud(ui, w, { gauge: s.gauge, keys: this.keys, boltHint: this.hints.current === 'bolt', label: `YARD ${this.run.depth}/${RUN_LENGTH}  WAVE ${Math.min(w.waves.length, w.wave.index + 1)}/${w.waves.length}` });
      this.overlay.drawBanner(ui);
    }
    if (DEBUG_KEYS) this.tuning.draw(ui, w.t, (on) => (w.flat = on), (id, on) => (on ? giveBolted(w, id) : delete w.player.parts[PARTS[id].mount]), dt);
    if (w.flat) ui.text('FLAT MODE', 6, 100, C.white, { shadow: C.ink });
    if (!this.host.input.look.locked && !this.paused && !w.result && !this.tuning.open && !this.frozen && !this.autopilot && !this.wipe)
      ui.text('CLICK TO STEER WITH THE MOUSE', 320, 300, C.mist, { align: 'center', shadow: C.ink });
    if (this.wipe) this.drawWipe(ui);
    if (this.paused) this.drawPause(ui);
    else if (this.over && this.endT > 1.2) this.drawResults(ui);
  }

  /** Ink bars sweep across and back while the next yard is built; the next yard's name at full cover. */
  private drawWipe(ui: UI) {
    const f = this.wipe!.t / WIPE;
    const cover = wipeCover(this.wipe!.t);
    const rows = 12;
    for (let i = 0; i < rows; i++) {
      const wdt = Math.round(Math.min(1, cover * 1.4 - (i % 3) * 0.08) * 640);
      if (wdt > 0) ui.fill(f < 0.5 ? 0 : 640 - wdt, i * 30, wdt, 30, C.ink);
    }
    const next = this.wipe!.swapped ? this.run.yard : this.run.options[this.world.exitChoice ?? 0] ?? this.run.yard;
    if (cover > 0.8) ui.text(YARDS[next].name, 320, 172, C.white, { align: 'center', scale: 2 });
  }

  restart() {
    const fresh = new Play(this.host);
    Object.assign(this, {
      run: fresh.run, world: fresh.world, prev: fresh.prev, steer: fresh.steer, hints: fresh.hints, overlay: fresh.overlay,
      paused: false, endT: 0, time: 0, recent: [], hurt: 0, white: 0, mirrorGold: 0, rstate: new Map(), scrubbing: false,
      wipe: null, runDone: false, counted: false,
    });
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
    const k = this.keys, parts = this.world.player.parts, flat = this.world.flat;
    const lines = [
      parts.sides?.id === 'treads' && !flat ? `W THRUST    ${k.brake} AT SPEED: POWER-SLIDE ROUND (GRIP TREADS)` : 'W THRUST    S BRAKE (IT NEVER REVERSES OR FLIPS YOU)',
      'MOUSE OR A/D STEER: THE BODY TURNS AT ITS OWN RATE',
      'THE RETICLE IS WHERE YOU ASKED TO GO; HARD TURNS COST SPEED',
      `${k.rip} RIP    ${k.bolt} BOLT ON    ${k.look} LOOK BACK    H HIDE HUD`,
      'THE MIRROR AT THE TOP IS BEHIND YOU',
    ];
    // what your bolted parts do to your verbs (2D PLAN.md 8.2)
    if (!flat) {
      if (parts.rear?.id === 'booster') lines.push(`BOOSTER: HOLD ${k.rip} TO REV A BURN, LET GO TO LAUNCH`);
      if (parts.front?.id === 'plow') lines.push('PLOW: DRIVE INTO THEM AT TEAL; IT BLOCKS CHARGES');
      if (parts.front?.id === 'jaws') lines.push('JAWS: A TEAL HIT BITES ON AND SLINGS YOU BACK OUT');
    }
    const ly = y + h + 8;
    ui.panel(130, ly, 380, lines.length * 12 + 10, 'dark');
    lines.forEach((t, i) => ui.text(t, 320, ly + 6 + i * 12, i === 4 ? C.frost : i > 4 ? C.gold3 : C.mist, { align: 'center' }));
  }

  private drawResults(ui: UI) {
    const r = this.run, T = r.totals, won = r.over === 'won';
    ui.dim();
    const x = 200, y = 60, pw = 240, ph = 236;
    ui.panel(x, y, pw, ph, 'dark');
    ui.text(won ? 'RUN CLEARED' : 'SCRAPPED', x + pw / 2, y + 10, won ? C.white : C.mist, { align: 'center', scale: 2 });
    ui.text(won ? 'ALL FIVE YARDS' : `IN ${YARDS[r.yard].name}, YARD ${r.depth} OF ${RUN_LENGTH}`, x + pw / 2, y + 30, C.mist, { align: 'center' });
    const secs = T.ticks / 60;
    const rows: [string, string][] = [
      ['TIME', `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`],
      ['YARDS CLEARED', `${won ? RUN_LENGTH : r.depth - 1}/${RUN_LENGTH}`],
      ['PARTS TORN OFF', String(T.tears)],
      ['WRECKED', String(T.wrecks)],
      ['JOUSTS', String(T.jousts)],
      ['TOP SPEED', String(Math.round(T.topSpeed))],
    ];
    rows.forEach(([k, v], i) => {
      ui.text(k, x + 16, y + 46 + i * 12, C.mist);
      ui.text(v, x + pw - 16, y + 46 + i * 12, C.white, { align: 'right' });
    });
    // the build you finished with
    ui.text('BUILD', x + 16, y + 122, C.mist);
    const parts = MOUNTS.map((m) => r.loadout?.parts[m]).filter((b): b is Bolted => !!b);
    if (!parts.length) ui.text('BARE CHASSIS', x + pw - 16, y + 122, C.lilac, { align: 'right' });
    parts.forEach((b, i) => partIcon(ui, b.id, x + pw - 16 - (parts.length - i) * 18 + 2, y + 118, b.cracked));
    const b = loadBest();
    const best = b.wins ? `BEST WIN ${Math.floor(b.bestWinTicks / 3600)}:${String(Math.floor((b.bestWinTicks / 60) % 60)).padStart(2, '0')}   WINS ${b.wins}` : `BEST: ${b.bestYards} YARD${b.bestYards === 1 ? '' : 'S'} CLEARED`;
    ui.text(best, x + pw / 2, y + 146, C.lilac, { align: 'center' });
    if (ui.button('r-again', x + 16, y + 168, pw - 32, 20, 'AGAIN')) this.restart();
    if (ui.button('r-title', x + 16, y + 194, pw - 32, 20, 'TITLE')) this.host.toTitle();
  }
}
