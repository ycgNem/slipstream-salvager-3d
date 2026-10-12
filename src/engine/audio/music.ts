// The music player: synthesizes the songs (src/engine/audio/songs.ts) note by note with
// Web Audio, plays them in turn and skips to the next on request. It runs on any BaseAudioContext,
// so a song can also be rendered offline to check its levels.
import { SONGS, type Inst, type Song } from './songs';

/** each song plays this many times through before the next one */
export const REPEATS = 2;
/** the quiet between two songs (s) */
const GAP = 2;
/** how far ahead notes are scheduled (s) */
const AHEAD = 0.4;

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** an instrument's place in the mix: its level, its pan, and how much reverb and echo it gets */
interface Strip { level: number; pan: number; rev: number; echo: number }
const STRIP: Record<Inst, Strip> = {
  bell: { level: 0.2, pan: 0.25, rev: 0.35, echo: 0.22 },
  marimba: { level: 0.22, pan: -0.3, rev: 0.2, echo: 0.08 },
  pluck: { level: 0.17, pan: -0.15, rev: 0.18, echo: 0.06 },
  flute: { level: 0.16, pan: 0.1, rev: 0.3, echo: 0.15 },
  whistle: { level: 0.13, pan: 0, rev: 0.35, echo: 0.22 },
  epiano: { level: 0.053, pan: 0, rev: 0.25, echo: 0.05 },
  bass: { level: 0.16, pan: 0, rev: 0.02, echo: 0 },
  subbass: { level: 0.11, pan: 0, rev: 0, echo: 0 },
  pad: { level: 0.033, pan: 0, rev: 0.45, echo: 0 },
  kick: { level: 0.3, pan: 0, rev: 0.03, echo: 0 },
  snare: { level: 0.2, pan: 0.05, rev: 0.15, echo: 0 },
  clap: { level: 0.34, pan: 0.05, rev: 0.2, echo: 0 },
  brush: { level: 0.09, pan: 0.05, rev: 0.2, echo: 0 },
  hat: { level: 0.12, pan: 0.3, rev: 0.06, echo: 0 },
  shaker: { level: 0.07, pan: -0.25, rev: 0.08, echo: 0 },
  tick: { level: 0.12, pan: 0.35, rev: 0.1, echo: 0.05 },
  tock: { level: 0.09, pan: -0.35, rev: 0.1, echo: 0.05 },
};

/** the timbres a single oscillator plays: each harmonic's level, the fundamental first */
const TIMBRE = {
  /** a music box tine: its tone and its octave */
  tine: [1, 0.22],
  /** plucked strings: bright, falling away as a saw's harmonics do */
  string: [1, 0.5, 0.33, 0.22, 0.14, 0.09, 0.05, 0.03],
  /** a round bass */
  bass: [1, 0.38, 0.14, 0.05],
  /** a warm pad */
  warm: [1, 0.45, 0.22, 0.11, 0.05],
  flute: [1, 0.12, 0.04],
  whistle: [1, 0.06],
  sub: [1, 0.12],
};

/** one playthrough's sends: fading these three fades everything it scheduled */
interface Bus { dry: GainNode; wet: GainNode; echo: GainNode; strips: Map<Inst, GainNode> }

export class Music {
  readonly ctx: BaseAudioContext;
  private mix: GainNode;
  private lp: BiquadFilterNode;
  private atmos: GainNode;
  private reverb: ConvolverNode;
  private delay: DelayNode;
  private noise: AudioBuffer;
  private bus: Bus | null = null;
  /** the song playing, by its place in SONGS */
  index = 0;
  private song: Song = SONGS[0];
  /** when the song's beat 0 falls (context time) */
  private t0 = 0;
  /** the next event to schedule */
  private i = 0;
  private pass = 0;
  /** told the title of each song as it starts */
  onSong?: (title: string, index: number) => void;

  constructor(ctx: BaseAudioContext, out: AudioNode) {
    this.ctx = ctx;
    // everything meets in the mix, then the room: a lowpass and a level, for underground and indoors
    this.mix = ctx.createGain();
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 20000;
    this.atmos = ctx.createGain();
    this.mix.connect(this.lp);
    this.lp.connect(this.atmos);
    this.atmos.connect(out);
    // a soft hall
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = hall(ctx);
    const ret = ctx.createGain();
    ret.gain.value = 0.6;
    this.reverb.connect(ret);
    ret.connect(this.mix);
    // an echo a dotted eighth behind, darker each time round
    this.delay = ctx.createDelay(2);
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const dl = ctx.createBiquadFilter();
    dl.type = 'lowpass';
    dl.frequency.value = 2400;
    this.delay.connect(dl);
    dl.connect(fb);
    fb.connect(this.delay);
    dl.connect(this.mix);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
  }

  get title(): string {
    return this.song.title;
  }

  /** Start song `index` at context time `at`. */
  start(index: number, at: number) {
    this.index = ((index % SONGS.length) + SONGS.length) % SONGS.length;
    this.song = SONGS[this.index];
    this.t0 = at;
    this.i = 0;
    this.pass = 0;
    this.bus = this.newBus(at);
    this.delay.delayTime.setValueAtTime(0.75 * (60 / this.song.bpm), at);
    this.onSong?.(this.song.title, this.index);
  }

  /** Fade the song out and start the next one a moment later. */
  next(now: number) {
    this.fade(now);
    this.start(this.index + 1, now + 0.5);
  }

  /** Underground or indoors the music is darker and quieter (cutoff in Hz, level 0..1). */
  setRoom(cutoff: number, level: number, now: number) {
    this.lp.frequency.setTargetAtTime(cutoff, now, 0.6);
    this.atmos.gain.setTargetAtTime(level, now, 0.6);
  }

  /** Schedule what falls within the next moment. A tab that slept skips what it missed. */
  update(now: number) {
    if (!this.bus) return;
    const spb = 60 / this.song.bpm;
    for (let guard = 0; guard < 4000; guard++) {
      const evs = this.song.events;
      if (this.i >= evs.length) {
        const end = this.t0 + this.song.length * spb;
        if (end > now + AHEAD) return;
        if (++this.pass < REPEATS) {
          this.t0 = end;
          this.i = 0;
        } else {
          this.fade(Math.max(now, end));
          this.start(this.index + 1, Math.max(end + GAP, now + 0.1));
          return;
        }
        continue;
      }
      const e = evs[this.i];
      const t = this.t0 + e.beat * spb;
      if (t > now + AHEAD) return;
      this.i++;
      if (t < now - 0.05) continue;
      const out = this.strip(e.inst);
      const vel = e.vel * (0.94 + Math.random() * 0.12);
      const dur = e.dur * spb;
      if (e.inst === 'pad') this.pad(t, e.notes, dur, vel, out);
      else if (e.notes.length) for (const m of e.notes) this.voice(e.inst, t, m, dur, vel, out);
      else this.drum(e.inst, t, vel, out);
    }
  }

  // ---------------- the mix ----------------
  private newBus(at: number): Bus {
    const ctx = this.ctx;
    const g = () => {
      const n = ctx.createGain();
      n.gain.setValueAtTime(0, at);
      n.gain.linearRampToValueAtTime(1, at + 0.05);
      return n;
    };
    const bus: Bus = { dry: g(), wet: g(), echo: g(), strips: new Map() };
    bus.dry.connect(this.mix);
    bus.wet.connect(this.reverb);
    bus.echo.connect(this.delay);
    return bus;
  }

  private fade(now: number) {
    const b = this.bus;
    if (!b) return;
    for (const n of [b.dry, b.wet, b.echo]) n.gain.setTargetAtTime(0, now, 0.12);
    // let the tails die, then let it go (a live context only: an offline render ends by itself)
    if (typeof AudioContext !== 'undefined' && this.ctx instanceof AudioContext) {
      setTimeout(() => {
        for (const n of [b.dry, b.wet, b.echo]) n.disconnect();
      }, 4000 + Math.max(0, now - this.ctx.currentTime) * 1000);
    }
    this.bus = null;
  }

  /** an instrument's input on the current bus: its level, pan and sends */
  private strip(inst: Inst): GainNode {
    const b = this.bus!;
    let s = b.strips.get(inst);
    if (s) return s;
    const ctx = this.ctx, st = STRIP[inst];
    s = ctx.createGain();
    s.gain.value = st.level;
    const pan = ctx.createStereoPanner();
    pan.pan.value = st.pan;
    s.connect(pan);
    pan.connect(b.dry);
    if (st.rev) {
      const r = ctx.createGain();
      r.gain.value = st.rev;
      pan.connect(r);
      r.connect(b.wet);
    }
    if (st.echo) {
      const e = ctx.createGain();
      e.gain.value = st.echo;
      pan.connect(e);
      e.connect(b.echo);
    }
    b.strips.set(inst, s);
    return s;
  }

  // ---------------- the instruments ----------------
  private waves = new Map<keyof typeof TIMBRE, PeriodicWave>();
  /** a timbre as one oscillator's waveform: cheaper than stacking oscillators or filtering them */
  private wave(name: keyof typeof TIMBRE): PeriodicWave {
    let w = this.waves.get(name);
    if (!w) {
      const h = TIMBRE[name];
      const real = new Float32Array(h.length + 1), imag = new Float32Array(h.length + 1);
      h.forEach((amp, k) => (imag[k + 1] = amp));
      w = this.ctx.createPeriodicWave(real, imag);
      this.waves.set(name, w);
    }
    return w;
  }

  private osc(type: OscillatorType | PeriodicWave, freq: number, t: number, end: number, out: AudioNode): OscillatorNode {
    const o = this.ctx.createOscillator();
    if (typeof type === 'string') o.type = type as OscillatorType;
    else o.setPeriodicWave(type);
    o.frequency.setValueAtTime(freq, t);
    o.connect(out);
    o.start(t);
    o.stop(end);
    return o;
  }

  private gain(out: AudioNode, v = 0): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = v;
    g.connect(out);
    return g;
  }

  /** a struck partial: up in a few ms, then rings down with time constant `tc` */
  private partial(type: OscillatorType | PeriodicWave, freq: number, amp: number, tc: number, t: number, out: AudioNode) {
    const g = this.gain(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.003);
    g.gain.setTargetAtTime(0.0001, t + 0.003, tc);
    return this.osc(type, freq, t, t + 0.003 + tc * 5, g);
  }

  /** a held note: up over `a`, held at `s` of the peak, then away over `r` after `dur` */
  private held(g: GainNode, t: number, dur: number, vel: number, a: number, s: number, r: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + a);
    g.gain.setTargetAtTime(vel * s, t + a, 0.15);
    g.gain.setTargetAtTime(0.0001, t + Math.max(a, dur), r);
    return t + Math.max(a, dur) + r * 6;
  }

  private vibrato(o: OscillatorNode, t: number, freq: number, rate: number, depth: number, delay: number, end: number) {
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = rate;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(freq * depth, t + delay);
    lfo.connect(g);
    g.connect(o.frequency);
    lfo.start(t);
    lfo.stop(end);
  }

  private voice(inst: Inst, t: number, m: number, dur: number, vel: number, out: AudioNode) {
    const ctx = this.ctx, f = mtof(m);
    switch (inst) {
      case 'bell': {
        // a music box: the tine and its octave, and a bright ping that's gone at once
        this.partial(this.wave('tine'), f, vel, 0.5, t, out);
        this.partial('sine', f * 5.4, vel * 0.07, 0.04, t, out);
        break;
      }
      case 'marimba': {
        this.partial('sine', f, vel, 0.2, t, out);
        this.partial('sine', f * 4, vel * 0.28, 0.025, t, out);
        break;
      }
      case 'pluck': {
        this.partial(this.wave('string'), f, vel, Math.min(0.3, 0.12 + dur * 0.2), t, out);
        break;
      }
      case 'flute': {
        const g = this.gain(out);
        const end = this.held(g, t, dur, vel, 0.05, 0.85, 0.07);
        this.vibrato(this.osc(this.wave('flute'), f, t, end, g), t, f, 5.2, 0.006, 0.3, end);
        // breath at the start of the note
        const n = ctx.createBufferSource();
        n.buffer = this.noise;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = Math.min(8000, f * 2);
        bp.Q.value = 1.2;
        const ng = this.gain(out);
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.linearRampToValueAtTime(vel * 0.14, t + 0.02);
        ng.gain.setTargetAtTime(0.0001, t + 0.02, 0.05);
        n.connect(bp);
        bp.connect(ng);
        n.start(t, Math.random() * 0.5);
        n.stop(t + 0.3);
        break;
      }
      case 'whistle': {
        const g = this.gain(out);
        const end = this.held(g, t, dur, vel, 0.03, 0.9, 0.08);
        const o = this.osc(this.wave('whistle'), f * 0.985, t, end, g);
        o.frequency.linearRampToValueAtTime(f, t + 0.05);
        this.vibrato(o, t, f, 5.5, 0.005, 0.25, end);
        break;
      }
      case 'epiano': {
        // FM, as a tine piano: the bright bark of the hammer fades into a round tone
        const g = this.gain(out);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vel, t + 0.003);
        g.gain.setTargetAtTime(vel * 0.3, t + 0.003, 0.6);
        g.gain.setTargetAtTime(0.0001, t + dur, 0.12);
        const end = t + dur + 0.8;
        const car = this.osc('sine', f, t, end, g);
        const idx = ctx.createGain();
        idx.gain.setValueAtTime(f * 1.4, t);
        idx.gain.setTargetAtTime(f * 0.25, t, 0.25);
        const mod = ctx.createOscillator();
        mod.frequency.value = f;
        mod.connect(idx);
        idx.connect(car.frequency);
        mod.start(t);
        mod.stop(end);
        break;
      }
      case 'bass': {
        const g = this.gain(out);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vel, t + 0.005);
        g.gain.setTargetAtTime(vel * 0.55, t + 0.005, 0.12);
        g.gain.setTargetAtTime(0.0001, t + dur * 0.92, 0.04);
        this.osc(this.wave('bass'), f, t, t + dur + 0.3, g);
        break;
      }
      case 'subbass': {
        const g = this.gain(out);
        const end = this.held(g, t, dur * 0.95, vel, 0.01, 0.9, 0.06);
        this.osc(this.wave('sub'), f, t, end, g);
        break;
      }
    }
  }

  /** a held chord: one warm voice a note, each a hair off the last */
  private pad(t: number, notes: number[], dur: number, vel: number, out: AudioNode) {
    const g = this.gain(out);
    const end = this.held(g, t, dur, vel, Math.min(0.6, dur * 0.4), 1, 0.35);
    notes.forEach((m, k) => (this.osc(this.wave('warm'), mtof(m), t, end, g).detune.value = k % 2 ? 6 : -6));
  }

  private noiseHit(t: number, dur: number, out: AudioNode, type: BiquadFilterType, freq: number, q = 0.7): GainNode {
    const ctx = this.ctx;
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.gain(out);
    n.connect(f);
    f.connect(g);
    n.start(t, Math.random() * 0.5);
    n.stop(t + dur);
    return g;
  }

  private drum(inst: Inst, t: number, vel: number, out: AudioNode) {
    switch (inst) {
      case 'kick': {
        const g = this.gain(out);
        g.gain.setValueAtTime(vel, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
        const o = this.osc('sine', 150, t, t + 0.35, g);
        o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
        const c = this.noiseHit(t, 0.02, out, 'lowpass', 2500);
        c.gain.setValueAtTime(vel * 0.25, t);
        c.gain.exponentialRampToValueAtTime(0.001, t + 0.012);
        break;
      }
      case 'snare': {
        const n = this.noiseHit(t, 0.22, out, 'bandpass', 1800);
        n.gain.setValueAtTime(vel, t);
        n.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        const g = this.gain(out);
        g.gain.setValueAtTime(vel * 0.5, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        this.osc('triangle', 185, t, t + 0.1, g);
        break;
      }
      case 'clap': {
        const n = this.noiseHit(t, 0.3, out, 'bandpass', 1300, 1.2);
        n.gain.setValueAtTime(vel, t);
        n.gain.setTargetAtTime(0.0001, t, 0.004);
        n.gain.setValueAtTime(vel * 0.8, t + 0.012);
        n.gain.setTargetAtTime(0.0001, t + 0.012, 0.004);
        n.gain.setValueAtTime(vel * 0.9, t + 0.024);
        n.gain.setTargetAtTime(0.0001, t + 0.024, 0.045);
        break;
      }
      case 'brush': {
        const n = this.noiseHit(t, 0.35, out, 'highpass', 2200);
        n.gain.setValueAtTime(0.0001, t);
        n.gain.linearRampToValueAtTime(vel, t + 0.012);
        n.gain.setTargetAtTime(0.0001, t + 0.012, 0.07);
        break;
      }
      case 'hat': {
        const n = this.noiseHit(t, 0.08, out, 'highpass', 7000);
        n.gain.setValueAtTime(vel, t);
        n.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
        break;
      }
      case 'shaker': {
        const n = this.noiseHit(t, 0.15, out, 'bandpass', 5500, 0.9);
        n.gain.setValueAtTime(0.0001, t);
        n.gain.linearRampToValueAtTime(vel, t + 0.012);
        n.gain.setTargetAtTime(0.0001, t + 0.012, 0.025);
        break;
      }
      case 'tick':
      case 'tock': {
        // the clockwork: a high tick, a lower wooden tock
        const g = this.gain(out);
        g.gain.setValueAtTime(vel, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + (inst === 'tick' ? 0.03 : 0.05));
        this.osc('sine', inst === 'tick' ? 1700 : 1050, t, t + 0.06, g);
        if (inst === 'tock') {
          const w = this.gain(out);
          w.gain.setValueAtTime(vel * 0.5, t);
          w.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
          this.osc('triangle', 525, t, t + 0.05, w);
        } else {
          const c = this.noiseHit(t, 0.01, out, 'highpass', 4500);
          c.gain.setValueAtTime(vel * 0.5, t);
          c.gain.exponentialRampToValueAtTime(0.001, t + 0.006);
        }
        break;
      }
    }
  }
}

/** a soft hall's impulse: two channels of darkened noise dying away */
function hall(ctx: BaseAudioContext, secs = 1.8): AudioBuffer {
  const n = Math.floor(ctx.sampleRate * secs);
  const b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let lp = 0;
    for (let k = 0; k < n; k++) {
      lp += (Math.random() * 2 - 1 - lp) * 0.35;
      d[k] = lp * Math.pow(1 - k / n, 3);
    }
  }
  return b;
}
