// Where a part sits on a body, per facing direction (STYLE.md "Mount points"). The renderer draws
// the part's 16x16 overlay (`part:<id>:<dir>`, anchor 8,8) at the body's anchor plus this offset,
// behind the body or in front of it. Pure.
import { dirAngle } from './dirs';

/** The Scrapper's three mounts, each tied to one verb (PLAN.md 8.2). */
export type MountSlot = 'rear' | 'sides' | 'front';
export const MOUNTS: MountSlot[] = ['rear', 'sides', 'front'];

export interface MountPos {
  /** offset from the body's anchor, whole pixels */
  dx: number;
  dy: number;
  /** draw the part before the body (it's on the far side) */
  behind: boolean;
}

/**
 * The rear mount for a body facing direction d, `dist` px behind its center. The 3/4 view squashes
 * depth: a mount behind a body facing south sits higher on screen and is hidden by the body.
 */
export function rearMount(d: number, dist: number, lift = 3): MountPos {
  const a = dirAngle(d);
  const dx = Math.round(-Math.cos(a) * dist);
  const dy = Math.round(-Math.sin(a) * dist * 0.6) - lift;
  return { dx, dy, behind: Math.sin(a) > 0.1 };
}

/**
 * The front mount (the plow, the jaws) for a body facing direction d, `dist` px ahead of its
 * center: drawn behind the body when it faces away from the viewer (north-ish).
 */
export function frontMount(d: number, dist: number, lift = 3): MountPos {
  const a = dirAngle(d);
  const dx = Math.round(Math.cos(a) * dist);
  const dy = Math.round(Math.sin(a) * dist * 0.6) - lift;
  return { dx, dy, behind: Math.sin(a) < -0.1 };
}

/** Rear-mount distance per body (px from the anchor). */
export const MOUNT_DIST = { scrapper: 7, rammer: 10, snapper: 7 } as const;
/** Front-mount distance per body (px from the anchor). */
export const FRONT_DIST = { scrapper: 9, rammer: 12, snapper: 9 } as const;

/**
 * Where the claw's tip is, relative to the Scrapper's anchor, for a heading angle (continuous, not
 * the 8-way facing). The art draws the claw there for each direction; the renderer puts the tier
 * glow and the heading tick there.
 */
export function clawTip(angle: number, reach = 11): { dx: number; dy: number } {
  return { dx: Math.round(Math.cos(angle) * reach), dy: Math.round(Math.sin(angle) * reach * 0.6) - 3 };
}
