// Settings and the little that persists: volumes, screen shake, hints, mouse sensitivity and
// invert, the speed gauge (the HUD-hidden playtest switch), the palette filter, which hints you've
// seen, and your best results. localStorage under the ss3d: prefix (PLAN.md "Identity"), so the 2D
// game's ss:/salvager.* keys never collide on one origin. Always wrapped in try/catch.

export interface Settings {
  master: number;
  music: number;
  sfx: number;
  musicOn: boolean;
  shake: boolean;
  hints: boolean;
  /** mouse steer sensitivity, 0..1 (src/input3d/steer.ts sensFromSetting) */
  sens: number;
  invert: boolean;
  /** show the speed gauge (off = play the "can you tell your speed" test) */
  gauge: boolean;
  /** snap every frame to the Resurrect 64 palette */
  palette: boolean;
}

export interface Best {
  clears: number;
  bestTicks: number;
  bestHull: number;
}

export const PREFIX = 'ss3d:';
const KEY = PREFIX + 'settings';
const SEEN = PREFIX + 'hints';
const BEST = PREFIX + 'best';

export const DEFAULT_SETTINGS: Settings = { master: 0.8, music: 0.6, sfx: 0.8, musicOn: true, shake: true, hints: true, sens: 0.5, invert: false, gauge: true, palette: true };

function read<T>(key: string, fallback: T): T {
  try {
    const s = localStorage.getItem(key);
    return s ? { ...fallback, ...JSON.parse(s) } : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // private window or storage blocked: settings just don't persist
  }
}

export const loadSettings = () => read<Settings>(KEY, { ...DEFAULT_SETTINGS });
export const saveSettings = (s: Settings) => write(KEY, s);

export const loadSeenHints = () => read<Record<string, boolean>>(SEEN, {});
export const saveSeenHints = (h: Record<string, boolean>) => write(SEEN, h);

export const loadBest = () => read<Best>(BEST, { clears: 0, bestTicks: 0, bestHull: 0 });
export const saveBest = (b: Best) => write(BEST, b);
