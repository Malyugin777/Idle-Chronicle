// ═══════════════════════════════════════════════════════════
// STATS SERVICE — L2-style формулы расчёта характеристик
// Портировано из huihui проекта
// ═══════════════════════════════════════════════════════════

'use strict';

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════

const ATTRIBUTE_DEFAULTS = {
  power: 10,         // → Physical Power (P.Atk)
  agility: 10,       // → Attack Speed, Crit Chance
  vitality: 10,      // → Max Health, Max Stamina
  intellect: 10,     // → Magic Power (будущее)
  spirit: 10,        // → Max Mana (будущее)
};

// Modifier tables - экспоненциальный рост статов
function buildModTable(base, min = 1, max = 99, offset = 10) {
  const table = {};
  for (let s = min; s <= max; s++) {
    table[s] = Math.pow(base, s - offset);
  }
  return table;
}

const POWER_MOD = buildModTable(1.036);      // +3.6% за каждый пункт
const AGILITY_MOD = buildModTable(1.009);    // +0.9% за каждый пункт
const VITALITY_MOD = buildModTable(1.030);   // +3.0% за каждый пункт
const INTELLECT_MOD = buildModTable(1.020);  // +2.0% за каждый пункт
const SPIRIT_MOD = buildModTable(1.010);     // +1.0% за каждый пункт

// Combat constants
const TAP_COST_BASE = 1;
const STAMINA_REGEN_PER_SEC = 1;
const EXHAUSTION_DURATION_MS = 5000;
const MIN_AUTO_ATTACK_INTERVAL_MS = 250;
const BASE_ATTACK_INTERVAL_MS = 2000;

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, Math.round(Number(val) || min)));
}

function clampStat(val) {
  return clamp(val, 1, 99);
}

// ═══════════════════════════════════════════════════════════
// DERIVED STATS CALCULATION
// ═══════════════════════════════════════════════════════════

/**
 * Рассчитывает производные статы на основе атрибутов и уровня
 * @param {Object} attributes - { power, agility, vitality, intellect, spirit }
 * @param {number} level - уровень персонажа
 * @param {Object} bonuses - { flat: {}, pct: {} } бонусы от экипировки
 * @returns {Object} derived stats
 */
function calculateDerived(attributes, level = 1, bonuses = {}) {
  const lvl = clamp(level, 1, 99);
  const flat = bonuses.flat || {};
  const pct = bonuses.pct || {};

  // Get modifiers from tables
  const powerMod = POWER_MOD[clampStat(attributes.power)];
  const agilityMod = AGILITY_MOD[clampStat(attributes.agility)];
  const vitalityMod = VITALITY_MOD[clampStat(attributes.vitality)];
  const intellectMod = INTELLECT_MOD[clampStat(attributes.intellect)];
  const spiritMod = SPIRIT_MOD[clampStat(attributes.spirit)];

  // Base values by level
  const baseHealth = 80 + 12 * (lvl - 1) + 0.37 * ((lvl - 1) * (lvl - 2) / 2);
  const baseMana = 30 + 5.5 * (lvl - 1) + 0.16 * ((lvl - 1) * (lvl - 2) / 2);
  const basePhysicalPower = 4 + lvl * 2;
  const baseMagicPower = 2 + lvl;
  const basePhysicalDef = 40;
  const baseMagicDef = 25;
  const baseAttackSpeed = 300;

  // Calculate derived stats
  const maxHealth = Math.floor(baseHealth * vitalityMod * (1 + (pct.healthMax || 0))) + (flat.healthMax || 0);
  const maxMana = Math.floor(baseMana * spiritMod * (1 + (pct.manaMax || 0))) + (flat.manaMax || 0);

  // STAMINA: max(100, floor(maxHealth * 10)) - ключевая формула из ТЗ
  const maxStamina = Math.max(100, Math.floor(maxHealth * 10));

  const physicalPower = Math.floor(basePhysicalPower * powerMod * (1 + (pct.physicalPower || 0))) + (flat.physicalPower || 0);
  const magicPower = Math.floor(baseMagicPower * intellectMod * (1 + (pct.magicPower || 0))) + (flat.magicPower || 0);

  const attackSpeed = Math.floor(baseAttackSpeed * agilityMod * (1 + (pct.attackSpeed || 0))) + (flat.attackSpeed || 0);

  const physicalDefense = Math.floor(basePhysicalDef * (1 + (pct.physicalDefense || 0))) + (flat.physicalDefense || 0);
  const magicDefense = Math.floor(baseMagicDef * (1 + (pct.magicDefense || 0))) + (flat.magicDefense || 0);

  // Crit from agility
  const baseCrit = 0.05;
  const agilityCritBonus = (clampStat(attributes.agility) - 10) * 0.002;
  const critChance = Math.min(0.5, Math.max(0, baseCrit + agilityCritBonus + (flat.critChance || 0) + (pct.critChance || 0)));
  const critMultiplier = 2.0 + (flat.critMultiplier || 0) + (pct.critMultiplier || 0);

  return {
    maxHealth,
    maxMana,
    maxStamina,
    physicalPower,
    magicPower,
    physicalDefense,
    magicDefense,
    attackSpeed,
    critChance,
    critMultiplier,
  };
}

// ═══════════════════════════════════════════════════════════
// ATTACK INTERVAL
// ═══════════════════════════════════════════════════════════

/**
 * Рассчитывает интервал авто-атаки в миллисекундах
 * @param {number} attackSpeed - скорость атаки (300 = базовая)
 * @returns {number} интервал в мс (min 250ms)
 */
function getAttackInterval(attackSpeed) {
  // attackSpeed 300 = 1000ms, attackSpeed 600 = 500ms
  const interval = Math.floor(300000 / Math.max(100, attackSpeed));
  return Math.max(MIN_AUTO_ATTACK_INTERVAL_MS, interval);
}

// ═══════════════════════════════════════════════════════════
// DAMAGE CALCULATION
// ═══════════════════════════════════════════════════════════

/**
 * Рассчитывает урон от удара
 * @param {Object} attacker - { physicalPower, critChance, critMultiplier }
 * @param {Object} defender - { physicalDefense }
 * @param {boolean} isPhysical - физический или магический урон
 * @returns {Object} { damage, isCrit }
 */
function calculateDamage(attacker, defender = {}, isPhysical = true) {
  const power = isPhysical ? attacker.physicalPower : attacker.magicPower;
  const defense = isPhysical ? (defender.physicalDefense || 0) : (defender.magicDefense || 0);

  // Base damage with variance ±20%
  const variance = 0.2;
  const rawDamage = power * (1 + (Math.random() * variance * 2 - variance));

  // Defense reduction (soft cap) - та же формула что и для thorns
  const defReduction = defense / (defense + 100);
  let damage = Math.floor(rawDamage * (1 - defReduction * 0.5));

  // Crit check
  const isCrit = Math.random() < (attacker.critChance || 0.05);
  if (isCrit) {
    damage = Math.floor(damage * (attacker.critMultiplier || 2.0));
  }

  return { damage: Math.max(1, damage), isCrit };
}

/**
 * Простой расчёт урона (для авто-атаки)
 * @param {number} physicalPower
 * @returns {number} урон
 */
function calculateBaseDamage(physicalPower) {
  return Math.floor(physicalPower);
}

// ═══════════════════════════════════════════════════════════
// THORNS (ОБРАТКА)
// ═══════════════════════════════════════════════════════════

/**
 * Рассчитывает урон от шипов босса после снижения бронёй
 * Формула: thornsTaken = ceil(rawThorns * 100 / (100 + pDef))
 * @param {number} rawThorns - базовый урон шипов босса
 * @param {number} pDef - физическая защита героя
 * @returns {number} фактический урон от шипов
 */
function calculateThorns(rawThorns, pDef) {
  if (rawThorns <= 0) return 0;
  // Softcap formula - броня снижает, но никогда не в ноль
  return Math.ceil(rawThorns * 100 / (100 + Math.max(0, pDef)));
}

/**
 * Рассчитывает стоимость тапа в stamina
 * @param {number} thornsTaken - урон от шипов после брони
 * @returns {number} стоимость в stamina
 */
function getStaminaCost(thornsTaken) {
  return TAP_COST_BASE + thornsTaken;
}

// ═══════════════════════════════════════════════════════════
// EXHAUSTION
// ═══════════════════════════════════════════════════════════

/**
 * Создаёт timestamp окончания exhaustion
 * @returns {number} timestamp когда exhaustion закончится
 */
function createExhaustionUntil() {
  return Date.now() + EXHAUSTION_DURATION_MS;
}

/**
 * Проверяет, находится ли игрок в exhaustion
 * @param {number|null} exhaustedUntil - timestamp окончания exhaustion
 * @returns {boolean}
 */
function isExhausted(exhaustedUntil) {
  if (!exhaustedUntil) return false;
  return Date.now() < exhaustedUntil;
}

// ═══════════════════════════════════════════════════════════
// OFFLINE PROGRESS
// ═══════════════════════════════════════════════════════════

const MAX_OFFLINE_HOURS = 4; // Кап 4 часа

/**
 * Рассчитывает оффлайн-прогресс
 * @param {Object} user - { attackSpeed, physicalPower, lastOnline }
 * @returns {Object} { offlineHours, totalDamage, goldEarned, expEarned, attacksSimulated }
 */
function calculateOfflineProgress(user) {
  const now = Date.now();
  const lastOnline = user.lastOnline instanceof Date ? user.lastOnline.getTime() : user.lastOnline;
  const offlineMs = now - lastOnline;
  const offlineSeconds = Math.min(offlineMs / 1000, MAX_OFFLINE_HOURS * 3600);

  if (offlineSeconds < 60) {
    // Меньше минуты - нет награды
    return { offlineHours: 0, totalDamage: 0, goldEarned: 0, expEarned: 0, attacksSimulated: 0 };
  }

  // Рассчитываем сколько авто-атак произошло бы
  const attackInterval = getAttackInterval(user.attackSpeed || 300);
  const attacksPerSecond = 1000 / attackInterval;
  const totalAttacks = Math.floor(offlineSeconds * attacksPerSecond);

  // Урон
  const damagePerAttack = calculateBaseDamage(user.physicalPower || 10);
  const totalDamage = totalAttacks * damagePerAttack;

  // Gold (1 gold per 100 damage)
  const goldEarned = Math.floor(totalDamage / 100);

  // Exp (1 exp per 50 damage)
  const expEarned = Math.floor(totalDamage / 50);

  return {
    offlineHours: Math.round(offlineSeconds / 3600 * 10) / 10,
    totalDamage,
    goldEarned,
    expEarned,
    attacksSimulated: totalAttacks,
  };
}

// ═══════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════

module.exports = {
  // Constants
  ATTRIBUTE_DEFAULTS,
  TAP_COST_BASE,
  STAMINA_REGEN_PER_SEC,
  EXHAUSTION_DURATION_MS,
  MIN_AUTO_ATTACK_INTERVAL_MS,
  MAX_OFFLINE_HOURS,

  // Functions
  calculateDerived,
  getAttackInterval,
  calculateDamage,
  calculateBaseDamage,
  calculateThorns,
  getStaminaCost,
  createExhaustionUntil,
  isExhausted,
  calculateOfflineProgress,

  // Helpers
  clamp,
  clampStat,
};
