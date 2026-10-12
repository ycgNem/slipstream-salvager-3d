// Sprites import: turns generated PNGs (PixelLab objects, review candidates, cut-outs of bigger
// images) into one packed sheet whose frames take over procedural sprites by name. Characters use
// scripts/art-import.mjs instead; terrain uses scripts/terrain-import.mjs.
//
// Usage: node scripts/sprites-import.mjs art/<group>/sprites.json [--force]
//
// Recipe (paths relative to the recipe file):
//   name      output name: src/art/<name>.png + .json
//   kind      "sprites"
//   defaults  default fields for every entry (frame, origin, at, place, …)
//   sprites   list of entries, first match wins at runtime, so list specific names before patterns:
//     match    sprite name, or a pattern: `*` matches one `:`-segment, a final `**` the rest
//              ("crop:radish:2:*:*:0", "tree:oak:4:**")
//     file     source PNG (integer upscaling is undone, colors snap to the palette)
//     rect     [x, y, w, h] cut from the source (source pixels after unscaling)
//     like     reuse the pixels of an earlier entry (its `match`), e.g. with a recolor
//     frame    output size [w, h] (what the procedural sprite had; see src/render/art/)
//     origin   the sprite's anchor offset [ox, oy] (same as the procedural sprite's ox/oy)
//     place    "at" (default when `at` is set): the art's bottom-center lands on `at` = [x, y]
//              "center": art centered in the frame; "none": the image is copied at (0, 0) as is
//     at       [x, y] frame pixel for the art's bottom-center (x = center column, y = lowest row)
//     flipX    store mirrored
//     recolor  { "#from": "#to" } palette swap applied when the game cuts the frame (seasons,
//              tiers); both colors must be palette colors
//     keepStrays  keep isolated single pixels (default: removed, generators leave noise)
//     kL       color snap lightness weight (default 2; 1 = textbook CIEDE2000)
import fs from 'node:fs';
import path from 'node:path';
import { encodePNG, upscale } from './lib/png.mjs';
import { ROOT, PAL, loadArt, bbox, crop, blank, blit, dropStrays, strays, sameImage, pack, hex } from './lib/pixel.mjs';

const args = process.argv.slice(2);
const force = args.includes('--force');
const recipeFile = path.resolve(args.find((a) => !a.startsWith('--')) ?? '');
if (!fs.existsSync(recipeFile)) { console.error('usage: node scripts/sprites-import.mjs <recipe.json> [--force]'); process.exit(2); }
const R = JSON.parse(fs.readFileSync(recipeFile, 'utf8'));
const base = path.dirname(recipeFile);
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');
const problems = [], warnings = [];

const memo = new Map();
function source(file, scale, kL) {
  const key = `${file}|${scale}|${kL}`;
  if (!memo.has(key)) {
    const L = loadArt(path.resolve(base, file), scale ?? R.scale ?? 'auto', { kL });
    const tag = rel(L.file);
    if (L.offGrid / L.blocks > 0.1) problems.push(`${tag}: ${Math.round((100 * L.offGrid) / L.blocks)}% of blocks off the pixel grid`);
    const farPct = (100 * L.q.far) / Math.max(1, L.q.opaque);
    if (farPct > 10) problems.push(`${tag}: ${farPct.toFixed(1)}% of pixels far (dE00 > 15) from the palette; regenerate in warmer colors`);
    else if (farPct > 3) warnings.push(`${tag}: ${farPct.toFixed(1)}% of pixels moved far when snapped`);
    memo.set(key, L);
  }
  return memo.get(key);
}

const out = []; // { match, img, o, flipX, recolor }
const byMatch = new Map();
for (const [n, raw] of R.sprites.entries()) {
  const e = { ...(R.defaults ?? {}), ...raw };
  const tag = `#${n} ${e.match}`;
  if (!e.match) { problems.push(`${tag}: no match`); continue; }
  for (const [a, b] of Object.entries(e.recolor ?? {}))
    if (!PAL.includes(a.toLowerCase()) || !PAL.includes(b.toLowerCase())) problems.push(`${tag}: recolor ${a} -> ${b} uses a color outside the palette`);
  if (e.like) {
    const src = byMatch.get(e.like);
    if (!src) { problems.push(`${tag}: like "${e.like}" is not an earlier entry`); continue; }
    const s = { ...src, match: e.match, recolor: raw.recolor ?? src.recolor, flipX: raw.flipX ?? src.flipX, o: raw.origin ?? src.o };
    out.push(s);
    byMatch.set(e.match, s);
    continue;
  }
  if (!e.file) { problems.push(`${tag}: no file or like`); continue; }
  const L = source(e.file, e.scale, e.kL ?? 2);
  let art = e.rect ? crop(L.img, ...e.rect) : { ...L.img, data: new Uint8Array(L.img.data) };
  if (!e.keepStrays) dropStrays(art);
  else if (strays(art) > 3) warnings.push(`${tag}: ${strays(art)} stray pixels kept`);
  const place = e.place ?? (e.at ? 'at' : e.frame ? 'center' : 'trim');
  let img;
  if (place === 'none') {
    const [w, h] = e.frame ?? [art.w, art.h];
    img = blank(w, h);
    blit(img, art, 0, 0);
    if (art.w > w || art.h > h) warnings.push(`${tag}: source ${art.w}x${art.h} clipped to ${w}x${h}`);
  } else {
    const b = bbox(art);
    if (!b) { problems.push(`${tag}: empty art`); continue; }
    const cut = crop(art, b.x0, b.y0, b.x1 - b.x0 + 1, b.y1 - b.y0 + 1);
    const [w, h] = place === 'trim' ? [cut.w, cut.h] : e.frame;
    img = blank(w, h);
    let dx, dy;
    if (place === 'at') { dx = e.at[0] - Math.floor(cut.w / 2); dy = e.at[1] - (cut.h - 1); }
    else if (place === 'center') { dx = Math.floor((w - cut.w) / 2); dy = Math.floor((h - cut.h) / 2); }
    else { dx = 0; dy = 0; }
    const clipped = blit(img, cut, dx, dy);
    if (clipped) problems.push(`${tag}: art ${cut.w}x${cut.h} does not fit the ${w}x${h} frame (${clipped} px clipped); make it smaller or change frame/at`);
  }
  const s = { match: e.match, img, o: e.origin ?? [0, 0], flipX: !!e.flipX, recolor: e.recolor };
  out.push(s);
  byMatch.set(e.match, s);
}
for (const L of memo.values()) console.log(`  ${rel(L.file)}: ${L.raw.w}x${L.raw.h}${L.k > 1 ? ` (x${L.k})` : ''}, ${L.q.colorsOut.size} colors, mean dE ${L.q.meanD.toFixed(1)}`);

// ---- pack (identical frames share one rect) ----
const uniq = [];
for (const s of out) {
  let u = uniq.find((q) => sameImage(q.img, s.img));
  if (!u) { u = { img: s.img }; uniq.push(u); }
  s.u = u;
}
// at least as wide as the widest frame (a wide frame such as the title wordmark used to be clipped)
const width = Math.max(128, ...uniq.map((u) => u.img.w), Math.min(1024, 2 ** Math.ceil(Math.log2(Math.sqrt(uniq.reduce((a, u) => a + (u.img.w + 1) * (u.img.h + 1), 0)) * 1.3))));
const { pos, height } = pack(uniq.map((u) => u.img), width);
const sheet = blank(width, Math.max(1, height));
uniq.forEach((u, i) => { u.x = pos[i].x; u.y = pos[i].y; blit(sheet, u.img, u.x, u.y); });

for (const w of warnings) console.log('  warning: ' + w);
for (const p of problems) console.log('  PROBLEM: ' + p);
if (problems.length && !force) { console.log(`REJECT ${R.name}: ${problems.length} problem(s). Fix them or pass --force.`); process.exit(1); }

const outDir = path.resolve(ROOT, R.out ?? 'src/art');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, R.name + '.png'), encodePNG(sheet.w, sheet.h, sheet.data));
const used = new Set();
for (let i = 0; i < sheet.data.length; i += 4) if (sheet.data[i + 3]) used.add(hex(sheet.data[i], sheet.data[i + 1], sheet.data[i + 2]));
const manifest = {
  name: R.name, kind: 'sprites', file: R.name + '.png', palette: 'Resurrect 64',
  ...(R.meta ? { meta: R.meta } : {}),
  sprites: out.map((s) => ({ match: s.match, r: [s.u.x, s.u.y, s.img.w, s.img.h], o: s.o, ...(s.flipX ? { flipX: true } : {}), ...(s.recolor ? { recolor: s.recolor } : {}) })),
};
// one sprite per line keeps the diffs readable
const json = JSON.stringify({ ...manifest, sprites: [] }, null, 1).replace('"sprites": []', '"sprites": [\n' + manifest.sprites.map((s) => '  ' + JSON.stringify(s)).join(',\n') + '\n ]');
fs.writeFileSync(path.join(outDir, R.name + '.json'), json + '\n');

// preview: every entry in recipe order, x3, in cells on a checkerboard (index = cell number)
const prevDir = path.join(ROOT, 'e2e/out/art');
fs.mkdirSync(prevDir, { recursive: true });
const CW = Math.max(...out.map((s) => s.img.w)), CHH = Math.max(...out.map((s) => s.img.h)), COLS = Math.min(16, out.length);
const grid = blank(COLS * (CW + 2), Math.ceil(out.length / COLS) * (CHH + 2));
for (let i = 0; i < grid.data.length; i += 4) {
  const x = (i / 4) % grid.w, y = Math.floor(i / 4 / grid.w);
  const cx = Math.floor(x / (CW + 2)), cy = Math.floor(y / (CHH + 2));
  grid.data.set(((x >> 2) + (y >> 2)) & 1 ? [58, 52, 64, 255] : [(cx + cy) & 1 ? 84 : 74, 66, 80, 255], i);
}
out.forEach((s, i) => {
  const im = s.recolor ? recolored(s.img, s.recolor) : s.img;
  blit(grid, im, (i % COLS) * (CW + 2) + 1, Math.floor(i / COLS) * (CHH + 2) + 1, s.flipX);
});
function recolored(img, map) {
  const m = new Map(Object.entries(map).map(([a, b]) => [a.toLowerCase(), b.toLowerCase()]));
  const o = { ...img, data: new Uint8Array(img.data) };
  for (let i = 0; i < o.data.length; i += 4) {
    if (!o.data[i + 3]) continue;
    const to = m.get(hex(o.data[i], o.data[i + 1], o.data[i + 2]));
    if (to) o.data.set([1, 3, 5].map((j) => parseInt(to.slice(j, j + 2), 16)), i);
  }
  return o;
}
const pv = upscale(grid, 3);
fs.writeFileSync(path.join(prevDir, R.name + '.preview.png'), encodePNG(pv.w, pv.h, pv.data));
console.log(`${problems.length ? 'FORCED' : 'OK'} ${R.name}: ${rel(path.join(outDir, R.name + '.png'))} (${sheet.w}x${sheet.h}, ${out.length} sprites, ${uniq.length} unique frames, ${used.size} colors); preview e2e/out/art/${R.name}.preview.png (${COLS} per row, recipe order)`);
