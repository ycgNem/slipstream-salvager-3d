// Procedural audio: synthesized SFX for every action, a continuous engine hum whose pitch follows
// speed (half of the movement feedback), and the music loop (songs.ts, played by music.ts).
// Primitives adapted from Sprocket & Sprout's engine; the sounds are this game's.
// First person (THREEJS-NOTES rule 10): a sound can be placed in the arena. Each source (a Rammer,
// a gate) gets an HRTF PannerNode (linear distance model, silent at the arena diagonal) that
// follows it, and the listener follows the camera, so a windup behind you is heard behind you.
// The engine hum stays non-positional.
import { playSfxr } from './sfxr';
import { Music } from './music';

export interface Vol { master: number; music: number; sfx: number }

export interface Vec3 { x: number; y: number; z: number }

/** the arena diagonal (m): a panned sound fades to nothing here */
const MAX_DIST = 37;

type Env = { a: number; d: number; s?: number; r?: number };

/** the music bus's level at full music volume (the songs mix to about 0.08 RMS) */
const MUSIC_LEVEL = 0.22;

export class Audio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private music: Music | null = null;
  private engineNodes: { o1: OscillatorNode; o2: OscillatorNode; whine: OscillatorNode; f: BiquadFilterNode; g: GainNode; wg: GainNode } | null = null;
  private lastSfx = new Map<string, number>();
  private pm = 1;
  /** where tone() and noise() send their output: the SFX bus, or a source's panner */
  private out!: AudioNode;
  private sources = new Map<string, { panner: PannerNode; muffle: BiquadFilterNode; last: number }>();
  /** where the listener is and faces, for muffling sounds from behind */
  private lis = { x: 0, y: 0, z: 0, fx: 0, fz: -1 };
  vol: Vol;
  musicOn = true;
  /** quieter while paused */
  private duck = false;

  constructor(v: Vol, musicOn = true) {
    this.vol = { ...v };
    this.musicOn = musicOn;
  }

  /** Create the context on the first user gesture (browsers require one). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      const ctx: AudioContext = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
      this.musicBus = ctx.createGain();
      this.sfxBus = ctx.createGain();
      this.musicBus.connect(this.master);
      this.sfxBus.connect(this.master);
      this.out = this.sfxBus;
      const len = ctx.sampleRate * 2;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.applyVol();
      this.music = new Music(ctx, this.musicBus);
      this.music.start(0, ctx.currentTime + 0.3);
    } catch {
      this.ctx = null;
      this.music = null;
    }
  }

  applySettings(v: Vol, musicOn: boolean) {
    this.vol = { ...v };
    this.musicOn = musicOn;
    this.applyVol();
  }

  setDuck(on: boolean) {
    if (this.duck === on) return;
    this.duck = on;
    this.applyVol();
  }

  private applyVol() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master * (this.duck ? 0.5 : 1), t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.musicOn ? this.vol.music * MUSIC_LEVEL : 0, t, 0.08);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx * 0.7, t, 0.05);
  }

  /** Call every frame: schedules music, drops idle panners. */
  update() {
    if (this.ctx && this.music) this.music.update(this.ctx.currentTime);
    this.sweepSources();
  }

  // ---------------- the engine hum ----------------

  /**
   * The robot's engine: two detuned oscillators through a lowpass, pitch and brightness rising with
   * speed (speed01 = speed / burn max), plus a whine while revving the Burn. on=false fades it out.
   */
  engine(speed01: number, revving: boolean, on: boolean) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.engineNodes) {
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), whine = ctx.createOscillator();
      const f = ctx.createBiquadFilter(), g = ctx.createGain(), wg = ctx.createGain();
      o1.type = 'sawtooth';
      o2.type = 'square';
      whine.type = 'triangle';
      f.type = 'lowpass';
      f.Q.value = 2;
      g.gain.value = 0;
      wg.gain.value = 0;
      o1.connect(f);
      o2.connect(f);
      f.connect(g);
      g.connect(this.sfxBus);
      whine.connect(wg);
      wg.connect(this.sfxBus);
      o1.start();
      o2.start();
      whine.start();
      this.engineNodes = { o1, o2, whine, f, g, wg };
    }
    const n = this.engineNodes, t = ctx.currentTime, s = Math.max(0, Math.min(1.2, speed01));
    const base = 42 + s * 95;
    n.o1.frequency.setTargetAtTime(base, t, 0.04);
    n.o2.frequency.setTargetAtTime(base * 0.502, t, 0.04);
    n.f.frequency.setTargetAtTime(260 + s * 1500, t, 0.05);
    n.g.gain.setTargetAtTime(on ? 0.035 + s * 0.06 : 0, t, on ? 0.05 : 0.12);
    n.whine.frequency.setTargetAtTime(500 + s * 900, t, 0.04);
    n.wg.gain.setTargetAtTime(on && revving ? 0.03 : 0, t, 0.05);
  }

  // ---------------- primitives ----------------

  private tone(freq: number, type: OscillatorType, env: Env, vol: number, t0 = 0, slide = 0): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + t0;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    freq *= this.pm;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + env.a + env.d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + env.a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol * (env.s ?? 0.001)), t + env.a + env.d);
    if (env.r) g.gain.exponentialRampToValueAtTime(0.0001, t + env.a + env.d + env.r);
    o.connect(g);
    g.connect(this.out);
    o.start(t);
    o.stop(t + env.a + env.d + (env.r ?? 0) + 0.05);
  }

  private noise(dur: number, vol: number, filter: BiquadFilterType, freq: number, q = 1, t0 = 0, sweep = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + t0;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.5 + Math.random();
    const f = ctx.createBiquadFilter();
    f.type = filter;
    freq *= this.pm;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.out);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  // ---------------- the sounds ----------------

  // ---------------- positional sound ----------------

  /** Put the listener at the camera: position and facing (unit vectors), once a frame. */
  setListener(pos: Vec3, fwd: Vec3, up: Vec3 = { x: 0, y: 1, z: 0 }) {
    const ctx = this.ctx;
    if (!ctx) return;
    const L = ctx.listener, t = ctx.currentTime;
    const fl = Math.hypot(fwd.x, fwd.z) || 1;
    this.lis = { x: pos.x, y: pos.y, z: pos.z, fx: fwd.x / fl, fz: fwd.z / fl };
    if (L.positionX) {
      L.positionX.setValueAtTime(pos.x, t);
      L.positionY.setValueAtTime(pos.y, t);
      L.positionZ.setValueAtTime(pos.z, t);
      L.forwardX.setValueAtTime(fwd.x, t);
      L.forwardY.setValueAtTime(fwd.y, t);
      L.forwardZ.setValueAtTime(fwd.z, t);
      L.upX.setValueAtTime(up.x, t);
      L.upY.setValueAtTime(up.y, t);
      L.upZ.setValueAtTime(up.z, t);
    } else {
      L.setPosition(pos.x, pos.y, pos.z);
      L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }
  }

  /** The panner for a named source (a Rammer's id, a gate), created on first use. */
  private source(key: string): PannerNode {
    const ctx = this.ctx!;
    let s = this.sources.get(key);
    if (!s) {
      const panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'linear';
      panner.refDistance = 1.5;
      panner.maxDistance = MAX_DIST;
      panner.rolloffFactor = 0.85;
      // HRTF alone is weakest at front vs back: a sound from behind you is also muffled
      const muffle = ctx.createBiquadFilter();
      muffle.type = 'lowpass';
      muffle.frequency.value = 20000;
      panner.connect(muffle);
      muffle.connect(this.sfxBus);
      s = { panner, muffle, last: ctx.currentTime };
      this.sources.set(key, s);
    }
    s.last = ctx.currentTime;
    return s.panner;
  }

  /** Move a source (call every frame while it exists). */
  place(key: string, p: Vec3) {
    const ctx = this.ctx;
    if (!ctx) return;
    const s = this.sources.get(key);
    if (!s) return;
    const t = ctx.currentTime, pn = s.panner, L = this.lis;
    const dx = p.x - L.x, dz = p.z - L.z, d = Math.hypot(dx, dz);
    // cos of the angle off your nose: full brightness ahead and beside, darker the further behind
    const c = d > 0.01 ? (dx * L.fx + dz * L.fz) / d : 1;
    s.muffle.frequency.setTargetAtTime(c >= -0.2 ? 20000 : 20000 * Math.pow(1400 / 20000, Math.min(1, (-0.2 - c) / 0.6)), t, 0.03);
    if (pn.positionX) {
      pn.positionX.setTargetAtTime(p.x, t, 0.02);
      pn.positionY.setTargetAtTime(p.y, t, 0.02);
      pn.positionZ.setTargetAtTime(p.z, t, 0.02);
    } else pn.setPosition(p.x, p.y, p.z);
  }

  /** Play a sound at a source in the arena (it follows the source while place() moves it). */
  sfxAt(id: string, key: string, at: Vec3, v = 1, pitch = 1) {
    if (!this.ctx) return;
    const pn = this.source(key);
    this.place(key, at);
    this.out = pn;
    try {
      this.sfx(id, v, pitch, key);
    } finally {
      this.out = this.sfxBus;
    }
  }

  /** Drop panners nobody has used for a while. */
  private sweepSources() {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const [k, s] of this.sources)
      if (ctx.currentTime - s.last > 4) {
        s.panner.disconnect();
        s.muffle.disconnect();
        this.sources.delete(k);
      }
  }

  /** Play a named sound. `v` scales volume; `pitch` multiplies pitch. */
  sfx(id: string, v = 1, pitch = 1, key = '') {
    const ctx = this.ctx;
    if (!ctx || v <= 0.02) return;
    const now = ctx.currentTime;
    // the same sound (from the same source) at most every 30 ms, so a burst never gets shrill
    if (now - (this.lastSfx.get(id + key) ?? -1) < 0.03) return;
    this.lastSfx.set(id + key, now);
    if (playSfxr(ctx, this.out, id, v, pitch)) return;
    this.pm = pitch;
    switch (id) {
      // ---- the player's attack, by tier ----
      case 'rip_crawl':
        this.noise(0.08, 0.25 * v, 'bandpass', 900, 3);
        this.tone(140, 'square', { a: 0.002, d: 0.09 }, 0.08 * v, 0, 0.7);
        break;
      case 'rip_cruise':
        this.noise(0.14, 0.3 * v, 'bandpass', 1400, 1.5, 0, 2.2);
        break;
      case 'rip_slip':
        this.noise(0.18, 0.45 * v, 'bandpass', 1800, 1.2, 0, 3);
        this.tone(300, 'sawtooth', { a: 0.004, d: 0.14 }, 0.06 * v, 0, 2.5);
        break;
      case 'burn':
        this.noise(0.4, 0.4 * v, 'lowpass', 1200, 0.8, 0, 3);
        this.tone(90, 'sawtooth', { a: 0.01, d: 0.38 }, 0.1 * v, 0, 2.2);
        break;
      case 'rev':
        this.tone(180, 'triangle', { a: 0.02, d: 0.2 }, 0.06 * v, 0, 1.6);
        break;
      // ---- hits ----
      case 'clank':
        this.tone(220, 'square', { a: 0.001, d: 0.12 }, 0.12 * v, 0, 0.6);
        this.tone(331, 'square', { a: 0.001, d: 0.08 }, 0.07 * v, 0.004, 0.7);
        this.noise(0.06, 0.25 * v, 'highpass', 2500);
        break;
      case 'scrape':
        this.noise(0.12, 0.15 * v, 'bandpass', 3200, 4);
        break;
      case 'shove':
        this.tone(110, 'square', { a: 0.002, d: 0.1 }, 0.14 * v, 0, 0.5);
        this.noise(0.08, 0.25 * v, 'lowpass', 900);
        break;
      case 'hit':
        this.tone(160, 'square', { a: 0.001, d: 0.16 }, 0.18 * v, 0, 0.35);
        this.noise(0.16, 0.45 * v, 'lowpass', 2200, 1, 0, 0.3);
        this.tone(900, 'square', { a: 0.001, d: 0.05 }, 0.05 * v, 0.01, 0.5);
        break;
      case 'tear':
        // metal ripping, then a bright pop
        this.noise(0.25, 0.4 * v, 'bandpass', 2600, 6, 0, 0.4);
        this.tone(520, 'sawtooth', { a: 0.002, d: 0.2 }, 0.08 * v, 0, 0.3);
        this.tone(660, 'square', { a: 0.002, d: 0.12 }, 0.08 * v, 0.18, 1.5);
        this.tone(990, 'square', { a: 0.002, d: 0.14 }, 0.06 * v, 0.24, 1.2);
        break;
      case 'wreck':
        this.noise(0.5, 0.55 * v, 'lowpass', 1800, 0.8, 0, 0.15);
        this.tone(80, 'sawtooth', { a: 0.002, d: 0.45 }, 0.16 * v, 0, 0.4);
        this.noise(0.2, 0.25 * v, 'highpass', 3000, 1, 0.05);
        break;
      // ---- the Rammer ----
      case 'windup':
        this.tone(140, 'sawtooth', { a: 0.05, d: 0.7 }, 0.06 * v, 0, 2.6);
        break;
      case 'windup_near':
        this.tone(200, 'sawtooth', { a: 0.02, d: 0.4 }, 0.07 * v, 0, 2.4);
        break;
      case 'lock':
        this.tone(1320, 'square', { a: 0.001, d: 0.05 }, 0.05 * v);
        this.tone(1320, 'square', { a: 0.001, d: 0.05 }, 0.05 * v, 0.09);
        break;
      case 'charge':
        this.noise(0.45, 0.35 * v, 'lowpass', 700, 1, 0, 2);
        this.tone(70, 'sawtooth', { a: 0.01, d: 0.4 }, 0.1 * v, 0, 1.6);
        break;
      case 'slam':
        this.tone(55, 'sine', { a: 0.002, d: 0.3 }, 0.35 * v, 0, 0.5);
        this.noise(0.3, 0.5 * v, 'lowpass', 900, 0.8);
        break;
      case 'cancel':
        this.tone(400, 'square', { a: 0.002, d: 0.12 }, 0.06 * v, 0, 0.4);
        break;
      case 'bump':
        this.tone(120, 'square', { a: 0.002, d: 0.07 }, 0.1 * v, 0, 0.6);
        break;
      // ---- the player getting hit ----
      case 'hurt':
        this.noise(0.3, 0.5 * v, 'lowpass', 1400, 1, 0, 0.3);
        this.tone(330, 'square', { a: 0.002, d: 0.12 }, 0.1 * v, 0, 0.5);
        this.tone(220, 'square', { a: 0.002, d: 0.16 }, 0.1 * v, 0.12, 0.5);
        break;
      case 'shatter':
        this.noise(0.35, 0.45 * v, 'highpass', 2000, 1, 0, 0.5);
        for (let i = 0; i < 4; i++) this.tone(1200 + i * 330, 'triangle', { a: 0.001, d: 0.08 }, 0.05 * v, i * 0.04);
        break;
      case 'stun':
        this.tone(300, 'triangle', { a: 0.002, d: 0.3 }, 0.08 * v, 0, 0.5);
        this.tone(420, 'triangle', { a: 0.002, d: 0.3 }, 0.06 * v, 0.1, 0.5);
        break;
      case 'skid':
        this.noise(0.22, 0.12 * v, 'bandpass', 2400, 5, 0, 0.7);
        break;
      case 'slipstream':
        this.tone(880, 'triangle', { a: 0.005, d: 0.12 }, 0.035 * v);
        this.tone(1320, 'triangle', { a: 0.005, d: 0.16 }, 0.03 * v, 0.05);
        break;
      // ---- salvage ----
      case 'bolt_tick':
        this.noise(0.03, 0.3 * v, 'highpass', 3500);
        this.tone(1800, 'square', { a: 0.001, d: 0.025 }, 0.05 * v);
        break;
      case 'bolt_cancel':
        this.tone(500, 'square', { a: 0.002, d: 0.1 }, 0.05 * v, 0, 0.5);
        break;
      case 'drop':
        this.tone(300, 'square', { a: 0.002, d: 0.08 }, 0.06 * v, 0, 0.6);
        this.tone(250, 'square', { a: 0.002, d: 0.06 }, 0.05 * v, 0.07, 0.6);
        break;
      // ---- the encounter ----
      case 'gate':
        for (let i = 0; i < 3; i++) this.tone(740, 'square', { a: 0.002, d: 0.09 }, 0.06 * v, i * 0.16);
        break;
      case 'wave':
        this.tone(392, 'square', { a: 0.005, d: 0.12 }, 0.08 * v);
        this.tone(523, 'square', { a: 0.005, d: 0.18 }, 0.08 * v, 0.12);
        break;
      case 'cleared':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 'square', { a: 0.005, d: 0.25 }, 0.07 * v, i * 0.11));
        break;
      case 'scrapped':
        this.tone(330, 'sawtooth', { a: 0.01, d: 1.0 }, 0.1 * v, 0, 0.25);
        this.noise(0.6, 0.3 * v, 'lowpass', 800, 1, 0, 0.3);
        break;
    }
    this.pm = 1;
  }
}
