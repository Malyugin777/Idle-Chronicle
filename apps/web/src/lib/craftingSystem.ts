// ═══════════════════════════════════════════════════════════
// CRAFTING SYSTEM - Salvage, Enchant, Fusion
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

export type MaterialType = 'ore' | 'leather' | 'coal' | 'enchantDust';

export type ScrollType = 'enchantWeapon' | 'enchantArmor' | 'protection';

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
}

export interface Materials {
  ore: number;
  leather: number;
  coal: number;
  enchantDust: number;
}

export interface Scrolls {
  enchantWeapon: number;
  enchantArmor: number;
  protection: number;
}

export interface SalvageOutput {
  baseMaterial: MaterialType;
  baseMaterialAmount: number;
  dustAmount: number;
}

export interface EnchantResult {
  success: boolean;
  itemDestroyed: boolean;
  newEnchantLevel: number;
  scrollConsumed: boolean;
  protectionConsumed: boolean;
}

// ═══════════════════════════════════════════════════════════
// CONSTANTS - SALVAGE
// ═══════════════════════════════════════════════════════════

// Материал по слоту
export const SLOT_TO_MATERIAL: Record<SlotType, MaterialType> = {
  weapon: 'ore',
  shield: 'leather',
  helmet: 'leather',
  armor: 'leather',
  gloves: 'leather',
  legs: 'leather',
  boots: 'leather',
  ring1: 'coal',
  ring2: 'coal',
  necklace: 'coal',
};

// Выход материалов по редкости (x3 на тир)
export const SALVAGE_OUTPUT: Record<Rarity, { baseMat: number; dust: number }> = {
  common:   { baseMat: 2,  dust: 1 },
  uncommon: { baseMat: 6,  dust: 3 },
  rare:     { baseMat: 18, dust: 9 },
  epic:     { baseMat: 54, dust: 27 },
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
// CONSTANTS - SCROLL CRAFTING
// ═══════════════════════════════════════════════════════════

export const SCROLL_RECIPES: Record<ScrollType, { dust: number; gold: number; coal?: number }> = {
  enchantWeapon: { dust: 10, gold: 500 },
  enchantArmor:  { dust: 10, gold: 500 },
  protection:    { dust: 20, gold: 1000, coal: 5 },
};

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
// PURE FUNCTIONS - SALVAGE
// ═══════════════════════════════════════════════════════════

/**
 * Получить выход материалов от разбора предмета
 */
export function getSalvageOutput(item: InventoryItem): SalvageOutput {
  const material = SLOT_TO_MATERIAL[item.slotType];
  const output = SALVAGE_OUTPUT[item.rarity];

  return {
    baseMaterial: material,
    baseMaterialAmount: output.baseMat,
    dustAmount: output.dust,
  };
}

/**
 * Разобрать несколько предметов и получить суммарный выход
 */
export function salvageItems(items: InventoryItem[]): Materials {
  const result: Materials = {
    ore: 0,
    leather: 0,
    coal: 0,
    enchantDust: 0,
  };

  for (const item of items) {
    const output = getSalvageOutput(item);
    result[output.baseMaterial] += output.baseMaterialAmount;
    result.enchantDust += output.dustAmount;
  }

  return result;
}

/**
 * Превью разбора (для UI)
 */
export function previewSalvage(items: InventoryItem[]): {
  materials: Materials;
  itemCount: number;
} {
  return {
    materials: salvageItems(items),
    itemCount: items.length,
  };
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
 * Проверить, подходит ли свиток для предмета
 */
export function isScrollValidForItem(scrollType: ScrollType, item: InventoryItem): boolean {
  if (scrollType === 'protection') return false; // Protection не используется напрямую

  if (scrollType === 'enchantWeapon') {
    return item.slotType === 'weapon';
  }

  if (scrollType === 'enchantArmor') {
    // Все слоты кроме оружия и аксессуаров
    return ['shield', 'helmet', 'armor', 'gloves', 'legs', 'boots'].includes(item.slotType);
  }

  return false;
}

/**
 * Получить список предметов, подходящих для свитка
 */
export function getValidItemsForScroll(
  scrollType: ScrollType,
  inventory: InventoryItem[]
): InventoryItem[] {
  return inventory.filter(item =>
    isScrollValidForItem(scrollType, item) &&
    item.enchantLevel < MAX_ENCHANT_LEVEL
  );
}

/**
 * Попытка энчанта (чистая функция - только расчёт)
 * Возвращает результат без побочных эффектов
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
      itemDestroyed: false,
      newEnchantLevel: item.enchantLevel + 1,
      scrollConsumed: true,
      protectionConsumed: useProtection && !isSafe,
    };
  }

  // Провал
  if (isSafe) {
    // Безопасный энчант не может провалиться, но на всякий случай
    return {
      success: false,
      itemDestroyed: false,
      newEnchantLevel: item.enchantLevel,
      scrollConsumed: true,
      protectionConsumed: false,
    };
  }

  // Рискованный провал
  if (useProtection) {
    return {
      success: false,
      itemDestroyed: false,
      newEnchantLevel: Math.max(0, item.enchantLevel - 1),
      scrollConsumed: true,
      protectionConsumed: true,
    };
  }

  // Провал без защиты - предмет уничтожен
  return {
    success: false,
    itemDestroyed: true,
    newEnchantLevel: 0,
    scrollConsumed: true,
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
// PURE FUNCTIONS - SCROLL CRAFTING
// ═══════════════════════════════════════════════════════════

/**
 * Проверить, можно ли скрафтить свиток
 */
export function canCraftScroll(
  scrollType: ScrollType,
  materials: Materials,
  gold: number,
  quantity: number = 1
): boolean {
  const recipe = SCROLL_RECIPES[scrollType];

  if (materials.enchantDust < recipe.dust * quantity) return false;
  if (gold < recipe.gold * quantity) return false;
  if (recipe.coal && materials.coal < recipe.coal * quantity) return false;

  return true;
}

/**
 * Получить стоимость крафта свитка
 */
export function getScrollCraftCost(scrollType: ScrollType, quantity: number = 1): {
  dust: number;
  gold: number;
  coal: number;
} {
  const recipe = SCROLL_RECIPES[scrollType];
  return {
    dust: recipe.dust * quantity,
    gold: recipe.gold * quantity,
    coal: (recipe.coal || 0) * quantity,
  };
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

export const MATERIAL_NAMES: Record<MaterialType, { ru: string; en: string; icon: string }> = {
  ore: { ru: 'Руда', en: 'Ore', icon: '🪨' },
  leather: { ru: 'Кожа', en: 'Leather', icon: '🧶' },
  coal: { ru: 'Уголь', en: 'Coal', icon: 'ite' },
  enchantDust: { ru: 'Пыль энчанта', en: 'Enchant Dust', icon: '✨' },
};

export const SCROLL_NAMES: Record<ScrollType, { ru: string; en: string; icon: string }> = {
  enchantWeapon: { ru: 'Свиток: Оружие', en: 'Scroll: Weapon', icon: '📜⚔️' },
  enchantArmor: { ru: 'Свиток: Броня', en: 'Scroll: Armor', icon: '📜🛡️' },
  protection: { ru: 'Свиток: Защита', en: 'Scroll: Protection', icon: '📜💎' },
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
 * Тест: проверка выхода от разбора
 */
export function debugSalvageOutput(): void {
  console.log('=== Salvage Output ===');
  const rarities: Rarity[] = ['common', 'uncommon', 'rare', 'epic'];
  for (const rarity of rarities) {
    const output = SALVAGE_OUTPUT[rarity];
    console.log(`${rarity}: ${output.baseMat} base mat, ${output.dust} dust`);
  }
}
