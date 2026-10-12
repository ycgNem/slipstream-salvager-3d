// The game palette: Resurrect 64 by Kerrie Lake (https://lospec.com/palette-list/resurrect-64).
// Every pixel of art comes from this list. Color meanings (speed, danger, salvage): STYLE.md.

export const PALETTE = [
  // 0-4 warm neutrals (plum-black up to taupe)
  '#2e222f', '#3e3546', '#625565', '#966c6c', '#ab947a',
  // 5-9 cool neutrals (mauve up to white)
  '#694f62', '#7f708a', '#9babb2', '#c7dcd0', '#ffffff',
  // 10-13 reds, 14-15 crimson
  '#6e2727', '#b33831', '#ea4f36', '#f57d4a', '#ae2334', '#e83b3b',
  // 16-18 orange to gold
  '#fb6b1d', '#f79617', '#f9c22b',
  // 19-23 rust to amber
  '#7a3045', '#9e4539', '#cd683d', '#e6904e', '#fbb954',
  // 24-28 olive to pale yellow
  '#4c3e24', '#676633', '#a2a947', '#d5e04b', '#fbff86',
  // 29-33 greens
  '#165a4c', '#239063', '#1ebc73', '#91db69', '#cddf6c',
  // 34-38 sage (muted green-grays)
  '#313638', '#374e4a', '#547e64', '#92a984', '#b2ba90',
  // 39-43 teals
  '#0b5e65', '#0b8a8f', '#0eaf9b', '#30e1b9', '#8ff8e2',
  // 44-48 blues
  '#323353', '#484a77', '#4d65b4', '#4d9be6', '#8fd3ff',
  // 49-53 purples
  '#45293f', '#6b3e75', '#905ea9', '#a884f3', '#eaaded',
  // 54-57 roses
  '#753c54', '#a24b6f', '#cf657f', '#ed8099',
  // 58-63 magenta to peach
  '#831c5d', '#c32454', '#f04f78', '#f68181', '#fca790', '#fdcbb0',
] as const;

export const PALETTE_RGB: readonly [number, number, number][] = PALETTE.map((h) => [
  parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16),
]);

/**
 * Named palette indices. The game's meanings come first (STYLE.md "Color language"): speed is
 * teal, danger is red, salvage is gold, and none of them is used for anything else.
 */
export const C = {
  // neutrals
  ink: 0, plum: 1, slate: 2, dusk: 3, taupe: 4, mauve: 5, lilac: 6, mist: 7, frost: 8, white: 9,
  // speed (teal) and the tiers
  speed0: 39, speed1: 40, speed2: 41, speed3: 42, speed4: 43, speedSky: 48,
  cruise: 32, cruiseHi: 33, crawl: 6, crawlHi: 7,
  // danger (red, magenta)
  danger0: 10, danger1: 11, danger2: 12, danger3: 15, dangerMag: 59, dangerPink: 60,
  // salvage (gold)
  gold0: 17, gold: 18, gold2: 23, gold3: 28,
  // player body: rust and orange
  rust0: 19, rust1: 20, rust2: 21, rust3: 22, orange: 16, peach: 63,
  // rammer body: blues, slate, purple
  steel0: 44, steel1: 45, steel2: 46, steel3: 47, violet: 50, sage: 35,
  // arena
  floor0: 1, floor1: 5, floor2: 2, olive0: 24, olive1: 25, moss: 34,
  // misc
  smoke: 2, steam: 8, green: 31,
} as const;

/** CSS color for a palette index, with alpha. */
export function rgba(c: number, a: number): string {
  const [r, g, b] = PALETTE_RGB[c];
  return `rgba(${r},${g},${b},${a})`;
}
