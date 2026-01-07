// ═══════════════════════════════════════════════════════════
// ITEMS DATABASE - Единая база предметов
// ═══════════════════════════════════════════════════════════

export type Slot = 'weapon' | 'helmet' | 'chest' | 'gloves' | 'legs' | 'boots' | 'shield';
export type ItemType = 'equipment' | 'consumable';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface ItemStats {
  pAtk?: number;
  pDef?: number;
  mAtk?: number;
  mDef?: number;
  crit?: number;        // flat % (0.01 = 1%)
  atkSpd?: number;      // flat bonus
  mpMax?: number;
  staminaMax?: number;
}

export interface ItemDefinition {
  id: string;
  code: string;
  nameRu: string;
  nameEn: string;
  icon: string;
  type: ItemType;       // equipment или consumable
  slot?: Slot;          // только для equipment
  rarity: Rarity;
  stats?: ItemStats;    // только для equipment
  setId?: string;       // ID сета (например "novice")
  stackable?: boolean;  // можно ли складывать (для consumable)
  dbField?: string;     // поле в БД (для consumable)
}

// ═══════════════════════════════════════════════════════════
// СТАРТОВЫЙ СЕТ НОВИЧКА (Common, setId: "novice")
// ═══════════════════════════════════════════════════════════

export const ITEMS: Record<string, ItemDefinition> = {
  // ═══════════════════════════════════════════════════════════
  // CONSUMABLES (Расходники)
  // ═══════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────────────────
  // ETHER (Эфир) - усиливает атаку x2, 1 шт за удар
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
  },

  // ─────────────────────────────────────────────────────────
  // SCROLLS (Свитки)
  // ─────────────────────────────────────────────────────────
  'enchant-scroll': {
    id: 'enchant-scroll',
    code: 'enchant-scroll',
    nameRu: 'Свиток заточки',
    nameEn: 'Enchant Scroll',
    icon: '📜',
    type: 'consumable',
    rarity: 'uncommon',
    stackable: true,
    dbField: 'enchantScrolls',
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

  // ═══════════════════════════════════════════════════════════
  // EQUIPMENT (Экипировка)
  // ═══════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────────────────
  // NOVICE SET (Common)
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
    setId: 'novice',
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
    setId: 'novice',
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
    setId: 'novice',
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
    setId: 'novice',
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
    setId: 'novice',
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
    setId: 'novice',
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
    setId: 'novice',
  },

  // ─────────────────────────────────────────────────────────
  // IRON SET (Uncommon) - будущее
  // ─────────────────────────────────────────────────────────
  // TODO: Add iron set items

  // ─────────────────────────────────────────────────────────
  // STEEL SET (Rare) - будущее
  // ─────────────────────────────────────────────────────────
  // TODO: Add steel set items
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
