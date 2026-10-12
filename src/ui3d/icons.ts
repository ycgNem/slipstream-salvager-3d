// The four part icons (16x16), cropped from the 2D game's pixel-art-studio sheet into
// public/ui/part-icons.png (DECISIONS #32), for the HUD slots, the exit signs and the run results.
// Drawn 1:1 on the 640x360 UI canvas; until the image has loaded a gold block stands in.
import { C, PALETTE } from '../data/palette';
import type { PartId } from '../data/parts';
import type { UI } from '../ui/ui';

const ORDER: PartId[] = ['booster', 'treads', 'plow', 'jaws'];
let sheet: HTMLImageElement | null = null;

function load(): HTMLImageElement | null {
  if (sheet || typeof Image === 'undefined') return sheet;
  sheet = new Image();
  sheet.src = './ui/part-icons.png';
  return sheet;
}

/** A cracked part: a white zigzag with an ink edge (as in 2D). */
export function crack(ui: UI, x: number, y: number) {
  const zig = [[-2, -2], [-1, -1], [-1, 0], [0, 1], [1, 1], [1, 2]];
  const c = ui.ctx;
  c.fillStyle = PALETTE[C.ink];
  for (const [dx, dy] of zig) c.fillRect(x + dx + 1, y + dy, 1, 1);
  c.fillStyle = PALETTE[C.white];
  for (const [dx, dy] of zig) c.fillRect(x + dx, y + dy, 1, 1);
}

export function partIcon(ui: UI, id: PartId, x: number, y: number, cracked = false) {
  const img = load();
  if (img && img.complete && img.naturalWidth > 0) ui.ctx.drawImage(img, ORDER.indexOf(id) * 16, 0, 16, 16, x, y, 16, 16);
  else {
    ui.fill(x + 2, y + 4, 12, 8, C.gold0);
    ui.fill(x + 3, y + 5, 10, 6, C.gold);
  }
  if (cracked) crack(ui, x + 8, y + 8);
}
