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

export type HintId = 'speed' | 'tear' | 'bolt' | 'burn';

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

  update(w: World, dt: number) {
    if (!this.enabled) {
      this.current = null;
      return;
    }
    const want: HintId | null =
      !this.seen.bolt && w.player.tow ? 'bolt'
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

  draw(ui: UI, w: World, cam: THREE.Camera, keys: { rip: string; bolt: string }, rear: boolean) {
    if (!this.current) return;
    const text = this.current === 'speed' ? 'BUILD SPEED - THE CLAW TURNS TEAL'
      : this.current === 'tear' ? `DODGE ITS CHARGE, THEN HIT ITS BACK AT TEAL (${keys.rip})`
      : this.current === 'burn' ? `HOLD ${keys.rip} TO REV A BURN, LET GO TO LAUNCH`
      : `TAP ${keys.bolt} TO BOLT IT ON`;
    const tw = textWidth(text);
    let x = 320, y = 262;
    if (this.current === 'bolt') {
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
    ui.text(text, Math.round(x), y, blink ? C.white : this.current === 'speed' || this.current === 'burn' ? C.speed4 : C.gold3, { align: 'center' });
  }
}
