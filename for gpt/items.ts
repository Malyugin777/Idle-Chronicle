// ═══════════════════════════════════════════════════════════
// ITEMS DATABASE - Единая база предметов
// ═══════════════════════════════════════════════════════════

export type Slot = 'weapon' | 'helmet' | 'chest' | 'gloves' | 'legs' | 'boots' | 'shield';
export type ItemType = 'equipment' | 'consumable' | 'material';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic';

export interface ItemStats {
  pAtk?: number;
  pDef?: number;
  mAtk?: number;
  mDef?: number;
  crit?: number;        // flat % (0.01 = 1%)
  atkSpd?: number;      // flat bonus
  mpMax?: number;
  staminaMax?: number;
  // Base attributes (для сетовых бонусов)
  power?: number;       // СИЛ
  agility?: number;     // ЛОВ
}

export interface ItemDefinition {
  id: string;
  code: string;
  nameRu: string;
  nameEn: string;
  icon: string;
  type: ItemType;       // equipment, consumable, material
  slot?: Slot;          // только для equipment
  rarity: Rarity;
  stats?: ItemStats;    // только для equipment
  setId?: string;       // ID сета (например "starter")
  stackable?: boolean;  // можно ли складывать (для consumable/material)
  dbField?: string;     // поле в БД (для consumable/material)
  description?: string; // описание эффекта (для consumable)
}

// ═══════════════════════════════════════════════════════════
// СТАРТОВЫЙ СЕТ НОВИЧКА (Common, setId: "starter")
// ═══════════════════════════════════════════════════════════

export const ITEMS: Record<string, ItemDefinition> = {
  // ═══════════════════════════════════════════════════════════
  // CONSUMABLES (Расходники)
  // ═══════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────────────────
  // ETHER SYSTEM (Эфирный цикл)
  // ─────────────────────────────────────────────────────────
  'ether': {
    id: 'ether',
    code: 'ether',
    nameRu: 'Эфир',
    nameEn: 'Ether',
    icon: '✨',
    type: 'consumable',
    rarity: 'common',
    stackable: true,
    dbField: 'ether',
    description: 'x2 урона за удар',
  },
  'ether-dust': {
    id: 'ether-dust',
    code: 'ether-dust',
    nameRu: 'Эфирная Пыль',
    nameEn: 'Ether Dust',
    icon: '🌫️',
    type: 'material',
    rarity: 'common',
    stackable: true,
    dbField: 'etherDust',
    description: 'Собирается во время медитации (оффлайн)',
  },

  // ─────────────────────────────────────────────────────────
  // ENCHANT SYSTEM (Система заточки)
  // ─────────────────────────────────────────────────────────
  'enchant-charge': {
    id: 'enchant-charge',
    code: 'enchant-charge',
    nameRu: 'Заряд заточки',
    nameEn: 'Enchant Charge',
    icon: '⚗️',
    type: 'consumable',
    rarity: 'common',
    stackable: true,
    dbField: 'enchantCharges',
    description: 'Используется для заточки экипировки. 1 заряд = 1 попытка.',
  },
  'protection-scroll': {
    id: 'protection-scroll',
    code: 'protection-scroll',
    nameRu: 'Безопасная заточка',
    nameEn: 'Protection Scroll',
    icon: '🛡️',
    type: 'consumable',
    rarity: 'rare',
    stackable: true,
    dbField: 'protectionCharges',
    description: 'Защищает предмет от поломки при неудачной заточке.',
  },

  // ─────────────────────────────────────────────────────────
  // BUFF SCROLLS (Свитки баффов) - временные усиления
  // ─────────────────────────────────────────────────────────
  'scroll-haste': {
    id: 'scroll-haste',
    code: 'scroll-haste',
    nameRu: 'Свиток скорости',
    nameEn: 'Haste Scroll',
    icon: '⚡',
    type: 'consumable',
    rarity: 'uncommon',
    stackable: true,
    dbField: 'potionHaste',
  },
  'scroll-acumen': {
    id: 'scroll-acumen',
    code: 'scroll-acumen',
    nameRu: 'Свиток силы магии',
    nameEn: 'Acumen Scroll',
    icon: '🔥',
    type: 'consumable',
    rarity: 'uncommon',
    stackable: true,
    dbField: 'potionAcumen',
  },
  'scroll-luck': {
    id: 'scroll-luck',
    code: 'scroll-luck',
    nameRu: 'Свиток удачи',
    nameEn: 'Luck Scroll',
    icon: '🍀',
    type: 'consumable',
    rarity: 'uncommon',
    stackable: true,
    dbField: 'potionLuck',
  },

  // ─────────────────────────────────────────────────────────
  // CHEST KEYS (Ключи для сундуков - моментальное открытие)
  // ─────────────────────────────────────────────────────────
  'key-wooden': {
    id: 'key-wooden',
    code: 'key-wooden',
    nameRu: 'Деревянный ключ',
    nameEn: 'Wooden Key',
    icon: '🗝️',
    type: 'consumable',
    rarity: 'common',
    stackable: true,
    dbField: 'keyWooden',
    description: 'Мгновенно открывает деревянный сундук',
  },
  'key-bronze': {
    id: 'key-bronze',
    code: 'key-bronze',
    nameRu: 'Бронзовый ключ',
    nameEn: 'Bronze Key',
    icon: '🔑',
    type: 'consumable',
    rarity: 'uncommon',
    stackable: true,
    dbField: 'keyBronze',
    description: 'Мгновенно открывает бронзовый сундук',
  },
  'key-silver': {
    id: 'key-silver',
    code: 'key-silver',
    nameRu: 'Серебряный ключ',
    nameEn: 'Silver Key',
    icon: '🔐',
    type: 'consumable',
    rarity: 'rare',
    stackable: true,
    dbField: 'keySilver',
    description: 'Мгновенно открывает серебряный сундук',
  },
  'key-gold': {
    id: 'key-gold',
    code: 'key-gold',
    nameRu: 'Золотой ключ',
    nameEn: 'Gold Key',
    icon: '🏆',
    type: 'consumable',
    rarity: 'epic',
    stackable: true,
    dbField: 'keyGold',
    description: 'Мгновенно открывает золотой сундук',
  },

  // ═══════════════════════════════════════════════════════════
  // EQUIPMENT (Экипировка)
  // ═══════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────────────────
  // DEBUG WEAPON (Тестовое оружие - не для продакшена!)
  // ─────────────────────────────────────────────────────────
  'debug-sword': {
    id: 'debug-sword',
    code: 'debug-sword',
    nameRu: '[DEBUG] Меч разработчика',
    nameEn: '[DEBUG] Developer Sword',
    icon: '⚔️',
    type: 'equipment',
    slot: 'weapon',
    rarity: 'epic',
    stats: { pAtk: 1500 },
    setId: 'debug',
  },

  // ─────────────────────────────────────────────────────────
  // STARTER SET (Common) - выдаётся новичкам, не дропается
  // ─────────────────────────────────────────────────────────
  'novice-sword': {
    id: 'novice-sword',
    code: 'starter-sword',
    nameRu: 'Меч новичка',
    nameEn: 'Novice Sword',
    icon: '🗡️',
    type: 'equipment',
    slot: 'weapon',
    rarity: 'common',
    stats: { pAtk: 8 },
    setId: 'starter',
  },
  'novice-helmet': {
    id: 'novice-helmet',
    code: 'starter-helmet',
    nameRu: 'Шлем новичка',
    nameEn: 'Novice Helmet',
    icon: '⛑️',
    type: 'equipment',
    slot: 'helmet',
    rarity: 'common',
    stats: { pDef: 2 },
    setId: 'starter',
  },
  'novice-chest': {
    id: 'novice-chest',
    code: 'starter-chest',
    nameRu: 'Нагрудник новичка',
    nameEn: 'Novice Chest',
    icon: '🎽',
    type: 'equipment',
    slot: 'chest',
    rarity: 'common',
    stats: { pDef: 3 },
    setId: 'starter',
  },
  'novice-gloves': {
    id: 'novice-gloves',
    code: 'starter-gloves',
    nameRu: 'Перчатки новичка',
    nameEn: 'Novice Gloves',
    icon: '🧤',
    type: 'equipment',
    slot: 'gloves',
    rarity: 'common',
    stats: { pDef: 1 },
    setId: 'starter',
  },
  'novice-legs': {
    id: 'novice-legs',
    code: 'starter-legs',
    nameRu: 'Поножи новичка',
    nameEn: 'Novice Legs',
    icon: '👖',
    type: 'equipment',
    slot: 'legs',
    rarity: 'common',
    stats: { pDef: 2 },
    setId: 'starter',
  },
  'novice-boots': {
    id: 'novice-boots',
    code: 'starter-boots',
    nameRu: 'Ботинки новичка',
    nameEn: 'Novice Boots',
    icon: '👢',
    type: 'equipment',
    slot: 'boots',
    rarity: 'common',
    stats: { pDef: 1 },
    setId: 'starter',
  },
  'novice-shield': {
    id: 'novice-shield',
    code: 'starter-shield',
    nameRu: 'Щит новичка',
    nameEn: 'Novice Shield',
    icon: '🛡️',
    type: 'equipment',
    slot: 'shield',
    rarity: 'common',
    stats: { pDef: 2 },
    setId: 'starter',
  },

  // ═══════════════════════════════════════════════════════════
  // DROPPABLE SETS (10 сетов × 5 частей = 50 предметов)
  // helmet, gloves, boots, chest, legs
  // ═══════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────────────────
  // ADVENTURER SET (Common) - Сет искателя
  // ─────────────────────────────────────────────────────────
  'adventurer-helmet': {
    id: 'adventurer-helmet',
    code: 'adventurer-helmet',
    nameRu: 'Шлем искателя',
    nameEn: 'Adventurer Helmet',
    icon: '⛑️',
    type: 'equipment',
    slot: 'helmet',
    rarity: 'common',
    stats: { pDef: 3, staminaMax: 10 },
    setId: 'adventurer',
  },
  'adventurer-gloves': {
    id: 'adventurer-gloves',
    code: 'adventurer-gloves',
    nameRu: 'Перчатки искателя',
    nameEn: 'Adventurer Gloves',
    icon: '🧤',
    type: 'equipment',
    slot: 'gloves',
    rarity: 'common',
    stats: { pDef: 2, staminaMax: 5 },
    setId: 'adventurer',
  },
  'adventurer-boots': {
    id: 'adventurer-boots',
    code: 'adventurer-boots',
    nameRu: 'Ботинки искателя',
    nameEn: 'Adventurer Boots',
    icon: '👢',
    type: 'equipment',
    slot: 'boots',
    rarity: 'common',
    stats: { pDef: 2, staminaMax: 10 },
    setId: 'adventurer',
  },
  'adventurer-chest': {
    id: 'adventurer-chest',
    code: 'adventurer-chest',
    nameRu: 'Нагрудник искателя',
    nameEn: 'Adventurer Chest',
    icon: '🎽',
    type: 'equipment',
    slot: 'chest',
    rarity: 'common',
    stats: { pDef: 4, staminaMax: 15 },
    setId: 'adventurer',
  },
  'adventurer-legs': {
    id: 'adventurer-legs',
    code: 'adventurer-legs',
    nameRu: 'Поножи искателя',
    nameEn: 'Adventurer Legs',
    icon: '👖',
    type: 'equipment',
    slot: 'legs',
    rarity: 'common',
    stats: { pDef: 3, staminaMax: 10 },
    setId: 'adventurer',
  },

  // ─────────────────────────────────────────────────────────
  // LEATHER SET (Common) - Кожаный сет
  // ─────────────────────────────────────────────────────────
  'leather-helmet': {
    id: 'leather-helmet',
    code: 'leather-helmet',
    nameRu: 'Кожаный шлем',
    nameEn: 'Leather Helmet',
    icon: '⛑️',
    type: 'equipment',
    slot: 'helmet',
    rarity: 'common',
    stats: { pDef: 4, staminaMax: 12 },
    setId: 'leather',
  },
  'leather-gloves': {
    id: 'leather-gloves',
    code: 'leather-gloves',
    nameRu: 'Кожаные перчатки',
    nameEn: 'Leather Gloves',
    icon: '🧤',
    type: 'equipment',
    slot: 'gloves',
    rarity: 'common',
    stats: { pDef: 2, staminaMax: 8 },
    setId: 'leather',
  },
  'leather-boots': {
    id: 'leather-boots',
    code: 'leather-boots',
    nameRu: 'Кожаные ботинки',
    nameEn: 'Leather Boots',
    icon: '👢',
    type: 'equipment',
    slot: 'boots',
    rarity: 'common',
    stats: { pDef: 3, staminaMax: 12 },
    setId: 'leather',
  },
  'leather-chest': {
    id: 'leather-chest',
    code: 'leather-chest',
    nameRu: 'Кожаный нагрудник',
    nameEn: 'Leather Chest',
    icon: '🎽',
    type: 'equipment',
    slot: 'chest',
    rarity: 'common',
    stats: { pDef: 5, staminaMax: 18 },
    setId: 'leather',
  },
  'leather-legs': {
    id: 'leather-legs',
    code: 'leather-legs',
    nameRu: 'Кожаные поножи',
    nameEn: 'Leather Legs',
    icon: '👖',
    type: 'equipment',
    slot: 'legs',
    rarity: 'common',
    stats: { pDef: 3, staminaMax: 12 },
    setId: 'leather',
  },

  // ─────────────────────────────────────────────────────────
  // SCOUT SET (Uncommon) - Сет разведчика
  // ─────────────────────────────────────────────────────────
  'scout-helmet': {
    id: 'scout-helmet',
    code: 'scout-helmet',
    nameRu: 'Шлем разведчика',
    nameEn: 'Scout Helmet',
    icon: '⛑️',
    type: 'equipment',
    slot: 'helmet',
    rarity: 'uncommon',
    stats: { pDef: 5, staminaMax: 20 },
    setId: 'scout',
  },
  'scout-gloves': {
    id: 'scout-gloves',
    code: 'scout-gloves',
    nameRu: 'Перчатки разведчика',
    nameEn: 'Scout Gloves',
    icon: '🧤',
    type: 'equipment',
    slot: 'gloves',
    rarity: 'uncommon',
    stats: { pDef: 3, staminaMax: 12 },
    setId: 'scout',
  },
  'scout-boots': {
    id: 'scout-boots',
    code: 'scout-boots',
    nameRu: 'Ботинки разведчика',
    nameEn: 'Scout Boots',
    icon: '👢',
    type: 'equipment',
    slot: 'boots',
    rarity: 'uncommon',
    stats: { pDef: 4, staminaMax: 18 },
    setId: 'scout',
  },
  'scout-chest': {
    id: 'scout-chest',
    code: 'scout-chest',
    nameRu: 'Нагрудник разведчика',
    nameEn: 'Scout Chest',
    icon: '🎽',
    type: 'equipment',
    slot: 'chest',
    rarity: 'uncommon',
    stats: { pDef: 7, staminaMax: 28 },
    setId: 'scout',
  },
  'scout-legs': {
    id: 'scout-legs',
    code: 'scout-legs',
    nameRu: 'Поножи разведчика',
    nameEn: 'Scout Legs',
    icon: '👖',
    type: 'equipment',
    slot: 'legs',
    rarity: 'uncommon',
    stats: { pDef: 5, staminaMax: 22 },
    setId: 'scout',
  },

  // ─────────────────────────────────────────────────────────
  // HUNTER SET (Uncommon) - Сет охотника
  // ─────────────────────────────────────────────────────────
  'hunter-helmet': {
    id: 'hunter-helmet',
    code: 'hunter-helmet',
    nameRu: 'Шлем охотника',
    nameEn: 'Hunter Helmet',
    icon: '⛑️',
    type: 'equipment',
    slot: 'helmet',
    rarity: 'uncommon',
    stats: { pDef: 6, staminaMax: 24 },
    setId: 'hunter',
  },
  'hunter-gloves': {
    id: 'hunter-gloves',
    code: 'hunter-gloves',
    nameRu: 'Перчатки охотника',
    nameEn: 'Hunter Gloves',
    icon: '🧤',
    type: 'equipment',
    slot: 'gloves',
    rarity: 'uncommon',
    stats: { pDef: 4, staminaMax: 14 },
    setId: 'hunter',
  },
  'hunter-boots': {
    id: 'hunter-boots',
    code: 'hunter-boots',
    nameRu: 'Ботинки охотника',
    nameEn: 'Hunter Boots',
    icon: '👢',
    type: 'equipment',
    slot: 'boots',
    rarity: 'uncommon',
    stats: { pDef: 5, staminaMax: 20 },
    setId: 'hunter',
  },
  'hunter-chest': {
    id: 'hunter-chest',
    code: 'hunter-chest',
    nameRu: 'Нагрудник охотника',
    nameEn: 'Hunter Chest',
    icon: '🎽',
    type: 'equipment',
    slot: 'chest',
    rarity: 'uncommon',
    stats: { pDef: 8, staminaMax: 32 },
    setId: 'hunter',
  },
  'hunter-legs': {
    id: 'hunter-legs',
    code: 'hunter-legs',
    nameRu: 'Поножи охотника',
    nameEn: 'Hunter Legs',
    icon: '👖',
    type: 'equipment',
    slot: 'legs',
    rarity: 'uncommon',
    stats: { pDef: 6, staminaMax: 26 },
    setId: 'hunter',
  },

  // ─────────────────────────────────────────────────────────
  // SOLDIER SET (Rare) - Сет солдата
  // ─────────────────────────────────────────────────────────
  'soldier-helmet': {
    id: 'soldier-helmet',
    code: 'soldier-helmet',
    nameRu: 'Шлем солдата',
    nameEn: 'Soldier Helmet',
    icon: '⛑️',
    type: 'equipment',
    slot: 'helmet',
    rarity: 'rare',
    stats: { pDef: 8, staminaMax: 35 },
    setId: 'soldier',
  },
  'soldier-gloves': {
    id: 'soldier-gloves',
    code: 'soldier-gloves',
    nameRu: 'Перчатки солдата',
    nameEn: 'Soldier Gloves',
    icon: '🧤',
    type: 'equipment',
    slot: 'gloves',
    rarity: 'rare',
    stats: { pDef: 5, staminaMax: 22 },
    setId: 'soldier',
  },
  'soldier-boots': {
    id: 'soldier-boots',
    code: 'soldier-boots',
    nameRu: 'Ботинки солдата',
    nameEn: 'Soldier Boots',
    icon: '👢',
    type: 'equipment',
    slot: 'boots',
    rarity: 'rare',
    stats: { pDef: 6, staminaMax: 28 },
    setId: 'soldier',
  },
  'soldier-chest': {
    id: 'soldier-chest',
    code: 'soldier-chest',
    nameRu: 'Нагрудник солдата',
    nameEn: 'Soldier Chest',
    icon: '🎽',
    type: 'equipment',
    slot: 'chest',
    rarity: 'rare',
    stats: { pDef: 10, staminaMax: 45 },
    setId: 'soldier',
  },
  'soldier-legs': {
    id: 'soldier-legs',
    code: 'soldier-legs',
    nameRu: 'Поножи солдата',
    nameEn: 'Soldier Legs',
    icon: '👖',
    type: 'equipment',
    slot: 'legs',
    rarity: 'rare',
    stats: { pDef: 8, staminaMax: 38 },
    setId: 'soldier',
  },

  // ─────────────────────────────────────────────────────────
  // KNIGHT SET (Rare) - Сет рыцаря
  // ─────────────────────────────────────────────────────────
  'knight-helmet': {
    id: 'knight-helmet',
    code: 'knight-helmet',
    nameRu: 'Шлем рыцаря',
    nameEn: 'Knight Helmet',
    icon: '⛑️',
    type: 'equipment',
    slot: 'helmet',
    rarity: 'rare',
    stats: { pDef: 10, staminaMax: 40 },
    setId: 'knight',
  },
  'knight-gloves': {
    id: 'knight-gloves',
    code: 'knight-gloves',
    nameRu: 'Перчатки рыцаря',
    nameEn: 'Knight Gloves',
    icon: '🧤',
    type: 'equipment',
    slot: 'gloves',
    rarity: 'rare',
    stats: { pDef: 6, staminaMax: 25 },
    setId: 'knight',
  },
  'knight-boots': {
    id: 'knight-boots',
    code: 'knight-boots',
    nameRu: 'Ботинки рыцаря',
    nameEn: 'Knight Boots',
    icon: '👢',
    type: 'equipment',
    slot: 'boots',
    rarity: 'rare',
    stats: { pDef: 8, staminaMax: 32 },
    setId: 'knight',
  },
  'knight-chest': {
    id: 'knight-chest',
    code: 'knight-chest',
    nameRu: 'Нагрудник рыцаря',
    nameEn: 'Knight Chest',
    icon: '🎽',
    type: 'equipment',
    slot: 'chest',
    rarity: 'rare',
    stats: { pDef: 12, staminaMax: 50 },
    setId: 'knight',
  },
  'knight-legs': {
    id: 'knight-legs',
    code: 'knight-legs',
    nameRu: 'Поножи рыцаря',
    nameEn: 'Knight Legs',
    icon: '👖',
    type: 'equipment',
    slot: 'legs',
    rarity: 'rare',
    stats: { pDef: 10, staminaMax: 42 },
    setId: 'knight',
  },

  // ─────────────────────────────────────────────────────────
  // GUARDIAN SET (Epic) - Сет стража
  // ─────────────────────────────────────────────────────────
  'guardian-helmet': {
    id: 'guardian-helmet',
    code: 'guardian-helmet',
    nameRu: 'Шлем стража',
    nameEn: 'Guardian Helmet',
    icon: '⛑️',
    type: 'equipment',
    slot: 'helmet',
    rarity: 'epic',
    stats: { pDef: 12, staminaMax: 50 },
    setId: 'guardian',
  },
  'guardian-gloves': {
    id: 'guardian-gloves',
    code: 'guardian-gloves',
    nameRu: 'Перчатки стража',
    nameEn: 'Guardian Gloves',
    icon: '🧤',
    type: 'equipment',
    slot: 'gloves',
    rarity: 'epic',
    stats: { pDef: 8, staminaMax: 32 },
    setId: 'guardian',
  },
  'guardian-boots': {
    id: 'guardian-boots',
    code: 'guardian-boots',
    nameRu: 'Ботинки стража',
    nameEn: 'Guardian Boots',
    icon: '👢',
    type: 'equipment',
    slot: 'boots',
    rarity: 'epic',
    stats: { pDef: 10, staminaMax: 42 },
    setId: 'guardian',
  },
  'guardian-chest': {
    id: 'guardian-chest',
    code: 'guardian-chest',
    nameRu: 'Нагрудник стража',
    nameEn: 'Guardian Chest',
    icon: '🎽',
    type: 'equipment',
    slot: 'chest',
    rarity: 'epic',
    stats: { pDef: 15, staminaMax: 65 },
    setId: 'guardian',
  },
  'guardian-legs': {
    id: 'guardian-legs',
    code: 'guardian-legs',
    nameRu: 'Поножи стража',
    nameEn: 'Guardian Legs',
    icon: '👖',
    type: 'equipment',
    slot: 'legs',
    rarity: 'epic',
    stats: { pDef: 12, staminaMax: 55 },
    setId: 'guardian',
  },

  // ─────────────────────────────────────────────────────────
  // WARLORD SET (Epic) - Сет полководца
  // ─────────────────────────────────────────────────────────
  'warlord-helmet': {
    id: 'warlord-helmet',
    code: 'warlord-helmet',
    nameRu: 'Шлем полководца',
    nameEn: 'Warlord Helmet',
    icon: '⛑️',
    type: 'equipment',
    slot: 'helmet',
    rarity: 'epic',
    stats: { pDef: 14, staminaMax: 60 },
    setId: 'warlord',
  },
  'warlord-gloves': {
    id: 'warlord-gloves',
    code: 'warlord-gloves',
    nameRu: 'Перчатки полководца',
    nameEn: 'Warlord Gloves',
    icon: '🧤',
    type: 'equipment',
    slot: 'gloves',
    rarity: 'epic',
    stats: { pDef: 9, staminaMax: 38 },
    setId: 'warlord',
  },
  'warlord-boots': {
    id: 'warlord-boots',
    code: 'warlord-boots',
    nameRu: 'Ботинки полководца',
    nameEn: 'Warlord Boots',
    icon: '👢',
    type: 'equipment',
    slot: 'boots',
    rarity: 'epic',
    stats: { pDef: 12, staminaMax: 50 },
    setId: 'warlord',
  },
  'warlord-chest': {
    id: 'warlord-chest',
    code: 'warlord-chest',
    nameRu: 'Нагрудник полководца',
    nameEn: 'Warlord Chest',
    icon: '🎽',
    type: 'equipment',
    slot: 'chest',
    rarity: 'epic',
    stats: { pDef: 18, staminaMax: 75 },
    setId: 'warlord',
  },
  'warlord-legs': {
    id: 'warlord-legs',
    code: 'warlord-legs',
    nameRu: 'Поножи полководца',
    nameEn: 'Warlord Legs',
    icon: '👖',
    type: 'equipment',
    slot: 'legs',
    rarity: 'epic',
    stats: { pDef: 14, staminaMax: 62 },
    setId: 'warlord',
  },

  // ─────────────────────────────────────────────────────────
  // CHAMPION SET (Epic) - Сет чемпиона
  // ─────────────────────────────────────────────────────────
  'champion-helmet': {
    id: 'champion-helmet',
    code: 'champion-helmet',
    nameRu: 'Шлем чемпиона',
    nameEn: 'Champion Helmet',
    icon: '⛑️',
    type: 'equipment',
    slot: 'helmet',
    rarity: 'epic',
    stats: { pDef: 16, staminaMax: 70 },
    setId: 'champion',
  },
  'champion-gloves': {
    id: 'champion-gloves',
    code: 'champion-gloves',
    nameRu: 'Перчатки чемпиона',
    nameEn: 'Champion Gloves',
    icon: '🧤',
    type: 'equipment',
    slot: 'gloves',
    rarity: 'epic',
    stats: { pDef: 10, staminaMax: 45 },
    setId: 'champion',
  },
  'champion-boots': {
    id: 'champion-boots',
    code: 'champion-boots',
    nameRu: 'Ботинки чемпиона',
    nameEn: 'Champion Boots',
    icon: '👢',
    type: 'equipment',
    slot: 'boots',
    rarity: 'epic',
    stats: { pDef: 13, staminaMax: 55 },
    setId: 'champion',
  },
  'champion-chest': {
    id: 'champion-chest',
    code: 'champion-chest',
    nameRu: 'Нагрудник чемпиона',
    nameEn: 'Champion Chest',
    icon: '🎽',
    type: 'equipment',
    slot: 'chest',
    rarity: 'epic',
    stats: { pDef: 20, staminaMax: 88 },
    setId: 'champion',
  },
  'champion-legs': {
    id: 'champion-legs',
    code: 'champion-legs',
    nameRu: 'Поножи чемпиона',
    nameEn: 'Champion Legs',
    icon: '👖',
    type: 'equipment',
    slot: 'legs',
    rarity: 'epic',
    stats: { pDef: 16, staminaMax: 72 },
    setId: 'champion',
  },

  // ─────────────────────────────────────────────────────────
  // IMMORTAL SET (Epic) - Сет бессмертного
  // ─────────────────────────────────────────────────────────
  'immortal-helmet': {
    id: 'immortal-helmet',
    code: 'immortal-helmet',
    nameRu: 'Шлем бессмертного',
    nameEn: 'Immortal Helmet',
    icon: '⛑️',
    type: 'equipment',
    slot: 'helmet',
    rarity: 'epic',
    stats: { pDef: 18, staminaMax: 80 },
    setId: 'immortal',
  },
  'immortal-gloves': {
    id: 'immortal-gloves',
    code: 'immortal-gloves',
    nameRu: 'Перчатки бессмертного',
    nameEn: 'Immortal Gloves',
    icon: '🧤',
    type: 'equipment',
    slot: 'gloves',
    rarity: 'epic',
    stats: { pDef: 12, staminaMax: 52 },
    setId: 'immortal',
  },
  'immortal-boots': {
    id: 'immortal-boots',
    code: 'immortal-boots',
    nameRu: 'Ботинки бессмертного',
    nameEn: 'Immortal Boots',
    icon: '👢',
    type: 'equipment',
    slot: 'boots',
    rarity: 'epic',
    stats: { pDef: 15, staminaMax: 65 },
    setId: 'immortal',
  },
  'immortal-chest': {
    id: 'immortal-chest',
    code: 'immortal-chest',
    nameRu: 'Нагрудник бессмертного',
    nameEn: 'Immortal Chest',
    icon: '🎽',
    type: 'equipment',
    slot: 'chest',
    rarity: 'epic',
    stats: { pDef: 22, staminaMax: 100 },
    setId: 'immortal',
  },
  'immortal-legs': {
    id: 'immortal-legs',
    code: 'immortal-legs',
    nameRu: 'Поножи бессмертного',
    nameEn: 'Immortal Legs',
    icon: '👖',
    type: 'equipment',
    slot: 'legs',
    rarity: 'epic',
    stats: { pDef: 18, staminaMax: 82 },
    setId: 'immortal',
  },
};

// Поиск предмета по code (для совместимости со старыми данными)
export function getItemByCode(code: string): ItemDefinition | undefined {
  return Object.values(ITEMS).find(item => item.code === code);
}

// Получить все предметы сета
export function getSetItems(setId: string): ItemDefinition[] {
  return Object.values(ITEMS).filter(item => item.setId === setId);
}

// Получить все consumables
export function getConsumables(): ItemDefinition[] {
  return Object.values(ITEMS).filter(item => item.type === 'consumable');
}

// Получить всю экипировку
export function getEquipment(): ItemDefinition[] {
  return Object.values(ITEMS).filter(item => item.type === 'equipment');
}

// Получить consumable по dbField
export function getConsumableByDbField(dbField: string): ItemDefinition | undefined {
  return Object.values(ITEMS).find(item => item.type === 'consumable' && item.dbField === dbField);
}

// Слоты и их порядок
export const SLOT_ORDER: Slot[] = ['weapon', 'helmet', 'chest', 'gloves', 'legs', 'boots', 'shield'];

// Иконки слотов по умолчанию
export const SLOT_ICONS: Record<Slot, string> = {
  weapon: '🗡️',
  helmet: '⛑️',
  chest: '🎽',
  gloves: '🧤',
  legs: '👖',
  boots: '👢',
  shield: '🛡️',
};
