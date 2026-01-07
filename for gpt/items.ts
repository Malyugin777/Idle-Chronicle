// ═══════════════════════════════════════════════════════════
// ITEMS DATABASE - Единая база предметов
// ═══════════════════════════════════════════════════════════

export type Slot = 'weapon' | 'helmet' | 'chest' | 'gloves' | 'legs' | 'boots' | 'shield';
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
  slot: Slot;
  rarity: Rarity;
  stats: ItemStats;
  setId?: string;       // ID сета (например "novice")
}

// ═══════════════════════════════════════════════════════════
// СТАРТОВЫЙ СЕТ НОВИЧКА (Common, setId: "novice")
// ═══════════════════════════════════════════════════════════

export const ITEMS: Record<string, ItemDefinition> = {
  // ─────────────────────────────────────────────────────────
  // NOVICE SET (Common)
  // ─────────────────────────────────────────────────────────
  'novice-sword': {
    id: 'novice-sword',
    code: 'starter-sword',
    nameRu: 'Меч новичка',
    nameEn: 'Novice Sword',
    icon: '🗡️',
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
