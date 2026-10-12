// The exit signs in first person (2D PLAN.md 8.1, DECISIONS #30). In 2D a sign is painted on the
// floor by its gate; seen from the seat, floor text 20 m away is a smear. So each open exit gets
// the 2D sign's content (where it leads, what its enemies carry, how big its last wave is: the
// vendored src/ui/signs.ts) as a panel pinned over the gate, drawn crisp at 1:1 on the UI layer,
// with a gold arrow down onto the gate. An exit out of view gets a gold arrow on the frame's edge
// pointing round to it, with the yard's name. The gate itself has gold lamps, open doors and gold
// chevrons on the floor pointing out (stage.ts).
import * as THREE from 'three';
import { C } from '../data/palette';
import type { World } from '../sim/world';
import type { Run } from '../sim/run';
import { YARDS } from '../data/yards';
import { signLayout } from '../ui/signs';
import { textWidth } from '../ui/font';
import type { UI } from '../ui/ui';
import { REAR } from '../render3d/view';
import { wx, wz } from '../render3d/units';
import { arrow } from './overlay';
import { partIcon } from './icons';

export interface SignBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Draw the open exits' signs; returns where the panels went (floating texts and hints keep off). */
export function drawExitSigns(ui: UI, cam: THREE.PerspectiveCamera, w: World, run: Run, time: number, rear: boolean): SignBox[] {
  const out: SignBox[] = [];
  const top = rear ? REAR.y + REAR.h + 6 : 6;
  const blink = Math.floor(time * 3) % 2 === 0;
  const inv = new THREE.Matrix4().copy(cam.matrixWorld).invert();
  for (const e of w.exits) {
    const g = w.arena.gates.find((q) => q.id === e.gate)!;
    const dest = run.options[e.option];
    const s = signLayout(g, dest, run.depth + 1);
    const at = new THREE.Vector3(wx(g.rect.x + g.rect.w / 2), 1.0, wz(g.rect.y + g.rect.h / 2));
    const v = at.clone().project(cam);
    if (v.z < 1 && v.z > -1 && Math.abs(v.x) < 0.96 && Math.abs(v.y) < 0.96) {
      const gx = Math.round((v.x * 0.5 + 0.5) * 640), gy = Math.round((-v.y * 0.5 + 0.5) * 360);
      const x = Math.max(4, Math.min(636 - s.w, gx - Math.floor(s.w / 2)));
      const y = Math.max(top, Math.min(300 - s.h, gy - s.h - 30));
      ui.fill(x, y, s.w, s.h, C.ink);
      ui.fill(x, y, s.w, 1, blink ? C.gold3 : C.gold);
      ui.text(s.name, x + 4, y + 4, C.white);
      s.icons.forEach((id, i) => partIcon(ui, id, x + 4 + i * 18, y + 14));
      ui.text(s.parts, x + 4, y + 33, C.gold2);
      ui.text(s.wave, x + 4, y + 43, C.mist);
      out.push({ x0: x - 2, y0: y - 2, x1: x + s.w + 2, y1: y + s.h + 2 });
      // a gold arrow down onto the gate
      const tip = Math.max(y + s.h + 14, Math.min(330, gy - 2 + (Math.floor(time * 6) % 2) * 2));
      arrow(ui, Math.max(10, Math.min(630, gx)), tip, 0, 1, blink ? C.gold3 : C.gold);
    } else {
      // out of view: an arrow on the frame's edge pointing round to it (compass style, ahead is up)
      const c = at.clone().applyMatrix4(inv);
      const ang = Math.atan2(c.x, -c.z);
      const ux = Math.sin(ang), uy = -Math.cos(ang);
      const right = ang > 0;
      const ax = right ? 630 : 10;
      const ay = Math.round(Math.max(top + 30, Math.min(320, 190 - Math.cos(ang) * 90)));
      arrow(ui, ax, ay, ux, uy, blink ? C.gold3 : C.gold);
      const name = YARDS[dest].name;
      const tw = textWidth(name);
      const tx = right ? ax - 30 - tw : ax + 30;
      ui.fill(tx - 3, ay - 4, tw + 6, 13, C.ink);
      ui.text(name, tx, ay - 1, C.gold3);
      out.push({ x0: tx - 5, y0: ay - 6, x1: tx + tw + 5, y1: ay + 11 });
    }
  }
  return out;
}
