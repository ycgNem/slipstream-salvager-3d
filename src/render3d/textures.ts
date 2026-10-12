// Pixel textures made in code, on the Resurrect 64 palette, nearest-filtered with no mipmaps
// (THREEJS-NOTES rule 4): the blob shadow, the particle and gate-warning textures, the backdrop sky,
// and the palette lookup table the pixel pass snaps every frame to.
import * as THREE from 'three';
import { PALETTE, PALETTE_RGB } from '../data/palette';

/** Make a texture pixel-crisp. */
export function pixelate<T extends THREE.Texture>(t: T, srgb = true): T {
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** A canvas texture painted by `paint` at w x h. */
export function canvasTexture(w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void, srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  paint(ctx);
  return pixelate(new THREE.CanvasTexture(c), srgb);
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** The round blob shadow: a dithered ellipse of plum, denser in the middle (STYLE: shadows are dither, never blur). */
export function shadowTexture(): THREE.CanvasTexture {
  return canvasTexture(32, 32, (ctx) => {
    ctx.fillStyle = PALETTE[0];
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        const d = Math.hypot((x + 0.5 - 16) / 16, (y + 0.5 - 16) / 16);
        if (d > 1) continue;
        const density = d < 0.6 ? 1 : 1 - (d - 0.6) / 0.4;
        if (BAYER4[(y % 4) * 4 + (x % 4)] / 16 < density * 0.85) ctx.fillRect(x, y, 1, 1);
      }
  });
}

/**
 * The sky behind the scrapyard: dark plum fading down to a dusky band at the horizon, banded and
 * dithered in palette colors. Mapped onto a big cylinder around the arena.
 */
export function skyTexture(): THREE.CanvasTexture {
  const W = 256, H = 64;
  return canvasTexture(W, H, (ctx) => {
    // flat bands, top to the horizon, with a two-row checker where they meet
    const bands = [0, 1, 49, 50, 54];
    const bh = H / bands.length;
    for (let y = 0; y < H; y++) {
      const i = Math.min(bands.length - 1, Math.floor(y / bh));
      const into = y - i * bh;
      for (let x = 0; x < W; x++) {
        const edge = i > 0 && into < 2 && (x + y) % 2 === 0;
        ctx.fillStyle = PALETTE[edge ? bands[i - 1] : bands[i]];
        ctx.fillRect(x, y, 1, 1);
      }
    }
    // a few stars
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 40; k++) {
      ctx.fillStyle = PALETTE[rnd() < 0.3 ? 8 : 6];
      ctx.fillRect(Math.floor(rnd() * W), Math.floor(rnd() * H * 0.4), 1, 1);
    }
  });
}

/**
 * The palette lookup table for the pixel pass: a 32x32x32 cube mapping any sRGB color to its
 * nearest Resurrect 64 color (weighted "redmean" distance), so every frame stays on the palette.
 */
export function paletteLut(): THREE.Data3DTexture {
  const N = 32;
  const data = new Uint8Array(N * N * N * 4);
  for (let b = 0; b < N; b++)
    for (let g = 0; g < N; g++)
      for (let r = 0; r < N; r++) {
        const R = (r / (N - 1)) * 255, G = (g / (N - 1)) * 255, B = (b / (N - 1)) * 255;
        let best = 0, bd = Infinity;
        for (let i = 0; i < PALETTE_RGB.length; i++) {
          const [pr, pg, pb] = PALETTE_RGB[i];
          const rm = (R + pr) / 2;
          const dr = R - pr, dg = G - pg, db = B - pb;
          const d = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
          if (d < bd) { bd = d; best = i; }
        }
        const o = ((b * N + g) * N + r) * 4;
        data[o] = PALETTE_RGB[best][0];
        data[o + 1] = PALETTE_RGB[best][1];
        data[o + 2] = PALETTE_RGB[best][2];
        data[o + 3] = 255;
      }
  const t = new THREE.Data3DTexture(data, N, N, N);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = false;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}
