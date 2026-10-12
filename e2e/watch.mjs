// Watch a bot play: a real encounter in first person under one of the strategy bots (src/sim/bots),
// screenshotting the moments that matter (windups, locks, charges, rips, tears, bolts, hits) and
// a frame every few seconds, with the event log. For judging the presentation in motion, and for
// the critic. Writes e2e/out/watch/*.png and events.json.
// Usage: node e2e/watch.mjs [seconds=40] [seed=7] [bot=hitAndRunBot] [--booster|--treads|--plow|--jaws] [--yard=kennel]
import fs from 'node:fs';
import { serve, launch, ready, OUT } from './serve.mjs';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const secs = Number(args[0] ?? 40), seed = Number(args[1] ?? 7), botName = args[2] ?? 'hitAndRunBot';
const part = ['booster', 'treads', 'plow', 'jaws'].find((p) => process.argv.includes(`--${p}`)) ?? null;
const yard = process.argv.find((a) => a.startsWith('--yard='))?.slice(7) ?? 'ring';
const dir = `${OUT}/watch`;
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const srv = await serve();
const { browser, page, errors } = await launch({ width: 1280, height: 720 });
const log = [];
try {
  await page.goto(srv.url);
  await ready(page);
  await page.evaluate(async ([seed, botName, part, yard]) => {
    const bots = await import('/src/sim/bots.ts');
    const world = await import('/src/sim/world.ts');
    const a = window.__app;
    a.startPlay(seed, yard);
    a.play.record = false;
    if (part) world.giveBolted(a.play.world, part);
    a.play.autopilot = bots[botName]();
    a.play.world.player.hull = 99;
    window.__seen = 0;
  }, [seed, botName, part, yard]);
  const KEY = new Set(['lock', 'charge', 'tear', 'bolted', 'hurt', 'knock', 'shatter', 'wreck', 'joust', 'draft', 'stun']);
  const t0 = Date.now();
  let n = 0, lastShot = 0;
  while (Date.now() - t0 < secs * 1000) {
    await page.waitForTimeout(120);
    const ev = await page.evaluate(() => {
      const p = window.__app.play;
      const out = p.recent.slice(window.__seen ?? 0);
      window.__seen = p.recent.length;
      return { ev: out.map((e) => e.k), tick: p.world.tick, result: p.world.result, wave: p.world.wave.index + 1 };
    });
    for (const k of ev.ev) log.push({ t: ev.tick, k });
    const key = ev.ev.find((k) => KEY.has(k));
    const now = Date.now();
    if (key || now - lastShot > 4000) {
      await page.screenshot({ path: `${dir}/${String(n++).padStart(2, '0')}-w${ev.wave}-${key ?? 'frame'}-t${ev.tick}.png` });
      lastShot = now;
    }
    if (ev.result) break;
  }
  fs.writeFileSync(`${dir}/events.json`, JSON.stringify(log));
  const count = (k) => log.filter((e) => e.k === k).length;
  console.log(`${n} shots in ${dir}; rips ${count('rip')} hits ${count('hit')} tears ${count('tear')} bolted ${count('bolted')} hurt ${count('hurt') + count('knock') + count('shatter')} wrecks ${count('wreck')}`);
  if (errors.length) console.log('console errors:\n' + errors.join('\n'));
} finally {
  await browser.close();
  await srv.close();
}
