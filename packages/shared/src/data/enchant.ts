// ═══════════════════════════════════════════════════════════
// ENCHANT SYSTEM CONFIG v1.3
// Единый конфиг для сервера и клиента
// ═══════════════════════════════════════════════════════════

// Максимальный уровень заточки
export const ENCHANT_MAX_LEVEL = 20;

// До какого уровня заточка безопасная (100% успех)
export const ENCHANT_SAFE_LEVEL = 3; // +0→+3 = 100%

// Бонус за уровень заточки (3% от базового стата за уровень)
export const ENCHANT_BONUS_PER_LEVEL = 0.03;

// Время поломки предмета (8 часов)
export const ENCHANT_BROKEN_DURATION_MS = 8 * 60 * 60 * 1000;

// Шансы успеха по целевому уровню (+4 и выше)
export const ENCHANT_CHANCES: Record<number, number> = {
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

// Стоимость заточки
export const ENCHANT_COST = {
  chargesNormal: 1,    // 1 enchantCharge для обычной
  chargesSafe: 1,      // 1 enchantCharge + 1 protectionCharge для безопасной
  protectionSafe: 1,   // 1 protectionCharge для безопасной
};

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

/**
 * Получить шанс успеха заточки
 * @param targetLevel - целевой уровень (текущий + 1)
 * @returns шанс от 0 до 1 (1.0 = 100%)
 */
export function getEnchantChance(targetLevel: number): number {
  if (targetLevel <= ENCHANT_SAFE_LEVEL) return 1.0;
  return ENCHANT_CHANCES[targetLevel] ?? 0;
}

/**
 * Проверить, находится ли заточка в безопасной зоне
 * @param currentLevel - текущий уровень заточки
 * @returns true если следующий уровень <= SAFE_LEVEL
 */
export function isInSafeZone(currentLevel: number): boolean {
  return (currentLevel + 1) <= ENCHANT_SAFE_LEVEL;
}

/**
 * Рассчитать бонус заточки для стата
 * @param baseStat - базовый стат предмета
 * @param enchantLevel - уровень заточки
 * @returns бонус от заточки (целое число)
 */
export function calculateEnchantBonus(baseStat: number, enchantLevel: number): number {
  if (enchantLevel <= 0) return 0;
  return Math.floor(baseStat * enchantLevel * ENCHANT_BONUS_PER_LEVEL);
}

/**
 * Рассчитать итоговый стат с заточкой
 * @param baseStat - базовый стат предмета
 * @param enchantLevel - уровень заточки
 * @returns итоговый стат
 */
export function calculateEnchantedStat(baseStat: number, enchantLevel: number): number {
  return baseStat + calculateEnchantBonus(baseStat, enchantLevel);
}
