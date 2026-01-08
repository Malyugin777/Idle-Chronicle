// ═══════════════════════════════════════════════════════════
// CRAFTING SYSTEM v1.2 - Salvage, Enchant, Broken Items
// Idle Chronicle
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic';
// 'legendary' disabled for now

export type SlotType =
  | 'weapon'
  | 'shield'
  | 'helmet'
  | 'armor'
  | 'gloves'
  | 'legs'
  | 'boots'
  | 'ring1'
  | 'ring2'
  | 'necklace';

export type ChestType = 'wooden' | 'bronze' | 'silver' | 'gold';

export interface ItemStats {
  pAtkFlat?: number;
  pDefFlat?: number;
  mAtkFlat?: number;
  mDefFlat?: number;
  critFlat?: number;
  atkSpdFlat?: number;
}

export interface InventoryItem {
  id: string;
  templateId: string;
  name: string;
  icon: string;
  slotType: SlotType;
  rarity: Rarity;
  baseStats: ItemStats;
  enchantLevel: number;
  setId?: string | null;
  // Broken Item System v1.2
  isBroken?: boolean;
  brokenUntil?: string | null;  // ISO date string
  enchantOnBreak?: number;
}

// Новая структура ресурсов v1.2
export interface PlayerResources {
  enchantDust: number;
  enchantCharges: number;
  protectionCharges: number;
  premiumCrystals: number;
  gold: number;
}

export interface EnchantResult {
  success: boolean;
  itemBroken: boolean;       // v1.2: предмет сломан (не удалён!)
  newEnchantLevel: number;
  chargeConsumed: boolean;   // v1.2: enchantCharge потрачен
  protectionConsumed: boolean;
}

// ═══════════════════════════════════════════════════════════
// CONSTANTS - SALVAGE v1.2
// ═══════════════════════════════════════════════════════════

// Выход только Enchant Dust по редкости (x3 на тир)
// v1.2: убраны материалы ore/leather/coal
export const SALVAGE_OUTPUT: Record<Rarity, number> = {
  common:   1,
  uncommon: 3,
  rare:     9,
  epic:    27,
};

// ═══════════════════════════════════════════════════════════
// CONSTANTS - ENCHANT
// ═══════════════════════════════════════════════════════════

export const MAX_ENCHANT_LEVEL = 20;
export const SAFE_ENCHANT_MAX = 3;

// Шанс успеха для рискованного энчанта (+4 и выше)
export const ENCHANT_SUCCESS_CHANCE: Record<number, number> = {
  4: 0.70,
  5: 0.60,
  6: 0.50,
  7: 0.42,
  8: 0.35,
  9: 0.28,
  10: 0.22,
  11: 0.18,
  12: 0.15,
  13: 0.12,
  14: 0.10,
  15: 0.08,
  16: 0.06,
  17: 0.05,
  18: 0.04,
  19: 0.03,
  20: 0.02,
};

// Стоимость энчанта в золоте (базовая + за уровень)
export const ENCHANT_GOLD_BASE = 100;
export const ENCHANT_GOLD_PER_LEVEL = 50;

// Стоимость энчанта в пыли
export const ENCHANT_DUST_BASE = 5;
export const ENCHANT_DUST_PER_LEVEL = 2;

// ═══════════════════════════════════════════════════════════
// CONSTANTS - BROKEN ITEMS v1.2
// ═══════════════════════════════════════════════════════════

// Таймер поломки (8 часов)
export const BROKEN_TIMER_MS = 8 * 60 * 60 * 1000;

// Базовая стоимость восстановления за 💎 по редкости
export const RESTORE_COST_BASE: Record<Rarity, number> = {
  common: 10,
  uncommon: 25,
  rare: 60,
  epic: 120,
};

// ═══════════════════════════════════════════════════════════
// CONSTANTS - ENCHANT CHARGES FROM CHESTS v1.2
// ═══════════════════════════════════════════════════════════

export const CHEST_ENCHANT_CHARGES: Record<ChestType, { min: number; max: number }> = {
  wooden: { min: 1, max: 2 },
  bronze: { min: 2, max: 4 },
  silver: { min: 4, max: 8 },
  gold:   { min: 8, max: 15 },
};

// Шанс дропа Protection из Gold сундуков
export const PROTECTION_DROP_CHANCE = 0.05; // 5%

// Стоимость покупки Protection за 💎
export const PROTECTION_BUY_COST = 50;

// ═══════════════════════════════════════════════════════════
// CONSTANTS - FUSION
// ═══════════════════════════════════════════════════════════

// Сколько предметов нужно для слияния в сундук следующей редкости
export const FUSION_REQUIREMENTS: Record<Rarity, { count: number; resultChest: ChestType } | null> = {
  common:   { count: 5, resultChest: 'bronze' },  // 5 Common -> Bronze (Uncommon) chest
  uncommon: { count: 5, resultChest: 'silver' },  // 5 Uncommon -> Silver (Rare) chest
  rare:     { count: 4, resultChest: 'gold' },    // 4 Rare -> Gold (Epic) chest
  epic:     null, // No fusion for Epic
};

// ═══════════════════════════════════════════════════════════
// PURE FUNCTIONS - SALVAGE v1.2
// ═══════════════════════════════════════════════════════════

/**
 * Получить выход Enchant Dust от разбора предмета
 * v1.2: возвращает только dust, без материалов
 */
export function getSalvageOutput(item: InventoryItem): number {
  // Broken items нельзя разбирать
  if (item.isBroken) return 0;
  return SALVAGE_OUTPUT[item.rarity] || 0;
}

/**
 * Разобрать несколько предметов и получить суммарный Enchant Dust
 * v1.2: возвращает только число dust
 */
export function salvageItems(items: InventoryItem[]): number {
  let totalDust = 0;
  for (const item of items) {
    // Пропускаем broken items
    if (!item.isBroken) {
      totalDust += getSalvageOutput(item);
    }
  }
  return totalDust;
}

/**
 * Превью разбора (для UI)
 * v1.2: показывает только dust
 */
export function previewSalvage(items: InventoryItem[]): {
  dustAmount: number;
  itemCount: number;
} {
  // Фильтруем broken items
  const validItems = items.filter(item => !item.isBroken);
  return {
    dustAmount: salvageItems(validItems),
    itemCount: validItems.length,
  };
}

/**
 * Стоимость восстановления сломанного предмета в 💎
 */
export function getRestoreCost(rarity: Rarity, enchantLevel: number): number {
  const base = RESTORE_COST_BASE[rarity] || 10;
  return Math.floor(base * (1 + enchantLevel * 0.25));
}

/**
 * Получить оставшееся время до удаления сломанного предмета
 */
export function getBrokenTimeRemaining(brokenUntil: string | null): number {
  if (!brokenUntil) return 0;
  const until = new Date(brokenUntil).getTime();
  const now = Date.now();
  return Math.max(0, until - now);
}

/**
 * Форматировать время до удаления (ЧЧ:ММ:СС)
 */
export function formatBrokenTimer(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((ms % (1000 * 60)) / 1000);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════════
// PURE FUNCTIONS - ENCHANT
// ═══════════════════════════════════════════════════════════

/**
 * Получить шанс успеха энчанта для текущего уровня
 * Возвращает шанс для СЛЕДУЮЩЕГО уровня (текущий +1)
 */
export function getEnchantChance(currentLevel: number): number {
  const targetLevel = currentLevel + 1;

  if (targetLevel <= SAFE_ENCHANT_MAX) {
    return 1.0; // 100% для безопасного энчанта
  }

  if (targetLevel > MAX_ENCHANT_LEVEL) {
    return 0; // Нельзя энчантить выше максимума
  }

  return ENCHANT_SUCCESS_CHANCE[targetLevel] || 0;
}

/**
 * Проверить, является ли энчант безопасным
 */
export function isSafeEnchant(currentLevel: number): boolean {
  return currentLevel < SAFE_ENCHANT_MAX;
}

/**
 * Получить множитель статов от энчанта
 * +1 to +3: +5% each = 1.05, 1.10, 1.15
 * +4 to +10: +3% each = 1.18, 1.21, ... 1.36
 * +11 to +20: +2% each = 1.38, 1.40, ... 1.56
 */
export function getEnchantMultiplier(level: number): number {
  if (level <= 0) return 1.0;

  let multiplier = 1.0;

  // Levels 1-3: +5% each
  const tier1Levels = Math.min(level, 3);
  multiplier += tier1Levels * 0.05;

  // Levels 4-10: +3% each
  if (level > 3) {
    const tier2Levels = Math.min(level, 10) - 3;
    multiplier += tier2Levels * 0.03;
  }

  // Levels 11-20: +2% each
  if (level > 10) {
    const tier3Levels = Math.min(level, 20) - 10;
    multiplier += tier3Levels * 0.02;
  }

  return multiplier;
}

/**
 * Получить стоимость энчанта
 */
export function getEnchantCost(currentLevel: number): { gold: number; dust: number } {
  return {
    gold: ENCHANT_GOLD_BASE + currentLevel * ENCHANT_GOLD_PER_LEVEL,
    dust: ENCHANT_DUST_BASE + currentLevel * ENCHANT_DUST_PER_LEVEL,
  };
}

/**
 * Проверить, можно ли точить предмет
 * v1.2: любой предмет можно точить universal charges
 */
export function canEnchantItem(item: InventoryItem): boolean {
  // Нельзя точить broken items
  if (item.isBroken) return false;
  // Нельзя точить выше максимума
  if (item.enchantLevel >= MAX_ENCHANT_LEVEL) return false;
  return true;
}

/**
 * Получить список предметов, подходящих для заточки
 * v1.2: все не-broken предметы с enchant < MAX
 */
export function getEnchantableItems(inventory: InventoryItem[]): InventoryItem[] {
  return inventory.filter(item => canEnchantItem(item));
}

/**
 * Попытка энчанта (чистая функция - только расчёт)
 * v1.2: использует charges вместо scrolls, broken вместо destroyed
 */
export function calculateEnchantResult(
  item: InventoryItem,
  useProtection: boolean,
  randomValue: number // 0-1, для тестирования передавать фиксированное значение
): EnchantResult {
  const chance = getEnchantChance(item.enchantLevel);
  const success = randomValue < chance;
  const isSafe = isSafeEnchant(item.enchantLevel);

  if (success) {
    return {
      success: true,
      itemBroken: false,
      newEnchantLevel: item.enchantLevel + 1,
      chargeConsumed: true,
      protectionConsumed: useProtection && !isSafe,
    };
  }

  // Провал
  if (isSafe) {
    // Безопасный энчант не может провалиться, но на всякий случай
    return {
      success: false,
      itemBroken: false,
      newEnchantLevel: item.enchantLevel,
      chargeConsumed: true,
      protectionConsumed: false,
    };
  }

  // Рискованный провал
  if (useProtection) {
    // С Protection: -1 уровень, не ломается
    return {
      success: false,
      itemBroken: false,
      newEnchantLevel: Math.max(0, item.enchantLevel - 1),
      chargeConsumed: true,
      protectionConsumed: true,
    };
  }

  // Провал без защиты - предмет ЛОМАЕТСЯ (не удаляется!)
  return {
    success: false,
    itemBroken: true,
    newEnchantLevel: item.enchantLevel, // Сохраняем для restore -1
    chargeConsumed: true,
    protectionConsumed: false,
  };
}

/**
 * Применить множитель энчанта к статам
 */
export function applyEnchantToStats(baseStats: ItemStats, enchantLevel: number): ItemStats {
  const multiplier = getEnchantMultiplier(enchantLevel);

  const result: ItemStats = {};

  if (baseStats.pAtkFlat) result.pAtkFlat = Math.floor(baseStats.pAtkFlat * multiplier);
  if (baseStats.pDefFlat) result.pDefFlat = Math.floor(baseStats.pDefFlat * multiplier);
  if (baseStats.mAtkFlat) result.mAtkFlat = Math.floor(baseStats.mAtkFlat * multiplier);
  if (baseStats.mDefFlat) result.mDefFlat = Math.floor(baseStats.mDefFlat * multiplier);
  if (baseStats.critFlat) result.critFlat = Math.floor(baseStats.critFlat * multiplier);
  if (baseStats.atkSpdFlat) result.atkSpdFlat = Math.floor(baseStats.atkSpdFlat * multiplier);

  return result;
}

// ═══════════════════════════════════════════════════════════
// PURE FUNCTIONS - FUSION
// ═══════════════════════════════════════════════════════════

/**
 * Получить требования для фьюжна
 */
export function getFusionRequirements(rarity: Rarity): {
  count: number;
  resultChest: ChestType;
} | null {
  return FUSION_REQUIREMENTS[rarity];
}

/**
 * Получить предметы, подходящие для фьюжна определённой редкости
 */
export function getItemsForFusion(
  inventory: InventoryItem[],
  rarity: Rarity
): InventoryItem[] {
  return inventory.filter(item => item.rarity === rarity);
}

/**
 * Проверить, можно ли выполнить фьюжн
 */
export function canFuse(inventory: InventoryItem[], rarity: Rarity): boolean {
  const req = FUSION_REQUIREMENTS[rarity];
  if (!req) return false;

  const items = getItemsForFusion(inventory, rarity);
  return items.length >= req.count;
}

/**
 * Получить количество возможных фьюжнов
 */
export function getMaxFusions(inventory: InventoryItem[], rarity: Rarity): number {
  const req = FUSION_REQUIREMENTS[rarity];
  if (!req) return 0;

  const items = getItemsForFusion(inventory, rarity);
  return Math.floor(items.length / req.count);
}

// ═══════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════

/**
 * Форматирование редкости для UI
 */
export const RARITY_COLORS: Record<Rarity, string> = {
  common: 'text-gray-400',
  uncommon: 'text-green-400',
  rare: 'text-blue-400',
  epic: 'text-purple-400',
};

export const RARITY_BG_COLORS: Record<Rarity, string> = {
  common: 'bg-gray-500/20 border-gray-500/30',
  uncommon: 'bg-green-500/20 border-green-500/30',
  rare: 'bg-blue-500/20 border-blue-500/30',
  epic: 'bg-purple-500/20 border-purple-500/30',
};

export const RARITY_NAMES: Record<Rarity, { ru: string; en: string }> = {
  common: { ru: 'Обычный', en: 'Common' },
  uncommon: { ru: 'Необычный', en: 'Uncommon' },
  rare: { ru: 'Редкий', en: 'Rare' },
  epic: { ru: 'Эпический', en: 'Epic' },
};

// v1.2: Новые ресурсы
export const RESOURCE_NAMES = {
  enchantDust: { ru: 'Пыль энчанта', en: 'Enchant Dust', icon: '✨' },
  enchantCharges: { ru: 'Заряды заточки', en: 'Enchant Charges', icon: '⚡' },
  protectionCharges: { ru: 'Защита', en: 'Protection', icon: '🛡️' },
  premiumCrystals: { ru: 'Кристаллы', en: 'Crystals', icon: '💎' },
  gold: { ru: 'Золото', en: 'Gold', icon: '🪙' },
};

// ═══════════════════════════════════════════════════════════
// DEBUG / TEST HELPERS
// ═══════════════════════════════════════════════════════════

/**
 * Тест: проверка таблицы множителей энчанта
 */
export function debugEnchantMultipliers(): void {
  console.log('=== Enchant Multipliers ===');
  for (let level = 0; level <= 20; level++) {
    const mult = getEnchantMultiplier(level);
    console.log(`+${level}: x${mult.toFixed(2)} (+${((mult - 1) * 100).toFixed(0)}%)`);
  }
}

/**
 * Тест: проверка шансов энчанта
 */
export function debugEnchantChances(): void {
  console.log('=== Enchant Chances ===');
  for (let level = 0; level <= 20; level++) {
    const chance = getEnchantChance(level);
    const isSafe = isSafeEnchant(level);
    console.log(`+${level} -> +${level + 1}: ${(chance * 100).toFixed(0)}% ${isSafe ? '(SAFE)' : ''}`);
  }
}

/**
 * Тест: проверка выхода от разбора (v1.2 - только dust)
 */
export function debugSalvageOutput(): void {
  console.log('=== Salvage Output (Enchant Dust) ===');
  const rarities: Rarity[] = ['common', 'uncommon', 'rare', 'epic'];
  for (const rarity of rarities) {
    const dust = SALVAGE_OUTPUT[rarity];
    console.log(`${rarity}: ${dust} dust`);
  }
}
