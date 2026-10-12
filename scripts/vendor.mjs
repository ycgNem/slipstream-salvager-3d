// Vendors the rules from the 2D game (src/sim, src/data, the sprite-name list its data test reads,
// its tests and the bots script) and writes vendor.json: the 2D commit and a hash of every file.
// tests/vendor.test.ts holds the copy to that manifest, so any drift is deliberate (DECISIONS #1).
//
// The 2D project is READ-ONLY: this only runs `git show` and `git rev-parse` there (no index
// refresh, no checkout, nothing written).
//
// Usage: node scripts/vendor.mjs [<2D commit>]       re-vendor (defaults to the 2D HEAD)
//        node scripts/vendor.mjs --check             list files that differ from the 2D HEAD
//        node scripts/vendor.mjs --accept '#21'      keep our copy of every file that differs, logged
//                                                    against a decision; the drift test passes until
//                                                    the 2D project changes that file again
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const SRC_2D = process.env.SS2D_DIR ?? path.resolve('..', 'slipstream-salvager');
/** what is vendored (directories are taken whole, at the 2D commit) */
export const VENDORED = ['src/sim', 'src/data', 'src/render/names.ts', 'src/ui/signs.ts', 'tests/combat.test.ts', 'tests/data.test.ts', 'tests/guards.test.ts', 'tests/helpers.ts', 'tests/m3.test.ts', 'tests/movement.test.ts', 'tests/run.test.ts', 'tests/salvage.test.ts', 'scripts/bots.ts'];

const git = (...args) => execFileSync('git', ['--no-optional-locks', '-C', SRC_2D, ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });
export const hash = (text) => createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);

/** Every vendored file path at a 2D commit. */
function filesAt(commit) {
  const out = [];
  for (const p of VENDORED) {
    const kind = git('cat-file', '-t', `${commit}:${p}`).trim();
    if (kind === 'tree') out.push(...git('ls-tree', '-r', '--name-only', commit, p).trim().split('\n'));
    else out.push(p);
  }
  return out;
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  if (process.argv.includes('--check')) {
    const man = JSON.parse(fs.readFileSync('vendor.json', 'utf8'));
    const head = git('rev-parse', 'HEAD').trim();
    let n = 0;
    for (const f of Object.keys(man.files)) {
      let theirs = null;
      try { theirs = git('show', `HEAD:${f}`); } catch { /* gone in 2D */ }
      if (theirs === null || hash(theirs) !== man.files[f]) { console.log(`differs: ${f}${theirs === null ? ' (deleted in 2D)' : ''}`); n++; }
    }
    for (const f of filesAt(head)) if (!(f in man.files)) { console.log(`new in 2D: ${f}`); n++; }
    console.log(`${n} difference(s) between the vendored copy (2D ${man.commit.slice(0, 7)}) and 2D HEAD ${head.slice(0, 7)}`);
    process.exit(n ? 1 : 0);
  }
  if (process.argv.includes('--accept')) {
    const decision = process.argv[process.argv.indexOf('--accept') + 1];
    if (!decision) throw new Error('--accept needs a decision, e.g. --accept "#21"');
    const man = JSON.parse(fs.readFileSync('vendor.json', 'utf8'));
    const head = git('rev-parse', 'HEAD').trim();
    let n = 0;
    for (const f of Object.keys(man.files)) {
      let theirs = null;
      try { theirs = hash(git('show', `HEAD:${f}`)); } catch { /* gone in 2D */ }
      if (theirs === man.files[f]) continue;
      man.divergences[f] = { decision, at: head, theirs };
      n++;
    }
    fs.writeFileSync('vendor.json', JSON.stringify(man, null, 2) + '\n');
    console.log(`kept our copy of ${n} file(s) that differ from 2D ${head.slice(0, 7)}, logged as ${decision}`);
    process.exit(0);
  }
  const commit = git('rev-parse', process.argv[2] ?? 'HEAD').trim();
  const files = {};
  for (const f of filesAt(commit)) {
    const text = git('show', `${commit}:${f}`);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text);
    files[f] = hash(text);
  }
  const prev = fs.existsSync('vendor.json') ? JSON.parse(fs.readFileSync('vendor.json', 'utf8')) : {};
  fs.writeFileSync('vendor.json', JSON.stringify({ from: 'C:/Users/jacks/Documents/slipstream-salvager', commit, files, divergences: prev.divergences ?? {} }, null, 2) + '\n');
  console.log(`vendored ${Object.keys(files).length} files from 2D ${commit.slice(0, 7)}`);
}
