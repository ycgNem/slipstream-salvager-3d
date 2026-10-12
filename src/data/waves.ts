// Waves: who comes in through the gates (PLAN.md 4.5, 8.5). The Ring's three are the slice; the
// yards (data/yards.ts) have their own.
import type { EnemyKind, PartId } from './parts';

export interface EnemySpec {
  kind: EnemyKind;
  /** the parts it wears; default: its kind's own (a Rammer's booster, a Snapper's treads) */
  parts?: PartId[];
}

export interface WaveDef {
  enemies: EnemySpec[];
  /** wave 1's safety net: an enemy can't be wrecked while it still has its part (DECISIONS #32) */
  safety?: boolean;
}

export const RAMMER: EnemySpec = { kind: 'rammer' };
export const SNAPPER: EnemySpec = { kind: 'snapper' };
export const PLOW_RAMMER: EnemySpec = { kind: 'rammer', parts: ['booster', 'plow'] };
export const JAW_SNAPPER: EnemySpec = { kind: 'snapper', parts: ['treads', 'jaws'] };

export const WAVES: WaveDef[] = [
  { enemies: [RAMMER], safety: true },
  { enemies: [RAMMER, RAMMER] },
  { enemies: [RAMMER, RAMMER, RAMMER] },
];
