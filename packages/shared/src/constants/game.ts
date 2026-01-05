// ═══════════════════════════════════════════════════════════
// SOULSHOTS
// ═══════════════════════════════════════════════════════════

export const SOULSHOT_GRADES = {
  NG: { multiplier: 1.5, cost: 1 },
  D: { multiplier: 2.2, cost: 5 },
  C: { multiplier: 3.5, cost: 25 },
  B: { multiplier: 5.0, cost: 100 },
  A: { multiplier: 7.0, cost: 500 },
  S: { multiplier: 10.0, cost: 2000 },
} as const;

export type SoulshotGrade = keyof typeof SOULSHOT_GRADES;

// ═══════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════

export const STAT_EFFECTS = {
  str: { perPoint: 0.08, description: '+8% damage per point' },
  dex: { perPoint: 0.05, description: '+5% attack speed per point' },
  luck: { perPoint: 0.03, description: '+3% crit chance per point' },
} as const;

export type StatType = keyof typeof STAT_EFFECTS;

// ═══════════════════════════════════════════════════════════
// ENERGY
// ═══════════════════════════════════════════════════════════

export const ENERGY = {
  DEFAULT_MAX: 1000,
  DEFAULT_REGEN: 10,
  COST_PER_TAP: 1,
} as const;

// ═══════════════════════════════════════════════════════════
// COMBAT
// ═══════════════════════════════════════════════════════════

export const COMBAT = {
  BASE_CRIT_CHANCE: 0.05,
  BASE_CRIT_DAMAGE: 2.0,
  MAX_CRIT_CHANCE: 0.75,
  DAMAGE_VARIANCE: 0.1,
} as const;

// ═══════════════════════════════════════════════════════════
// BUFFS
// ═══════════════════════════════════════════════════════════

export const BUFFS = {
  HASTE: { duration: 30, value: 1.3, cost: 500 },
  ACUMEN: { duration: 30, value: 1.5, cost: 500 },
  LUCK: { duration: 60, value: 0.10, cost: 1000 },
} as const;

export type BuffType = keyof typeof BUFFS;

// ═══════════════════════════════════════════════════════════
// SKILLS
// ═══════════════════════════════════════════════════════════

export const SKILLS = {
  POWER_STRIKE: { cooldown: 10, multiplier: 5 },
  HASTE_BURST: { cooldown: 60, duration: 30, speedBonus: 0.3 },
} as const;

export type SkillType = keyof typeof SKILLS;

// ═══════════════════════════════════════════════════════════
// ANTI-CHEAT
// ═══════════════════════════════════════════════════════════

export const ANTI_CHEAT = {
  MAX_TAPS_PER_BATCH: 50,
  MIN_BATCH_INTERVAL_MS: 400,
  MAX_HUMAN_CPS: 15,
  RATE_LIMIT_MAX_TOKENS: 100,
  RATE_LIMIT_REFILL_RATE: 20,
} as const;

// ═══════════════════════════════════════════════════════════
// BOSS
// ═══════════════════════════════════════════════════════════

export const BOSS = {
  RESPAWN_DELAY_SECONDS: 30,
  HP_BROADCAST_INTERVAL_MS: 100,
  DAMAGE_FEED_SIZE: 50,
  RAGE_PHASES: [
    { hpPercent: 75, rewardMultiplier: 1.2 },
    { hpPercent: 50, rewardMultiplier: 1.5 },
    { hpPercent: 25, rewardMultiplier: 2.0 },
  ],
} as const;

// ═══════════════════════════════════════════════════════════
// OFFLINE
// ═══════════════════════════════════════════════════════════

export const OFFLINE = {
  MAX_HOURS: 8,
  EFFICIENCY: 0.1,
} as const;

// ═══════════════════════════════════════════════════════════
// VIEWPORT (TMA)
// ═══════════════════════════════════════════════════════════

export const VIEWPORT = {
  BASE_WIDTH: 780,
  BASE_HEIGHT: 1688,
  SCALE_MODE: 'ENVELOP',
} as const;

// ═══════════════════════════════════════════════════════════
// VISUAL THEME
// ═══════════════════════════════════════════════════════════

export const THEME = {
  COLORS: {
    BACKGROUND_TOP: 0x0e141b,
    BACKGROUND_BOTTOM: 0x2a313b,
    GOLD: '#D6B36A',
    GOLD_HEX: 0xD6B36A,
    HEALTH_RED: '#C41E3A',
    ENERGY_BLUE: '#3498DB',
    CRIT_RED: '#FF4444',
    TEXT_WHITE: '#FFFFFF',
  },
  FONTS: {
    PRIMARY: 'Press Start 2P',
    FALLBACK: 'monospace',
  },
} as const;

// ═══════════════════════════════════════════════════════════
// RAGE PHASE REWARDS
// ═══════════════════════════════════════════════════════════

export const RAGE_PHASE_REWARDS = [1.0, 1.2, 1.5, 2.0] as const;
