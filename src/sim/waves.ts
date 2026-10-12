// The encounter script (PLAN.md 4.5): a banner, a warning at the gates, the Rammers walk in, the
// fight, a breather, the next wave; clearing the last one ends the slice. No timer escalates
// anything (DECISIONS #22).
import { WAVES } from '../data/waves';
import { addRammer, DT, type World } from './world';

export function updateWaves(w: World) {
  if (w.sandbox || w.result) return;
  const wv = w.wave, t = w.t, p = w.player;
  if (wv.t === 0 && wv.phase === 'banner') w.events.push({ k: 'wave', n: wv.index + 1 });
  wv.t += DT;
  const def = WAVES[wv.index];
  switch (wv.phase) {
    case 'banner':
      if (wv.t >= t.bannerTime) {
        // the gates farthest from the player
        const n = Math.min(def.rammers, w.arena.gates.length);
        wv.gates = [...w.arena.gates]
          .sort((a, b) => Math.hypot(b.spawn.x - p.x, b.spawn.y - p.y) - Math.hypot(a.spawn.x - p.x, a.spawn.y - p.y))
          .slice(0, n);
        for (const g of wv.gates) w.events.push({ k: 'gate', gate: g.id });
        wv.phase = 'warn';
        wv.t = 0;
      }
      break;
    case 'warn':
      if (wv.t >= t.gateWarn) {
        for (const g of wv.gates) {
          const r = addRammer(w, g.spawn.x, g.spawn.y, Math.atan2(g.dir.y, g.dir.x), { safety: def.safety, state: 'enter' });
          r.enter = { ...g.dir };
          w.events.push({ k: 'enter', id: r.id, gate: g.id });
        }
        wv.phase = 'fight';
        wv.t = 0;
      }
      break;
    case 'fight':
      if (w.rammers.length === 0) {
        if (wv.index >= WAVES.length - 1) {
          wv.phase = 'done';
          w.result = 'cleared';
          w.events.push({ k: 'cleared' });
        } else {
          wv.phase = 'breather';
          wv.t = 0;
        }
      }
      break;
    case 'breather':
      if (wv.t >= t.breather) {
        wv.index++;
        wv.phase = 'banner';
        wv.t = 0;
      }
      break;
  }
}
