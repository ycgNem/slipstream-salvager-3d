// Gamepad API polling (standard mapping). Read once per frame and merged into Input.

/** Radial deadzone: inside `dz` reads as zero, outside is rescaled so the edge of the deadzone is 0
 * and full tilt is 1. Keeps the direction exact (no square-ish snapping). */
export function applyDeadzone(x: number, y: number, dz = 0.2): { x: number; y: number } {
  const m = Math.hypot(x, y);
  if (m <= dz) return { x: 0, y: 0 };
  const k = Math.min(1, (m - dz) / (1 - dz)) / m;
  return { x: x * k, y: y * k };
}

/** Standard-mapping button indices. */
export const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;

export interface PadState {
  connected: boolean;
  /** left stick after the deadzone */
  x: number;
  y: number;
  /** buttons held (value > 0.5) by index */
  down: boolean[];
  /** the analog triggers, 0..1 (RT is thrust in first person) */
  rt: number;
  lt: number;
}

export function pollPad(): PadState {
  const none: PadState = { connected: false, x: 0, y: 0, down: [], rt: 0, lt: 0 };
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return none;
  for (const gp of navigator.getGamepads()) {
    if (!gp || !gp.connected) continue;
    const s = applyDeadzone(gp.axes[0] ?? 0, gp.axes[1] ?? 0);
    return { connected: true, x: s.x, y: s.y, down: gp.buttons.map((b) => b.pressed || b.value > 0.5), rt: gp.buttons[PAD.RT]?.value ?? 0, lt: gp.buttons[PAD.LT]?.value ?? 0 };
  }
  return none;
}
