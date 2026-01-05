// ═══════════════════════════════════════════════════════════
// DATABASE ENUMS (mirroring Prisma)
// ═══════════════════════════════════════════════════════════

export type Grade = 'NG' | 'D' | 'C' | 'B' | 'A' | 'S';

export type ItemType = 'SCROLL' | 'MATERIAL' | 'RECIPE' | 'ARMOR_PART' | 'CURRENCY';

export type Rarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';

export type TaskType = 'DAILY' | 'WEEKLY' | 'ACHIEVEMENT';

// ═══════════════════════════════════════════════════════════
// WEAPON
// ═══════════════════════════════════════════════════════════

export interface Weapon {
  id: string;
  code: string;
  name: string;
  grade: Grade;
  pAtk: number;
  critBonus: number;
  cost: bigint;
  requiredLvl: number;
  iconUrl: string | null;
}

// ═══════════════════════════════════════════════════════════
// BOSS
// ═══════════════════════════════════════════════════════════

export interface Boss {
  id: string;
  code: string;
  name: string;
  title: string | null;
  baseHp: bigint;
  defense: number;
  ragePhases: RagePhase[];
  spineJson: string | null;
  spineAtlas: string | null;
  iconUrl: string | null;
  isActive: boolean;
  order: number;
  timesKilled: number;
}

export interface RagePhase {
  hpPercent: number;
  dmgBonus: number;
}

// ═══════════════════════════════════════════════════════════
// ITEM
// ═══════════════════════════════════════════════════════════

export interface Item {
  id: string;
  code: string;
  name: string;
  description: string | null;
  type: ItemType;
  rarity: Rarity;
  grade: Grade;
  isRpgItem: boolean;
  rpgValue: number | null;
  iconUrl: string | null;
}

// ═══════════════════════════════════════════════════════════
// INVENTORY
// ═══════════════════════════════════════════════════════════

export interface InventoryItem {
  id: string;
  userId: string;
  itemId: string;
  quantity: number;
  item?: Item;
}

// ═══════════════════════════════════════════════════════════
// ACTIVE BUFF
// ═══════════════════════════════════════════════════════════

export interface ActiveBuff {
  id: string;
  buffType: 'HASTE' | 'ACUMEN' | 'LUCK';
  value: number;
  expiresAt: Date;
}

// ═══════════════════════════════════════════════════════════
// TASK
// ═══════════════════════════════════════════════════════════

export interface Task {
  id: string;
  code: string;
  name: string;
  description: string;
  type: TaskType;
  target: number;
  adenaReward: bigint;
  ancientCoinReward: number;
}

export interface UserTask {
  id: string;
  userId: string;
  taskId: string;
  progress: number;
  completed: boolean;
  claimedAt: Date | null;
  resetAt: Date;
  task?: Task;
}

// ═══════════════════════════════════════════════════════════
// LEADERBOARD
// ═══════════════════════════════════════════════════════════

export interface LeaderboardEntry {
  rank: number;
  odamage: string;
  username: string;
  photoUrl: string | null;
  damage: string;
  percent: number;
}
