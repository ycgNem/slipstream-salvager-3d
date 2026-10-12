// The first-person HUD, kept to the bottom corners so the floor ahead and the rear strip stay
// clear: hull pips with the yard and wave bottom left, the speed gauge under them (the last item in
// the speed readability stack, and it can be hidden: THREEJS-NOTES rule 8), the three part slots
// bottom right (rear, sides, front, as in 2D) with what you're towing and the bolt's progress.
import { C, PALETTE } from '../data/palette';
import { PARTS } from '../data/parts';
import { MOUNTS } from '../data/mounts';
import { playerStats } from '../sim/body';
import type { World } from '../sim/world';
import { textWidth } from '../ui/font';
import type { UI } from '../ui/ui';
import { partIcon } from './icons';

const GAUGE_MAX = 330;

/** A hull pip: an orange plate when full, an empty socket when lost. */
function pip(ui: UI, x: number, y: number, full: boolean) {
  const c = ui.ctx;
  const f = (xx: number, yy: number, w: number, h: number, k: number) => {
    c.fillStyle = PALETTE[k];
    c.fillRect(xx, yy, w, h);
  };
  f(x, y, 8, 8, C.ink);
  f(x + 1, y + 1, 6, 6, full ? C.rust2 : C.plum);
  if (full) {
    f(x + 1, y + 1, 6, 1, C.rust3);
    f(x + 1, y + 1, 1, 6, C.rust3);
    f(x + 3, y + 3, 2, 2, C.peach);
  }
}

export interface HudOpts {
  gauge: boolean;
  keys: { bolt: string };
  /** the bolt hint is up: it says the key, so the slot just names the part */
  boltHint?: boolean;
  /** what goes after the hull pips (the yard and wave in a run) */
  label?: string;
}

export function drawHud(ui: UI, w: World, o: HudOpts) {
  const p = w.player, t = w.t;

  // hull and wave, bottom left
  const wave = o.label ?? `WAVE ${Math.min(w.waves.length, w.wave.index + 1)}/${w.waves.length}`;
  const hy = o.gauge ? 330 : 346;
  const wx = 6 + t.hull * 10 + 6;
  ui.fill(2, hy - 3, wx + textWidth(wave) + 6, 14, C.ink);
  for (let i = 0; i < t.hull; i++) pip(ui, 6 + i * 10, hy, i < p.hull);
  ui.text(wave, wx, hy, C.frost);

  // the three part slots, bottom right, with what you're towing to their left
  const slotX = (i: number) => 584 + i * 18, sy = 342;
  const bolting = p.bolt !== null;
  const towName = p.tow ? PARTS[p.tow.part].name.toUpperCase() : '';
  const tow = p.tow ? (bolting ? `BOLTING ${towName}...` : o.boltHint ? towName : `${towName}  ${o.keys.bolt}: BOLT ON`) : '';
  const left = slotX(0) - 6 - (tow ? textWidth(tow) + 4 : 0);
  ui.fill(left - 4, sy - 1, 640 - left + 2, 18, C.ink);
  MOUNTS.forEach((m, i) => {
    const b = p.parts[m], x = slotX(i);
    ui.fill(x - 1, sy, 18, 16, C.floor0);
    if (b) partIcon(ui, b.id, x, sy, b.cracked);
    else {
      // an empty mount: a dim socket
      ui.fill(x + 5, sy + 5, 6, 6, C.plum);
      ui.fill(x + 6, sy + 6, 4, 4, C.ink);
    }
    // the slot a towed part will go on
    if (p.tow && PARTS[p.tow.part].mount === m) ui.fill(x, sy + 15, 16, 1, bolting ? C.gold : C.gold0);
  });
  if (tow) {
    ui.text(tow, slotX(0) - 6, sy + 4, C.gold3, { align: 'right' });
    if (bolting) {
      const tw = textWidth(tow);
      ui.fill(slotX(0) - 6 - tw, sy + 13, Math.max(1, Math.round(tw * Math.min(1, p.bolt! / t.boltTime))), 1, C.gold);
    }
  }

  // the speed gauge, bottom left (hideable)
  if (o.gauge) {
    const gw = 150, gx = 62, gy = 350;
    const at = (v: number) => gx + 1 + Math.round(((gw - 2) * Math.min(v, GAUGE_MAX)) / GAUGE_MAX);
    ui.fill(2, gy - 4, gx + gw + 30, 13, C.ink);
    ui.fill(gx, gy, gw, 6, C.plum);
    const sp = p.speed;
    const seg = (a: number, b: number, c: number) => {
      const x0 = at(a), x1 = at(Math.min(b, sp));
      if (x1 > x0) ui.fill(x0, gy + 1, x1 - x0, 4, c);
    };
    seg(0, t.cruiseAt, C.crawl);
    seg(t.cruiseAt, t.slipAt, C.cruise);
    seg(t.slipAt, GAUGE_MAX, C.speed3);
    for (const v of [t.cruiseAt, t.slipAt]) ui.fill(at(v), gy - 2, 1, 10, C.frost);
    ui.fill(at(playerStats(w).topSpeed), gy - 1, 1, 8, C.lilac);
    const tier = p.tier === 'slip' ? 'SLIPSTREAM' : p.tier === 'cruise' ? 'CRUISE' : 'CRAWL';
    const col = p.tier === 'slip' ? C.speed4 : p.tier === 'cruise' ? C.cruiseHi : C.crawlHi;
    ui.text(tier, gx - 4, gy - 1, col, { align: 'right' });
    ui.text(`${Math.round(sp)}`, gx + gw + 4, gy - 1, C.mist);
  }
}
