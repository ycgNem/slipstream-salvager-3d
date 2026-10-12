// The game's music, written as text and turned into timed note events; src/engine/audio/music.ts
// synthesizes them, so there are no sound files. (Notation and player from Sprocket & Sprout.)
//
// Notation, one bar per `|`:
// - chords: "F | Dm | Bb C" (a bar's chords share it evenly) or "Am7:4 D7:2" (steps each)
// - notes:  "C5:2 F5:2 r:4 _:2" (pitch:steps; r rests; _ ties onto the note before)
// - comp:   "x:6 x:4 r:2 x:4" (the chord's voicing, struck with that rhythm)
// - arp:    "0:2 2:2 1:2" (chord tones by index, lowest first; past the top wraps an octave up)
// - bass:   "R:6 R:2 5:4 8:4" (root, 3rd, 5th, 7th or octave of the bar's chord, or its slash note)
// - hits:   "x...x...o..g...." (one character a step: x hit, o accent, g ghost, . nothing)
// - hold:   each chord's voicing held for as long as the chord lasts (pads)
// Pattern parts (comp, arp, bass, hits) repeat bar by bar; several bars between `|` take turns.

export type Inst =
  | 'bell' | 'marimba' | 'pluck' | 'flute' | 'whistle' | 'epiano' | 'bass' | 'subbass' | 'pad'
  | 'kick' | 'snare' | 'clap' | 'brush' | 'hat' | 'shaker' | 'tick' | 'tock';

export interface SongEvent {
  /** start, in beats from the top of the song */
  beat: number;
  inst: Inst;
  /** MIDI notes (several for a chord; empty for a drum) */
  notes: number[];
  /** length in beats */
  dur: number;
  /** 0..1 */
  vel: number;
}

export interface Song {
  id: string;
  title: string;
  bpm: number;
  beatsPerBar: number;
  bars: number;
  /** length in beats: the song loops on this */
  length: number;
  events: SongEvent[];
}

interface PartDef {
  inst: Inst;
  vel?: number;
  notes?: string;
  comp?: string;
  arp?: string;
  bass?: string;
  hits?: string;
  hold?: boolean;
  /** where comp, arp and hold voicings sit (MIDI): each chord tone takes its octave nearest this */
  center?: number;
  /** the lowest root a bass part plays (MIDI); the root sits in the octave above it */
  low?: number;
  /** octaves to move a written line by */
  octave?: number;
}

interface SectionDef {
  chords: string;
  parts: PartDef[];
}

interface SongDef {
  id: string;
  title: string;
  bpm: number;
  stepsPerBar: number;
  /** a step's length in beats (0.25 = sixteenth notes) */
  stepBeats: number;
  /** how far an off-beat step leans late, as a share of a step */
  swing: number;
  sections: Record<string, SectionDef>;
  order: string[];
}

// ---------------- the songs ----------------

const RING_ARP = '0:1 1:1 2:1 1:1 0:1 2:1 3:1 2:1 0:1 1:1 2:1 1:1 3:1 2:1 1:1 2:1';
const RING_BASS = 'R:2 R:2 8:2 R:2 R:2 5:2 R:2 8:2';
const RING_DRUMS: PartDef[] = [
  { inst: 'kick', hits: 'x...x...x...x...' },
  { inst: 'snare', hits: '....x.......x..g' },
  { inst: 'hat', hits: '..x...x...x...x.' },
];
const RING_A = 'A4:2 C5:2 E5:2 A5:4 G5:2 E5:4 | F5:4 E5:2 C5:2 A4:8 | E5:2 G5:2 C6:4 B5:2 G5:2 E5:4 | D5:4 B4:2 D5:2 G5:4 r:4';
const RING_B = 'C6:4 A5:4 E5:4 A5:4 | F5:6 G5:2 A5:8 | G5:4 E5:4 C5:4 E5:4 | D5:4 E5:2 G5:2 B5:8';

/** The slice's one loop: scrappy and kinetic, a plucky arp over a four-on-the-floor kit (A minor, 132 bpm). */
const RING: SongDef = {
  id: 'ring', title: 'Scrap Ring', bpm: 132, stepsPerBar: 16, stepBeats: 0.25, swing: 0,
  sections: {
    intro: {
      chords: 'Am | F | C | G',
      parts: [
        { inst: 'bass', bass: RING_BASS, low: 33 },
        { inst: 'kick', hits: 'x...x...x...x...' },
        { inst: 'hat', hits: '..x...x...x...x.', vel: 0.7 },
      ],
    },
    A: {
      chords: 'Am | F | C | G',
      parts: [
        { inst: 'bell', notes: RING_A, vel: 0.85 },
        { inst: 'pluck', arp: RING_ARP, center: 64, vel: 0.55 },
        { inst: 'bass', bass: RING_BASS, low: 33 },
        ...RING_DRUMS,
      ],
    },
    B: {
      chords: 'F | G | Am | E',
      parts: [
        { inst: 'whistle', notes: RING_B, vel: 0.8 },
        { inst: 'pluck', arp: RING_ARP, center: 64, vel: 0.6 },
        { inst: 'bass', bass: RING_BASS, low: 33 },
        { inst: 'pad', hold: true, center: 60, vel: 0.6 },
        ...RING_DRUMS,
        { inst: 'clap', hits: '....x.......x...' },
        { inst: 'shaker', hits: 'x.x.x.x.x.x.x.x.', vel: 0.6 },
      ],
    },
  },
  order: ['intro', 'A', 'A', 'B', 'A'],
};

const DEFS: SongDef[] = [RING];

// ---------------- reading the notation ----------------

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUALITY: Record<string, number[]> = {
  '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9], sus2: [0, 2, 7], sus4: [0, 5, 7], '7sus4': [0, 5, 7, 10], add9: [0, 4, 7, 14],
  '9': [0, 4, 7, 10, 14], maj9: [0, 4, 7, 11, 14], m9: [0, 3, 7, 10, 14], dim: [0, 3, 6], m7b5: [0, 3, 6, 10], aug: [0, 4, 8],
};

const pitchClass = (name: string, acc: string) => (PC[name] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0) + 12) % 12;

/** "Eb4" -> 63 */
export function midiOf(s: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
  if (!m) throw new Error(`not a note: ${s}`);
  return pitchClass(m[1], m[2]) + 12 * (Number(m[3]) + 1);
}

interface Chord { root: number; bass: number; tones: number[] }

/** "Am7" or "C/E" */
export function chordOf(s: string): Chord {
  const m = /^([A-G])([#b]?)([a-z0-9]*)(?:\/([A-G])([#b]?))?$/.exec(s);
  const q = m ? QUALITY[m[3]] : undefined;
  if (!m || !q) throw new Error(`not a chord: ${s}`);
  const root = pitchClass(m[1], m[2]);
  return { root, bass: m[4] ? pitchClass(m[4], m[5]) : root, tones: q };
}

/** a chord's tones, each in its octave nearest `center`, low to high */
export function voicing(c: Chord, center: number): number[] {
  return c.tones
    .map((iv) => {
      const pc = (c.root + iv) % 12;
      let n = center - ((((center - pc) % 12) + 12) % 12);
      if (center - n > 6) n += 12;
      return n;
    })
    .sort((a, b) => a - b);
}

/** split on bars; a token list per bar */
const bars = (s: string) => s.split('|').map((b) => b.trim().split(/\s+/).filter(Boolean));
const tok = (t: string): [string, number] => {
  const i = t.lastIndexOf(':');
  if (i < 1) throw new Error(`no length on "${t}"`);
  const n = Number(t.slice(i + 1));
  if (!Number.isInteger(n) || n < 1) throw new Error(`bad length on "${t}"`);
  return [t.slice(0, i), n];
};

/** Turn a song's notation into its timed events. Throws, naming the place, on anything malformed. */
export function compile(def: SongDef): Song {
  const events: SongEvent[] = [];
  const spb = def.stepsPerBar, sb = def.stepBeats;
  // a step's start in beats, the off-beat steps leaning late by the swing
  const at = (bar: number, step: number) => (bar * spb + step) * sb + (step % 2 === 1 ? def.swing * sb : 0);
  // on the beat a little louder than off it
  const accent = (step: number) => ((step * sb) % 1 === 0 ? 1 : 0.86);
  let bar0 = 0;
  for (const name of def.order) {
    const sec = def.sections[name];
    if (!sec) throw new Error(`${def.id}: no section ${name}`);
    const where = (s: string) => `${def.id} ${name}: ${s}`;
    // the chords, as a list of [chord, from step, to step] for each bar
    const chordBars = bars(sec.chords).map((toks, b) => {
      const parts = toks.map((t) => (t.includes(':') ? tok(t) : ([t, 0] as [string, number])));
      const given = parts.reduce((a, [, n]) => a + n, 0);
      const even = parts.every(([, n]) => n === 0);
      if (!even && given !== spb) throw new Error(where(`chord bar ${b + 1} lasts ${given} steps, not ${spb}`));
      if (even && spb % parts.length) throw new Error(where(`chord bar ${b + 1} can't share ${spb} steps ${parts.length} ways`));
      let s = 0;
      return parts.map(([c, n]) => {
        const len = even ? spb / parts.length : n;
        const span = { chord: chordOf(c), from: s, to: s + len };
        s += len;
        return span;
      });
    });
    const nBars = chordBars.length;
    const chordAt = (b: number, step: number) => chordBars[b].find((c) => step >= c.from && step < c.to)!.chord;
    for (const p of sec.parts) {
      const vel = p.vel ?? 1;
      const center = p.center ?? 60;
      if (p.hold) {
        chordBars.forEach((spans, b) => spans.forEach((c) => events.push({ beat: at(bar0 + b, c.from), inst: p.inst, notes: voicing(c.chord, center), dur: (c.to - c.from) * sb, vel })));
        continue;
      }
      if (p.hits) {
        const pats = p.hits.split('|').map((x) => x.trim());
        for (const [k, pat] of pats.entries()) if (pat.length !== spb) throw new Error(where(`${p.inst} hits bar ${k + 1} has ${pat.length} steps, not ${spb}`));
        for (let b = 0; b < nBars; b++) {
          const pat = pats[b % pats.length];
          for (let s = 0; s < spb; s++) {
            const ch = pat[s];
            if (ch === '.') continue;
            const v = ch === 'o' ? 1 : ch === 'g' ? 0.4 : ch === 'x' ? 0.75 : NaN;
            if (Number.isNaN(v)) throw new Error(where(`${p.inst} hits: "${ch}"`));
            events.push({ beat: at(bar0 + b, s), inst: p.inst, notes: [], dur: sb, vel: v * vel });
          }
        }
        continue;
      }
      const line = p.notes ?? p.comp ?? p.arp ?? p.bass;
      if (!line) throw new Error(where(`${p.inst} has nothing to play`));
      const lineBars = bars(line);
      if (p.notes && lineBars.length !== nBars) throw new Error(where(`${p.inst} has ${lineBars.length} bars of notes, the chords ${nBars}`));
      // the part's last note, which a tie lengthens
      const last: { e: SongEvent | null } = { e: null };
      for (let b = 0; b < nBars; b++) {
        const toks = lineBars[b % lineBars.length];
        let s = 0;
        for (const t of toks) {
          const [what, n] = tok(t);
          if (s + n > spb) throw new Error(where(`${p.inst} bar ${b + 1} runs past the bar at "${t}"`));
          const beat = at(bar0 + b, s), dur = n * sb, v = vel * accent(s);
          const play = (notes: number[]) => {
            last.e = { beat, inst: p.inst, notes, dur, vel: v };
            events.push(last.e);
          };
          if (what === 'r') {
            last.e = null;
          } else if (what === '_') {
            if (!last.e) throw new Error(where(`${p.inst} ties onto nothing`));
            last.e.dur += dur;
          } else if (p.notes) {
            play([midiOf(what) + 12 * (p.octave ?? 0)]);
          } else if (p.comp) {
            if (what !== 'x') throw new Error(where(`${p.inst} comp: "${what}"`));
            play(voicing(chordAt(b, s), center));
          } else if (p.arp) {
            const vc = voicing(chordAt(b, s), center);
            const i = Number(what);
            if (!Number.isInteger(i) || i < 0) throw new Error(where(`${p.inst} arp: "${what}"`));
            play([vc[i % vc.length] + 12 * Math.floor(i / vc.length)]);
          } else {
            const c = chordAt(b, s);
            const low = p.low ?? 36;
            const r = low + ((((c.bass - low) % 12) + 12) % 12);
            const above = (pc: number) => r + ((((pc - c.bass) % 12) + 12) % 12);
            const deg: Record<string, number> = {
              R: r, '8': r + 12, '3': above((c.root + c.tones[1]) % 12), '5': above((c.root + 7) % 12),
              '7': above((c.root + (c.tones[3] ?? 10)) % 12),
            };
            if (deg[what] === undefined) throw new Error(where(`${p.inst} bass: "${what}"`));
            play([deg[what]]);
          }
          s += n;
        }
        if (s !== spb) throw new Error(where(`${p.inst} bar ${b + 1} lasts ${s} steps, not ${spb}`));
      }
    }
    bar0 += nBars;
  }
  events.sort((a, b) => a.beat - b.beat);
  const beatsPerBar = spb * sb;
  return { id: def.id, title: def.title, bpm: def.bpm, beatsPerBar, bars: bar0, length: bar0 * beatsPerBar, events };
}

/** the playlist, in order */
export const SONGS: Song[] = DEFS.map(compile);
