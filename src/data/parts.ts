// Parts: what you tear off enemies and bolt on. A part is a behavior module, not a stat sheet:
// `behavior` must say how it changes the way you play (a data test fails if it's empty; PLAN.md
// architecture rule 4). Stat multipliers name tuning keys so the tuning panel can edit them.
// Every part sits on one of three mounts, each tied to one verb (PLAN.md 8.2), and comes off an
// enemy that visibly moves that way ("you become what you rip").
import type { TuningKey } from './tuning';
import type { MountSlot } from './mounts';

export type PartId = 'booster' | 'treads' | 'plow' | 'jaws';
export type AttackMode = 'rip' | 'burn';
export type EnemyKind = 'rammer' | 'snapper';

/** Which chassis stat a multiplier scales. */
export type StatKey = 'topSpeed' | 'turnLow' | 'turnHigh' | 'scrubLat' | 'accHigh';

export interface PartDef {
  id: PartId;
  name: string;
  mount: MountSlot;
  /** the enemy that carries it */
  from: EnemyKind;
  /** chassis stat -> the tuning key holding its multiplier */
  stats: Partial<Record<StatKey, TuningKey>>;
  behavior: {
    /** replaces what holding Rip does (the Booster's Burn) */
    attack?: AttackMode;
    /** replaces the brake: a power-slide that keeps your speed (the Grip Treads) */
    brake?: 'slide';
    /** your front is a ram: contact at speed is a hit, and a charge into it is blocked (the Plow) */
    contact?: 'plow';
    /** a Slipstream hit latches on and slings you round the enemy (the Jaws) */
    onHit?: 'latch';
  };
  /** how it comes off an enemy: a Slipstream hit on its mount's zone, or only in a joust */
  tear: 'zone' | 'joust';
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
    tear: 'zone',
    blurb: 'Hold Rip to rev in a straight line, release to burn through.',
  },
  treads: {
    id: 'treads',
    name: 'Grip Treads',
    mount: 'sides',
    from: 'snapper',
    stats: { topSpeed: 'treadsTopMul', turnLow: 'treadsTurnMul', turnHigh: 'treadsTurnMul', scrubLat: 'treadsGripMul' },
    behavior: { brake: 'slide' },
    tear: 'zone',
    blurb: 'Push hard against your motion to power-slide round at speed.',
  },
  plow: {
    id: 'plow',
    name: 'Plow',
    mount: 'front',
    from: 'rammer',
    stats: { accHigh: 'plowAccMul' },
    behavior: { contact: 'plow' },
    tear: 'joust',
    blurb: 'Drive into them at teal: your front is a ram, and it blocks charges.',
  },
  jaws: {
    id: 'jaws',
    name: 'Jaws',
    mount: 'front',
    from: 'snapper',
    stats: {},
    behavior: { onHit: 'latch' },
    tear: 'zone',
    blurb: 'A teal hit bites on and slings you round, back the way you came.',
  },
};

export const PART_IDS = Object.keys(PARTS) as PartId[];
