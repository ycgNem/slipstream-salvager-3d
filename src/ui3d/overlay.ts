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
    const want = Math.round(speedLines * 26);
    while (this.lines.length < want) this.lines.push({ a: this.rnd() * Math.PI * 2, r: 0.55 + this.rnd() * 0.3, v: 1.6 + this.rnd() * 1.6, len: 0.05 + this.rnd() * 0.12, c: this.rnd() < 0.3 ? C.speed4 : this.rnd() < 0.6 ? C.speed3 : C.frost });
    for (const l of this.lines) l.r += l.v * dt;
    this.lines = this.lines.filter((l) => l.r < 1.25);
    if (this.lines.length > want) this.lines.length = want;
  }

  draw(ui: UI, cam: THREE.Camera, w: World | null, opts: { reticle: number | null; hfov: number; stun: boolean; time: number; rear: boolean }) {
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
    // for more turn than the body can give (the scrub made visible)
    if (opts.reticle !== null) {
      const half = THREE.MathUtils.degToRad(opts.hfov) / 2;
      const off = Math.max(-1.4, Math.min(1.4, opts.reticle));
      const rx = Math.round(320 + (Math.tan(Math.max(-half * 0.98, Math.min(half * 0.98, off))) / Math.tan(half)) * 320);
      const ry = 196;
      // the nose tick
      ui.fill(319, ry - 3, 2, 2, C.frost);
      ui.fill(319, ry + 3, 2, 2, C.frost);
      if (Math.abs(rx - 320) > 2) {
        const c = Math.abs(off) > 0.5 ? C.cruiseHi : C.mist;
        ui.fill(rx - 3, ry, 2, 2, c);
        ui.fill(rx + 2, ry, 2, 2, c);
        ui.fill(rx - 1, ry - 2, 2, 1, c);
        ui.fill(rx - 1, ry + 3, 2, 1, c);
        for (let x = Math.min(rx, 320) + 3; x < Math.max(rx, 320) - 3; x += 3) ui.fill(x, ry + 1, 1, 1, C.slate);
      }
    }
    // floating texts
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
    }
    // the stun stars
    if (opts.stun) {
      for (let i = 0; i < 5; i++) {
        const a = opts.time * 6 + (i * Math.PI * 2) / 5;
        ui.fill(Math.round(320 + Math.cos(a) * 34), Math.round(top + 22 + Math.sin(a) * 6), 2, 2, i % 2 ? C.white : C.frost);
      }
    }
    // the wave banner
    if (this.banner) {
      const b = this.banner;
      if (!(b.t < 0.3 && Math.floor(b.t * 20) % 2 === 1)) {
        const y = 120;
        const tw = textWidth(b.text) * 3;
        ui.fill(320 - tw / 2 - 10, y - 6, tw + 20, b.sub ? 40 : 30, C.ink);
        ui.text(b.text, 320, y, C.white, { align: 'center', scale: 3, shadow: C.plum });
        if (b.sub) ui.text(b.sub, 320, y + 24, C.gold3, { align: 'center' });
      }
    }
  }
}

/**
 * Edge markers: a Rammer winding up (or charging) where the main view can't see it gets an arrow
 * on the frame edge in its direction (behind you is the bottom edge), grey while it is still
 * aiming, flashing danger red once its lane locks, solid red while it charges.
 */
export function drawMarkers(ui: UI, cam: THREE.PerspectiveCamera, w: World, pos: (id: number) => THREE.Vector3 | null, time: number, rear: boolean) {
  const inv = new THREE.Matrix4().copy(cam.matrixWorld).invert();
  const top = rear ? REAR.y + REAR.h + 6 : 8;
  for (const r of w.rammers) {
    if (r.state !== 'windup' && r.state !== 'charge') continue;
    const p = pos(r.id);
    if (!p) continue;
    const v = p.clone().project(cam);
    if (v.z < 1 && Math.abs(v.x) < 0.98 && Math.abs(v.y) < 0.98) continue; // in view
    const c = p.clone().applyMatrix4(inv); // camera space: x right, z toward the viewer
    // the direction on screen: forward is up, right is right, behind is down
    const dx = c.x, dy = c.z;
    const m = Math.hypot(dx, dy) || 1;
    const ux = dx / m, uy = dy / m;
    // from the centre to the inset frame edge
    const cx = 320, cy = 200, hx = 300, hyTop = cy - top, hyBot = 360 - 26 - cy;
    const kx = Math.abs(ux) > 1e-6 ? hx / Math.abs(ux) : Infinity;
    const ky = uy < 0 ? hyTop / -uy : uy > 0 ? hyBot / uy : Infinity;
    const k = Math.min(kx, ky);
    const ax = Math.round(cx + ux * k), ay = Math.round(cy + uy * k);
    const locked = r.state === 'charge' || r.locked;
    const flash = r.state === 'windup' && r.locked && Math.floor(time * 12) % 2 === 1;
    const col = r.state === 'charge' ? C.danger3 : locked ? (flash ? C.dangerPink : C.danger3) : C.mist;
    // an arrow: a filled triangle pointing outward, outlined in ink
    const tri = (s: number, color: number) => {
      const bx = ax - ux * 10, by = ay - uy * 10, px = -uy, py = ux;
      for (let t = 0; t <= 1.0001; t += 0.1) {
        const lx = bx + px * s * (1 - t) + ux * 10 * t, ly = by + py * s * (1 - t) + uy * 10 * t;
        const rx = bx - px * s * (1 - t) + ux * 10 * t, ry = by - py * s * (1 - t) + uy * 10 * t;
        pxLine(ui.ctx, lx, ly, rx, ry, color);
      }
    };
    tri(8, C.ink);
    tri(6, col);
  }
}
