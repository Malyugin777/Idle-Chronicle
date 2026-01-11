// ═══════════════════════════════════════════════════════════
// GAME CONSTANTS - Shared constants for PhaserGame components
// ═══════════════════════════════════════════════════════════

import type { Skill } from './types';

export const APP_VERSION = 'v1.8.28';

// ═══════════════════════════════════════════════════════════
// STANDARDIZED ICONS - Use these everywhere for consistency
// ═══════════════════════════════════════════════════════════

// Валюты и ресурсы
export const CURRENCY_ICONS = {
  gold: '🪙',
  crystals: '💎',
  tickets: '🎟️',
  ether: '✨',
  etherDust: '🌫️',
  protection: '🛡️',
  enchantCharge: '⚡',
} as const;

// Сундуки
export const CHEST_ICONS = {
  WOODEN: '🪵',
  BRONZE: '🟫',
  SILVER: '🥈',
  GOLD: '🟨',
} as const;

// Ключи
export const KEY_ICONS = {
  WOODEN: '🗝️',
  BRONZE: '🔑',
  SILVER: '🔐',
  GOLD: '🔑',
} as const;

// Цвета для Tailwind
export const CURRENCY_COLORS = {
  gold: 'text-amber-400',
  crystals: 'text-purple-400',
  tickets: 'text-yellow-400',
  ether: 'text-cyan-400',
  etherDust: 'text-purple-300',
  protection: 'text-purple-400',
  enchantCharge: 'text-blue-400',
} as const;

export const CHEST_COLORS = {
  WOODEN: 'text-amber-600',
  BRONZE: 'text-orange-400',
  SILVER: 'text-gray-300',
  GOLD: 'text-yellow-400',
} as const;

export const BUFF_ICONS: Record<string, string> = {
  haste: '⚡',
  acumen: '🔥',
  luck: '🍀',
};

export const BUFF_DURATIONS: Record<string, number> = {
  haste: 30000,
  acumen: 30000,
  luck: 60000,
};

export const SKILLS: Skill[] = [
  { id: 'fireball', name: 'Fireball', nameRu: 'Огненный шар', icon: '🔥', manaCost: 100, cooldown: 10000, lastUsed: 0, color: 'border-orange-500' },
  { id: 'iceball', name: 'Ice Ball', nameRu: 'Ледяной шар', icon: '❄️', manaCost: 100, cooldown: 10000, lastUsed: 0, color: 'border-cyan-400' },
  { id: 'lightning', name: 'Lightning', nameRu: 'Молния', icon: '⚡', manaCost: 100, cooldown: 10000, lastUsed: 0, color: 'border-yellow-400' },
];

export const COOLDOWNS_KEY = 'battle_skill_cooldowns';

// Initial states
export const INITIAL_BOSS_STATE = {
  name: 'Loading...',
  nameRu: '',
  icon: '⏳',
  hp: 0,
  maxHp: 1,
  defense: 0,
  bossIndex: 0,
  totalBosses: 4,
};

export const INITIAL_PLAYER_STATE = {
  stamina: 0,
  maxStamina: 1,
  mana: 0,
  maxMana: 1,
  exhaustedUntil: null,
  gold: 0,
  ether: 0,
  etherDust: 0,
  level: 1,
  crystals: 0,
  photoUrl: null,
  firstName: '',
  skillFireball: 1,
  skillIceball: 0,
  skillLightning: 0,
  sp: 0,
  ps: 0,
  psCap: 24,
};

export const INITIAL_SLOT_INFO = {
  max: 5,
  used: 0,
  free: 5,
  nextPrice: 50,
  crystals: 0,
};

// Helper function
export function formatCompact(num: number): string {
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + 'B';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
  return num.toString();
}
