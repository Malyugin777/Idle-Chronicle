// ═══════════════════════════════════════════════════════════
// GAME TYPES - Shared types for PhaserGame components
// ═══════════════════════════════════════════════════════════

export interface BossState {
  name: string;
  nameRu?: string;
  icon: string;
  image?: string;
  hp: number;
  maxHp: number;
  defense: number;
  bossIndex: number;
  totalBosses: number;
}

export interface StarterItem {
  name: string;
  icon: string;
  slot: string;
}

export interface PlayerState {
  stamina: number;
  maxStamina: number;
  mana: number;
  maxMana: number;
  exhaustedUntil: number | null;
  gold: number;
  ether: number;
  etherDust: number;
  level: number;
  crystals: number;
  photoUrl: string | null;
  firstName: string;
  skillFireball: number;
  skillIceball: number;
  skillLightning: number;
  ps: number;
  psCap: number;
}

export interface MeditationData {
  pendingDust: number;
  offlineMinutes: number;
}

export interface Skill {
  id: string;
  name: string;
  nameRu?: string;
  icon: string;
  manaCost: number;
  cooldown: number;
  lastUsed: number;
  color: string;
}

export interface DamageFeedItem {
  playerName: string;
  damage: number;
  isCrit: boolean;
  timestamp: number;
}

export interface VictoryData {
  bossName: string;
  bossIcon: string;
  finalBlowBy: string;
  topDamageBy: string;
  respawnAt: number;
}

export interface PendingReward {
  id: string;
  bossName: string;
  bossIcon: string;
  rank: number | null;
  chestsWooden: number;
  chestsBronze: number;
  chestsSilver: number;
  chestsGold: number;
  crystals: number;
  badgeId?: string;
}

export interface SlotInfo {
  max: number;
  used: number;
  free: number;
  nextPrice: number;
  crystals: number;
}

export interface ChestSelection {
  wooden: number;
  bronze: number;
  silver: number;
  gold: number;
}

export interface ActiveBuff {
  type: 'haste' | 'acumen' | 'luck';
  value: number;
  expiresAt: number;
}

export interface LoadingState {
  auth: boolean;
  boss: boolean;
  player: boolean;
}

export interface ActivityStatus {
  time: number;
  eligible: boolean;
}
