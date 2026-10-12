// The dev tuning panel, as in the 2D game (its DECISIONS #18, #28): every movement and combat
// number, editable while you play, with flat mode (the removal test as an A/B), START WITH THE
// BOOSTER, and a Copy button whose output pastes into src/data/tuning.ts... of the 2D project,
// since the rules are vendored (DECISIONS #1): a tuning change here is a proposal for both games.
// Only in dev builds or with ?debug in the address. The mouse is free while it's open.
import { C } from '../data/palette';
import { DEFAULT_TUNING, TUNING_GROUPS, defaultTuning, type Tuning, type TuningKey } from '../data/tuning';
import type { UI } from '../ui/ui';

/** The numbers new encounters start with (edits here carry over to Again). */
export const LIVE: { t: Tuning; flat: boolean; booster: boolean } = { t: defaultTuning(), flat: false, booster: false };

const round = (v: number) => Math.round(v * 1000) / 1000;

export class TuningPanel {
  open = false;
  scroll = 0;
  private note = '';
  private noteT = 0;

  /** Changes from the defaults, as lines to paste into DEFAULT_TUNING. */
  diff(): string {
    const lines: string[] = [];
    for (const k of Object.keys(DEFAULT_TUNING) as TuningKey[]) if (LIVE.t[k] !== DEFAULT_TUNING[k]) lines.push(`  ${k}: ${round(LIVE.t[k])},`);
    return lines.length ? lines.join('\n') : '// no changes from the defaults';
  }

  draw(ui: UI, worldT: Tuning, setFlat: (on: boolean) => void, setBooster: (on: boolean) => void, dt: number) {
    if (!this.open) return;
    this.noteT = Math.max(0, this.noteT - dt);
    const x = 446, y = 78, w = 190, h = 252;
    ui.panel(x, y, w, h, 'dark');
    ui.text('TUNING', x + 6, y + 5, C.white);
    ui.text('` TO CLOSE', x + w - 6, y + 5, C.lilac, { align: 'right' });
    const flat = ui.toggle('t-flat', x + 6, y + 18, w - 12, 'FLAT MODE (REMOVAL TEST)', LIVE.flat);
    if (flat !== LIVE.flat) {
      LIVE.flat = flat;
      setFlat(flat);
    }
    const booster = ui.toggle('t-booster', x + 6, y + 30, w - 12, 'START WITH THE BOOSTER', LIVE.booster);
    if (booster !== LIVE.booster) {
      LIVE.booster = booster;
      setBooster(booster);
    }
    if (ui.button('t-copy', x + 6, y + 42, 56, 12, 'COPY')) {
      const text = this.diff();
      try {
        navigator.clipboard?.writeText(text);
        this.note = 'COPIED';
      } catch {
        this.note = 'COPY FAILED';
      }
      console.log(text);
      this.noteT = 1.5;
    }
    if (ui.button('t-reset', x + 68, y + 42, 56, 12, 'RESET')) {
      Object.assign(LIVE.t, defaultTuning());
      Object.assign(worldT, defaultTuning());
    }
    if (this.noteT > 0) ui.text(this.note, x + w - 6, y + 44, C.white, { align: 'right' });

    // the list, clipped and scrolled with the wheel
    const lx = x + 4, ly = y + 60, lh = h - 64;
    if (ui.hover(x, y, w, h)) this.scroll = Math.max(0, this.scroll + ui.input.mouse.wheel * 20);
    const ctx = ui.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(lx, ly, w - 8, lh);
    ctx.clip();
    let cy = ly - this.scroll;
    for (const g of TUNING_GROUPS) {
      if (cy > ly - 12 && cy < ly + lh) ui.text(g.title.toUpperCase(), lx + 2, cy + 2, C.white);
      cy += 12;
      for (const [k, step] of g.keys) {
        const visible = cy > ly - 2 && cy < ly + lh - 10;
        if (visible) {
          const changed = LIVE.t[k] !== DEFAULT_TUNING[k];
          ui.text(k, lx + 2, cy + 1, changed ? C.white : C.mist);
          ui.text(String(round(LIVE.t[k])), lx + w - 40, cy + 1, changed ? C.cruiseHi : C.frost, { align: 'right' });
          if (ui.button('t-' + k + '-', lx + w - 36, cy, 12, 10, '-')) set(k, LIVE.t[k] - step);
          if (ui.button('t-' + k + '+', lx + w - 22, cy, 12, 10, '+')) set(k, LIVE.t[k] + step);
        }
        cy += 11;
      }
      cy += 2;
    }
    ctx.restore();
    const total = cy + this.scroll - ly;
    this.scroll = Math.min(this.scroll, Math.max(0, total - lh));

    function set(k: TuningKey, v: number) {
      v = round(Math.max(0, v));
      LIVE.t[k] = v;
      worldT[k] = v;
    }
  }
}
