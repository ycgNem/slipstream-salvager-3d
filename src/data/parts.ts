// Parts: what you tear off enemies and bolt on. A part is a behavior module, not a stat sheet:
// `behavior` must say how it changes the way you play (a data test fails if it's empty; PLAN.md
// architecture rule 4). Stat multipliers name tuning keys so the tuning panel can edit them.
import type { TuningKey } from './tuning';
import type { MountSlot } from './mounts';

export type PartId = 'booster';
export type AttackMode = 'rip' | 'burn';

/** Which chassis stat a multiplier scales. */
export type StatKey = 'topSpeed' | 'turnLow' | 'turnHigh';

export interface PartDef {
  id: PartId;
  name: string;
  mount: MountSlot;
  /** the enemy that carries it */
  from: 'rammer';
  /** chassis stat -> the tuning key holding its multiplier */
  stats: Partial<Record<StatKey, TuningKey>>;
  behavior: {
    /** replaces the Rip */
    attack?: AttackMode;
  };
  /** one line for the HUD and hints */
  blurb: string;
}

export const PARTS: Record<PartId, PartDef> = {
  booster: {
    id: 'booster',
    name: 'Booster',
    mount: 'rear',
    from: 'rammer',
    stats: { topSpeed: 'boosterTopMul', turnLow: 'boosterTurnLowMul', turnHigh: 'boosterTurnHighMul' },
    behavior: { attack: 'burn' },
    blurb: 'Hold Rip to rev in a straight line, release to burn through.',
  },
};
