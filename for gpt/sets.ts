// ═══════════════════════════════════════════════════════════
// SETS DATABASE - Система сетовых бонусов
// ═══════════════════════════════════════════════════════════

import { ItemStats } from './items';

export interface SetBonus {
  pieces: number;       // Сколько частей нужно (3, 5...)
  bonusFlat?: ItemStats; // Плоские бонусы (включая power, agility)
  bonusPct?: {          // Процентные бонусы
    pAtk?: number;      // 0.05 = +5%
    pDef?: number;
    mAtk?: number;
    mDef?: number;
    crit?: number;
    atkSpd?: number;
    mpMax?: number;
    staminaMax?: number;
    staminaRegen?: number; // 0.15 = +15% к регену стамины
  };
  description: {
    ru: string;
    en: string;
  };
}

export interface SetDefinition {
  id: string;
  nameRu: string;
  nameEn: string;
  totalPieces: number;  // Сколько всего предметов в сете
  bonuses: SetBonus[];  // Бонусы за 3/6, 6/6 и т.д.
}

// ═══════════════════════════════════════════════════════════
// ОПРЕДЕЛЕНИЯ СЕТОВ
// ═══════════════════════════════════════════════════════════

export const SETS: Record<string, SetDefinition> = {
  // ═══════════════════════════════════════════════════════════
  // STARTER SET (выдаётся в начале, НЕ дропается)
  // ═══════════════════════════════════════════════════════════
  starter: {
    id: 'starter',
    nameRu: 'Стартовый сет',
    nameEn: 'Starter Set',
    totalPieces: 7,
    bonuses: [
      {
        pieces: 3,
        bonusPct: { pAtk: 0.03 },
        description: { ru: '+3% к физ. атаке', en: '+3% Physical Attack' },
      },
      {
        pieces: 6,
        bonusPct: { pAtk: 0.05, pDef: 0.05 },
        description: { ru: '+5% к физ. атаке, +5% к физ. защите', en: '+5% P.Atk, +5% P.Def' },
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // ДРОПОВЫЕ СЕТЫ (10 сетов, 5 частей каждый)
  // helmet, gloves, boots, chest, legs
  // ═══════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────────────────
  // COMMON (adventurer, leather)
  // ─────────────────────────────────────────────────────────
  adventurer: {
    id: 'adventurer',
    nameRu: 'Сет искателя',
    nameEn: 'Adventurer Set',
    totalPieces: 5,
    bonuses: [
      { pieces: 3, bonusPct: { staminaRegen: 0.05 }, description: { ru: '+5% к регену стамины', en: '+5% stamina regen' } },
      { pieces: 5, bonusPct: { staminaRegen: 0.15 }, description: { ru: '+15% к регену стамины', en: '+15% stamina regen' } },
    ],
  },

  leather: {
    id: 'leather',
    nameRu: 'Кожаный сет',
    nameEn: 'Leather Set',
    totalPieces: 5,
    bonuses: [
      { pieces: 3, bonusPct: { staminaRegen: 0.05 }, description: { ru: '+5% к регену стамины', en: '+5% stamina regen' } },
      { pieces: 5, bonusPct: { staminaRegen: 0.15 }, description: { ru: '+15% к регену стамины', en: '+15% stamina regen' } },
    ],
  },

  // ─────────────────────────────────────────────────────────
  // UNCOMMON (scout, hunter)
  // ─────────────────────────────────────────────────────────
  scout: {
    id: 'scout',
    nameRu: 'Сет разведчика',
    nameEn: 'Scout Set',
    totalPieces: 5,
    bonuses: [
      { pieces: 3, bonusPct: { staminaRegen: 0.05 }, description: { ru: '+5% к регену стамины', en: '+5% stamina regen' } },
      { pieces: 5, bonusPct: { staminaRegen: 0.15 }, description: { ru: '+15% к регену стамины', en: '+15% stamina regen' } },
    ],
  },

  hunter: {
    id: 'hunter',
    nameRu: 'Сет охотника',
    nameEn: 'Hunter Set',
    totalPieces: 5,
    bonuses: [
      { pieces: 3, bonusPct: { staminaRegen: 0.05 }, description: { ru: '+5% к регену стамины', en: '+5% stamina regen' } },
      { pieces: 5, bonusPct: { staminaRegen: 0.15 }, bonusFlat: { power: 1 }, description: { ru: '+15% реген стамины, +1 СИЛ', en: '+15% stamina regen, +1 STR' } },
    ],
  },

  // ─────────────────────────────────────────────────────────
  // RARE (soldier, knight)
  // ─────────────────────────────────────────────────────────
  soldier: {
    id: 'soldier',
    nameRu: 'Сет солдата',
    nameEn: 'Soldier Set',
    totalPieces: 5,
    bonuses: [
      { pieces: 3, bonusPct: { staminaRegen: 0.05 }, description: { ru: '+5% к регену стамины', en: '+5% stamina regen' } },
      { pieces: 5, bonusPct: { staminaRegen: 0.15 }, bonusFlat: { power: 2 }, description: { ru: '+15% реген стамины, +2 СИЛ', en: '+15% stamina regen, +2 STR' } },
    ],
  },

  knight: {
    id: 'knight',
    nameRu: 'Сет рыцаря',
    nameEn: 'Knight Set',
    totalPieces: 5,
    bonuses: [
      { pieces: 3, bonusPct: { staminaRegen: 0.05 }, description: { ru: '+5% к регену стамины', en: '+5% stamina regen' } },
      { pieces: 5, bonusPct: { staminaRegen: 0.15 }, bonusFlat: { power: 2, agility: 1 }, description: { ru: '+15% реген, +2 СИЛ, +1 ЛОВ', en: '+15% regen, +2 STR, +1 DEX' } },
    ],
  },

  // ─────────────────────────────────────────────────────────
  // EPIC (guardian, warlord, champion, immortal)
  // ─────────────────────────────────────────────────────────
  guardian: {
    id: 'guardian',
    nameRu: 'Сет стража',
    nameEn: 'Guardian Set',
    totalPieces: 5,
    bonuses: [
      { pieces: 3, bonusPct: { staminaRegen: 0.05 }, description: { ru: '+5% к регену стамины', en: '+5% stamina regen' } },
      { pieces: 5, bonusPct: { staminaRegen: 0.15 }, bonusFlat: { power: 3, agility: 1 }, description: { ru: '+15% реген, +3 СИЛ, +1 ЛОВ', en: '+15% regen, +3 STR, +1 DEX' } },
    ],
  },

  warlord: {
    id: 'warlord',
    nameRu: 'Сет полководца',
    nameEn: 'Warlord Set',
    totalPieces: 5,
    bonuses: [
      { pieces: 3, bonusPct: { staminaRegen: 0.05 }, description: { ru: '+5% к регену стамины', en: '+5% stamina regen' } },
      { pieces: 5, bonusPct: { staminaRegen: 0.15 }, bonusFlat: { power: 3, agility: 2 }, description: { ru: '+15% реген, +3 СИЛ, +2 ЛОВ', en: '+15% regen, +3 STR, +2 DEX' } },
    ],
  },

  champion: {
    id: 'champion',
    nameRu: 'Сет чемпиона',
    nameEn: 'Champion Set',
    totalPieces: 5,
    bonuses: [
      { pieces: 3, bonusPct: { staminaRegen: 0.05 }, description: { ru: '+5% к регену стамины', en: '+5% stamina regen' } },
      { pieces: 5, bonusPct: { staminaRegen: 0.15 }, bonusFlat: { power: 4, agility: 2 }, description: { ru: '+15% реген, +4 СИЛ, +2 ЛОВ', en: '+15% regen, +4 STR, +2 DEX' } },
    ],
  },

  immortal: {
    id: 'immortal',
    nameRu: 'Сет бессмертного',
    nameEn: 'Immortal Set',
    totalPieces: 5,
    bonuses: [
      { pieces: 3, bonusPct: { staminaRegen: 0.05 }, description: { ru: '+5% к регену стамины', en: '+5% stamina regen' } },
      { pieces: 5, bonusPct: { staminaRegen: 0.15 }, bonusFlat: { power: 5, agility: 3 }, description: { ru: '+15% реген, +5 СИЛ, +3 ЛОВ', en: '+15% regen, +5 STR, +3 DEX' } },
    ],
  },
};

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

/**
 * Получить активные бонусы сета на основе количества надетых частей
 * @param setId - ID сета
 * @param equippedCount - Сколько частей надето
 * @returns Массив активных бонусов
 */
export function getActiveSetBonuses(setId: string, equippedCount: number): SetBonus[] {
  const set = SETS[setId];
  if (!set) return [];

  return set.bonuses.filter(bonus => equippedCount >= bonus.pieces);
}

/**
 * Рассчитать суммарные бонусы от сета
 * @param setId - ID сета
 * @param equippedCount - Сколько частей надето
 */
export function calculateSetBonuses(setId: string, equippedCount: number): {
  flat: ItemStats;
  pct: { pAtk?: number; pDef?: number; mAtk?: number; mDef?: number; crit?: number; atkSpd?: number; mpMax?: number; staminaMax?: number; staminaRegen?: number };
} {
  const activeBonuses = getActiveSetBonuses(setId, equippedCount);

  const flat: ItemStats = {};
  const pct: Record<string, number> = {};

  for (const bonus of activeBonuses) {
    // Суммируем flat бонусы
    if (bonus.bonusFlat) {
      for (const [key, value] of Object.entries(bonus.bonusFlat)) {
        flat[key as keyof ItemStats] = (flat[key as keyof ItemStats] || 0) + (value || 0);
      }
    }

    // Суммируем pct бонусы
    if (bonus.bonusPct) {
      for (const [key, value] of Object.entries(bonus.bonusPct)) {
        pct[key] = (pct[key] || 0) + (value || 0);
      }
    }
  }

  return { flat, pct };
}

/**
 * Получить информацию о прогрессе сета для UI
 */
export function getSetProgress(setId: string, equippedCount: number): {
  set: SetDefinition;
  current: number;
  total: number;
  activeBonuses: SetBonus[];
  nextBonus: SetBonus | null;
  piecesUntilNext: number;
} | null {
  const set = SETS[setId];
  if (!set) return null;

  const activeBonuses = getActiveSetBonuses(setId, equippedCount);
  const nextBonus = set.bonuses.find(b => b.pieces > equippedCount) || null;
  const piecesUntilNext = nextBonus ? nextBonus.pieces - equippedCount : 0;

  return {
    set,
    current: equippedCount,
    total: set.totalPieces,
    activeBonuses,
    nextBonus,
    piecesUntilNext,
  };
}
