// The 2D layer over the 3D view, drawn with the UI kit on the 640x360 canvas the composite puts on
// top (palette colors, the pixel font, whole pixels): floating texts anchored in the world, the wave
// banner, speed lines at Slipstream (THREEJS-NOTES rule 8), the steer reticle, the stun stars and
// the edge markers for Rammers winding up outside your view (PLAN.md readability answer 4).
import * as THREE from 'three';
import { C, PALETTE } from '../data/palette';
import type { World } from '../sim/world';
import type { UI } from '../ui/ui';
import { textWidth } from '../ui/font';
import { REAR, VIEW_H, VIEW_W } from '../render3d/view';
import { wx, wz } from '../render3d/units';

/** World point to the 640x360 frame (top-left origin); null if behind the camera. */
export function project(cam: THREE.Camera, p: THREE.Vector3): { x: number; y: number } | null {
  const v = p.clone().project(cam);
  if (v.z >= 1 || v.z <= -1) return null;
  return { x: Math.round((v.x * 0.5 + 0.5) * VIEW_W), y: Math.round((-v.y * 0.5 + 0.5) * VIEW_H) };
}

/** Bresenham line in a palette color. */
export function pxLine(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, c: number) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  ctx.fillStyle = PALETTE[c];
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let i = 0; i < 2000; i++) {
    ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

interface FloatText {
  text: string;
  color: number;
  /** a world anchor, or a fixed screen spot */
  at: THREE.Vector3 | null;
  sx: number;
  sy: number;
  age: number;
  life: number;
}

export class Overlay {
  texts: FloatText[] = [];
  /** where this frame's floating texts were drawn (the hints keep clear of them) */
  drawn: { x0: number; y0: number; x1: number; y1: number }[] = [];
  banner: { text: string; sub: string; t: number; life: number } | null = null;
  private lines: { a: number; r: number; v: number; len: number; c: number }[] = [];
  private seed = 5;

  private rnd() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  /** Text rising from a point in the world (or from a screen spot when `at` is null). */
  text(text: string, color: number, at: THREE.Vector3 | null, sx = 320, sy = 250, life = 0.9) {
    // one of each at a time: a new one replaces the old
    this.texts = this.texts.filter((t) => t.text !== text);
    this.texts.push({ text, color, at: at?.clone() ?? null, sx, sy, age: 0, life });
  }

  showBanner(text: string, sub: string, life: number) {
    this.banner = { text, sub, t: 0, life };
  }

  update(dt: number, speedLines: number) {
    for (const t of this.texts) t.age += dt;
    this.texts = this.texts.filter((t) => t.age < t.life);
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > this.banner.life) this.banner = null;
    }
    // speed lines: pixel streaks that start near the frame edge and race outward
    // never negative: the tier can still read 'slip' in the tick a hit cuts the speed (a crash, before)
    const want = Math.max(0, Math.min(26, Math.round(speedLines * 26)));
    while (this.lines.length < want) this.lines.push({ a: this.rnd() * Math.PI * 2, r: 0.55 + this.rnd() * 0.3, v: 1.6 + this.rnd() * 1.6, len: 0.05 + this.rnd() * 0.12, c: this.rnd() < 0.3 ? C.speed4 : this.rnd() < 0.6 ? C.speed3 : C.speedSky });
    for (const l of this.lines) l.r += l.v * dt;
    this.lines = this.lines.filter((l) => l.r < 1.25);
    if (this.lines.length > want) this.lines.length = want;
  }

  draw(ui: UI, cam: THREE.Camera, w: World | null, opts: { reticle: number | null; scrub: boolean; hfov: number; stun: boolean; time: number; rear: boolean }) {
    const ctx = ui.ctx;
    // speed lines, anchored to the frame edges (never over the rear strip)
    const top = opts.rear ? REAR.y + REAR.h + 3 : 0;
    for (const l of this.lines) {
      const cx = 320, cy = 200;
      const ex = Math.cos(l.a), ey = Math.sin(l.a) * 0.62;
      const x0 = cx + ex * l.r * 360, y0 = cy + ey * l.r * 360;
      const x1 = cx + ex * (l.r + l.len) * 360, y1 = cy + ey * (l.r + l.len) * 360;
      if (Math.min(y0, y1) < top) continue;
      pxLine(ctx, x0, y0, x1, y1, l.c);
    }
    // the steer reticle: where you've asked the nose to go, drifting from the nose tick when you ask
    // for more turn than the body can give; a demand past the view's edge is pinned there with an
    // arrow, and it blinks white while the turn scrubs speed (DECISIONS #23)
    if (opts.reticle !== null) {
      const half = THREE.MathUtils.degToRad(opts.hfov) / 2;
      const off = opts.reticle;
      const pinned = Math.abs(off) > half * 0.92;
      const rx = pinned ? (off > 0 ? 612 : 28) : Math.round(320 + (Math.tan(off) / Math.tan(half)) * 320);
      const ry = 196;
      // the nose tick
      ui.fill(319, ry - 3, 2, 2, C.frost);
      ui.fill(319, ry + 3, 2, 2, C.frost);
      if (Math.abs(rx - 320) > 2) {
        const c = opts.scrub && Math.floor(opts.time * 16) % 2 === 0 ? C.white : Math.abs(off) > 0.5 ? C.frost : C.mist;
        ui.fill(rx - 3, ry, 2, 2, c);
        ui.fill(rx + 2, ry, 2, 2, c);
        ui.fill(rx - 1, ry - 2, 2, 1, c);
        ui.fill(rx - 1, ry + 3, 2, 1, c);
        for (let x = Math.min(rx, 320) + 3; x < Math.max(rx, 320) - 3; x += 3) ui.fill(x, ry + 1, 1, 1, C.slate);
        if (pinned) {
          // the rest of the turn is still to come: a chevron beyond the reticle
          const d = off > 0 ? 1 : -1;
          for (let i = 0; i < 4; i++) {
            ui.fill(rx + d * (7 + i), ry - 3 + i, 1, 1, c);
            ui.fill(rx + d * (7 + i), ry + 4 - i, 1, 1, c);
          }
        }
      }
    }
    // floating texts
    this.drawn.length = 0;
    for (const t of this.texts) {
      let p: { x: number; y: number } | null = { x: t.sx, y: t.sy };
      if (t.at) p = project(cam, t.at);
      if (!p) continue;
      const rise = Math.round(t.age * 22);
      const blink = t.age > t.life * 0.7 && Math.floor(t.age * 16) % 2 === 1;
      if (blink) continue;
      const x = Math.max(4 + textWidth(t.text) / 2, Math.min(636 - textWidth(t.text) / 2, p.x));
      const y = Math.max(top + 2, Math.min(330, p.y - 14 - rise));
      ui.text(t.text, x, y, t.color, { align: 'center', shadow: C.ink });
      const tw = textWidth(t.text);
      this.drawn.push({ x0: x - tw / 2 - 2, y0: y - 2, x1: x + tw / 2 + 2, y1: y + 10 });
    }
    // the stun stars
    if (opts.stun) {
      for (let i = 0; i < 5; i++) {
        const a = opts.time * 6 + (i * Math.PI * 2) / 5;
        ui.fill(Math.round(320 + Math.cos(a) * 34), Math.round(top + 22 + Math.sin(a) * 6), 2, 2, i % 2 ? C.white : C.frost);
      }
    }
  }

  /** The wave / yard banner, drawn last so the markers and signs never cover it. */
  drawBanner(ui: UI) {
    const b = this.banner;
    if (!b || (b.t < 0.3 && Math.floor(b.t * 20) % 2 === 1)) return;
    const y = 120;
    const tw = Math.max(textWidth(b.text) * 3, b.sub ? textWidth(b.sub) : 0);
    ui.fill(320 - tw / 2 - 10, y - 6, tw + 20, b.sub ? 44 : 30, C.ink);
    ui.text(b.text, 320, y, C.white, { align: 'center', scale: 3, shadow: C.plum });
    if (b.sub) ui.text(b.sub, 320, y + 27, C.gold3, { align: 'center' });
  }
}

/** A filled arrow, tip at (ax, ay), pointing along (ux, uy), outlined in ink; whole pixels. */
export function arrow(ui: UI, ax: number, ay: number, ux: number, uy: number, color: number) {
  const px = -uy, py = ux;
  const HEAD = 11, LEN = 22, SHAFT = 2.5;
  // inside the arrow grown by g pixels (the ink outline is the shape grown by 1)
  const inside = (x: number, y: number, g: number) => {
    const dx = x - ax, dy = y - ay;
    const along = -(dx * ux + dy * uy), side = Math.abs(dx * px + dy * py);
    if (along < -g || along > LEN + g) return false;
    if (along <= HEAD) return side <= along * 0.8 + g * 1.3;
    return side <= SHAFT + g;
  };
  const r = LEN + 3;
  const ctx = ui.ctx;
  for (const [g, c] of [[1, C.ink], [0, color]] as const) {
    ctx.fillStyle = PALETTE[c];
    for (let y = Math.floor(ay - r); y <= ay + r; y++)
      for (let x = Math.floor(ax - r); x <= ax + r; x++) if (inside(x + 0.5, y + 0.5, g)) ctx.fillRect(x, y, 1, 1);
  }
}

/**
 * Edge markers for an enemy winding up (or charging, or snapping) where neither the view nor the
 * mirror shows it:
 * a long filled arrow pointing where it is, compass-style (ahead is up, behind is down). Ahead of
 * you it sits on the frame's side edge; behind you it sits beside the mirror, and that side of the
 * mirror's frame lights up (the mirror is where you look for things behind). Light grey while it is
 * still aiming, flashing danger red once its lane locks, solid red while it charges. A gate about
 * to open gets one too, flashing red (DECISIONS #15).
 */
export function drawMarkers(ui: UI, cam: THREE.PerspectiveCamera, rearCam: THREE.PerspectiveCamera, w: World, pos: (id: number) => THREE.Vector3 | null, time: number) {
  const inv = new THREE.Matrix4().copy(cam.matrixWorld).invert();
  const sides: { l: number | null; r: number | null } = { l: null, r: null };
  const shown = (v: THREE.Vector3) => v.z < 1 && v.z > -1 && Math.abs(v.x) < 0.97 && Math.abs(v.y) < 0.97;
  const rank = (c: number) => (c === C.danger3 ? 2 : c === C.dangerPink ? 1 : 0);
  const flash = Math.floor(time * 12) % 2 === 1;
  const threats: { p: THREE.Vector3; col: number; gate?: boolean }[] = [];
  for (const r of w.enemies) {
    // a Rammer's charge, a Snapper's snap, or either winding up for one
    const attacking = r.kind === 'rammer' ? r.state === 'charge' : r.state === 'snap';
    if (r.state !== 'windup' && !attacking) continue;
    const p = pos(r.id);
    if (!p) continue;
    const locked = attacking || r.locked;
    threats.push({ p, col: attacking ? C.danger3 : locked ? (flash ? C.dangerPink : C.danger3) : C.frost });
  }
  // a gate about to open (the wave's warning)
  if (w.wave.phase === 'warn')
    for (const g of w.wave.gates) threats.push({ p: new THREE.Vector3(wx(g.spawn.x), 0.5, wz(g.spawn.y)), col: flash ? C.dangerPink : C.danger3, gate: true });
  for (const { p, col, gate } of threats) {
    if (shown(p.clone().project(cam))) {
      // a warned gate in view is often 20 m off and a few pixels tall: an arrow drops onto it
      if (gate) {
        const s = project(cam, new THREE.Vector3(p.x, 2.6, p.z));
        if (s) arrow(ui, s.x, Math.max(REAR.y + REAR.h + 30, s.y) - 4 + (Math.floor(time * 6) % 2) * 2, 0, 1, col);
      }
      continue;
    }
    const c = p.clone().applyMatrix4(inv); // camera space: x right, z toward the viewer
    const ang = Math.atan2(c.x, -c.z); // 0 ahead, + right, ±π behind
    const behind = Math.abs(ang) > Math.PI / 2;
    if (behind && shown(p.clone().project(rearCam))) continue; // the mirror shows it
    const ux = Math.sin(ang), uy = -Math.cos(ang);
    const right = ang > 0;
    if (!behind) {
      // on the side edge, higher the more ahead it is
      const k = Math.min(1, Math.max(0, (Math.abs(ang) - 0.5) / 1.1));
      arrow(ui, right ? 633 : 6, Math.round(130 + k * 110), ux, uy, col);
    } else {
      arrow(ui, right ? REAR.x + REAR.w + 26 : REAR.x - 26, REAR.y + 34, ux, uy, col);
      const side = right ? 'r' : 'l';
      if (sides[side] === null || rank(col) > rank(sides[side]!)) sides[side] = col;
    }
  }
  if (sides.l !== null) ui.fill(REAR.x - 3, REAR.y - 1, 2, REAR.h + 3, sides.l);
  if (sides.r !== null) ui.fill(REAR.x + REAR.w + 1, REAR.y - 1, 2, REAR.h + 3, sides.r);
}

/** The mirror's whole frame lit in one color (gold: a Rammer behind you just opened its back). */
export function drawMirrorFrame(ui: UI, color: number) {
  ui.fill(REAR.x - 3, REAR.y - 1, 2, REAR.h + 3, color);
  ui.fill(REAR.x + REAR.w + 1, REAR.y - 1, 2, REAR.h + 3, color);
  ui.fill(REAR.x - 3, REAR.y + REAR.h + 1, REAR.w + 6, 2, color);
}
