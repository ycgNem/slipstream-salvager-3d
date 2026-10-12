#!/usr/bin/env node
// Rebuild every low-poly model: runs each art/<family>/build_<asset>.py through headless
// Blender (deterministic: same scripts -> same .glb / .png), then art/_lib/verify_models.py,
// which checks node names, budgets, materials and palettes and renders an overview.
//
//   node scripts/build-models.mjs               build everything + verify
//   node scripts/build-models.mjs rammer claw   only scripts whose path contains a filter
//                                               (verification still runs over all models)
//   BLENDER=/path/to/blender node scripts/build-models.mjs
//
// Fails (exit 1) if Blender is missing, any script raises, or verification fails.
// Never uses the Blender MCP / a running Blender: always --background --factory-startup.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const artDir = join(root, 'art');
const BLENDER =
  process.env.BLENDER ||
  'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Blender\\blender.exe';

if (!existsSync(BLENDER)) {
  console.error(`[models] Blender not found at ${BLENDER} (set BLENDER=...)`);
  process.exit(1);
}

// Scripts whose previews import other models run after them; anything new runs last.
const ORDER = [
  'arena/build_wall.py',
  'arena/build_floor.py',
  'arena/build_pillar.py',
  'arena/build_gate.py',
  'booster/build_booster.py',
  'claw/build_claw.py',
  'rammer/build_rammer.py',
  'scrapper/build_scrapper.py',
];

const found = [];
for (const fam of readdirSync(artDir).sort()) {
  const dir = join(artDir, fam);
  if (fam.startsWith('_') || !statSync(dir).isDirectory()) continue;
  for (const f of readdirSync(dir).sort()) {
    if (/^build_.*\.py$/.test(f)) found.push(`${fam}/${f}`);
  }
}
const rank = (p) => (ORDER.includes(p) ? ORDER.indexOf(p) : ORDER.length);
found.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

const filters = process.argv.slice(2);
const scripts = filters.length ? found.filter((p) => filters.some((f) => p.includes(f))) : found;
if (!scripts.length) {
  console.error(`[models] no build scripts match ${filters.join(' ')}`);
  process.exit(1);
}

function runBlender(script, label) {
  const t0 = Date.now();
  const r = spawnSync(
    BLENDER,
    ['--background', '--factory-startup', '--python-exit-code', '1', '--python', script],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const lines = out.split(/\r?\n/).filter((l) => /^\[(pix|verify)\]/.test(l));
  const crashed = r.status !== 0 || r.error || /Traceback \(most recent call last\)/.test(out);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (crashed) {
    console.error(`[models] FAILED ${label} (exit ${r.status}, ${secs}s)`);
    console.error(out.split(/\r?\n/).filter((l) => l.trim()).slice(-40).join('\n'));
    return false;
  }
  console.log(`[models] ok ${label} (${secs}s)`);
  for (const l of lines) {
    if (/TOTAL|exported|preview|FAIL|verify\]/.test(l)) console.log('   ' + l);
  }
  return true;
}

let ok = true;
for (const s of scripts) {
  ok = runBlender(join('art', s), relative(root, join(artDir, s)).replace(/\\/g, '/')) && ok;
}
ok = runBlender(join('art', '_lib', 'verify_models.py'), 'verify') && ok;
if (!ok) {
  console.error('[models] build failed');
  process.exit(1);
}
console.log('[models] all models built and verified -> public/models/*.glb, previews in e2e/out/art/');
