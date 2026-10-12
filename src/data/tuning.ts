// Every movement and combat number in the slice, in one place, so the dev tuning panel can edit
// them live (PLAN.md section 4 has the reasoning; DECISIONS.md #29-#32 the review changes).
// Units: px, seconds, px/s, px/s², rad/s, degrees where the name says Deg.

export const DEFAULT_TUNING = {
  // ---- the Scrapper's movement ----
  topSpeed: 240,
  /** acceleration below accSplit px/s: instant to get moving */
  accLow: 900,
  /** acceleration above accSplit: the run-up to Slipstream (~0.8 s, ~90 px) */
  accHigh: 180,
  accSplit: 60,
  /** turn rate at rest and at top speed (rad/s) */
  turnLow: 14,
  turnHigh: 4,
  /** a turn pulling more than this sideways (speed × turn rate, px/s²) scrubs speed... */
  scrubLat: 900,
  /** ...at this share of the excess (px/s² of speed lost per px/s² over) */
  scrubK: 1,
  /** speed half-life when you let go (s) */
  coastHalf: 0.3,
  /** push more than brakeDeg against your motion to brake, then pivot below pivotSpeed */
  brakeDecel: 900,
  brakeDeg: 150,
  brakeHystDeg: 12,
  pivotSpeed: 60,
  /** how fast speed above top speed (from a lunge or a burn) falls back (half-life, s) */
  overspeedHalf: 0.25,
  playerRadius: 8,
  /** a wall hit within ~41° of head-on (|cos| above this) is a clank */
  clankCos: 0.75,
  clankKeep: 0.2,

  // ---- speed tiers (absolute, the same marks for every body) ----
  cruiseAt: 110,
  slipAt: 190,

  // ---- the Rip ----
  ripTime: 0.16,
  ripImpulse: 90,
  ripCooldown: 0.45,
  ripReach: 12,
  ripRadius: 11,
  aimAssistDeg: 12,
  aimAssistConeDeg: 35,
  aimAssistRange: 140,
  slipDamage: 2,
  /** a Slipstream hit within frontArcDeg of an enemy's front glances off its armor for this much (DECISIONS #55) */
  frontDamage: 1,
  frontArcDeg: 60,
  /** a Slipstream hit in the back (once the booster is off) is the decisive one */
  rearDamage: 4,
  /** Cruise rips push the enemy this far and cancel its windup */
  cruiseShove: 24,
  cruiseKeep: 0.85,
  hitstopCrawl: 2,
  hitstopCruise: 4,
  hitstopSlip: 7,
  hitstopTear: 9,
  /** after a rip ends you still pass through bodies this long (s) */
  passThrough: 0.08,

  // ---- the Booster and its Burn ----
  boosterTopMul: 1.125,
  boosterTurnLowMul: 0.65,
  boosterTurnHighMul: 0.65,
  burnAccel: 260,
  burnMax: 330,
  burnTime: 0.4,
  burnCooldown: 0.6,
  burnWallStun: 0.6,
  /** let go of Rip sooner than this and it's a plain Rip, not a Burn (DECISIONS #57) */
  burnTapTime: 0.15,

  // ---- the Grip Treads (PLAN.md 8.4) ----
  treadsTopMul: 0.92,
  treadsTurnMul: 1.35,
  /** you grip harder: turn scrub starts at this times the sideways pull */
  treadsGripMul: 1.4,
  /** the power-slide that replaces the brake: how fast you swing round (rad/s)... */
  slideTurn: 9,
  /** ...and the share of your speed a full 180° slide keeps */
  slideKeep: 0.88,

  // ---- the Plow ----
  plowAccMul: 0.65,
  /** contact within this of your heading is a ram hit */
  plowConeDeg: 50,
  /** how long a ram hit lets you plough through */
  plowTime: 0.18,

  // ---- the Jaws ----
  /** the swing round the bitten enemy (s) and the extra speed it flings you out with */
  latchTime: 0.2,
  slingBoost: 40,

  // ---- salvage ----
  boltTime: 0.7,
  boltSteerMul: 0.5,
  rearArcDeg: 70,
  towLen: 14,
  pickupRadius: 7,
  /** a hit knocks your part loose this fast; a cracked part shatters instead (DECISIONS #58) */
  knockLooseKick: 120,
  /** hits a part takes before it shatters: 2 = knocked loose, then shatters; 1 = the M1 rule */
  partLives: 2,

  // ---- the player's hull ----
  hull: 5,
  invulnTime: 1.0,
  knockTime: 0.3,
  knockSpeed: 160,
  /** speed kept after bumping an enemy outside a rip */
  bumpKeep: 0.4,

  // ---- the Rammer ----
  rammerHp: 3,
  rammerRadius: 11,
  stalkSpeed: 45,
  stalkTurn: 6,
  strippedSpeed: 35,
  /** stripped, it limps and turns slowly: a fast circle gets round its armored front (DECISIONS #59) */
  strippedTurn: 2.5,
  windupFar: 0.85,
  lockFar: 0.35,
  windupNear: 0.45,
  lockNear: 0.25,
  nearDist: 80,
  chargeRange: 230,
  /** it aims where you'll be if you keep going at this share of your velocity (DECISIONS #48) */
  leadFrac: 0.8,
  trackTurn: 10,
  chargeSpeed: 330,
  /** a charge runs this far past where you were when it locked, within min..max, so it always
   * stops a run-up past you and the counter-pass is on (DECISIONS #79) */
  chargeOver: 120,
  chargeMin: 220,
  chargeMax: 340,
  skidTime: 0.9,
  /** a charge that passes within this of you (edge to edge, px) gives you its slipstream... */
  draftGap: 24,
  /** ...lifting you to at least Slipstream + this (DECISIONS #61) */
  draftBoost: 30,
  /** a Slipstream Rip into the front of a charge stops it and stuns it this long (the joust; DECISIONS #56) */
  joustStun: 1.3,
  /** ...if you meet it nose to nose, within this many degrees of head-on */
  joustDeg: 30,
  reboundDist: 24,
  chargeCdMin: 1.2,
  chargeCdMax: 2.2,
  maxWindups: 2,
  shoveWindup: 0.5,
  shoveLock: 0.2,
  shoveDist: 70,
  shoveSpeed: 220,
  shoveRange: 140,

  // ---- the Snapper (PLAN.md 8.3) ----
  snapperHp: 2,
  snapperRadius: 8,
  snapperTop: 170,
  snapperAcc: 420,
  snapperTurn: 9,
  snapperStrippedTop: 110,
  snapperStrippedTurn: 3,
  /** it snaps when you're this close and within snapConeDeg of its nose */
  snapRange: 64,
  /** between snaps it circles you this far out */
  snapCircle: 72,
  snapConeDeg: 35,
  snapWindup: 0.45,
  snapLock: 0.2,
  snapSpeed: 330,
  snapDist: 80,
  /** after a snap it power-slides round to face you, broadside (s) */
  snapSlide: 0.6,
  snapCdMin: 1.5,
  snapCdMax: 2.5,
  maxSnaps: 2,
  /** a Jaw Snapper's bite throws you this much harder */
  jawFling: 1.7,

  // ---- the encounter ----
  bannerTime: 1.5,
  gateWarn: 1.0,
  enterTime: 0.6,
  breather: 2.0,

  // ---- flat mode (the removal test as an A/B; DECISIONS #28, #50) ----
  /** every rip's damage, at any speed */
  flatDamage: 2,
  /** what a bolted part adds to every rip instead of changing how you move */
  flatPartDamage: 1,
};

export type Tuning = typeof DEFAULT_TUNING;
export type TuningKey = keyof Tuning;

export function defaultTuning(): Tuning {
  return { ...DEFAULT_TUNING };
}

/** Groups for the tuning panel, in display order, with a step for each key. */
export const TUNING_GROUPS: { title: string; keys: [TuningKey, number][] }[] = [
  { title: 'Movement', keys: [['topSpeed', 10], ['accLow', 50], ['accHigh', 10], ['accSplit', 5], ['turnLow', 0.5], ['turnHigh', 0.25], ['scrubLat', 25], ['scrubK', 0.05], ['coastHalf', 0.05], ['brakeDecel', 50], ['brakeDeg', 5], ['pivotSpeed', 5], ['overspeedHalf', 0.05], ['clankCos', 0.05], ['clankKeep', 0.05]] },
  { title: 'Tiers', keys: [['cruiseAt', 5], ['slipAt', 5]] },
  { title: 'Rip', keys: [['ripTime', 0.02], ['ripImpulse', 10], ['ripCooldown', 0.05], ['aimAssistDeg', 1], ['slipDamage', 1], ['frontDamage', 1], ['rearDamage', 1], ['frontArcDeg', 5], ['cruiseShove', 2], ['cruiseKeep', 0.05], ['hitstopSlip', 1], ['passThrough', 0.02]] },
  { title: 'Booster', keys: [['boosterTopMul', 0.025], ['boosterTurnLowMul', 0.05], ['boosterTurnHighMul', 0.05], ['burnAccel', 10], ['burnMax', 10], ['burnTime', 0.05], ['burnCooldown', 0.05], ['burnWallStun', 0.05], ['burnTapTime', 0.01]] },
  { title: 'Treads, Plow, Jaws', keys: [['treadsTopMul', 0.02], ['treadsTurnMul', 0.05], ['treadsGripMul', 0.05], ['slideTurn', 0.5], ['slideKeep', 0.02], ['plowAccMul', 0.05], ['plowConeDeg', 5], ['latchTime', 0.02], ['slingBoost', 5]] },
  { title: 'Salvage', keys: [['boltTime', 0.05], ['boltSteerMul', 0.05], ['rearArcDeg', 5], ['partLives', 1]] },
  { title: 'Hull', keys: [['hull', 1], ['invulnTime', 0.1], ['knockSpeed', 10], ['bumpKeep', 0.05]] },
  { title: 'Snapper', keys: [['snapperHp', 1], ['snapperTop', 5], ['snapperAcc', 20], ['snapperTurn', 0.5], ['snapRange', 5], ['snapCircle', 4], ['snapConeDeg', 5], ['snapWindup', 0.05], ['snapLock', 0.05], ['snapSpeed', 10], ['snapDist', 5], ['snapSlide', 0.05], ['snapCdMin', 0.1], ['snapCdMax', 0.1], ['maxSnaps', 1], ['jawFling', 0.1]] },
  { title: 'Flat mode', keys: [['flatDamage', 1], ['flatPartDamage', 1]] },
  { title: 'Rammer', keys: [['rammerHp', 1], ['stalkSpeed', 5], ['stalkTurn', 0.5], ['strippedTurn', 0.25], ['windupFar', 0.05], ['lockFar', 0.05], ['windupNear', 0.05], ['lockNear', 0.05], ['nearDist', 5], ['chargeRange', 10], ['leadFrac', 0.05], ['chargeSpeed', 10], ['chargeOver', 10], ['chargeMin', 10], ['chargeMax', 10], ['skidTime', 0.05], ['joustStun', 0.1], ['joustDeg', 5], ['draftGap', 1], ['draftBoost', 5], ['chargeCdMin', 0.1], ['chargeCdMax', 0.1], ['maxWindups', 1]] },
];
