// Sim space -> world space (THREEJS-NOTES rule 1 and PLAN.md "Scale"). The sim is flat top-down in
// pixels with y pointing down the screen; the world is metres with Y up. Sim (x, y) maps to world
// (x, 0, y) scaled, which keeps the 2D game's handedness: a heading that turns clockwise on the 2D
// screen turns right here. Models face +X; the camera looks down its own -Z.
import * as THREE from 'three';
import { PALETTE } from '../data/palette';

/** metres per sim pixel */
export const M = 0.05;
/** the Scrapper's eye height (m): above its head plate, not in it (DECISIONS #27) */
export const EYE = 0.68;
/** how far the eye sits behind the body's centre (m), inside its 0.4 m radius so it never pokes
 *  through a wall the body is touching */
export const EYE_BACK = 0.22;

export const wx = (x: number) => x * M;
export const wz = (y: number) => y * M;

/** rotation.y for a model facing +X, given a sim heading */
export const modelYaw = (heading: number) => -heading;
/** rotation.y for a camera (looks down -Z), given a sim heading */
export const cameraYaw = (heading: number) => -heading - Math.PI / 2;

/** A THREE.Color for a palette index (sRGB hex, converted to the working space). */
const cache = new Map<number, THREE.Color>();
export function pal(i: number): THREE.Color {
  let c = cache.get(i);
  if (!c) {
    c = new THREE.Color(PALETTE[i]);
    cache.set(i, c);
  }
  return c.clone();
}

/** Interpolate an angle the short way round. */
export function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** Ease a value toward a target with a time constant (s), frame-rate independent. */
export const ease = (v: number, target: number, dt: number, tau: number) => target + (v - target) * Math.exp(-dt / Math.max(1e-4, tau));
