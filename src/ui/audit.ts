// UI overlap audit. When `ui.audit` is on, the UI records every text, panel, button and opaque
// fill it draws in a frame (see UI.rec); findIssues turns one frame's records into a list of
// layout problems. Used by `npm run screens` (e2e/screens.mjs); costs nothing when off.
import type { Rect } from './ui';

export type AuditKind = 'text' | 'panel' | 'button' | 'fill';

export interface AuditRec extends Rect {
  kind: AuditKind;
  /** the string, for text */
  s?: string;
  /** active clip rect when it was drawn */
  clip?: Rect;
  /** 'tip' for hover tooltips and the dragged stack, 'ui' for everything else */
  layer: 'ui' | 'tip';
  /** draw order within the frame */
  seq: number;
}

export interface AuditIssue {
  /**
   * clash: two texts overlap. overflow: text runs past the panel or button it starts in.
   * covered: something drawn later paints over the text.
   */
  type: 'clash' | 'overflow' | 'covered';
  text: string;
  rect: Rect;
  other?: string;
  otherRect?: Rect;
}

export function intersect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
  return x1 > x && y1 > y ? { x, y, w: x1 - x, h: y1 - y } : null;
}

const area = (r: Rect) => r.w * r.h;
const contains = (r: Rect, x: number, y: number) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

/** The part of a record that is actually on screen (inside its clip and the screen). */
function visible(r: AuditRec, screen: Rect): Rect | null {
  const v = intersect(r, screen);
  return v && r.clip ? intersect(v, r.clip) : v;
}

export function findIssues(recs: AuditRec[], screen: { w: number; h: number }): AuditIssue[] {
  const scr = { x: 0, y: 0, w: screen.w, h: screen.h };
  const texts = recs.filter((r) => r.kind === 'text').map((r) => ({ r, v: visible(r, scr) })).filter((t) => t.v) as { r: AuditRec; v: Rect }[];
  const issues: AuditIssue[] = [];
  const label = (r: AuditRec) => r.s ?? r.kind;

  const covers = recs.filter((r) => r.kind !== 'text');
  // clash: overlapping texts in the same layer (a tooltip over the UI is intended).
  // Texts are 9px cells and lines are 10px apart, so require at least 2x2 px of overlap.
  // If something opaque drawn between the two hides most of the overlap, the earlier text is
  // under it, not clashing: that shows up as 'covered' instead.
  for (let i = 0; i < texts.length; i++)
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i], b = texts[j];
      if (a.r.layer !== b.r.layer) continue;
      if (a.r.s === b.r.s && a.r.x === b.r.x && a.r.y === b.r.y) continue; // the same text drawn twice
      const o = intersect(a.v, b.v);
      if (!o || o.w < 2 || o.h < 2) continue;
      const [first, second] = a.r.seq < b.r.seq ? [a.r, b.r] : [b.r, a.r];
      const hidden = covers.some((c) => c.seq > first.seq && c.seq < second.seq && area(intersect(o, c) ?? { x: 0, y: 0, w: 0, h: 0 }) * 2 >= area(o));
      if (!hidden) issues.push({ type: 'clash', text: label(a.r), rect: a.v, other: label(b.r), otherRect: b.v });
    }

  // overflow: text sticking out of the panel/button it starts in. In immediate mode that is the
  // most recently drawn one under the text's first pixel.
  for (const t of texts) {
    let box: AuditRec | null = null;
    for (const c of recs) {
      if ((c.kind !== 'panel' && c.kind !== 'button') || c.seq > t.r.seq || c.layer !== t.r.layer) continue;
      if (!contains(c, t.r.x + 1, t.r.y + 1)) continue;
      if (!box || c.seq > box.seq) box = c;
    }
    if (!box) continue;
    const inside = intersect(t.v, box);
    if (!inside || inside.w < t.v.w || inside.h < t.v.h) issues.push({ type: 'overflow', text: label(t.r), rect: t.v, other: `${box.kind} ${box.w}x${box.h}`, otherRect: box });
  }

  // covered: an opaque panel, button or fill drawn after the text paints over part of it
  for (const t of texts) {
    for (const c of recs) {
      if (c.seq <= t.r.seq || c.kind === 'text' || c.layer === 'tip') continue;
      const o = intersect(t.v, c);
      if (o && area(o) >= 6) {
        issues.push({ type: 'covered', text: label(t.r), rect: t.v, other: `${c.kind} ${c.w}x${c.h}`, otherRect: { x: c.x, y: c.y, w: c.w, h: c.h } });
        break;
      }
    }
  }
  return issues;
}
