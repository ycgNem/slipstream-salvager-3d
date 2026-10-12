// Runs the strategy bots on several seeds and prints what they achieved, to tune the slice and
// set the thresholds in tests/guards.test.ts. Usage: npx vite-node scripts/bots.ts
import { createWorld, type World } from '../src/sim/world';
import { step } from '../src/sim/tick';
import { brawlerBot, hitAndRunBot, lanerBot, looperBot, matadorBot, turretBot, type Bot } from '../src/sim/bots';

function play(bot: Bot, seed: number, secs: number, untilWave = 1) {
  const w = createWorld({ seed });
  for (let i = 0; i < secs * 60; i++) {
    step(w, bot(w));
    w.events.length = 0;
    if (w.result) break;
    if (w.wave.index >= untilWave) break;
  }
  return w;
}

function line(name: string, ws: World[]) {
  const sum = (f: (w: World) => number) => ws.reduce((a, w) => a + f(w), 0);
  const dealt = sum((w) => w.stats.damageDealt), taken = sum((w) => w.stats.hitsTaken);
  const cleared = ws.filter((w) => w.wave.index >= 1 || w.result === 'cleared').length;
  const secs = sum((w) => w.stats.ticks) / ws.length / 60;
  console.log(
    `${name.padEnd(12)} wave1 cleared ${cleared}/${ws.length}  dmg ${dealt}  hits taken ${taken}  dmg/hit ${(dealt / Math.max(1, taken)).toFixed(2)}  tears ${sum((w) => w.stats.tears)}  slip ${sum((w) => w.stats.slipHits)} cruise ${sum((w) => w.stats.cruiseHits)} crawl ${sum((w) => w.stats.crawlHits)}  avg ${secs.toFixed(1)}s  scrapped ${ws.filter((w) => w.result === 'scrapped').length}`,
  );
}

const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
for (const [name, mk] of [['turret', turretBot], ['brawler', brawlerBot], ['matador', matadorBot], ['hit-and-run', hitAndRunBot]] as const) {
  line(name, seeds.map((s) => play(mk(), s, 90)));
}
// whole slice for hit-and-run
{
  const ws = seeds.map((s) => play(hitAndRunBot(), s, 300, 99));
  console.log('hit-and-run full slice:', ws.map((w) => `${w.result ?? 'w' + (w.wave.index + 1)}:${(w.stats.ticks / 60).toFixed(0)}s hull${w.player.hull} part:${w.player.part ?? '-'}`).join('  '));
}

// route flip: share of time at Slipstream over 40 s
function route(bot: Bot, booster: boolean) {
  const w = createWorld({ seed: 1, sandbox: true });
  if (booster) w.player.part = 'booster';
  for (let i = 0; i < 2400; i++) {
    step(w, bot(w));
    w.events.length = 0;
  }
  const tt = w.stats.tierTicks;
  return tt.slip / (tt.slip + tt.cruise + tt.crawl);
}
for (const booster of [false, true]) {
  console.log(`route ${booster ? 'booster' : 'base   '}  looper ${(route(looperBot(), booster) * 100).toFixed(0)}%  laner ${(route(lanerBot(), booster) * 100).toFixed(0)}%`);
}
