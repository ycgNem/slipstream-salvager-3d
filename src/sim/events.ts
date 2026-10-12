// What happened this tick, for the presentation layer (sound, particles, hit-stop, shake) and the
// tests. The sim only appends; whoever runs it drains World.events after each tick.
import type { EnemyKind, PartId } from '../data/parts';
import type { Gate } from '../data/arena';
import type { Tier } from './world';

/** Where a hit landed on an enemy, relative to its facing. */
export type Zone = 'front' | 'side' | 'rear';

export type SimEvent =
  | { k: 'rip'; tier: Tier; burn: boolean }
  | { k: 'rev' }
  | { k: 'hit'; tier: Tier; id: number; x: number; y: number; dmg: number; zone: Zone; clang?: boolean }
  | { k: 'ram'; tier: Tier; id: number }
  | { k: 'block'; id: number; x: number; y: number }
  | { k: 'latch'; id: number }
  | { k: 'sling' }
  | { k: 'slide' }
  | { k: 'snap'; id: number }
  | { k: 'slide-e'; id: number }
  | { k: 'joust'; id: number; x: number; y: number }
  | { k: 'draft'; id: number; x: number; y: number }
  | { k: 'shove'; id: number; x: number; y: number }
  | { k: 'clank'; x: number; y: number; wall: boolean }
  | { k: 'scrape'; x: number; y: number }
  | { k: 'tear'; id: number; part: PartId; x: number; y: number }
  | { k: 'wreck'; id: number; kind: EnemyKind; x: number; y: number; lost: PartId[] }
  | { k: 'windup'; id: number; near: boolean; shove: boolean }
  | { k: 'lock'; id: number }
  | { k: 'charge'; id: number; shove: boolean }
  | { k: 'cancel'; id: number }
  | { k: 'slam'; id: number; x: number; y: number }
  | { k: 'bump'; id: number; x: number; y: number }
  | { k: 'hurt'; x: number; y: number }
  | { k: 'shatter'; part: PartId; x: number; y: number }
  | { k: 'knock'; part: PartId; x: number; y: number }
  | { k: 'crush'; part: PartId; x: number; y: number }
  | { k: 'stun'; x: number; y: number }
  | { k: 'skid' }
  | { k: 'tier'; tier: Tier; prev: Tier }
  | { k: 'grab'; part: PartId }
  | { k: 'drop'; part: PartId; x: number; y: number }
  | { k: 'pickup'; part: PartId }
  | { k: 'bolt-start' }
  | { k: 'bolt-tick'; n: number }
  | { k: 'bolted'; part: PartId }
  | { k: 'bolt-cancel' }
  | { k: 'wave'; n: number }
  | { k: 'gate'; gate: Gate['id'] }
  | { k: 'enter'; id: number; gate: Gate['id'] }
  | { k: 'cleared' }
  | { k: 'yard-clear'; patched: boolean }
  | { k: 'exit'; option: number }
  | { k: 'scrapped' };
