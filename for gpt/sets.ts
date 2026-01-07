// ═══════════════════════════════════════════════════════════
// SETS DATABASE - Система сетовых бонусов
// ═══════════════════════════════════════════════════════════

import { ItemStats } from './items';

export interface SetBonus {
  pieces: number;       // Сколько частей нужно (3, 6, 7...)
  bonusFlat?: ItemStats; // Плоские бонусы
  bonusPct?: {          // Процентные бонусы
    pAtk?: number;      // 0.05 = +5%
    pDef?: number;
    mAtk?: number;
    mDef?: number;
    crit?: number;
    atkSpd?: number;
    mpMax?: number;
    staminaMax?: number;
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
  novice: {
    id: 'novice',
    nameRu: 'Сет новичка',
    nameEn: 'Novice Set',
    totalPieces: 7,
    bonuses: [
      {
        pieces: 3,
        bonusPct: { pAtk: 0.03 },  // +3% P.Atk
        description: {
          ru: '+3% к физ. атаке',
          en: '+3% Physical Attack',
        },
      },
      {
        pieces: 6,
        bonusPct: { pAtk: 0.05, pDef: 0.05 },  // +5% P.Atk, +5% P.Def
        description: {
          ru: '+5% к физ. атаке, +5% к физ. защите',
          en: '+5% Physical Attack, +5% Physical Defense',
        },
      },
    ],
  },

  // ─────────────────────────────────────────────────────────
  // IRON SET (будущее)
  // ─────────────────────────────────────────────────────────
  iron: {
    id: 'iron',
    nameRu: 'Железный сет',
    nameEn: 'Iron Set',
    totalPieces: 7,
    bonuses: [
      {
        pieces: 3,
        bonusPct: { pDef: 0.05 },
        description: {
          ru: '+5% к физ. защите',
          en: '+5% Physical Defense',
        },
      },
      {
        pieces: 6,
        bonusPct: { pDef: 0.10, staminaMax: 0.05 },
        description: {
          ru: '+10% к физ. защите, +5% к макс. стамине',
          en: '+10% Physical Defense, +5% Max Stamina',
        },
      },
    ],
  },

  // ─────────────────────────────────────────────────────────
  // STEEL SET (будущее)
  // ─────────────────────────────────────────────────────────
  steel: {
    id: 'steel',
    nameRu: 'Стальной сет',
    nameEn: 'Steel Set',
    totalPieces: 7,
    bonuses: [
      {
        pieces: 3,
        bonusPct: { pAtk: 0.05, crit: 0.01 },
        description: {
          ru: '+5% к физ. атаке, +1% крит. шанс',
          en: '+5% Physical Attack, +1% Crit Chance',
        },
      },
      {
        pieces: 6,
        bonusPct: { pAtk: 0.10, pDef: 0.08, crit: 0.02 },
        description: {
          ru: '+10% к физ. атаке, +8% к защите, +2% крит',
          en: '+10% P.Atk, +8% P.Def, +2% Crit',
        },
      },
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
  pct: { pAtk?: number; pDef?: number; mAtk?: number; mDef?: number; crit?: number; atkSpd?: number; mpMax?: number; staminaMax?: number };
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
