// Perf (THREEJS-NOTES rule 13): frames per second, draw calls and triangles per frame (every pass:
// the world, the claw, the rear strip, the composite and the blit), in headless SwiftShader, the
// proxy for a weak laptop (budget >= 15 fps there; <= 60 draw calls and <= 20k triangles anywhere).
// Plays wave 3 (three Rammers) under the hit-and-run bot. Writes e2e/out/perf.json.
// Usage: node e2e/perf.mjs
import fs from 'node:fs';
import { serve, launch, ready, OUT } from './serve.mjs';

const srv = await serve();
const { browser, page, errors } = await launch({ width: 1280, height: 720 });
let res;
try {
  await page.goto(srv.url);
  await ready(page);
  res = await page.evaluate(async () => {
    const a = window.__app;
    const bots = await import('/src/sim/bots.ts');
    a.startPlay(11);
    const w = a.play.world;
    w.player.hull = 99;
    w.wave.index = 2; // the last wave: three Rammers
    w.wave.phase = 'banner';
    w.wave.t = 0;
    a.play.autopilot = bots.hitAndRunBot();
    await new Promise((r) => setTimeout(r, 3500)); // the banner and the gates
    const out = { frames: 0, calls: 0, tris: 0, maxCalls: 0, maxTris: 0 };
    const t0 = performance.now();
    await new Promise((done) => {
      const f = () => {
        out.frames++;
        out.calls += a.view.stats.calls;
        out.tris += a.view.stats.triangles;
        out.maxCalls = Math.max(out.maxCalls, a.view.stats.calls);
        out.maxTris = Math.max(out.maxTris, a.view.stats.triangles);
        if (performance.now() - t0 < 6000) requestAnimationFrame(f);
        else done();
      };
      requestAnimationFrame(f);
    });
    const secs = (performance.now() - t0) / 1000;
    return { fps: out.frames / secs, avgCalls: out.calls / out.frames, avgTris: out.tris / out.frames, maxCalls: out.maxCalls, maxTris: out.maxTris, rammers: w.rammers.length, particles: a.stage.particles.count, renderer: a.view.renderer.getContext().getParameter(a.view.renderer.getContext().RENDERER) };
  });
} finally {
  await browser.close();
  await srv.close();
}
fs.writeFileSync(`${OUT}/perf.json`, JSON.stringify(res, null, 2));
console.log(`fps ${res.fps.toFixed(1)}  draw calls avg ${res.avgCalls.toFixed(1)} max ${res.maxCalls}  triangles avg ${Math.round(res.avgTris)} max ${res.maxTris}  (rammers ${res.rammers}, particles ${res.particles}; ${res.renderer})`);
const ok = res.fps >= 15 && res.maxCalls <= 60 && res.maxTris <= 20000;
console.log(ok ? 'within budget' : 'OVER BUDGET (fps >= 15, calls <= 60, tris <= 20k)');
if (errors.length) console.log('console errors:\n' + errors.join('\n'));
process.exit(ok && !errors.length ? 0 : 1);
