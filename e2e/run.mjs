// A whole run in the real app, fast-forwarded: the drafter bot (with a hull it can't lose) plays
// every yard of a run through the real presentation (Play.tick feeding the stage, the HUD, hints,
// exits and signs, a real frame drawn between chunks of ticks), so every yard's arena builds,
// every exit leads on through the wipe, and the run ends on its results with no console errors.
// It checks the presentation, not difficulty: the rule bots are weak against Snappers (2D
// DECISIONS #74), so a wave the bot hasn't finished in 90 s of sim is cleared for it (counted).
// Screenshots each new yard to e2e/out/run/. Usage: node e2e/run.mjs [seed=5] [seed...]
import fs from 'node:fs';
import { serve, launch, ready, OUT } from './serve.mjs';

const seeds = process.argv.slice(2).map(Number).filter((n) => n > 0);
if (!seeds.length) seeds.push(5);
const dir = `${OUT}/run`;
fs.mkdirSync(dir, { recursive: true });
const srv = await serve();
const { browser, page, errors } = await launch({ width: 1280, height: 720 });
let failed = false;
try {
  await page.goto(srv.url);
  await ready(page);
  for (const seed of seeds) {
    await page.evaluate(async (seed) => {
      const a = window.__app;
      const bots = await import('/src/sim/bots.ts');
      a.startPlay(seed);
      a.play.record = false;
      a.play.hints.enabled = false;
      a.play.autopilot = bots.drafterBot(seed % 2);
      window.__run = { yards: [], arenas: [], worlds: new Set(), ticks: 0, forced: 0, waveAt: 0, wave: -1 };
    }, seed);
    const t0 = Date.now();
    let shots = 0;
    for (;;) {
      const s = await page.evaluate(async () => {
        const a = window.__app, p = a.play, r = window.__run;
        if (!r.worlds.has(p.world)) {
          // a new yard: the bot can't lose its hull, and we note where we are
          r.worlds.add(p.world);
          p.world.player.hull = 99;
          r.yards.push(p.run.yard);
        }
        for (let i = 0; i < 240 && !p.wipe && !p.over; i++) {
          p.tick();
          r.ticks++;
          const w = p.world;
          if (w.wave.index !== r.wave) {
            r.wave = w.wave.index;
            r.waveAt = w.stats.ticks;
          }
          if (w.wave.phase === 'fight' && w.enemies.length && w.stats.ticks - r.waveAt > 60 * 90) {
            w.enemies.length = 0;
            r.forced++;
          }
        }
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        const arena = a.stage.arena?.group?.children?.length ?? 0;
        return { yard: p.run.yard, depth: p.run.depth, over: p.over, result: p.world.result, wipe: !!p.wipe, endT: p.endT, n: r.worlds.size, arena, ticks: r.ticks, enemies: p.world.enemies.length };
      });
      if (s.n > shots && !s.wipe) {
        shots = s.n;
        await page.screenshot({ path: `${dir}/seed${seed}-yard${s.depth}-${s.yard}.png` });
      }
      if (s.over && s.endT > 1.5) {
        await page.screenshot({ path: `${dir}/seed${seed}-results.png` });
        const r = await page.evaluate(() => ({ yards: window.__run.yards, forced: window.__run.forced, over: window.__app.play.run.over, totals: window.__app.play.run.totals }));
        const ok = r.over === 'won' && r.yards.length === 5 && r.yards[0] === 'ring' && r.yards[4] === 'heap' && new Set(r.yards).size === 5;
        console.log(`${ok ? 'ok  ' : 'FAIL'} seed ${seed}: ${r.over} through ${r.yards.join(' > ')} in ${(r.totals.ticks / 3600).toFixed(1)} min of sim, ${r.totals.tears} parts torn off, ${r.totals.wrecks} wrecked, ${r.forced} wave(s) cleared for the bot (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
        if (!ok) failed = true;
        break;
      }
      if (Date.now() - t0 > 240000) {
        console.log(`FAIL seed ${seed}: stuck in ${s.yard} (yard ${s.depth}, ${s.enemies} enemies, result ${s.result}) after ${s.ticks} ticks`);
        await page.screenshot({ path: `${dir}/seed${seed}-stuck.png` });
        failed = true;
        break;
      }
    }
  }
  if (errors.length) {
    console.log('console errors:\n' + errors.join('\n'));
    failed = true;
  }
} finally {
  await browser.close();
  await srv.close();
}
process.exit(failed ? 1 : 0);
