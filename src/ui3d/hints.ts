// The one-time hints (2D PLAN.md 4.5, 8.5): shown once each, one at a time, when they're relevant,
// and dropped as soon as you've done the thing. In first person they sit in the world where the
// thing is: the speed, part and exit hints just above the claw; the enemy hints over the nearest
// enemy they're about (under the rear strip when it's out of view); the bolt hint over the part
// slots, since the part you're towing is behind you.
import * as THREE from 'three';
import { C } from '../data/palette';
import { MOUNTS } from '../data/mounts';
import type { PartId } from '../data/parts';
import type { Enemy, World } from '../sim/world';
import type { SimEvent } from '../sim/events';
import type { UI } from '../ui/ui';
import { textWidth } from '../ui/font';
import { REAR } from '../render3d/view';
import { project } from './overlay';

export type HintId = 'speed' | 'tear' | 'bolt' | 'burn' | 'mirror' | 'exit' | 'treads' | 'plow' | 'jaws' | 'snapper' | 'plowfoe' | 'jawfoe';

/** a hint about a part you've bolted on, by part */
const PART_HINT: Record<PartId, HintId> = { booster: 'burn', treads: 'treads', plow: 'plow', jaws: 'jaws' };
/** hints placed over the enemy they're about */
const OVER: Partial<Record<HintId, (e: Enemy) => boolean>> = {
  tear: (e) => e.parts.rear === 'booster',
  snapper: (e) => e.kind === 'snapper' && e.parts.sides === 'treads',
  plowfoe: (e) => e.parts.front === 'plow',
  jawfoe: (e) => e.parts.front === 'jaws',
};
const SPEEDY = new Set<HintId>(['speed', 'burn', 'treads', 'plow', 'jaws']);

export interface HintKeys {
  rip: string;
  bolt: string;
  look: string;
  brake: string;
}

export class Hints {
  seen: Record<string, boolean>;
  current: HintId | null = null;
  private shownFor = 0;
  enabled: boolean;
  onSeen: (seen: Record<string, boolean>) => void = () => {};

  constructor(seen: Record<string, boolean>, enabled: boolean) {
    this.seen = { ...seen };
    this.enabled = enabled;
  }

  private done(id: HintId) {
    if (this.seen[id]) return;
    this.seen[id] = true;
    if (this.current === id) this.current = null;
    this.onSeen(this.seen);
  }

  event(e: SimEvent) {
    if (e.k === 'tier' && e.tier === 'slip') this.done('speed');
    if (e.k === 'tear') {
      if (e.part === 'booster') this.done('tear');
      if (e.part === 'treads') this.done('snapper');
      if (e.part === 'plow') this.done('plowfoe');
      if (e.part === 'jaws') this.done('jawfoe');
    }
    if (e.k === 'joust') this.done('plowfoe');
    if (e.k === 'bolted') this.done('bolt');
    if (e.k === 'rip' && e.burn && e.tier === 'slip') this.done('burn');
    if (e.k === 'exit') this.done('exit');
    if (e.k === 'slide') this.done('treads');
    if (e.k === 'ram' && e.tier === 'slip') this.done('plow');
    if (e.k === 'sling') this.done('jaws');
  }

  /** You held the look-back: the mirror hint has done its job. */
  looked() {
    this.done('mirror');
  }

  /** `behind`: an enemy is winding up where the view can't see it (the first time teaches the mirror). */
  update(w: World, dt: number, behind = false) {
    if (!this.enabled) {
      this.current = null;
      return;
    }
    if (this.current === 'mirror' && this.shownFor > 4) this.done('mirror');
    const p = w.player, s = this.seen;
    const bolted = w.flat ? [] : MOUNTS.map((m) => p.parts[m]?.id).filter((id): id is PartId => !!id);
    const partHint = bolted.map((id) => PART_HINT[id]).find((h) => !s[h]);
    const foes = (h: HintId) => w.enemies.some(OVER[h]!);
    const want: HintId | null =
      !s.bolt && p.tow ? 'bolt'
      : !s.exit && w.exits.length ? 'exit'
      : partHint ? partHint
      : !s.speed && w.wave.phase !== 'banner' ? 'speed'
      : !s.plowfoe && foes('plowfoe') ? 'plowfoe'
      : !s.jawfoe && foes('jawfoe') ? 'jawfoe'
      : !s.snapper && s.speed && foes('snapper') ? 'snapper'
      : !s.tear && s.speed && foes('tear') ? 'tear'
      : !s.mirror && (behind || this.current === 'mirror') ? 'mirror'
      : null;
    if (want !== this.current) {
      this.current = want;
      this.shownFor = 0;
    }
    this.shownFor += dt;
  }

  /** `avoid`: where this frame's floating texts are (TORN OFF!, BOLTED ON!): the hint steps aside. */
  draw(ui: UI, w: World, cam: THREE.Camera, keys: HintKeys, rear: boolean, avoid: { x0: number; y0: number; x1: number; y1: number }[] = []) {
    if (!this.current) return;
    const TEXT: Record<HintId, string> = {
      speed: 'BUILD SPEED - THE CLAW TURNS TEAL',
      tear: `LET IT CHARGE PAST, SWING ROUND, HIT ITS GOLD BACK AT TEAL (${keys.rip})`,
      burn: `HOLD ${keys.rip} TO REV A BURN, LET GO TO LAUNCH`,
      mirror: `IT'S BEHIND YOU: THE MIRROR SHOWS IT, HOLD ${keys.look} TO LOOK BACK`,
      bolt: `TAP ${keys.bolt} TO BOLT IT ON`,
      exit: 'DRIVE OUT AN OPEN GATE - ITS SIGN SAYS WHERE IT LEADS',
      treads: `TAP ${keys.brake} AT SPEED TO POWER-SLIDE ROUND`,
      plow: 'DRIVE INTO THEM AT TEAL - YOUR FRONT IS A RAM',
      jaws: 'A TEAL HIT BITES ON AND SLINGS YOU BACK OUT',
      snapper: "RIP A SNAPPER'S TREADS: HIT ITS SIDE AT TEAL AS IT SLIDES",
      plowfoe: 'A PLOW TAKES NOTHING - JOUST ITS CHARGE HEAD-ON',
      jawfoe: 'HIT ITS JAWS HEAD-ON AT TEAL TO TEAR THEM OFF',
    };
    const text = TEXT[this.current];
    const tw = textWidth(text);
    const top = rear ? REAR.y + REAR.h + 8 : 8;
    // just above the claw, clear of the reticle
    let x = 320, y = 228;
    if (this.current === 'mirror') y = top + 4;
    else if (this.current === 'bolt') {
      x = 636 - tw / 2;
      y = 326;
    } else if (OVER[this.current]) {
      // over the nearest enemy it's about, if that's in view
      const p = w.player, is = OVER[this.current]!;
      const r = w.enemies.filter(is).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
      const s = r ? project(cam, new THREE.Vector3(r.x * 0.05, r.kind === 'rammer' ? 1.3 : 0.9, r.y * 0.05)) : null;
      if (s && s.x > 0 && s.x < 640 && s.y > top && s.y < 300) {
        x = s.x;
        y = s.y - 6;
      } else y = top + 4;
    }
    x = Math.max(4 + tw / 2, Math.min(636 - tw / 2, x));
    const bx0 = x - tw / 2 - 4, bx1 = x + tw / 2 + 4, by0 = y - 3, by1 = y + 11;
    if (avoid.some((r) => r.x0 < bx1 && r.x1 > bx0 && r.y0 < by1 && r.y1 > by0)) return;
    ui.fill(Math.round(x - tw / 2 - 4), y - 3, tw + 8, 14, C.ink);
    const blink = this.shownFor < 0.6 && Math.floor(this.shownFor * 10) % 2 === 1;
    const col = SPEEDY.has(this.current) ? C.speed4 : this.current === 'mirror' ? C.frost : C.gold3;
    ui.text(text, Math.round(x), y, blink ? C.white : col, { align: 'center' });
  }
}
