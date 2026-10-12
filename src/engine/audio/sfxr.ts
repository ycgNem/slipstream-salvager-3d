// jsfxr sound bank: retro SFX stored as base58 strings, designed as parameter sets in
// scripts/sfx-design.mjs (rerun it to change them). Each sound is rendered once into the game's own
// AudioContext (so it obeys the SFX volume) and cached. Ids not in the bank are synthesized in
// Audio.sfx instead.
import { sfxr } from 'jsfxr';

/** id -> base58 definition (printed by scripts/sfx-design.mjs). */
export const SFXR_BANK: Record<string, string> = {
  click: '11111BFZZ5aCLQJUWY1sLk8atJVvi8pSfY5rPme3DDqYS74kRUV29bJ4TGhhHJSgjNSty5qGUBssTLQxG7Xt2uDvYTXFTtTjRntWtDMoAcafN5XWLSmNHefZ',
  grab: '11111mqnbgNnkh3jdLTgDr7gdram37BFveafNAcb3anwQi98AihinNbHi3rJojShUThtT2qebnNzdQnTsoew1fm9AVzY3Ke9nPH9tGrtppG16juNqtiHnFH',
  bolted: '11111BFZ5ub6DQHuJ9weHkMWA1wqtzwVyBdgVsvyRwHyWDHNmwWPhGkztsqZ3zJ4DmYCViq4MDBXKjtTS67pkuzXdB1Nc7SoVw8saDb63WtSBF39yyGkK7Uj',
  pickup: '57uBnWgpsMuJCJGHndFBtWtuLoFBXVGCb11Gfg6u3XiUFbTaFogD2sLVbzZJVeZe1TEfpqp5UxkWxPpMKce8fXNkDUK5pQAXM8mz6BQAwXFjM74iChUFwZ6sR',
};

/** Loudness per sound (base58 strings carry no volume). */
export const BANK_GAIN: Record<string, number> = {
  click: 0.45, grab: 0.8, bolted: 0.9, pickup: 0.6,
};

const cache = new Map<string, AudioBuffer>();

export function hasSfxr(id: string): boolean {
  return id in SFXR_BANK;
}

/** Render (once) and return the AudioBuffer for a bank sound, or null if it is not in the bank. */
export function sfxrBuffer(ctx: AudioContext, id: string): AudioBuffer | null {
  const def = SFXR_BANK[id];
  if (!def) return null;
  let buf = cache.get(def);
  if (!buf) {
    buf = sfxr.toWebAudio(def, ctx).buffer!;
    cache.set(def, buf);
  }
  return buf;
}

/** Play a bank sound through `bus`. `vol` scales loudness; `pitch` is a playback-rate multiplier. */
export function playSfxr(ctx: AudioContext, bus: AudioNode, id: string, vol = 1, pitch = 1): boolean {
  const buf = sfxrBuffer(ctx, id);
  if (!buf) return false;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = pitch;
  const g = ctx.createGain();
  g.gain.value = vol * (BANK_GAIN[id] ?? 1);
  src.connect(g);
  g.connect(bus);
  src.start();
  return true;
}
