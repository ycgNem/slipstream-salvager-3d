// The rules are the 2D game's, vendored (DECISIONS #1). These fail if a vendored file was edited
// here, or if the 2D project's committed copy has moved on, so every divergence is deliberate:
// either re-vendor (`npm run vendor`) or keep our copy against a DECISIONS entry
// (`node scripts/vendor.mjs --accept '#N'`), which records the 2D version it accepted: if the 2D
// project changes that file again, the test fails again. The second check only runs where the 2D
// project is on disk (not in CI).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const man: { commit: string; files: Record<string, string>; divergences: Record<string, { decision: string; at: string; theirs: string | null }> } = JSON.parse(fs.readFileSync('vendor.json', 'utf8'));
const hash = (text: string) => createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
const SRC_2D = process.env.SS2D_DIR ?? path.resolve('..', 'slipstream-salvager');

describe('vendored rules', () => {
  it('no vendored file has been edited here', () => {
    const edited = Object.entries(man.files).filter(([f, h]) => !fs.existsSync(f) || hash(fs.readFileSync(f, 'utf8')) !== h).map(([f]) => f);
    expect(edited, 'vendored files differ from vendor.json; the sim is not edited in this project').toEqual([]);
  });

  it.runIf(fs.existsSync(path.join(SRC_2D, '.git')))("matches the 2D project's committed copy, or the divergence is logged", () => {
    const drift: string[] = [];
    for (const [f, h] of Object.entries(man.files)) {
      let theirs: string | null = null;
      try {
        theirs = hash(execFileSync('git', ['--no-optional-locks', '-C', SRC_2D, 'show', `HEAD:${f}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
      } catch {
        theirs = null;
      }
      const kept = man.divergences[f];
      if (kept ? theirs !== kept.theirs : theirs !== h) drift.push(f);
    }
    expect(drift, `the 2D project changed these since ${man.commit.slice(0, 7)}: re-vendor or log the divergence`).toEqual([]);
  });
});
