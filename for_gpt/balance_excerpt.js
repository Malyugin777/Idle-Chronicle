// ═══════════════════════════════════════════════════════════
// БАЛАНС IDLE CHRONICLE - MVP ФОРМУЛЫ
// Обновлено: 2024-01-06
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// БАЗОВЫЕ СТАТЫ НА СТАРТЕ
// ═══════════════════════════════════════════════════════════

const STARTING_STATS = {
  power: 10,      // СИЛ → P.Atk
  agility: 10,    // ЛОВ → Crit, Atk.Spd
  vitality: 12,   // СТОЙ → MaxStamina (12 для "длинной сессии")
  intellect: 10,  // ИНТ → Skill Power
  spirit: 10,     // ДУХ → MaxMana, Mana Regen
};

// ═══════════════════════════════════════════════════════════
// ПРОИЗВОДНЫЕ СТАТЫ (MVP формулы)
// ═══════════════════════════════════════════════════════════

// P.Atk = 10 (база кулаками) + (СИЛ - 10) * 1 + equipment
// При СИЛ 10 → P.Atk = 10
// При СИЛ 20 → P.Atk = 20

// P.Def = 0 (голый) + equipment
// Стартовый сет даёт +11 P.Def

// MaxStamina = 800 + (СТОЙ - 10) * 80
// При СТОЙ 10 → 800
// При СТОЙ 12 → 960
// При СТОЙ 20 → 1600

// MaxMana = 100 + (ДУХ - 10) * 10
// При ДУХ 10 → 100
// При ДУХ 20 → 200

// Crit = 5% + (ЛОВ - 10) * 0.2%
// При ЛОВ 10 → 5%
// При ЛОВ 20 → 7%

// Atk.Spd = 300 + (ЛОВ - 10) * 10
// 300 = ~1 атака в секунду

// ═══════════════════════════════════════════════════════════
// СТАРТОВЫЕ ПРОИЗВОДНЫЕ (при СТОЙ=12, остальные=10)
// ═══════════════════════════════════════════════════════════

const STARTING_DERIVED = {
  pAtk: 10,           // 10 (база кулаками)
  pDef: 0,            // 0 (голый) → +11 со стартовым сетом
  critChance: 0.05,   // 5%
  critMultiplier: 2.0,
  attackSpeed: 300,   // ~1 атака/сек
  maxStamina: 960,    // 800 + 2*80
  maxMana: 100,
  maxHealth: 140,     // 100 + 2*20
};

// ═══════════════════════════════════════════════════════════
// СТАРТОВЫЙ СЕТ ЭКИПИРОВКИ
// ═══════════════════════════════════════════════════════════

const STARTER_EQUIPMENT = [
  { slot: 'WEAPON',  name: 'Меч новичка',       icon: '🗡️', pAtk: 10, pDef: 0 },
  { slot: 'HELMET',  name: 'Шлем новичка',      icon: '⛑️', pAtk: 0,  pDef: 2 },
  { slot: 'CHEST',   name: 'Нагрудник новичка', icon: '🎽', pAtk: 0,  pDef: 3 },
  { slot: 'GLOVES',  name: 'Перчатки новичка',  icon: '🧤', pAtk: 0,  pDef: 1 },
  { slot: 'LEGS',    name: 'Поножи новичка',    icon: '👖', pAtk: 0,  pDef: 2 },
  { slot: 'BOOTS',   name: 'Ботинки новичка',   icon: '👢', pAtk: 0,  pDef: 1 },
  { slot: 'SHIELD',  name: 'Щит новичка',       icon: '🛡️', pAtk: 0,  pDef: 2 },
];
// ИТОГО стартовый сет: +10 P.Atk, +11 P.Def
// С сетом: P.Atk = 20, P.Def = 11

// ═══════════════════════════════════════════════════════════
// СТАТЫ ЭКИПИРОВКИ ПО РЕДКОСТИ
// ═══════════════════════════════════════════════════════════

const rarityStats = {
  COMMON:   { pAtkMin: 10, pAtkMax: 10, pDefMin: 2, pDefMax: 2 },
  UNCOMMON: { pAtkMin: 12, pAtkMax: 13, pDefMin: 3, pDefMax: 4 },
  RARE:     { pAtkMin: 15, pAtkMax: 16, pDefMin: 5, pDefMax: 6 },
  EPIC:     { pAtkMin: 18, pAtkMax: 20, pDefMin: 7, pDefMax: 8 },
};

// ═══════════════════════════════════════════════════════════
// СКИЛЛЫ
// ═══════════════════════════════════════════════════════════

const SKILLS = [
  { id: 'fireball',  name: 'Fireball',  icon: '🔥', manaCost: 25, cooldown: 10000 },
  { id: 'iceball',   name: 'Ice Ball',  icon: '❄️', manaCost: 25, cooldown: 10000 },
  { id: 'lightning', name: 'Lightning', icon: '⚡', manaCost: 25, cooldown: 10000 },
];
// При MaxMana = 100 можно использовать 4 скилла подряд
// Mana regen = 1/сек → 25 сек на восстановление 1 скилла

// ═══════════════════════════════════════════════════════════
// STAMINA & EXHAUSTION
// ═══════════════════════════════════════════════════════════

const STAMINA_RULES = {
  tapCost: 1,                    // 1 stamina за тап (без thorns)
  thornsFormula: 'ceil(rawThorns * 100 / (100 + pDef))',
  staminaCostWithThorns: '1 + thornsTaken',
  regenPerSec: 1,
  exhaustionDuration: 5000,      // 5 секунд при 0 stamina
};

// ═══════════════════════════════════════════════════════════
// БОССЫ
// ═══════════════════════════════════════════════════════════

const BOSSES = [
  { name: 'Lizard',         hp: '500K',   defense: 0,   thorns: 0 },
  { name: 'Golem',          hp: '750K',   defense: 5,   thorns: 0 },
  { name: 'Spider Queen',   hp: '1M',     defense: 10,  thorns: 0 },
  { name: 'Werewolf',       hp: '1.5M',   defense: 15,  thorns: 0 },
  { name: 'Demon',          hp: '2M',     defense: 20,  thorns: 0 },
  { name: 'Kraken',         hp: '3M',     defense: 30,  thorns: 0 },
  { name: 'Dragon',         hp: '5M',     defense: 50,  thorns: 0 },
  { name: 'Hydra',          hp: '7.5M',   defense: 75,  thorns: 0 },
  { name: 'Phoenix',        hp: '10M',    defense: 100, thorns: 0 },
  { name: 'Ancient Dragon', hp: '15M',    defense: 150, thorns: 0 },
];

// ═══════════════════════════════════════════════════════════
// СУНДУКИ
// ═══════════════════════════════════════════════════════════

const CHEST_LOOT = {
  WOODEN: {
    items: { COMMON: 0.50, UNCOMMON: 0.07, RARE: 0, EPIC: 0 },
    gold: 1000,
    enchantChance: 0.03,
    openTime: '5 min',
  },
  BRONZE: {
    items: { COMMON: 0.60, UNCOMMON: 0.20, RARE: 0.03, EPIC: 0 },
    gold: 3000,
    enchantChance: 0.15,
    openTime: '30 min',
  },
  SILVER: {
    items: { COMMON: 0, UNCOMMON: 0.40, RARE: 0.10, EPIC: 0.01 },
    gold: 8000,
    enchantChance: 0.25,
    openTime: '4 hours',
  },
  GOLD: {
    items: { COMMON: 0, UNCOMMON: 0, RARE: 0.15, EPIC: 0.03 },
    gold: 20000,
    enchantChance: 0.45,
    openTime: '8 hours',
  },
};
