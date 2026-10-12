// The one-time hints (2D PLAN.md 4.5): shown once each, one at a time, when they're relevant, and
// dropped as soon as you've done the thing. In first person they sit in the world where the thing
// is: the speed and Burn hints just above the claw, the tear hint over the Rammer you should hit
// (under the rear strip when it's out of view), the bolt hint over the part slot, since the part
// you're towing is behind you.
import * as THREE from 'three';
import { C } from '../data/palette';
import type { World } from '../sim/world';
import type { SimEvent } from '../sim/events';
import type { UI } from '../ui/ui';
import { textWidth } from '../ui/font';
import { REAR } from '../render3d/view';
import { project } from './overlay';

export type HintId = 'speed' | 'tear' | 'bolt' | 'burn' | 'mirror';

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
    if (e.k === 'tear') this.done('tear');
    if (e.k === 'bolted') this.done('bolt');
    if (e.k === 'rip' && e.burn && e.tier === 'slip') this.done('burn');
  }

  /** You held the look-back: the mirror hint has done its job. */
  looked() {
    this.done('mirror');
  }

  /** `behind`: a Rammer is winding up where the view can't see it (the first time teaches the mirror). */
  update(w: World, dt: number, behind = false) {
    if (!this.enabled) {
      this.current = null;
      return;
    }
    if (this.current === 'mirror' && this.shownFor > 4) this.done('mirror');
    const want: HintId | null =
      !this.seen.mirror && (behind || this.current === 'mirror') ? 'mirror'
      : !this.seen.bolt && w.player.tow ? 'bolt'
      : !this.seen.burn && w.player.part === 'booster' && !w.flat ? 'burn'
      : !this.seen.speed && w.wave.phase !== 'banner' ? 'speed'
      : !this.seen.tear && this.seen.speed && w.rammers.length > 0 ? 'tear'
      : null;
    if (want !== this.current) {
      this.current = want;
      this.shownFor = 0;
    }
    this.shownFor += dt;
  }

  draw(ui: UI, w: World, cam: THREE.Camera, keys: { rip: string; bolt: string; look: string }, rear: boolean) {
    if (!this.current) return;
    const text = this.current === 'speed' ? 'BUILD SPEED - THE CLAW TURNS TEAL'
      : this.current === 'tear' ? `LET IT CHARGE PAST, SWING ROUND, HIT ITS GOLD BACK AT TEAL (${keys.rip})`
      : this.current === 'burn' ? `HOLD ${keys.rip} TO REV A BURN, LET GO TO LAUNCH`
      : this.current === 'mirror' ? `IT'S BEHIND YOU: THE MIRROR SHOWS IT, HOLD ${keys.look} TO LOOK BACK`
      : `TAP ${keys.bolt} TO BOLT IT ON`;
    const tw = textWidth(text);
    // just above the claw, clear of the reticle
    let x = 320, y = 228;
    if (this.current === 'mirror') y = (rear ? REAR.y + REAR.h + 8 : 8) + 4;
    else if (this.current === 'bolt') {
      x = 636 - tw / 2;
      y = 328;
    } else if (this.current === 'tear') {
      // over the nearest Rammer, if it's in view
      const p = w.player;
      const r = [...w.rammers].sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
      const s = r ? project(cam, new THREE.Vector3(r.x * 0.05, 1.3, r.y * 0.05)) : null;
      const top = rear ? REAR.y + REAR.h + 8 : 8;
      if (s && s.x > 0 && s.x < 640 && s.y > top && s.y < 300) {
        x = s.x;
        y = s.y - 6;
      } else y = top + 4;
    }
    x = Math.max(4 + tw / 2, Math.min(636 - tw / 2, x));
    ui.fill(Math.round(x - tw / 2 - 4), y - 3, tw + 8, 14, C.ink);
    const blink = this.shownFor < 0.6 && Math.floor(this.shownFor * 10) % 2 === 1;
    const col = this.current === 'speed' || this.current === 'burn' ? C.speed4 : this.current === 'mirror' ? C.frost : C.gold3;
    ui.text(text, Math.round(x), y, blink ? C.white : col, { align: 'center' });
  }
}
