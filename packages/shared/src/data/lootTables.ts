// ═══════════════════════════════════════════════════════════
// LOOT TABLES - Таблицы дропа для сундуков
// ═══════════════════════════════════════════════════════════

import { Rarity } from './items';

export type ChestType = 'WOODEN' | 'BRONZE' | 'SILVER' | 'GOLD';

// ═══════════════════════════════════════════════════════════
// CHEST DEFINITIONS
// ═══════════════════════════════════════════════════════════

export interface ChestDefinition {
  type: ChestType;
  nameRu: string;
  nameEn: string;
  icon: string;
  color: string;           // Tailwind text color
  bgColor: string;         // Tailwind bg color
  borderColor: string;     // Tailwind border color
  openDuration: number;    // Время открытия в ms
}

export const CHESTS: Record<ChestType, ChestDefinition> = {
  WOODEN: {
    type: 'WOODEN',
    nameRu: 'Деревянный сундук',
    nameEn: 'Wooden Chest',
    icon: '🪵',
    color: 'text-amber-600',
    bgColor: 'bg-amber-900/30',
    borderColor: 'border-amber-700',
    openDuration: 5 * 60 * 1000,  // 5 минут
  },
  BRONZE: {
    type: 'BRONZE',
    nameRu: 'Бронзовый сундук',
    nameEn: 'Bronze Chest',
    icon: '🟫',
    color: 'text-orange-400',
    bgColor: 'bg-orange-900/30',
    borderColor: 'border-orange-600',
    openDuration: 30 * 60 * 1000,  // 30 минут
  },
  SILVER: {
    type: 'SILVER',
    nameRu: 'Серебряный сундук',
    nameEn: 'Silver Chest',
    icon: '🪙',
    color: 'text-gray-300',
    bgColor: 'bg-gray-500/30',
    borderColor: 'border-gray-400',
    openDuration: 4 * 60 * 60 * 1000,  // 4 часа
  },
  GOLD: {
    type: 'GOLD',
    nameRu: 'Золотой сундук',
    nameEn: 'Gold Chest',
    icon: '🟨',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-600/30',
    borderColor: 'border-yellow-500',
    openDuration: 8 * 60 * 60 * 1000,  // 8 часов
  },
};

// ═══════════════════════════════════════════════════════════
// DROP RATES (Таблицы дропа по ТЗ)
// ═══════════════════════════════════════════════════════════

export interface DropRate {
  // Шанс выпадения предмета по редкости (0-1)
  // Сумма НЕ должна быть 100% — остаток = "ничего не выпало"
  items: {
    common: number;
    uncommon: number;
    rare: number;
    epic: number;
  };
  // Фиксированное золото (100% шанс)
  gold: number;
  // Шанс свитка заточки (0-1)
  enchantChance: number;
  // Количество свитков [min, max]
  enchantQty: [number, number];
}

export const DROP_RATES: Record<ChestType, DropRate> = {
  // ─────────────────────────────────────────────────────────
  // WOODEN: 1000 золота, 50% Common, 7% Uncommon, 3% свиток
  // ─────────────────────────────────────────────────────────
  WOODEN: {
    items: { common: 0.50, uncommon: 0.07, rare: 0, epic: 0 },
    gold: 1000,
    enchantChance: 0.03,
    enchantQty: [1, 1],
  },

  // ─────────────────────────────────────────────────────────
  // BRONZE: 3000 золота, 60% Common, 20% Uncommon, 3% Rare, 15% свиток
  // ─────────────────────────────────────────────────────────
  BRONZE: {
    items: { common: 0.60, uncommon: 0.20, rare: 0.03, epic: 0 },
    gold: 3000,
    enchantChance: 0.15,
    enchantQty: [1, 1],
  },

  // ─────────────────────────────────────────────────────────
  // SILVER: 8000 золота, 40% Uncommon, 10% Rare, 1% Epic, 25% свиток x1-5
  // ─────────────────────────────────────────────────────────
  SILVER: {
    items: { common: 0, uncommon: 0.40, rare: 0.10, epic: 0.01 },
    gold: 8000,
    enchantChance: 0.25,
    enchantQty: [1, 5],
  },

  // ─────────────────────────────────────────────────────────
  // GOLD: 20000 золота, 15% Rare, 3% Epic, 45% свиток x1-5
  // ─────────────────────────────────────────────────────────
  GOLD: {
    items: { common: 0, uncommon: 0, rare: 0.15, epic: 0.03 },
    gold: 20000,
    enchantChance: 0.45,
    enchantQty: [1, 5],
  },
};

// ═══════════════════════════════════════════════════════════
// RARITY STYLES (для UI)
// ═══════════════════════════════════════════════════════════

export interface RarityStyle {
  nameRu: string;
  nameEn: string;
  color: string;           // text color
  borderColor: string;     // border color
  glow: string;            // box-shadow/glow effect
  dropShadow: string;      // drop-shadow filter
}

export const RARITY_STYLES: Record<Rarity, RarityStyle> = {
  common: {
    nameRu: 'Обычный',
    nameEn: 'Common',
    color: 'text-gray-400',
    borderColor: 'border-gray-500/50',
    glow: '',
    dropShadow: '',
  },
  uncommon: {
    nameRu: 'Необычный',
    nameEn: 'Uncommon',
    color: 'text-green-400',
    borderColor: 'border-green-500/70',
    glow: 'shadow-[0_0_12px_rgba(74,222,128,0.5)]',
    dropShadow: 'drop-shadow-[0_0_8px_rgba(74,222,128,0.6)]',
  },
  rare: {
    nameRu: 'Редкий',
    nameEn: 'Rare',
    color: 'text-blue-400',
    borderColor: 'border-blue-500/70',
    glow: 'shadow-[0_0_14px_rgba(96,165,250,0.6)]',
    dropShadow: 'drop-shadow-[0_0_10px_rgba(96,165,250,0.7)]',
  },
  epic: {
    nameRu: 'Эпический',
    nameEn: 'Epic',
    color: 'text-purple-400',
    borderColor: 'border-purple-500/70',
    glow: 'shadow-[0_0_16px_rgba(192,132,252,0.7)]',
    dropShadow: 'drop-shadow-[0_0_12px_rgba(192,132,252,0.8)]',
  },
  legendary: {
    nameRu: 'Легендарный',
    nameEn: 'Legendary',
    color: 'text-orange-400',
    borderColor: 'border-orange-500/70',
    glow: 'shadow-[0_0_20px_rgba(251,146,60,0.8)] animate-pulse',
    dropShadow: 'drop-shadow-[0_0_14px_rgba(251,146,60,0.9)]',
  },
};

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

/**
 * Роллит редкость предмета по таблице дропа
 * @returns Редкость или null если ничего не выпало
 */
export function rollItemRarity(chestType: ChestType): Rarity | null {
  const rates = DROP_RATES[chestType].items;
  const roll = Math.random();
  let cumulative = 0;

  for (const [rarity, chance] of Object.entries(rates)) {
    if (chance === 0) continue;
    cumulative += chance;
    if (roll < cumulative) {
      return rarity as Rarity;
    }
  }

  return null; // Ничего не выпало
}

/**
 * Роллит количество свитков заточки
 * @returns Количество свитков или 0 если не выпало
 */
export function rollEnchantScrolls(chestType: ChestType): number {
  const rates = DROP_RATES[chestType];

  if (Math.random() >= rates.enchantChance) {
    return 0;
  }

  const [min, max] = rates.enchantQty;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Генерирует полный лут из сундука
 */
export function generateChestLoot(chestType: ChestType): {
  gold: number;
  itemRarity: Rarity | null;
  enchantScrolls: number;
} {
  return {
    gold: DROP_RATES[chestType].gold,
    itemRarity: rollItemRarity(chestType),
    enchantScrolls: rollEnchantScrolls(chestType),
  };
}

/**
 * Форматирует время открытия сундука
 */
export function formatOpenDuration(ms: number): string {
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));

  if (hours > 0) {
    return minutes > 0 ? `${hours}ч ${minutes}м` : `${hours}ч`;
  }
  return `${minutes}м`;
}
