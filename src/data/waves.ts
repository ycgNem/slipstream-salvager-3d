// The slice's encounter: three waves in The Ring (PLAN.md 4.5).

export interface WaveDef {
  /** how many Rammers, each with its booster */
  rammers: number;
  /** wave 1's safety net: a Rammer can't be wrecked while it still has its booster (DECISIONS #32) */
  safety?: boolean;
}

export const WAVES: WaveDef[] = [
  { rammers: 1, safety: true },
  { rammers: 2 },
  { rammers: 3 },
];
