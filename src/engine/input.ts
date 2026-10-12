// Keyboard, mouse and gamepad input with rebindable keys. Edges are latched per frame. First
// person adds pointer-lock mouse deltas (steer demand), look-back and the HUD switch.
import { pollPad, PAD, type PadState } from './gamepad';

export const ACTIONS = ['up', 'down', 'left', 'right', 'rip', 'bolt', 'look', 'hud', 'pause', 'confirm', 'back', 'music', 'debug'] as const;
export type Action = (typeof ACTIONS)[number];

/** The tuning panel exists only in dev builds or with ?debug in the address. */
export const DEBUG_KEYS = !!import.meta.env?.DEV || (typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug'));

export const ACTION_LABELS: Record<Action, string> = {
  up: 'Thrust', down: 'Brake', left: 'Steer left', right: 'Steer right', rip: 'Rip',
  bolt: 'Bolt on', look: 'Look back', hud: 'Hide HUD', pause: 'Pause', confirm: 'Confirm', back: 'Back', music: 'Music on/off', debug: 'Tuning panel',
};

export const DEFAULT_BINDS: Record<Action, string[]> = {
  up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  rip: ['Space', 'KeyJ'], bolt: ['KeyE', 'KeyK'], look: ['KeyQ'], hud: ['KeyH'], pause: ['Escape', 'KeyP'], confirm: ['Enter', 'NumpadEnter', 'Space'],
  back: ['Escape', 'Backspace'], music: ['KeyN'], debug: ['Backquote', 'F1'],
};

/** Gamepad buttons per action (standard mapping). */
const PAD_BINDS: Partial<Record<Action, number[]>> = {
  up: [PAD.UP], down: [PAD.DOWN], left: [PAD.LEFT], right: [PAD.RIGHT],
  rip: [PAD.A, PAD.RB], bolt: [PAD.Y, PAD.X], look: [PAD.LB], hud: [PAD.BACK], pause: [PAD.START], confirm: [PAD.A], back: [PAD.B],
};

export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map: Record<string, string> = {
    ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Escape: 'Esc', Backquote: '`',
    Space: 'Space', Enter: 'Enter', Backspace: 'Bksp', NumpadEnter: 'Enter',
  };
  return map[code] ?? code;
}

export class Input {
  down = new Set<string>();
  pressed = new Set<string>();
  released = new Set<string>();
  binds: Record<Action, string[]> = structuredClone(DEFAULT_BINDS);
  mouse = { x: 0, y: 0, down: [false, false, false], pressed: [false, false, false], wheel: 0, moved: false };
  /** mouse movement while the pointer is locked (px), accumulated until the sim takes it */
  look = { dx: 0, locked: false };
  pad: PadState = { connected: false, x: 0, y: 0, down: [], rt: 0, lt: 0 };
  private padPrev: boolean[] = [];
  /** true when the last thing touched was the gamepad (prompts show pad buttons) */
  usingPad = false;
  /** called on the first key, click or button (audio needs a user gesture) */
  onGesture: (() => void) | null = null;

  attach(el: HTMLElement) {
    const gesture = () => this.onGesture?.();
    window.addEventListener('keydown', (e) => {
      gesture();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
      this.usingPad = false;
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Backquote' || e.code === 'F1' || e.code === 'KeyQ') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.released.add(e.code);
    });
    window.addEventListener('blur', () => {
      this.down.clear();
      this.mouse.down = [false, false, false];
    });
    el.addEventListener('mousemove', (e) => {
      if (this.look.locked) {
        this.look.dx += e.movementX;
        return;
      }
      this.mouse.x = e.offsetX;
      this.mouse.y = e.offsetY;
      this.mouse.moved = true;
    });
    document.addEventListener('pointerlockchange', () => {
      this.look.locked = document.pointerLockElement === el;
      this.look.dx = 0;
    });
    el.addEventListener('mousedown', (e) => {
      gesture();
      if (e.button > 2) return;
      if (!this.look.locked) {
        this.mouse.x = e.offsetX;
        this.mouse.y = e.offsetY;
        this.mouse.moved = true;
      }
      this.mouse.down[e.button] = true;
      this.mouse.pressed[e.button] = true;
      this.usingPad = false;
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button <= 2) this.mouse.down[e.button] = false;
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('wheel', (e) => {
      this.mouse.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
  }

  /** Read the gamepad; call once at the start of each frame. */
  pollPad() {
    this.pad = pollPad();
    const now = this.pad.down;
    for (let i = 0; i < now.length; i++) if (now[i] && !this.padPrev[i]) { this.usingPad = true; this.onGesture?.(); }
    if (Math.hypot(this.pad.x, this.pad.y) > 0.5) this.usingPad = true;
  }

  private padHeld(a: Action): boolean {
    for (const b of PAD_BINDS[a] ?? []) if (this.pad.down[b]) return true;
    return false;
  }
  private padEdge(a: Action): boolean {
    for (const b of PAD_BINDS[a] ?? []) if (this.pad.down[b] && !this.padPrev[b]) return true;
    return false;
  }

  isDown(a: Action): boolean {
    for (const k of this.binds[a]) if (this.down.has(k)) return true;
    return this.padHeld(a);
  }

  wasPressed(a: Action): boolean {
    for (const k of this.binds[a]) if (this.pressed.has(k)) return true;
    return this.padEdge(a);
  }

  /** Take the mouse movement since the last call (px). */
  takeLook(): number {
    const d = this.look.dx;
    this.look.dx = 0;
    return d;
  }

  /** Consume an action's edge so lower layers don't also react. */
  consume(a: Action) {
    for (const k of this.binds[a]) this.pressed.delete(k);
    for (const b of PAD_BINDS[a] ?? []) this.padPrev[b] = true;
  }

  /** The steering vector, |v| <= 1: the analog stick if it's tilted, otherwise keys and d-pad. */
  steer(): { x: number; y: number } {
    if (Math.hypot(this.pad.x, this.pad.y) > 0) return { x: this.pad.x, y: this.pad.y };
    const x = (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
    const y = (this.isDown('down') ? 1 : 0) - (this.isDown('up') ? 1 : 0);
    const m = Math.hypot(x, y);
    return m ? { x: x / m, y: y / m } : { x: 0, y: 0 };
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.mouse.pressed = [false, false, false];
    this.mouse.wheel = 0;
    this.mouse.moved = false;
    this.padPrev = this.pad.down.slice();
  }
}
