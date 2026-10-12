// The 8 facing directions. Index 0 is east and they go clockwise on screen (y points down), so a
// direction's angle is index * 45°. Pure: used by the sim, the renderer and the art generators.

export const DIRS = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'] as const;
export type DirName = (typeof DIRS)[number];

export const TAU = Math.PI * 2;

/** Angle (radians, screen space) of direction index d. */
export function dirAngle(d: number): number {
  return (((d % 8) + 8) % 8) * (Math.PI / 4);
}

/** Wrap an angle into (-PI, PI]. */
export function wrapAngle(a: number): number {
  a = a % TAU;
  if (a <= -Math.PI) a += TAU;
  else if (a > Math.PI) a -= TAU;
  return a;
}

/** The nearest of the 8 directions to an angle. */
export function dirOf(angle: number): number {
  return ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
}

/**
 * The nearest direction with hysteresis: stay on `current` until the angle is more than
 * 22.5° + `hyst` away from it, so a heading on a boundary doesn't flicker between two frames.
 */
export function dirHyst(angle: number, current: number, hystDeg = 6): number {
  const off = Math.abs(wrapAngle(angle - dirAngle(current)));
  return off <= Math.PI / 8 + (hystDeg * Math.PI) / 180 ? current : dirOf(angle);
}
