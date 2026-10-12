// The first-person HUD, kept to the bottom corners so the floor ahead and the rear strip stay
// clear: hull pips and the wave bottom left, the speed gauge under them (the last item in the speed
// readability stack, and it can be hidden: THREEJS-NOTES rule 8), the part slot bottom right with
// the towing and bolting state.
import { C, PALETTE } from '../data/palette';
import { WAVES } from '../data/waves';
import { PARTS } from '../data/parts';
import { playerStats } from '../sim/body';
import type { World } from '../sim/world';
import { textWidth } from '../ui/font';
import type { UI } from '../ui/ui';

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

/** The Booster icon, 14x10, gold (salvage). */
export function boosterIcon(ui: UI, x: number, y: number, cracked = false) {
  const c = ui.ctx;
  const f = (xx: number, yy: number, w: number, h: number, k: number) => {
    c.fillStyle = PALETTE[k];
    c.fillRect(x + xx, y + yy, w, h);
  };
  f(0, 2, 10, 6, C.ink);
  f(1, 3, 8, 4, C.gold);
  f(1, 3, 8, 1, C.gold3);
  f(9, 1, 5, 8, C.ink);
  f(10, 2, 3, 6, C.gold0);
  f(11, 3, 2, 4, C.orange);
  f(3, 3, 1, 4, C.gold2);
  f(6, 3, 1, 4, C.gold2);
  if (cracked) {
    f(4, 3, 1, 1, C.ink);
    f(5, 4, 1, 1, C.ink);
    f(4, 5, 1, 1, C.ink);
  }
}

export interface HudOpts {
  gauge: boolean;
  keys: { bolt: string };
  /** the bolt hint is up: it says the key, so the slot just says TOWING */
  boltHint?: boolean;
}

export function drawHud(ui: UI, w: World, o: HudOpts) {
  const p = w.player, t = w.t;

  // hull and wave, bottom left
  const wave = `WAVE ${Math.min(WAVES.length, w.wave.index + 1)}/${WAVES.length}`;
  const hy = o.gauge ? 330 : 346;
  const wx = 6 + t.hull * 10 + 6;
  ui.fill(2, hy - 3, wx + textWidth(wave) + 6, 14, C.ink);
  for (let i = 0; i < t.hull; i++) pip(ui, 6 + i * 10, hy, i < p.hull);
  ui.text(wave, wx, hy, C.frost);

  // the part slot, bottom right
  const name = p.part ? PARTS[p.part].name.toUpperCase() + (p.partCracked ? ' (CRACKED)' : '') : 'NO PART';
  const bolting = p.bolt !== null;
  const tow = p.tow ? (bolting ? 'BOLTING...' : o.boltHint ? 'TOWING' : `TOWING  ${o.keys.bolt}: BOLT ON`) : '';
  const nameW = textWidth(name);
  const sx = 620;
  const rowW = 22 + nameW + (tow ? textWidth(tow) + 12 : 0);
  ui.fill(638 - rowW - 8, 343, rowW + 8, 15, C.ink);
  if (p.part) boosterIcon(ui, sx, 345, p.partCracked);
  else ui.fill(sx, 346, 14, 8, C.plum);
  ui.text(name, sx - 6, 346, p.part ? C.gold2 : C.lilac, { align: 'right' });
  if (tow) {
    ui.text(tow, sx - 6 - nameW - 12, 346, C.gold3, { align: 'right' });
    if (bolting) ui.fill(sx - 6 - nameW - 12 - textWidth(tow), 355, Math.max(1, Math.round(textWidth(tow) * Math.min(1, p.bolt! / t.boltTime))), 1, C.gold);
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
