// The Ring: one 640x360 screen, a 16 px wall all round, four pillars and four gates
// (PLAN.md 4.1). World coordinates are screen pixels; the sim is flat top-down, the 3/4 look is
// only in the art.

export interface Rect { x: number; y: number; w: number; h: number }

export interface Gate {
  id: 'n' | 's' | 'w' | 'e';
  /** the opening in the wall */
  rect: Rect;
  /** h: in the top/bottom wall, v: in a side wall */
  orient: 'h' | 'v';
  /** where an entering Rammer appears, and the way it walks in */
  spawn: { x: number; y: number };
  dir: { x: number; y: number };
}

export interface ArenaDef {
  w: number;
  h: number;
  wall: number;
  /** solid rectangles: the four walls, then the pillars */
  solids: Rect[];
  pillars: Rect[];
  gates: Gate[];
  playerStart: { x: number; y: number; heading: number };
}

const W = 640, H = 360, T = 16;
const pillar = (cx: number, cy: number): Rect => ({ x: cx - 16, y: cy - 16, w: 32, h: 32 });
const PILLARS = [pillar(192, 120), pillar(448, 120), pillar(192, 240), pillar(448, 240)];

export const RING: ArenaDef = {
  w: W,
  h: H,
  wall: T,
  solids: [
    { x: 0, y: 0, w: W, h: T },
    { x: 0, y: H - T, w: W, h: T },
    { x: 0, y: 0, w: T, h: H },
    { x: W - T, y: 0, w: T, h: H },
    ...PILLARS,
  ],
  pillars: PILLARS,
  gates: [
    { id: 'n', rect: { x: 304, y: 0, w: 32, h: 16 }, orient: 'h', spawn: { x: 320, y: 30 }, dir: { x: 0, y: 1 } },
    { id: 's', rect: { x: 304, y: H - T, w: 32, h: 16 }, orient: 'h', spawn: { x: 320, y: H - 30 }, dir: { x: 0, y: -1 } },
    { id: 'w', rect: { x: 0, y: 164, w: 16, h: 32 }, orient: 'v', spawn: { x: 30, y: 180 }, dir: { x: 1, y: 0 } },
    { id: 'e', rect: { x: W - T, y: 164, w: 16, h: 32 }, orient: 'v', spawn: { x: W - 30, y: 180 }, dir: { x: -1, y: 0 } },
  ],
  playerStart: { x: 320, y: 180, heading: 0 },
};
