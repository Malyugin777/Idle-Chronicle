// ═══════════════════════════════════════════════════════════
// LOOT TABLES — Таблицы дропа сундуков
// ═══════════════════════════════════════════════════════════

export type ChestType = 'wood' | 'bronze' | 'silver' | 'gold';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic';

// ═══════════════════════════════════════════════════════════
// CHEST DROP CONFIG
// ═══════════════════════════════════════════════════════════

export interface ChestConfig {
  gold: number;                                  // 100% шанс золота
  itemChance: number;                            // шанс получить 1 предмет (0-1)
  rarityWeights: Partial<Record<Rarity, number>>; // веса внутри itemChance
  scrollChance: number;                          // шанс свитка заточки (0-1)
  scrollQty: [number, number];                   // [min, max] количество свитков
}

export const CHESTS: Record<ChestType, ChestConfig> = {
  // ─────────────────────────────────────────────────────────
  // WOODEN: 55% шмот (93% Common, 7% Uncommon), 3% свиток
  // ─────────────────────────────────────────────────────────
  wood: {
    gold: 1000,
    itemChance: 0.55,
    rarityWeights: { common: 93, uncommon: 7 },
    scrollChance: 0.03,
    scrollQty: [1, 1],
  },

  // ─────────────────────────────────────────────────────────
  // BRONZE: 80% шмот (70% C, 27% U, 3% R), 15% свиток
  // ─────────────────────────────────────────────────────────
  bronze: {
    gold: 2500,
    itemChance: 0.80,
    rarityWeights: { common: 70, uncommon: 27, rare: 3 },
    scrollChance: 0.15,
    scrollQty: [1, 1],
  },

  // ─────────────────────────────────────────────────────────
  // SILVER: 100% шмот (75% U, 24% R, 1% E), 25% свиток x1-2
  // ─────────────────────────────────────────────────────────
  silver: {
    gold: 7000,
    itemChance: 1.0,
    rarityWeights: { uncommon: 75, rare: 24, epic: 1 },
    scrollChance: 0.25,
    scrollQty: [1, 2],
  },

  // ─────────────────────────────────────────────────────────
  // GOLD: 100% шмот (92% R, 8% E), 45% свиток x1-3
  // ─────────────────────────────────────────────────────────
  gold: {
    gold: 20000,
    itemChance: 1.0,
    rarityWeights: { rare: 92, epic: 8 },
    scrollChance: 0.45,
    scrollQty: [1, 3],
  },
};

// ═══════════════════════════════════════════════════════════
// CHEST UI CONFIG
// ═══════════════════════════════════════════════════════════

export interface ChestUIConfig {
  nameRu: string;
  nameEn: string;
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
  openDuration: number; // ms
}

export const CHEST_UI: Record<ChestType, ChestUIConfig> = {
  wood: {
    nameRu: 'Деревянный',
    nameEn: 'Wooden',
    icon: '🪵',
    color: 'text-amber-600',
    bgColor: 'bg-amber-900/30',
    borderColor: 'border-amber-700',
    openDuration: 5 * 60 * 1000,  // 5 минут
  },
  bronze: {
    nameRu: 'Бронзовый',
    nameEn: 'Bronze',
    icon: '🟫',
    color: 'text-orange-400',
    bgColor: 'bg-orange-900/30',
    borderColor: 'border-orange-600',
    openDuration: 30 * 60 * 1000,  // 30 минут
  },
  silver: {
    nameRu: 'Серебряный',
    nameEn: 'Silver',
    icon: '🪙',
    color: 'text-gray-300',
    bgColor: 'bg-gray-500/30',
    borderColor: 'border-gray-400',
    openDuration: 4 * 60 * 60 * 1000,  // 4 часа
  },
  gold: {
    nameRu: 'Золотой',
    nameEn: 'Gold',
    icon: '🟨',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-600/30',
    borderColor: 'border-yellow-500',
    openDuration: 8 * 60 * 60 * 1000,  // 8 часов
  },
};

// ═══════════════════════════════════════════════════════════
// RARITY STYLES (для UI)
// ═══════════════════════════════════════════════════════════

export interface RarityStyle {
  nameRu: string;
  nameEn: string;
  color: string;
  borderColor: string;
  glow: string;
  dropShadow: string;
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
};

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

/**
 * Роллит редкость предмета по таблице дропа
 * @returns Редкость или null если ничего не выпало
 */
export function rollItemRarity(chestType: ChestType): Rarity | null {
  const config = CHESTS[chestType];

  // Сначала проверяем шанс выпадения предмета вообще
  if (Math.random() >= config.itemChance) {
    return null;
  }

  // Предмет выпал — теперь определяем редкость по весам
  const weights = config.rarityWeights;
  const totalWeight = Object.values(weights).reduce((sum, w) => sum + (w || 0), 0);
  let roll = Math.random() * totalWeight;

  for (const [rarity, weight] of Object.entries(weights)) {
    if (!weight) continue;
    roll -= weight;
    if (roll <= 0) {
      return rarity as Rarity;
    }
  }

  // Fallback (shouldn't happen)
  return Object.keys(weights)[0] as Rarity;
}

/**
 * Роллит количество свитков заточки
 * @returns Количество свитков или 0 если не выпало
 */
export function rollEnchantScrolls(chestType: ChestType): number {
  const config = CHESTS[chestType];

  if (Math.random() >= config.scrollChance) {
    return 0;
  }

  const [min, max] = config.scrollQty;
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
    gold: CHESTS[chestType].gold,
    itemRarity: rollItemRarity(chestType),
    enchantScrolls: rollEnchantScrolls(chestType),
  };
}

// ═══════════════════════════════════════════════════════════
// TYPE MAPPING (server uses UPPERCASE)
// ═══════════════════════════════════════════════════════════

export function serverChestType(type: string): ChestType {
  const map: Record<string, ChestType> = {
    'WOODEN': 'wood',
    'BRONZE': 'bronze',
    'SILVER': 'silver',
    'GOLD': 'gold',
  };
  return map[type] || 'wood';
}
