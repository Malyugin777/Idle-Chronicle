// ═══════════════════════════════════════════════════════════
// SKILLS PROGRESSION SYSTEM v1.4
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// ACTIVE SKILLS DEFINITIONS
// ═══════════════════════════════════════════════════════════

export const ACTIVE_SKILLS = {
  fireball: {
    id: 'fireball',
    nameRu: 'Огненный шар',
    nameEn: 'Fireball',
    icon: '🔥',
    manaCost: 100,
    cooldown: 10000,
    baseDamage: 100,
    multiplier: 3.0, // pAtk * multiplier
    unlockLevel: 1,
  },
  iceball: {
    id: 'iceball',
    nameRu: 'Ледяной шар',
    nameEn: 'Ice Ball',
    icon: '❄️',
    manaCost: 100,
    cooldown: 10000,
    baseDamage: 100,
    multiplier: 3.0,
    unlockLevel: 2,
  },
  lightning: {
    id: 'lightning',
    nameRu: 'Молния',
    nameEn: 'Lightning',
    icon: '⚡',
    manaCost: 100,
    cooldown: 10000,
    baseDamage: 100,
    multiplier: 3.0,
    unlockLevel: 3,
  },
} as const;

export type ActiveSkillId = keyof typeof ACTIVE_SKILLS;

// ═══════════════════════════════════════════════════════════
// MASTERY SYSTEM (ranks 0-10)
// +3% skill damage per rank
// ═══════════════════════════════════════════════════════════

export const MASTERY_MAX_RANK = 10;
export const MASTERY_BONUS_PER_RANK = 0.03; // +3% dmg per rank

// Costs for ranks 1-10 (index 0 = rank 1 cost)
export const MASTERY_COSTS = {
  gold: [5000, 8000, 12000, 18000, 26000, 38000, 55000, 80000, 120000, 180000],
  sp:   [80, 120, 180, 260, 380, 540, 760, 1050, 1450, 2000],
};

// Get cost for upgrading from currentRank to currentRank+1
export function getMasteryCost(currentRank: number): { gold: number; sp: number } | null {
  if (currentRank >= MASTERY_MAX_RANK) return null;
  return {
    gold: MASTERY_COSTS.gold[currentRank],
    sp: MASTERY_COSTS.sp[currentRank],
  };
}

// Calculate total mastery bonus multiplier
export function getMasteryMultiplier(rank: number): number {
  return 1 + rank * MASTERY_BONUS_PER_RANK;
}

// ═══════════════════════════════════════════════════════════
// PROFICIENCY TIERS (unlock by casts, activate with Gold+SP)
// ═══════════════════════════════════════════════════════════

export const TIER_COUNT = 4;

// Casts required to UNLOCK tier (not activate)
export const TIER_THRESHOLDS = [50, 200, 500, 1000];

// Damage bonus per tier (cumulative when activated)
// T1=+3%, T2=+7%, T3=+15%, T4=+25% → total +50% at max
export const TIER_BONUSES = [0.03, 0.07, 0.15, 0.25];

// Cost to ACTIVATE unlocked tier
export const TIER_ACTIVATION_COSTS = {
  gold: [8000, 18000, 45000, 120000],
  sp:   [120, 280, 700, 1800],
};

// Check which tier is unlocked by casts (0 = none unlocked yet)
export function getUnlockedTierByCasts(casts: number): number {
  for (let i = TIER_THRESHOLDS.length - 1; i >= 0; i--) {
    if (casts >= TIER_THRESHOLDS[i]) return i + 1; // tier 1-4
  }
  return 0;
}

// Check if tier N is activated (bitmask)
export function isTierActivated(tierBitmask: number, tier: number): boolean {
  if (tier < 1 || tier > 4) return false;
  return (tierBitmask & (1 << (tier - 1))) !== 0;
}

// Activate tier and return new bitmask
export function activateTier(tierBitmask: number, tier: number): number {
  if (tier < 1 || tier > 4) return tierBitmask;
  return tierBitmask | (1 << (tier - 1));
}

// Calculate total tier bonus from bitmask
export function getTierBonusMultiplier(tierBitmask: number): number {
  let bonus = 0;
  for (let i = 0; i < TIER_COUNT; i++) {
    if (tierBitmask & (1 << i)) {
      bonus += TIER_BONUSES[i];
    }
  }
  return 1 + bonus;
}

// Get tier activation cost
export function getTierActivationCost(tier: number): { gold: number; sp: number } | null {
  if (tier < 1 || tier > 4) return null;
  return {
    gold: TIER_ACTIVATION_COSTS.gold[tier - 1],
    sp: TIER_ACTIVATION_COSTS.sp[tier - 1],
  };
}

// ═══════════════════════════════════════════════════════════
// PASSIVE SKILLS (ranks 0-10, upgraded with Gold+SP)
// ═══════════════════════════════════════════════════════════

export const PASSIVE_SKILLS = {
  arcanePower: {
    id: 'arcanePower',
    nameRu: 'Тайная сила',
    nameEn: 'Arcane Power',
    icon: '⚔️',
    descRu: '+2% к финальному P.Atk за ранг',
    descEn: '+2% final P.Atk per rank',
    maxRank: 10,
    effectPerRank: 0.02,
  },
  critFocus: {
    id: 'critFocus',
    nameRu: 'Фокус крита',
    nameEn: 'Crit Focus',
    icon: '🎯',
    descRu: '+0.6% шанс крита за ранг (макс 60%)',
    descEn: '+0.6% crit chance per rank (cap 60%)',
    maxRank: 10,
    effectPerRank: 0.006,
    cap: 0.6,
  },
  critPower: {
    id: 'critPower',
    nameRu: 'Мощь крита',
    nameEn: 'Crit Power',
    icon: '💥',
    descRu: '+6% урон крита за ранг',
    descEn: '+6% crit damage per rank',
    maxRank: 10,
    effectPerRank: 0.06,
  },
  staminaTraining: {
    id: 'staminaTraining',
    nameRu: 'Тренировка выносливости',
    nameEn: 'Stamina Training',
    icon: '💪',
    descRu: '+50 макс. стамины за ранг',
    descEn: '+50 max stamina per rank',
    maxRank: 10,
    effectPerRank: 50,
  },
  manaFlow: {
    id: 'manaFlow',
    nameRu: 'Поток маны',
    nameEn: 'Mana Flow',
    icon: '🔮',
    descRu: '+30 макс. маны за ранг',
    descEn: '+30 max mana per rank',
    maxRank: 10,
    effectPerRank: 30,
  },
  etherEfficiency: {
    id: 'etherEfficiency',
    nameRu: 'Эффективность эфира',
    nameEn: 'Ether Efficiency',
    icon: '✨',
    descRu: '-6% расхода эфира за ранг (макс -30%)',
    descEn: '-6% ether cost per rank (max -30%)',
    maxRank: 5, // Special: only 5 ranks
    effectPerRank: 0.06,
  },
} as const;

export type PassiveSkillId = keyof typeof PASSIVE_SKILLS;

// Standard passive costs (ranks 1-10)
export const PASSIVE_COSTS = {
  gold: [4000, 6000, 9000, 13000, 19000, 28000, 41000, 60000, 90000, 135000],
  sp:   [60, 90, 130, 190, 280, 400, 560, 780, 1100, 1550],
};

// Ether Efficiency special costs (ranks 1-5)
export const ETHER_EFFICIENCY_COSTS = {
  gold: [12000, 20000, 32000, 50000, 80000],
  sp:   [200, 320, 520, 820, 1300],
};

export function getPassiveCost(passiveId: PassiveSkillId, currentRank: number): { gold: number; sp: number } | null {
  const passive = PASSIVE_SKILLS[passiveId];
  if (currentRank >= passive.maxRank) return null;

  if (passiveId === 'etherEfficiency') {
    return {
      gold: ETHER_EFFICIENCY_COSTS.gold[currentRank],
      sp: ETHER_EFFICIENCY_COSTS.sp[currentRank],
    };
  }

  return {
    gold: PASSIVE_COSTS.gold[currentRank],
    sp: PASSIVE_COSTS.sp[currentRank],
  };
}

// ═══════════════════════════════════════════════════════════
// LEVEL CAPS (restrict upgrades by hero level)
// ═══════════════════════════════════════════════════════════

export interface LevelCaps {
  activeMastery: number;  // Max mastery rank
  passiveRank: number;    // Max passive rank
  tierMax: number;        // Max tier that can be activated
  etherMax: number;       // Max ether efficiency rank
}

export const LEVEL_CAPS: Record<number, LevelCaps> = {
  1:  { activeMastery: 3, passiveRank: 0, tierMax: 1, etherMax: 0 },
  5:  { activeMastery: 5, passiveRank: 3, tierMax: 1, etherMax: 0 },
  10: { activeMastery: 7, passiveRank: 6, tierMax: 2, etherMax: 0 },
  15: { activeMastery: 9, passiveRank: 8, tierMax: 3, etherMax: 3 },
  20: { activeMastery: 10, passiveRank: 10, tierMax: 4, etherMax: 5 },
};

export function getLevelCaps(level: number): LevelCaps {
  if (level >= 20) return LEVEL_CAPS[20];
  if (level >= 15) return LEVEL_CAPS[15];
  if (level >= 10) return LEVEL_CAPS[10];
  if (level >= 5) return LEVEL_CAPS[5];
  return LEVEL_CAPS[1];
}

// ═══════════════════════════════════════════════════════════
// SKILL DAMAGE CALCULATION HELPERS
// ═══════════════════════════════════════════════════════════

export interface SkillDamageParams {
  pAtk: number;
  heroLevel: number;
  masteryRank: number;
  tierBitmask: number;
  passiveArcanePower: number;
  passiveCritFocus: number;
  passiveCritPower: number;
  baseCritChance?: number;
  baseCritDamage?: number;
}

export function calculateSkillDamage(
  skillId: ActiveSkillId,
  params: SkillDamageParams
): { damage: number; isCrit: boolean } {
  const skill = ACTIVE_SKILLS[skillId];

  // Base damage: baseDamage + pAtk * multiplier
  let damage = skill.baseDamage + params.pAtk * skill.multiplier;

  // Hero level multiplier: +2% per level
  damage *= Math.pow(1.02, params.heroLevel - 1);

  // Mastery multiplier: +3% per rank
  damage *= getMasteryMultiplier(params.masteryRank);

  // Tier multiplier: sum of activated tier bonuses
  damage *= getTierBonusMultiplier(params.tierBitmask);

  // Arcane Power passive: +2% per rank to final damage
  damage *= 1 + params.passiveArcanePower * PASSIVE_SKILLS.arcanePower.effectPerRank;

  // Crit check
  const baseCritChance = params.baseCritChance ?? 0.05;
  const critChanceBonus = params.passiveCritFocus * PASSIVE_SKILLS.critFocus.effectPerRank;
  const totalCritChance = Math.min(baseCritChance + critChanceBonus, PASSIVE_SKILLS.critFocus.cap ?? 1);

  const isCrit = Math.random() < totalCritChance;

  if (isCrit) {
    const baseCritDamage = params.baseCritDamage ?? 2.0;
    const critDamageBonus = params.passiveCritPower * PASSIVE_SKILLS.critPower.effectPerRank;
    damage *= baseCritDamage + critDamageBonus;
  }

  return { damage: Math.floor(damage), isCrit };
}
