// Types (models.ts has uppercase ItemType/Rarity for Prisma)
export * from './types';
export * from './constants';
// Data exports lowercase ItemType/Rarity for items.ts
// We use explicit exports to avoid conflicts with types/models.ts
export {
  // items.ts
  Slot,
  ItemType as DataItemType,
  Rarity as DataRarity,
  ItemStats,
  ItemDefinition,
  ITEMS,
  getItemByCode,
  getSetItems,
  getConsumables,
  getEquipment,
  getConsumableByDbField,
  SLOT_ORDER,
  SLOT_ICONS,
  // sets.ts
  SetBonus,
  SetDefinition,
  SETS,
  getActiveSetBonuses,
  calculateSetBonuses,
  getSetProgress,
  // lootTables.ts
  ChestType,
  ChestConfig,
  CHESTS,
  CHEST_UI,
  RarityStyle,
  RARITY_STYLES,
  rollItemRarity,
} from './data';
