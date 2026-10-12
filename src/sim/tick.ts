// One simulation tick, systems in a fixed order (PLAN.md architecture rule 6):
// input → player movement → rip/burn → enemies → collisions → hits and tear-offs → towed part and
// pickups → bolting → waves.
import { drift, movePlayer, settleFacing, steer } from './body';
import { autoRelease, releaseBurn, resolveRipHits, tryAttack, updateRip } from './rip';
import { checkDrafts, resolveContacts, updateRammers } from './rammer';
import { startBolt, updateBolt, updatePickups, updateTow } from './salvage';
import { updateWaves } from './waves';
import { DT, type InputFrame, type World } from './world';

/** How long a Rip pressed too early is remembered (s). */
const RIP_BUFFER = 0.12;

/**
 * Advance the world one tick. Returns false if it didn't advance (hit-stop or the encounter is
 * over), so a caller that latches button presses knows to keep them for the next tick.
 */
export function step(w: World, input: InputFrame): boolean {
  if (w.result) return false;
  if (w.hitstop > 0) {
    w.hitstop--;
    return false;
  }
  const p = w.player;
  w.tick++;
  w.stats.ticks++;
  p.invuln = Math.max(0, p.invuln - DT);
  p.ripCd = Math.max(0, p.ripCd - DT);
  p.pass = Math.max(0, p.pass - DT);
  p.knock = Math.max(0, p.knock - DT);
  p.stun = Math.max(0, p.stun - DT);
  p.ripBuf = Math.max(0, p.ripBuf - DT);
  if (p.rev !== null) {
    const before = p.rev;
    p.rev += DT;
    // held past the tap window: now it's a Burn (the lane shows, the heading locks)
    if (before < w.t.burnTapTime && p.rev >= w.t.burnTapTime) w.events.push({ k: 'rev' });
  }

  // button edges
  const ripEdge = input.rip && !p.prevRip;
  const boltEdge = input.bolt && !p.prevBolt;
  p.prevRip = input.rip;
  p.prevBolt = input.bolt;
  if (ripEdge) p.ripBuf = RIP_BUFFER;

  const control = p.knock <= 0 && p.stun <= 0;
  if (control) {
    if (p.rev !== null && !input.rip) releaseBurn(w);
    // a press a moment too early fires when it can (a tap with the Booster is a plain Rip)
    if (p.ripBuf > 0 && tryAttack(w)) p.ripBuf = 0;
    if (p.rev !== null && !input.rip) releaseBurn(w);
    if (boltEdge) startBolt(w);
    steer(w, input);
  } else {
    if (p.rev !== null) p.rev = null;
    drift(w);
  }
  updateRip(w, DT);
  movePlayer(w);
  settleFacing(w, input);

  updateRammers(w);
  autoRelease(w);
  resolveRipHits(w);
  resolveContacts(w);
  checkDrafts(w);

  updateTow(w);
  updatePickups(w);
  updateBolt(w);
  updateWaves(w);

  w.stats.topSpeed = Math.max(w.stats.topSpeed, p.speed);
  w.stats.tierTicks[p.tier]++;
  return true;
}

/** Run n ticks with a constant input (tests). */
export function run(w: World, input: InputFrame, n: number) {
  for (let i = 0; i < n; i++) {
    step(w, input);
    w.events.length = 0;
  }
}
