// The sign by an open exit gate (PLAN.md 8.1, DECISIONS #79-#80): where it leads, what its enemies
// carry (icons, and the names, since an icon means nothing before you've met the part) and how big
// its last wave is at that depth. Painted on the floor below the side gate, at most 96 px wide, and
// clear of every wall and block in every yard (tests/run.test.ts checks).
import type { Gate } from '../data/arena';
import { PARTS } from '../data/parts';
import { YARDS, wavesAt, type YardId } from '../data/yards';
import type { Rect } from '../data/arena';
import { textWidth } from './font';

export interface SignLayout extends Rect {
  name: string;
  icons: (typeof YARDS)[YardId]['salvage'];
  parts: string;
  wave: string;
}

export const SIGN_H = 54;

/** The sign for an exit through gate `g` to yard `dest`, which would be yard number `depth`. */
export function signLayout(g: Gate, dest: YardId, depth: number): SignLayout {
  const y = YARDS[dest], icons = y.salvage;
  const parts = icons.length >= 4 ? 'ALL FOUR PARTS' : icons.map((id) => PARTS[id].name.toUpperCase()).join(' + ');
  const wave = `LAST WAVE: ${wavesAt(y, depth).at(-1)!.enemies.length}`;
  const tw = Math.max(textWidth(y.name), icons.length * 18 - 2, textWidth(parts), textWidth(wave));
  const w = tw + 8;
  const x = g.id === 'w' ? 22 : g.id === 'e' ? 618 - w : g.rect.x + 16 - Math.floor(w / 2);
  // just below a side gate (clear of the yard banner); by a top or bottom gate, inside the wall
  const top = g.id === 'w' || g.id === 'e' ? g.rect.y + g.rect.h + 4 : g.id === 'n' ? 22 : 360 - 16 - 6 - SIGN_H;
  return { x, y: top, w, h: SIGN_H, name: y.name, icons, parts, wave };
}
