'use client';

import { useEffect, useState, useCallback } from 'react';
import { getSocket } from '@/lib/socket';
import { X, Sword, Shield, Crown, Shirt, Hand, Footprints, Gem, CircleDot } from 'lucide-react';
import { detectLanguage, useTranslation, Language } from '@/lib/i18n';
import { SETS, SetDefinition, SetBonus } from '@shared/data/sets';
import { calculateEnchantBonus, ENCHANT_BONUS_PER_LEVEL } from '@shared/data/enchant';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
type SlotType = 'weapon' | 'shield' | 'helmet' | 'armor' | 'gloves' | 'legs' | 'boots' | 'ring1' | 'ring2' | 'necklace';

interface ItemStats {
  pAtkFlat?: number;
  pDefFlat?: number;
  mAtkFlat?: number;
  mDefFlat?: number;
  critFlat?: number;
  atkSpdFlat?: number;
}

interface Item {
  id: string;
  name: string;
  slotType: SlotType;
  rarity: Rarity;
  icon: string;
  stats: ItemStats;
  setId?: string | null;
  enchantLevel?: number;
  isBroken?: boolean;
  brokenUntil?: number | null;
}

// ═══════════════════════════════════════════════════════════
// STAT TOOLTIPS
// ═══════════════════════════════════════════════════════════

const STAT_TOOLTIPS: Record<string, { ru: string; en: string }> = {
  power: { ru: 'Сила — увеличивает физ. урон (+8% за единицу)', en: 'Power — increases P.Atk (+8% per point)' },
  vitality: { ru: 'Выносливость — увеличивает макс. стамину (+80 за единицу)', en: 'Vitality — increases max stamina (+80 per point)' },
  agility: { ru: 'Ловкость — увеличивает скорость атаки', en: 'Agility — increases attack speed' },
  intellect: { ru: 'Интеллект — увеличивает маг. урон', en: 'Intellect — increases M.Atk' },
  spirit: { ru: 'Дух — увеличивает макс. ману (+10 за единицу)', en: 'Spirit — increases max mana (+10 per point)' },
};

// ═══════════════════════════════════════════════════════════
// CONSUMABLE TOOLTIPS
// ═══════════════════════════════════════════════════════════

const CONSUMABLE_TOOLTIPS: Record<string, { ru: string; en: string }> = {
  ether: { ru: 'Эфир — x2 урона на 1 тап', en: 'Ether — x2 damage per tap' },
  etherDust: { ru: 'Эфирная пыль — крафтится в Эфир (10:1)', en: 'Ether Dust — crafts into Ether (10:1)' },
  scrollHaste: { ru: 'Свиток скорости — +30% скорость атаки на 30 сек', en: 'Haste Scroll — +30% attack speed for 30s' },
  scrollAcumen: { ru: 'Свиток силы магии — +50% урона на 30 сек', en: 'Acumen Scroll — +50% damage for 30s' },
  scrollLuck: { ru: 'Свиток удачи — +10% шанс крита на 60 сек', en: 'Luck Scroll — +10% crit chance for 60s' },
  enchantCharges: { ru: 'Заряд заточки — 1 заряд = 1 попытка улучшения', en: 'Enchant Charge — 1 charge = 1 upgrade attempt' },
  protectionCharges: { ru: 'Безопасная заточка — защищает от поломки', en: 'Protection — prevents item from breaking' },
};

// ═══════════════════════════════════════════════════════════
// SKILLS DATA
// ═══════════════════════════════════════════════════════════

interface SkillInfo {
  id: string;
  nameRu: string;
  nameEn: string;
  descRu: string;
  descEn: string;
  icon: string;
  gradient: string;
  glow: string;
  manaCost: number;
  cooldown: number;
  unlockLevel: number;
}

const SKILLS_DATA: SkillInfo[] = [
  {
    id: 'fireball',
    nameRu: 'Огненный шар',
    nameEn: 'Fireball',
    descRu: '100 + P.Atk × 3',
    descEn: '100 + P.Atk × 3',
    icon: '🔥',
    gradient: 'from-orange-700/70 to-red-900/90',
    glow: 'shadow-[0_0_12px_rgba(249,115,22,0.4)]',
    manaCost: 100,
    cooldown: 10000,
    unlockLevel: 1,
  },
  {
    id: 'iceball',
    nameRu: 'Ледяная стрела',
    nameEn: 'Ice Arrow',
    descRu: '100 + P.Atk × 3',
    descEn: '100 + P.Atk × 3',
    icon: '❄️',
    gradient: 'from-cyan-700/70 to-blue-900/90',
    glow: 'shadow-[0_0_12px_rgba(34,211,238,0.4)]',
    manaCost: 100,
    cooldown: 10000,
    unlockLevel: 2,
  },
  {
    id: 'lightning',
    nameRu: 'Молния',
    nameEn: 'Lightning',
    descRu: '100 + P.Atk × 3',
    descEn: '100 + P.Atk × 3',
    icon: '⚡',
    gradient: 'from-yellow-600/70 to-amber-900/90',
    glow: 'shadow-[0_0_12px_rgba(250,204,21,0.4)]',
    manaCost: 100,
    cooldown: 10000,
    unlockLevel: 3,
  },
];

// ═══════════════════════════════════════════════════════════
// MASTERY CONSTANTS (mirror of server)
// ═══════════════════════════════════════════════════════════

const MASTERY_MAX_RANK = 10;
const MASTERY_COSTS = {
  gold: [5000, 8000, 12000, 18000, 26000, 38000, 55000, 80000, 120000, 180000],
  sp:   [80, 120, 180, 260, 380, 540, 760, 1050, 1450, 2000],
};

const TIER_THRESHOLDS = [50, 200, 500, 1000];
const TIER_BONUSES = [3, 7, 15, 25]; // Display as percentages
const TIER_ACTIVATION_COSTS = {
  gold: [8000, 18000, 45000, 120000],
  sp:   [120, 280, 700, 1800],
};

// PASSIVE SKILLS
const PASSIVE_SKILLS = [
  { id: 'arcanePower', nameRu: 'Тайная сила', nameEn: 'Arcane Power', icon: '⚔️', descRu: '+2% к P.Atk/ранг', descEn: '+2% P.Atk/rank', maxRank: 10 },
  { id: 'critFocus', nameRu: 'Фокус крита', nameEn: 'Crit Focus', icon: '🎯', descRu: '+0.6% крит шанс/ранг', descEn: '+0.6% crit/rank', maxRank: 10 },
  { id: 'critPower', nameRu: 'Мощь крита', nameEn: 'Crit Power', icon: '💥', descRu: '+6% крит урон/ранг', descEn: '+6% crit dmg/rank', maxRank: 10 },
  { id: 'staminaTraining', nameRu: 'Выносливость', nameEn: 'Stamina', icon: '💪', descRu: '+50 макс стамины/ранг', descEn: '+50 max stam/rank', maxRank: 10 },
  { id: 'manaFlow', nameRu: 'Поток маны', nameEn: 'Mana Flow', icon: '🔮', descRu: '+30 макс маны/ранг', descEn: '+30 max mana/rank', maxRank: 10 },
  { id: 'etherEfficiency', nameRu: 'Эфир', nameEn: 'Ether Eff.', icon: '✨', descRu: '-6% расхода эфира/ранг', descEn: '-6% ether cost/rank', maxRank: 5 },
];
const PASSIVE_COSTS = {
  gold: [4000, 6000, 9000, 13000, 19000, 28000, 41000, 60000, 90000, 135000],
  sp:   [60, 90, 130, 190, 280, 400, 560, 780, 1100, 1550],
};
const ETHER_EFFICIENCY_COSTS = {
  gold: [12000, 20000, 32000, 50000, 80000],
  sp:   [200, 320, 520, 820, 1300],
};

const SKILL_LEVEL_CAPS: Record<number, { activeMastery: number; tierMax: number; passiveRank: number; etherMax: number }> = {
  1:  { activeMastery: 3, tierMax: 1, passiveRank: 0, etherMax: 0 },
  5:  { activeMastery: 5, tierMax: 1, passiveRank: 3, etherMax: 0 },
  10: { activeMastery: 7, tierMax: 2, passiveRank: 6, etherMax: 0 },
  15: { activeMastery: 9, tierMax: 3, passiveRank: 8, etherMax: 3 },
  20: { activeMastery: 10, tierMax: 4, passiveRank: 10, etherMax: 5 },
};

function getSkillLevelCaps(level: number) {
  if (level >= 20) return SKILL_LEVEL_CAPS[20];
  if (level >= 15) return SKILL_LEVEL_CAPS[15];
  if (level >= 10) return SKILL_LEVEL_CAPS[10];
  if (level >= 5) return SKILL_LEVEL_CAPS[5];
  return SKILL_LEVEL_CAPS[1];
}

interface PlayerStats {
  id: string;
  username: string | null;
  firstName: string | null;
  photoUrl?: string | null;
  level: number;
  exp: number;
  expToNext: number;
  power: number;
  vitality: number;
  agility: number;
  intellect: number;
  spirit: number;
  pAtk: number;
  pDef: number;
  mAtk: number;
  mDef: number;
  critChance: number;
  attackSpeed: number;
  gold: number;
  ancientCoin?: number;
  // Consumables
  ether?: number;
  etherDust?: number;
  potionHaste?: number;   // Server sends potion*, mapped to scroll* in UI
  potionAcumen?: number;
  potionLuck?: number;
  enchantCharges?: number;
  protectionCharges?: number;
  // Skill levels (legacy)
  skillFireball?: number;
  skillIceball?: number;
  skillLightning?: number;
  // ═══ SKILLS v1.4 ═══
  skillFireballMastery?: number;
  skillIceballMastery?: number;
  skillLightningMastery?: number;
  skillFireballCasts?: number;
  skillIceballCasts?: number;
  skillLightningCasts?: number;
  skillFireballTiers?: number;
  skillIceballTiers?: number;
  skillLightningTiers?: number;
  // Passive skills
  passiveArcanePower?: number;
  passiveCritFocus?: number;
  passiveCritPower?: number;
  passiveStaminaTraining?: number;
  passiveManaFlow?: number;
  passiveEtherEfficiency?: number;
  // SP for skill upgrades
  sp?: number;
}

interface HeroState {
  equipment: Partial<Record<SlotType, Item | null>>;
  inventory: Item[];
  baseStats: PlayerStats | null;
  derivedStats: {
    pAtk: number;
    pDef: number;
    mAtk: number;
    mDef: number;
    critChance: number;
    attackSpeed: number;
  };
}

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════

const SLOT_ICONS: Record<SlotType, React.ReactNode> = {
  weapon: <Sword size={18} className="text-gray-500" />,
  shield: <Shield size={18} className="text-gray-500" />,
  helmet: <Crown size={18} className="text-gray-500" />,
  armor: <Shirt size={18} className="text-gray-500" />,
  gloves: <Hand size={18} className="text-gray-500" />,
  legs: <span className="text-lg text-gray-500">👖</span>,
  boots: <Footprints size={18} className="text-gray-500" />,
  ring1: <CircleDot size={16} className="text-gray-500" />,
  ring2: <CircleDot size={16} className="text-gray-500" />,
  necklace: <Gem size={16} className="text-gray-500" />,
};

const RARITY_STYLES: Record<Rarity, { border: string; glow: string; text: string; bg: string }> = {
  common: {
    border: 'border-gray-500/60',
    glow: '',
    text: 'text-gray-300',
    bg: 'from-gray-700/60 to-gray-900/80',
  },
  uncommon: {
    border: 'border-green-500/70',
    glow: 'shadow-[0_0_10px_rgba(34,197,94,0.4)]',
    text: 'text-green-400',
    bg: 'from-green-800/50 to-green-950/70',
  },
  rare: {
    border: 'border-blue-500/70',
    glow: 'shadow-[0_0_12px_rgba(59,130,246,0.5)]',
    text: 'text-blue-400',
    bg: 'from-blue-800/50 to-blue-950/70',
  },
  epic: {
    border: 'border-purple-500/70',
    glow: 'shadow-[0_0_14px_rgba(168,85,247,0.5)]',
    text: 'text-purple-400',
    bg: 'from-purple-800/50 to-purple-950/70',
  },
  legendary: {
    border: 'border-orange-500/80',
    glow: 'shadow-[0_0_16px_rgba(249,115,22,0.6)] animate-pulse',
    text: 'text-orange-400',
    bg: 'from-orange-800/50 to-orange-950/70',
  },
};

const SLOT_MAP: Record<string, SlotType> = {
  weapon: 'weapon', shield: 'shield', helmet: 'helmet',
  chest: 'armor', armor: 'armor', gloves: 'gloves',
  legs: 'legs', boots: 'boots', ring: 'ring1',
  ring1: 'ring1', ring2: 'ring2', necklace: 'necklace',
};

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function countSetPieces(equipment: Partial<Record<SlotType, Item | null>>): Record<string, number> {
  const counts: Record<string, number> = {};
  Object.values(equipment).forEach(item => {
    if (item?.setId) counts[item.setId] = (counts[item.setId] || 0) + 1;
  });
  return counts;
}

function getActiveSetBonuses(setId: string, count: number): SetBonus[] {
  const set = SETS[setId];
  if (!set) return [];
  return set.bonuses.filter(b => count >= b.pieces);
}

function calculateEquipmentBonuses(heroState: HeroState): { pAtk: number; pDef: number; mAtk: number; mDef: number } {
  let pAtk = 0, pDef = 0, mAtk = 0, mDef = 0;
  Object.values(heroState.equipment).forEach(item => {
    if (item?.stats) {
      pAtk += item.stats.pAtkFlat || 0;
      pDef += item.stats.pDefFlat || 0;
      mAtk += item.stats.mAtkFlat || 0;
      mDef += item.stats.mDefFlat || 0;
    }
  });
  return { pAtk, pDef, mAtk, mDef };
}

// Debug breakdown for stats
interface StatsBreakdown {
  base: number;
  equipment: number;
  enchant: number;
  setBonus: number;
  total: number;
  items: Array<{ name: string; value: number; enchant?: number }>;
  sets: Array<{ name: string; bonus: string }>;
}

function calculateStatsBreakdown(heroState: HeroState, stat: 'pAtk' | 'pDef'): StatsBreakdown {
  const base = heroState.baseStats?.[stat] || (stat === 'pAtk' ? 10 : 0);
  let equipment = 0;
  let enchant = 0;
  const items: Array<{ name: string; value: number; enchant?: number }> = [];

  // Calculate equipment contributions
  Object.values(heroState.equipment).forEach(item => {
    if (!item?.stats) return;
    const statKey = stat === 'pAtk' ? 'pAtkFlat' : 'pDefFlat';
    const baseValue = item.stats[statKey] || 0;
    if (baseValue > 0) {
      // Enchant bonus: +3% per level for weapon/armor
      const enchantBonus = item.enchantLevel ? Math.floor(baseValue * item.enchantLevel * 0.03) : 0;
      equipment += baseValue;
      enchant += enchantBonus;
      items.push({
        name: item.name,
        value: baseValue,
        enchant: enchantBonus > 0 ? enchantBonus : undefined,
      });
    }
  });

  // Calculate set bonuses
  const setCounts = countSetPieces(heroState.equipment);
  let setBonus = 0;
  const sets: Array<{ name: string; bonus: string }> = [];
  const subtotal = base + equipment + enchant;

  for (const [setId, count] of Object.entries(setCounts)) {
    const set = SETS[setId];
    if (!set) continue;
    for (const bonus of getActiveSetBonuses(setId, count)) {
      const pctKey = stat === 'pAtk' ? 'pAtk' : 'pDef';
      if (bonus.bonusPct?.[pctKey]) {
        const bonusValue = Math.floor(subtotal * bonus.bonusPct[pctKey]);
        setBonus += bonusValue;
        sets.push({
          name: set.nameRu,
          bonus: `${count}/${set.totalPieces}: +${(bonus.bonusPct[pctKey] * 100).toFixed(0)}% (+${bonusValue})`,
        });
      }
    }
  }

  return {
    base,
    equipment,
    enchant,
    setBonus,
    total: base + equipment + enchant + setBonus,
    items,
    sets,
  };
}

function recalculateDerivedStats(heroState: HeroState): HeroState['derivedStats'] {
  const base = heroState.baseStats;
  if (!base) return { pAtk: 10, pDef: 0, mAtk: 10, mDef: 0, critChance: 0.05, attackSpeed: 300 };

  let pAtk = base.pAtk, pDef = base.pDef, mAtk = base.mAtk, mDef = base.mDef;
  let critChance = base.critChance, attackSpeed = base.attackSpeed;

  Object.values(heroState.equipment).forEach(item => {
    if (item?.stats) {
      pAtk += item.stats.pAtkFlat || 0;
      pDef += item.stats.pDefFlat || 0;
      mAtk += item.stats.mAtkFlat || 0;
      mDef += item.stats.mDefFlat || 0;
      critChance += item.stats.critFlat || 0;
      attackSpeed += item.stats.atkSpdFlat || 0;
    }
  });

  const setCounts = countSetPieces(heroState.equipment);
  for (const [setId, count] of Object.entries(setCounts)) {
    for (const bonus of getActiveSetBonuses(setId, count)) {
      if (bonus.bonusPct?.pAtk) pAtk = Math.floor(pAtk * (1 + bonus.bonusPct.pAtk));
      if (bonus.bonusPct?.pDef) pDef = Math.floor(pDef * (1 + bonus.bonusPct.pDef));
    }
  }

  return { pAtk, pDef, mAtk, mDef, critChance, attackSpeed };
}

function equipItem(heroState: HeroState, itemId: string): HeroState {
  const item = heroState.inventory.find(i => i.id === itemId);
  if (!item) return heroState;
  const currentEquipped = heroState.equipment[item.slotType];
  const newInventory = heroState.inventory.filter(i => i.id !== itemId);
  if (currentEquipped) newInventory.push(currentEquipped);
  const newEquipment = { ...heroState.equipment, [item.slotType]: item };
  const newState = { ...heroState, equipment: newEquipment, inventory: newInventory };
  newState.derivedStats = recalculateDerivedStats(newState);
  return newState;
}

function unequipItem(heroState: HeroState, slotType: SlotType): HeroState {
  const item = heroState.equipment[slotType];
  if (!item) return heroState;
  const newEquipment = { ...heroState.equipment, [slotType]: null };
  const newInventory = [...heroState.inventory, item];
  const newState = { ...heroState, equipment: newEquipment, inventory: newInventory };
  newState.derivedStats = recalculateDerivedStats(newState);
  return newState;
}

function formatCompact(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toString();
}

// ═══════════════════════════════════════════════════════════
// SLOT COMPONENT - Premium Style
// ═══════════════════════════════════════════════════════════

interface SlotProps {
  slotType: SlotType;
  item: Item | null;
  size?: 'normal' | 'small';
  onClick?: () => void;
}

function Slot({ slotType, item, size = 'normal', onClick }: SlotProps) {
  const sizeClasses = size === 'normal' ? 'w-12 h-12' : 'w-10 h-10';
  const iconSize = size === 'normal' ? 'text-2xl' : 'text-xl';

  if (!item) {
    return (
      <button
        onClick={onClick}
        className={`${sizeClasses} bg-black/30 rounded-lg border border-gray-700/50 flex items-center justify-center
          hover:border-gray-500/70 active:scale-95 transition-all relative`}
      >
        {SLOT_ICONS[slotType]}
      </button>
    );
  }

  const style = RARITY_STYLES[item.rarity];
  const isBroken = item.isBroken;
  const enchantLevel = item.enchantLevel || 0;

  return (
    <button
      onClick={onClick}
      className={`${sizeClasses} bg-black/30 rounded-lg border ${style.border} ${style.glow}
        flex items-center justify-center hover:brightness-125 active:scale-95 transition-all relative
        ${isBroken ? 'opacity-50 grayscale' : ''}`}
    >
      <span className={iconSize}>{item.icon}</span>
      {/* Enchant level badge */}
      {enchantLevel > 0 && !isBroken && (
        <span className="absolute -top-1 -right-1 bg-amber-500 text-black text-[9px] font-bold px-1 rounded">
          +{enchantLevel}
        </span>
      )}
      {/* Broken overlay */}
      {isBroken && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-900/60 rounded-lg">
          <span className="text-red-400 text-lg">💔</span>
        </div>
      )}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// ITEM TOOLTIP
// ═══════════════════════════════════════════════════════════

interface ItemTooltipProps {
  item: Item;
  isEquipped: boolean;
  slotHasItem: boolean;
  onEquip: () => void;
  onUnequip: () => void;
  onClose: () => void;
  lang: Language;
}

function ItemTooltip({ item, isEquipped, slotHasItem, onEquip, onUnequip, onClose, lang }: ItemTooltipProps) {
  const style = RARITY_STYLES[item.rarity];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div
        className={`bg-l2-panel rounded-lg w-full max-w-xs border ${style.border} overflow-hidden`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-700/30">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-black/30 rounded-lg flex items-center justify-center">
              <span className="text-2xl">{item.icon}</span>
            </div>
            <div className="flex-1">
              <div className={`font-bold ${style.text}`}>{item.name}</div>
              <div className="text-xs text-gray-400 capitalize">{item.rarity}</div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="p-4 space-y-2">
          {/* Set info with bonuses */}
          {item.setId && SETS[item.setId] && (() => {
            const set = SETS[item.setId!];
            return (
              <div className="p-2 bg-purple-900/30 rounded-lg border border-purple-500/30">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-300 text-sm">📜 {lang === 'ru' ? 'Сэт' : 'Set'}</span>
                  <span className="text-purple-400 font-bold text-xs">
                    {lang === 'ru' ? set.nameRu : set.nameEn}
                  </span>
                </div>
                {/* Set bonuses list */}
                <div className="space-y-1 mt-2 pt-2 border-t border-purple-500/20">
                  {set.bonuses.map((bonus, idx) => (
                    <div key={idx} className="text-[10px] text-gray-400">
                      <span className="text-purple-400">{bonus.pieces}/{set.totalPieces}:</span>{' '}
                      {lang === 'ru' ? bonus.description.ru : bonus.description.en}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
          {/* Enchant level */}
          {(item.enchantLevel ?? 0) > 0 && (
            <div className="flex justify-between items-center p-2 bg-amber-900/30 rounded-lg border border-amber-500/30">
              <span className="text-gray-300 text-sm">✨ {lang === 'ru' ? 'Заточка' : 'Enchant'}</span>
              <span className="text-amber-400 font-bold">+{item.enchantLevel}</span>
            </div>
          )}
          {(item.stats.pAtkFlat ?? 0) > 0 && (() => {
            const base = item.stats.pAtkFlat!;
            const enchantBonus = (item.enchantLevel ?? 0) > 0 ? calculateEnchantBonus(base, item.enchantLevel!) : 0;
            return (
              <div className="flex justify-between items-center p-2 bg-black/30 rounded-lg">
                <span className="text-gray-300 text-sm">⚔️ {lang === 'ru' ? 'П. Атака' : 'P.Atk'}</span>
                <span className="text-red-400 font-bold">
                  +{base}
                  {enchantBonus > 0 && <span className="text-amber-400 ml-1">(+{enchantBonus})</span>}
                </span>
              </div>
            );
          })()}
          {(item.stats.pDefFlat ?? 0) > 0 && (() => {
            const base = item.stats.pDefFlat!;
            const enchantBonus = (item.enchantLevel ?? 0) > 0 ? calculateEnchantBonus(base, item.enchantLevel!) : 0;
            return (
              <div className="flex justify-between items-center p-2 bg-black/30 rounded-lg">
                <span className="text-gray-300 text-sm">🛡️ {lang === 'ru' ? 'П. Защита' : 'P.Def'}</span>
                <span className="text-blue-400 font-bold">
                  +{base}
                  {enchantBonus > 0 && <span className="text-amber-400 ml-1">(+{enchantBonus})</span>}
                </span>
              </div>
            );
          })()}
        </div>

        {/* Actions */}
        <div className="p-4 pt-0">
          {isEquipped ? (
            <button
              onClick={onUnequip}
              className="w-full py-3 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold active:scale-[0.98] transition-all"
            >
              {lang === 'ru' ? 'Снять' : 'Unequip'}
            </button>
          ) : (
            <button
              onClick={onEquip}
              className="w-full py-3 bg-l2-gold hover:bg-l2-gold/80 text-black rounded-lg font-bold active:scale-[0.98] transition-all"
            >
              {slotHasItem ? (lang === 'ru' ? 'Заменить' : 'Replace') : (lang === 'ru' ? 'Надеть' : 'Equip')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// STATS POPUP
// ═══════════════════════════════════════════════════════════

interface StatsPopupProps {
  stats: PlayerStats;
  derived: HeroState['derivedStats'];
  equipBonus: { pAtk: number; pDef: number; mAtk: number; mDef: number };
  heroState: HeroState;
  onClose: () => void;
  lang: Language;
}

function StatsPopup({ stats, derived, equipBonus, heroState, onClose, lang }: StatsPopupProps) {
  const [selectedStat, setSelectedStat] = useState<string | null>(null);
  const [selectedCombatStat, setSelectedCombatStat] = useState<'pAtk' | 'pDef' | null>(null);

  // Calculate breakdown when combat stat is selected
  const breakdown = selectedCombatStat ? calculateStatsBreakdown(heroState, selectedCombatStat) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div
        className="bg-l2-panel rounded-lg w-full max-w-sm overflow-hidden max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-700/30 flex items-center justify-between">
          <h3 className="text-sm text-gray-400">📊 {lang === 'ru' ? 'Статистика' : 'Statistics'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
            <X size={20} />
          </button>
        </div>

        <div className="p-4">
          {/* Combat Stats Grid */}
          <p className="text-xs text-gray-500 mb-2">{lang === 'ru' ? 'Боевые характеристики (тап = дебаг)' : 'Combat Stats (tap = debug)'}</p>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { key: 'pAtk', label: lang === 'ru' ? 'АТК' : 'ATK', value: derived.pAtk, bonus: equipBonus.pAtk, icon: '⚔️', text: 'text-red-400' },
              { key: 'pDef', label: lang === 'ru' ? 'ЗАЩ' : 'DEF', value: derived.pDef, bonus: equipBonus.pDef, icon: '🛡️', text: 'text-blue-400' },
              { key: null, label: lang === 'ru' ? 'КРИТ' : 'CRIT', value: `${(derived.critChance * 100).toFixed(0)}%`, icon: '💥', text: 'text-yellow-400' },
              { key: null, label: lang === 'ru' ? 'М.АТК' : 'M.ATK', value: derived.mAtk, bonus: equipBonus.mAtk, icon: '✨', text: 'text-purple-400' },
              { key: null, label: lang === 'ru' ? 'М.ЗАЩ' : 'M.DEF', value: derived.mDef, bonus: equipBonus.mDef, icon: '🔮', text: 'text-cyan-400' },
              { key: null, label: lang === 'ru' ? 'СКР' : 'SPD', value: derived.attackSpeed, icon: '⚡', text: 'text-green-400' },
            ].map((stat, idx) => (
              <button
                key={idx}
                onClick={() => stat.key && setSelectedCombatStat(selectedCombatStat === stat.key ? null : stat.key as 'pAtk' | 'pDef')}
                className={`bg-black/30 rounded-lg p-2 text-center transition-all ${
                  stat.key && selectedCombatStat === stat.key ? 'ring-2 ring-l2-gold' : ''
                } ${stat.key ? 'cursor-pointer hover:bg-black/50' : ''}`}
              >
                <div className="text-[10px] text-gray-500 mb-0.5">{stat.icon} {stat.label}</div>
                <div className={`text-lg font-bold ${stat.text}`}>
                  {stat.value}
                  {stat.bonus && stat.bonus > 0 && (
                    <span className="text-[10px] text-green-400 ml-1">(+{stat.bonus})</span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Debug Breakdown */}
          {breakdown && (
            <div className="mb-4 p-3 bg-gradient-to-b from-gray-800 to-gray-900 rounded-lg border border-l2-gold/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-l2-gold font-bold">
                  🔍 {selectedCombatStat === 'pAtk' ? (lang === 'ru' ? 'Разбор АТК' : 'ATK Breakdown') : (lang === 'ru' ? 'Разбор ЗАЩ' : 'DEF Breakdown')}
                </span>
                <span className="text-lg font-bold text-white">{breakdown.total}</span>
              </div>

              <div className="space-y-1.5 text-xs">
                {/* Base */}
                <div className="flex justify-between">
                  <span className="text-gray-400">{lang === 'ru' ? 'База (сила)' : 'Base (STR)'}</span>
                  <span className="text-white">{breakdown.base}</span>
                </div>

                {/* Equipment */}
                {breakdown.equipment > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">{lang === 'ru' ? 'Экипировка' : 'Equipment'}</span>
                    <span className="text-green-400">+{breakdown.equipment}</span>
                  </div>
                )}

                {/* Enchant */}
                {breakdown.enchant > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">{lang === 'ru' ? 'Заточка' : 'Enchant'}</span>
                    <span className="text-amber-400">+{breakdown.enchant}</span>
                  </div>
                )}

                {/* Set bonuses */}
                {breakdown.setBonus > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">{lang === 'ru' ? 'Сет бонус' : 'Set Bonus'}</span>
                    <span className="text-purple-400">+{breakdown.setBonus}</span>
                  </div>
                )}

                {/* Divider */}
                <div className="border-t border-gray-700 my-2" />

                {/* Item details */}
                {breakdown.items.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] text-gray-500">{lang === 'ru' ? 'Предметы:' : 'Items:'}</span>
                    {breakdown.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-[10px] pl-2">
                        <span className="text-gray-400 truncate max-w-[150px]">{item.name}</span>
                        <span className="text-green-400">
                          +{item.value}
                          {item.enchant && <span className="text-amber-400 ml-1">(+{item.enchant})</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Set details */}
                {breakdown.sets.length > 0 && (
                  <div className="space-y-1 mt-2">
                    <span className="text-[10px] text-gray-500">{lang === 'ru' ? 'Сеты:' : 'Sets:'}</span>
                    {breakdown.sets.map((set, i) => (
                      <div key={i} className="text-[10px] pl-2 text-purple-400">
                        {set.name} {set.bonus}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Base Attributes */}
          <p className="text-xs text-gray-500 mb-2">{lang === 'ru' ? 'Атрибуты (тап = инфо)' : 'Attributes (tap = info)'}</p>
          <div className="grid grid-cols-5 gap-1.5">
            {[
              { key: 'power', icon: '💪', color: 'text-red-400', label: lang === 'ru' ? 'СИЛ' : 'STR' },
              { key: 'agility', icon: '🏃', color: 'text-green-400', label: lang === 'ru' ? 'ЛОВ' : 'AGI' },
              { key: 'vitality', icon: '❤️', color: 'text-pink-400', label: lang === 'ru' ? 'СТОЙ' : 'VIT' },
              { key: 'intellect', icon: '🧠', color: 'text-blue-400', label: lang === 'ru' ? 'ИНТ' : 'INT' },
              { key: 'spirit', icon: '✨', color: 'text-purple-400', label: lang === 'ru' ? 'ДУХ' : 'SPI' },
            ].map(attr => (
              <button
                key={attr.key}
                onClick={() => setSelectedStat(selectedStat === attr.key ? null : attr.key)}
                className={`bg-black/30 rounded-lg p-2 text-center transition-all ${
                  selectedStat === attr.key ? 'ring-1 ring-l2-gold' : ''
                }`}
              >
                <div className="text-base mb-0.5">{attr.icon}</div>
                <div className={`text-sm font-bold ${attr.color}`}>{(stats as any)[attr.key] || 10}</div>
                <div className="text-[8px] text-gray-500">{attr.label}</div>
              </button>
            ))}
          </div>

          {/* Stat Tooltip */}
          {selectedStat && STAT_TOOLTIPS[selectedStat] && (
            <div className="mt-3 p-3 bg-black/30 rounded-lg">
              <p className="text-xs text-gray-300">
                {lang === 'ru' ? STAT_TOOLTIPS[selectedStat].ru : STAT_TOOLTIPS[selectedStat].en}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SKILLS POPUP v1.4 - Mastery System
// ═══════════════════════════════════════════════════════════

interface PassiveRanks {
  arcanePower: number;
  critFocus: number;
  critPower: number;
  staminaTraining: number;
  manaFlow: number;
  etherEfficiency: number;
}

interface SkillsPopupProps {
  level: number;
  skillLevels: { fireball: number; iceball: number; lightning: number };
  skillMastery: { fireball: number; iceball: number; lightning: number };
  skillCasts: { fireball: number; iceball: number; lightning: number };
  skillTiers: { fireball: number; iceball: number; lightning: number };
  passiveRanks: PassiveRanks;
  gold: number;
  sp: number;
  onClose: () => void;
  onUpgrade: (skillId: string) => void;
  onTierActivate: (skillId: string, tier: number) => void;
  onPassiveUpgrade: (passiveId: string) => void;
  lang: Language;
}

function SkillsPopup({ level, skillLevels, skillMastery, skillCasts, skillTiers, passiveRanks, gold, sp, onClose, onUpgrade, onTierActivate, onPassiveUpgrade, lang }: SkillsPopupProps) {
  const [activeTab, setActiveTab] = useState<'active' | 'passive'>('active');
  const getMastery = (skillId: string): number => {
    if (skillId === 'fireball') return skillMastery.fireball;
    if (skillId === 'iceball') return skillMastery.iceball;
    if (skillId === 'lightning') return skillMastery.lightning;
    return 0;
  };

  const getCasts = (skillId: string): number => {
    if (skillId === 'fireball') return skillCasts.fireball;
    if (skillId === 'iceball') return skillCasts.iceball;
    if (skillId === 'lightning') return skillCasts.lightning;
    return 0;
  };

  const getTiers = (skillId: string): number => {
    if (skillId === 'fireball') return skillTiers.fireball;
    if (skillId === 'iceball') return skillTiers.iceball;
    if (skillId === 'lightning') return skillTiers.lightning;
    return 0;
  };

  const caps = getSkillLevelCaps(level);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div
        className="bg-l2-panel rounded-lg w-full max-w-md overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header with tabs */}
        <div className="p-4 border-b border-gray-700/30">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm text-gray-400">⚡ {lang === 'ru' ? 'Навыки' : 'Skills'}</h3>
              <div className="flex items-center gap-3 text-xs mt-1">
                <span className="text-l2-gold">🪙 {gold.toLocaleString()}</span>
                <span className="text-blue-400">SP: {sp}</span>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
              <X size={20} />
            </button>
          </div>
          {/* Tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('active')}
              className={`flex-1 py-2 px-3 rounded text-xs font-bold transition-all ${
                activeTab === 'active'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {lang === 'ru' ? 'Активные' : 'Active'}
            </button>
            <button
              onClick={() => setActiveTab('passive')}
              className={`flex-1 py-2 px-3 rounded text-xs font-bold transition-all ${
                activeTab === 'passive'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {lang === 'ru' ? 'Пассивные' : 'Passive'}
            </button>
          </div>
        </div>

        <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
        {activeTab === 'active' && (<>
          {SKILLS_DATA.map((skill) => {
            const isLocked = level < skill.unlockLevel;
            const mastery = getMastery(skill.id);
            const casts = getCasts(skill.id);
            const tiers = getTiers(skill.id);

            // Mastery upgrade cost
            const canUpgradeMastery = mastery < MASTERY_MAX_RANK && mastery < caps.activeMastery;
            const masteryCost = mastery < MASTERY_MAX_RANK ? {
              gold: MASTERY_COSTS.gold[mastery],
              sp: MASTERY_COSTS.sp[mastery],
            } : null;
            const canAffordMastery = masteryCost && gold >= masteryCost.gold && sp >= masteryCost.sp;

            // Calculate total mastery bonus
            const masteryBonus = mastery * 3; // +3% per rank

            // Calculate tier bonuses unlocked
            let tierUnlocked = 0;
            for (let i = TIER_THRESHOLDS.length - 1; i >= 0; i--) {
              if (casts >= TIER_THRESHOLDS[i]) {
                tierUnlocked = i + 1;
                break;
              }
            }

            // Calculate active tier bonus
            let tierBonus = 0;
            for (let i = 0; i < 4; i++) {
              if (tiers & (1 << i)) {
                tierBonus += TIER_BONUSES[i];
              }
            }

            return (
              <div
                key={skill.id}
                className={`p-3 bg-black/30 rounded-lg ${isLocked ? 'opacity-50' : ''}`}
              >
                {/* Skill Header */}
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-black/50 flex items-center justify-center relative">
                    <span className="text-2xl">{skill.icon}</span>
                    {!isLocked && mastery > 0 && (
                      <span className="absolute -top-1 -right-1 bg-purple-600 px-1.5 py-0.5 rounded text-[9px] font-bold text-white">
                        M{mastery}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold ${isLocked ? 'text-gray-400' : 'text-white'}`}>
                        {lang === 'ru' ? skill.nameRu : skill.nameEn}
                      </span>
                      {isLocked && (
                        <span className="text-[9px] text-red-400 bg-red-900/30 px-1.5 py-0.5 rounded">Lv.{skill.unlockLevel}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      {lang === 'ru' ? skill.descRu : skill.descEn}
                    </p>
                    <div className="flex items-center gap-3 text-[10px] text-gray-400 mt-1">
                      <span>💧 {skill.manaCost}</span>
                      <span>⏱️ {skill.cooldown / 1000}s</span>
                      {(masteryBonus > 0 || tierBonus > 0) && (
                        <span className="text-green-400">+{masteryBonus + tierBonus}% {lang === 'ru' ? 'урон' : 'dmg'}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Mastery & Upgrade Section */}
                {!isLocked && (
                  <div className="mt-3 pt-3 border-t border-gray-700/30">
                    {/* Mastery Row */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-purple-400">{lang === 'ru' ? 'Мастерство' : 'Mastery'}</span>
                        <span className="text-xs text-white">{mastery}/{caps.activeMastery}</span>
                        {mastery >= caps.activeMastery && mastery < MASTERY_MAX_RANK && (
                          <span className="text-[9px] text-yellow-500">Lv.{level < 20 ? (level < 15 ? (level < 10 ? (level < 5 ? 5 : 10) : 15) : 20) : 20}+</span>
                        )}
                      </div>
                      {canUpgradeMastery && masteryCost && (
                        <button
                          onClick={() => onUpgrade(skill.id)}
                          disabled={!canAffordMastery}
                          className={`px-2 py-1 rounded text-[10px] font-bold ${
                            canAffordMastery
                              ? 'bg-purple-600 text-white hover:bg-purple-500'
                              : 'bg-gray-700 text-gray-500'
                          }`}
                        >
                          +3% • {masteryCost.gold.toLocaleString()}🪙 {masteryCost.sp}SP
                        </button>
                      )}
                      {mastery >= MASTERY_MAX_RANK && (
                        <span className="text-[10px] text-yellow-500">MAX</span>
                      )}
                    </div>

                    {/* Proficiency (Casts) Progress */}
                    <div className="flex items-center gap-2 text-[10px]">
                      <span className="text-gray-500">{lang === 'ru' ? 'Каст' : 'Casts'}:</span>
                      <span className="text-cyan-400">{casts}</span>
                      {tierUnlocked < 4 && (
                        <span className="text-gray-600">→ {TIER_THRESHOLDS[tierUnlocked]}</span>
                      )}
                    </div>

                    {/* Tier activation buttons */}
                    <div className="flex gap-1 mt-2">
                      {[1, 2, 3, 4].map(t => {
                        const isUnlocked = tierUnlocked >= t;
                        const isActivated = (tiers & (1 << (t - 1))) !== 0;
                        const canActivate = isUnlocked && !isActivated && t <= caps.tierMax;
                        const tierCost = {
                          gold: TIER_ACTIVATION_COSTS.gold[t - 1],
                          sp: TIER_ACTIVATION_COSTS.sp[t - 1],
                        };
                        const canAfford = gold >= tierCost.gold && sp >= tierCost.sp;
                        const isLevelLocked = t > caps.tierMax;

                        return (
                          <div key={t} className="flex-1 text-center">
                            {isActivated ? (
                              <div className="bg-green-600/30 border border-green-500/50 rounded p-1.5">
                                <div className="text-green-400 font-bold text-[10px]">T{t} ✓</div>
                                <div className="text-green-300 text-[8px]">+{TIER_BONUSES[t - 1]}%</div>
                              </div>
                            ) : canActivate ? (
                              <button
                                onClick={() => onTierActivate(skill.id, t)}
                                disabled={!canAfford}
                                className={`w-full rounded p-1.5 ${
                                  canAfford
                                    ? 'bg-yellow-600/30 border border-yellow-500/50 hover:bg-yellow-600/50'
                                    : 'bg-gray-700/30 border border-gray-600/50'
                                }`}
                              >
                                <div className={`font-bold text-[10px] ${canAfford ? 'text-yellow-400' : 'text-gray-500'}`}>
                                  T{t}
                                </div>
                                <div className={`text-[8px] ${canAfford ? 'text-yellow-300' : 'text-gray-500'}`}>
                                  +{TIER_BONUSES[t - 1]}%
                                </div>
                                <div className={`text-[7px] mt-0.5 ${canAfford ? 'text-gray-400' : 'text-gray-600'}`}>
                                  {(tierCost.gold / 1000).toFixed(0)}k🪙
                                </div>
                              </button>
                            ) : isLevelLocked ? (
                              <div className="bg-gray-800/30 border border-gray-700/50 rounded p-1.5">
                                <div className="text-gray-500 font-bold text-[10px]">T{t}</div>
                                <div className="text-gray-600 text-[8px]">Lv.{t === 2 ? 10 : t === 3 ? 15 : 20}+</div>
                              </div>
                            ) : (
                              <div className="bg-gray-800/30 border border-gray-700/50 rounded p-1.5">
                                <div className="text-gray-500 font-bold text-[10px]">T{t}</div>
                                <div className="text-gray-600 text-[8px]">{TIER_THRESHOLDS[t - 1]}</div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </>)}

        {/* PASSIVE SKILLS TAB */}
        {activeTab === 'passive' && (
          <div className="space-y-2">
            {PASSIVE_SKILLS.map((passive) => {
              const rank = passiveRanks[passive.id as keyof PassiveRanks] ?? 0;
              const isEther = passive.id === 'etherEfficiency';
              const maxRank = passive.maxRank;
              const capRank = isEther ? caps.etherMax : caps.passiveRank;
              const canUpgrade = rank < maxRank && rank < capRank;

              // Get cost for next rank
              const costs = isEther ? ETHER_EFFICIENCY_COSTS : PASSIVE_COSTS;
              const cost = rank < maxRank ? { gold: costs.gold[rank], sp: costs.sp[rank] } : null;
              const canAfford = cost && gold >= cost.gold && sp >= cost.sp;

              return (
                <div key={passive.id} className="p-3 bg-black/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-black/50 flex items-center justify-center">
                      <span className="text-xl">{passive.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white text-sm">
                          {lang === 'ru' ? passive.nameRu : passive.nameEn}
                        </span>
                        <span className={`text-xs ${rank > 0 ? 'text-green-400' : 'text-gray-500'}`}>
                          {rank}/{capRank}
                          {capRank < maxRank && <span className="text-yellow-500 ml-1">(max {maxRank})</span>}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-400">
                        {lang === 'ru' ? passive.descRu : passive.descEn}
                      </p>
                    </div>
                  </div>

                  {/* Upgrade button */}
                  {canUpgrade && cost && (
                    <button
                      onClick={() => onPassiveUpgrade(passive.id)}
                      disabled={!canAfford}
                      className={`w-full mt-2 py-1.5 rounded text-xs font-bold ${
                        canAfford
                          ? 'bg-green-600 text-white hover:bg-green-500'
                          : 'bg-gray-700 text-gray-500'
                      }`}
                    >
                      {lang === 'ru' ? 'Улучшить' : 'Upgrade'} • {cost.gold.toLocaleString()}🪙 {cost.sp}SP
                    </button>
                  )}
                  {rank >= capRank && rank < maxRank && (
                    <div className="mt-2 text-center text-[10px] text-yellow-500">
                      {lang === 'ru' ? `Требуется уровень ${capRank < 3 ? 5 : capRank < 6 ? 10 : capRank < 8 ? 15 : 20}+` : `Requires level ${capRank < 3 ? 5 : capRank < 6 ? 10 : capRank < 8 ? 15 : 20}+`}
                    </div>
                  )}
                  {rank >= maxRank && (
                    <div className="mt-2 text-center text-[10px] text-yellow-500">MAX</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        </div>

        {/* Footer hint */}
        <div className="p-3 border-t border-gray-700/30 text-center">
          <p className="text-[10px] text-gray-500">
            {activeTab === 'active'
              ? (lang === 'ru'
                ? '💡 Мастерство: +3% урона/ранг • Касты открывают тиры'
                : '💡 Mastery: +3% dmg/rank • Casts unlock tiers')
              : (lang === 'ru'
                ? '💡 Пассивки усиливают героя постоянно'
                : '💡 Passives boost your hero permanently')}
          </p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════

export default function CharacterTab() {
  const [heroState, setHeroState] = useState<HeroState>({
    equipment: {},
    inventory: [],
    baseStats: null,
    derivedStats: { pAtk: 10, pDef: 40, mAtk: 10, mDef: 30, critChance: 0.05, attackSpeed: 300 },
  });
  const [isLoading, setIsLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<{ item: Item; isEquipped: boolean; slotType?: SlotType } | null>(null);
  const [showStatsPopup, setShowStatsPopup] = useState(false);
  const [showSkillsPopup, setShowSkillsPopup] = useState(false);
  const [selectedConsumable, setSelectedConsumable] = useState<string | null>(null);
  const [consumables, setConsumables] = useState({ ether: 0, etherDust: 0, scrollHaste: 0, scrollAcumen: 0, scrollLuck: 0, enchantCharges: 0, protectionCharges: 0 });
  const [lang] = useState<Language>(() => detectLanguage());
  const t = useTranslation(lang);

  useEffect(() => {
    const socket = getSocket();
    socket.emit('player:get');
    socket.emit('equipment:get');

    const handlePlayerData = (data: PlayerStats) => {
      setHeroState(prev => {
        const newState = { ...prev, baseStats: data };
        newState.derivedStats = recalculateDerivedStats(newState);
        return newState;
      });
      setConsumables({
        ether: data.ether || 0,
        etherDust: data.etherDust || 0,
        scrollHaste: data.potionHaste || 0,  // Server sends potionHaste
        scrollAcumen: data.potionAcumen || 0, // Server sends potionAcumen
        scrollLuck: data.potionLuck || 0,     // Server sends potionLuck
        enchantCharges: data.enchantCharges || 0,
        protectionCharges: data.protectionCharges || 0,
      });
      setIsLoading(false);
    };

    const handleEquipmentData = (data: { equipped: any[]; inventory: any[] }) => {
      const serverToItem = (item: any): Item => ({
        id: item.id,
        name: item.name || item.nameRu || 'Unknown',
        slotType: SLOT_MAP[item.slot] || 'weapon',
        rarity: (item.rarity || 'common') as Rarity,
        icon: item.icon || '📦',
        stats: { pAtkFlat: item.pAtk || 0, pDefFlat: item.pDef || 0 },
        setId: item.setId || null,
        // Enchant fields - map from server (enchant or enchantLevel)
        enchantLevel: item.enchantLevel ?? item.enchant ?? 0,
        isBroken: item.isBroken ?? false,
        brokenUntil: item.brokenUntil ? new Date(item.brokenUntil).getTime() : null,
      });

      const newEquipment: Partial<Record<SlotType, Item | null>> = {};
      const newInventory: Item[] = [];
      for (const item of data.equipped) {
        const clientItem = serverToItem(item);
        newEquipment[clientItem.slotType] = clientItem;
      }
      for (const item of data.inventory) {
        newInventory.push(serverToItem(item));
      }

      setHeroState(prev => {
        const newState = { ...prev, equipment: newEquipment, inventory: newInventory };
        newState.derivedStats = recalculateDerivedStats(newState);
        return newState;
      });
    };

    // FIX: Server sends potionHaste/potionAcumen/potionLuck directly, not in stats object
    const handleBuffSuccess = (data: { buffId: string; expiresAt: number; potionHaste?: number; potionAcumen?: number; potionLuck?: number }) => {
      setConsumables(prev => ({
        ...prev,
        scrollHaste: data.potionHaste ?? prev.scrollHaste,
        scrollAcumen: data.potionAcumen ?? prev.scrollAcumen,
        scrollLuck: data.potionLuck ?? prev.scrollLuck,
      }));
    };

    // Sync ether when used in combat (from PhaserGame taps)
    const handleTapResult = (data: { ether?: number }) => {
      if (data.ether !== undefined) {
        setConsumables(prev => ({ ...prev, ether: data.ether! }));
      }
    };

    // Sync ether when crafted
    const handleEtherCraft = (data: { ether: number }) => {
      setConsumables(prev => ({ ...prev, ether: data.ether }));
    };

    // Sync consumables when task rewards are claimed or enchant/forge used
    const handlePlayerState = (data: { ether?: number; etherDust?: number; potionHaste?: number; potionAcumen?: number; potionLuck?: number; enchantCharges?: number; protectionCharges?: number }) => {
      setConsumables(prev => ({
        ether: data.ether ?? prev.ether,
        etherDust: data.etherDust ?? prev.etherDust,
        scrollHaste: data.potionHaste ?? prev.scrollHaste,
        scrollAcumen: data.potionAcumen ?? prev.scrollAcumen,
        scrollLuck: data.potionLuck ?? prev.scrollLuck,
        enchantCharges: data.enchantCharges ?? prev.enchantCharges,
        protectionCharges: data.protectionCharges ?? prev.protectionCharges,
      }));
    };

    // Handle level up (boss kill rewards)
    const handleLevelUp = (data: { level: number; skillFireball: number; skillIceball: number; skillLightning: number }) => {
      setHeroState(prev => {
        if (!prev.baseStats) return prev;
        return {
          ...prev,
          baseStats: {
            ...prev.baseStats,
            level: data.level,
            skillFireball: data.skillFireball,
            skillIceball: data.skillIceball,
            skillLightning: data.skillLightning,
          },
        };
      });
    };

    // Handle skill mastery upgrade
    const handleSkillUpgrade = (data: { skillId: string; newRank: number; gold: number; sp: number; [key: string]: any }) => {
      setHeroState(prev => {
        if (!prev.baseStats) return prev;
        const updates: Partial<PlayerStats> = {
          gold: data.gold,
          sp: data.sp,
        };
        // Update the specific mastery field
        if (data.skillFireballMastery !== undefined) updates.skillFireballMastery = data.skillFireballMastery;
        if (data.skillIceballMastery !== undefined) updates.skillIceballMastery = data.skillIceballMastery;
        if (data.skillLightningMastery !== undefined) updates.skillLightningMastery = data.skillLightningMastery;

        return {
          ...prev,
          baseStats: {
            ...prev.baseStats,
            ...updates,
          },
        };
      });
    };

    // Handle skill tier activation
    const handleTierActivate = (data: { skillId: string; tier: number; newTiers: number; gold: number; sp: number }) => {
      setHeroState(prev => {
        if (!prev.baseStats) return prev;
        const updates: Partial<PlayerStats> = {
          gold: data.gold,
          sp: data.sp,
        };
        // Update the specific tiers field
        if (data.skillId === 'fireball') updates.skillFireballTiers = data.newTiers;
        if (data.skillId === 'iceball') updates.skillIceballTiers = data.newTiers;
        if (data.skillId === 'lightning') updates.skillLightningTiers = data.newTiers;

        return {
          ...prev,
          baseStats: {
            ...prev.baseStats,
            ...updates,
          },
        };
      });
    };

    // Handle passive skill upgrade
    const handlePassiveUpgrade = (data: { passiveId: string; newRank: number; gold: number; sp: number }) => {
      setHeroState(prev => {
        if (!prev.baseStats) return prev;
        const updates: Partial<PlayerStats> = {
          gold: data.gold,
          sp: data.sp,
        };
        // Update the specific passive field
        if (data.passiveId === 'arcanePower') updates.passiveArcanePower = data.newRank;
        if (data.passiveId === 'critFocus') updates.passiveCritFocus = data.newRank;
        if (data.passiveId === 'critPower') updates.passiveCritPower = data.newRank;
        if (data.passiveId === 'staminaTraining') updates.passiveStaminaTraining = data.newRank;
        if (data.passiveId === 'manaFlow') updates.passiveManaFlow = data.newRank;
        if (data.passiveId === 'etherEfficiency') updates.passiveEtherEfficiency = data.newRank;

        return {
          ...prev,
          baseStats: {
            ...prev.baseStats,
            ...updates,
          },
        };
      });
    };

    socket.on('player:data', handlePlayerData);
    socket.on('auth:success', handlePlayerData);
    socket.on('equipment:data', handleEquipmentData);
    socket.on('buff:success', handleBuffSuccess);
    socket.on('tap:result', handleTapResult);
    socket.on('ether:craft:success', handleEtherCraft);
    socket.on('player:state', handlePlayerState);
    socket.on('level:up', handleLevelUp);
    socket.on('skill:upgrade-success', handleSkillUpgrade);
    socket.on('skill:tier-success', handleTierActivate);
    socket.on('skill:passive-success', handlePassiveUpgrade);

    return () => {
      // IMPORTANT: Pass handler reference to only remove THIS component's listeners
      socket.off('player:data', handlePlayerData);
      socket.off('auth:success', handlePlayerData);
      socket.off('equipment:data', handleEquipmentData);
      socket.off('buff:success', handleBuffSuccess);
      socket.off('tap:result', handleTapResult);
      socket.off('ether:craft:success', handleEtherCraft);
      socket.off('player:state', handlePlayerState);
      socket.off('level:up', handleLevelUp);
      socket.off('skill:upgrade-success', handleSkillUpgrade);
      socket.off('skill:tier-success', handleTierActivate);
      socket.off('skill:passive-success', handlePassiveUpgrade);
    };
  }, []);

  const handleEquip = useCallback((itemId: string) => {
    setHeroState(prev => equipItem(prev, itemId));
    setSelectedItem(null);
    getSocket().emit('equipment:equip', { itemId });
  }, []);

  const handleUnequip = useCallback((slotType: SlotType) => {
    const item = heroState.equipment[slotType];
    if (!item) return;
    setHeroState(prev => unequipItem(prev, slotType));
    setSelectedItem(null);
    getSocket().emit('equipment:unequip', { itemId: item.id });
  }, [heroState.equipment]);

  const handleEquippedSlotClick = useCallback((slotType: SlotType) => {
    const item = heroState.equipment[slotType];
    if (item) setSelectedItem({ item, isEquipped: true, slotType });
  }, [heroState.equipment]);

  if (isLoading || !heroState.baseStats) {
    return (
      <div className="flex-1 flex items-center justify-center bg-l2-dark">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-bounce">⚔️</div>
          <p className="text-gray-400 text-sm">{t.game.loading}</p>
        </div>
      </div>
    );
  }

  const stats = heroState.baseStats;
  const derived = heroState.derivedStats;
  const equipBonus = calculateEquipmentBonuses(heroState);
  const expPercent = Math.min(100, (stats.exp / stats.expToNext) * 100);
  const setCounts = countSetPieces(heroState.equipment);

  // Build consumables for inventory
  const consumableSlots: { id: string; dbField: string; icon: string; count: number; color: string }[] = [];
  if (consumables.enchantCharges > 0) {
    consumableSlots.push({ id: 'enchantCharges', dbField: 'enchantCharges', icon: '⚗️', count: consumables.enchantCharges, color: 'text-amber-400' });
  }
  if (consumables.protectionCharges > 0) {
    consumableSlots.push({ id: 'protectionCharges', dbField: 'protectionCharges', icon: '🛡️', count: consumables.protectionCharges, color: 'text-blue-400' });
  }
  if (consumables.ether > 0) {
    consumableSlots.push({ id: 'ether', dbField: 'ether', icon: '✨', count: consumables.ether, color: 'text-cyan-400' });
  }
  if (consumables.etherDust > 0) {
    consumableSlots.push({ id: 'etherDust', dbField: 'etherDust', icon: '🌫️', count: consumables.etherDust, color: 'text-purple-400' });
  }
  if (consumables.scrollHaste > 0) {
    consumableSlots.push({ id: 'scrollHaste', dbField: 'scrollHaste', icon: '⚡', count: consumables.scrollHaste, color: 'text-yellow-400' });
  }
  if (consumables.scrollAcumen > 0) {
    consumableSlots.push({ id: 'scrollAcumen', dbField: 'scrollAcumen', icon: '🔥', count: consumables.scrollAcumen, color: 'text-orange-400' });
  }
  if (consumables.scrollLuck > 0) {
    consumableSlots.push({ id: 'scrollLuck', dbField: 'scrollLuck', icon: '🍀', count: consumables.scrollLuck, color: 'text-green-400' });
  }

  const totalSlots = heroState.inventory.length + consumableSlots.length;

  return (
    <div className="flex-1 overflow-auto bg-l2-dark p-4">
      {/* ═══════════════════════════════════════════════════════════ */}
      {/* COMPACT HEADER */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="bg-l2-panel rounded-lg p-4 mb-4">
        <div className="flex items-center gap-3">
          {/* Level Badge */}
          <div className="w-12 h-12 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <span className="text-lg font-bold text-amber-400">{stats.level}</span>
          </div>

          {/* Name + EXP */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-bold text-white truncate">
                {stats.firstName || stats.username || 'Hero'}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-l2-gold font-bold flex items-center gap-1">
                  <span>🪙</span> {formatCompact(stats.gold || 0)}
                </span>
                <span className="text-sm text-purple-400 font-bold flex items-center gap-1">
                  <Gem size={14} /> {stats.ancientCoin || 0}
                </span>
              </div>
            </div>
            {/* EXP Bar */}
            <div className="h-3 bg-black/30 rounded-md overflow-hidden relative">
              <div
                className="h-full bg-purple-600 transition-all duration-300"
                style={{ width: `${expPercent}%` }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-[9px] text-white font-bold">
                {stats.exp}/{stats.expToNext} ({expPercent.toFixed(0)}%)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* EQUIPMENT PAPERDOLL */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="bg-l2-panel rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm text-gray-400">{lang === 'ru' ? 'Снаряжение' : 'Equipment'}</h3>
          <span className="text-xs text-gray-500">
            {Object.values(heroState.equipment).filter(Boolean).length}/10
          </span>
        </div>

        {/* Paperdoll Grid */}
        <div className="flex flex-col items-center gap-2">
          {/* Row 1: Helmet */}
          <Slot slotType="helmet" item={heroState.equipment.helmet || null} onClick={() => handleEquippedSlotClick('helmet')} />

          {/* Row 2: Weapon - Armor - Shield */}
          <div className="flex items-center gap-3">
            <Slot slotType="weapon" item={heroState.equipment.weapon || null} onClick={() => handleEquippedSlotClick('weapon')} />
            <Slot slotType="armor" item={heroState.equipment.armor || null} onClick={() => handleEquippedSlotClick('armor')} />
            <Slot slotType="shield" item={heroState.equipment.shield || null} onClick={() => handleEquippedSlotClick('shield')} />
          </div>

          {/* Row 3: Gloves - Legs - Boots */}
          <div className="flex items-center gap-3">
            <Slot slotType="gloves" item={heroState.equipment.gloves || null} onClick={() => handleEquippedSlotClick('gloves')} />
            <Slot slotType="legs" item={heroState.equipment.legs || null} onClick={() => handleEquippedSlotClick('legs')} />
            <Slot slotType="boots" item={heroState.equipment.boots || null} onClick={() => handleEquippedSlotClick('boots')} />
          </div>

          {/* Row 4: Accessories */}
          <div className="flex items-center gap-3">
            <Slot slotType="ring1" item={heroState.equipment.ring1 || null} size="small" onClick={() => handleEquippedSlotClick('ring1')} />
            <Slot slotType="necklace" item={heroState.equipment.necklace || null} size="small" onClick={() => handleEquippedSlotClick('necklace')} />
            <Slot slotType="ring2" item={heroState.equipment.ring2 || null} size="small" onClick={() => handleEquippedSlotClick('ring2')} />
          </div>
        </div>

        {/* Set Bonuses */}
        {Object.entries(setCounts).filter(([_, c]) => c > 0).map(([setId, count]) => {
          const set = SETS[setId];
          if (!set) return null;
          const activeBonuses = getActiveSetBonuses(setId, count);
          const nextBonus = set.bonuses.find(b => b.pieces > count);

          return (
            <div key={setId} className="mt-3 pt-3 border-t border-gray-700/30">
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-xs font-bold ${activeBonuses.length > 0 ? 'text-l2-gold' : 'text-gray-400'}`}>
                  {lang === 'ru' ? set.nameRu : set.nameEn}
                </span>
                <span className={`text-xs ${activeBonuses.length > 0 ? 'text-l2-gold' : 'text-gray-500'}`}>
                  {count}/{set.totalPieces}
                </span>
              </div>
              {activeBonuses.map((bonus, idx) => (
                <div key={idx} className="text-[10px] text-green-400 bg-black/30 rounded-lg px-2 py-1 mb-1">
                  ✓ {bonus.pieces} шт: {lang === 'ru' ? bonus.description.ru : bonus.description.en}
                </div>
              ))}
              {nextBonus && (
                <div className="text-[10px] text-gray-500 pl-1">
                  ○ {nextBonus.pieces} шт: {lang === 'ru' ? nextBonus.description.ru : nextBonus.description.en}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* STATS & SKILLS BUTTONS */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setShowStatsPopup(true)}
          className="flex-1 py-3 px-4 rounded-lg font-bold text-xs bg-l2-gold text-black hover:bg-l2-gold/80 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          📊 {lang === 'ru' ? 'Статы' : 'Stats'}
        </button>
        <button
          onClick={() => setShowSkillsPopup(true)}
          className="flex-1 py-3 px-4 rounded-lg font-bold text-xs bg-purple-600 text-white hover:bg-purple-500 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          ⚡ {lang === 'ru' ? 'Скиллы' : 'Skills'}
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* INVENTORY */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="bg-l2-panel rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm text-gray-400">{lang === 'ru' ? 'Инвентарь' : 'Inventory'}</h3>
          <span className="text-xs text-gray-500">{totalSlots}/20</span>
        </div>

        {/* Consumable Tooltip */}
        {selectedConsumable && CONSUMABLE_TOOLTIPS[selectedConsumable] && (
          <div className="mb-3 p-3 bg-black/30 rounded-lg border border-cyan-500/20">
            <p className="text-xs text-cyan-300 mb-2">
              {lang === 'ru' ? CONSUMABLE_TOOLTIPS[selectedConsumable].ru : CONSUMABLE_TOOLTIPS[selectedConsumable].en}
            </p>
            {selectedConsumable.startsWith('scroll') && (
              <button
                onClick={() => {
                  const buffId = selectedConsumable.replace('scroll', '').toLowerCase();
                  getSocket().emit('buff:use', { buffId });
                  setSelectedConsumable(null);
                }}
                className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-xs text-white font-bold active:scale-[0.98] transition-all"
              >
                {lang === 'ru' ? '⚡ Использовать' : '⚡ Use'}
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-5 gap-2">
          {/* Consumable slots */}
          {consumableSlots.map((cons) => (
            <button
              key={cons.id}
              onClick={() => setSelectedConsumable(selectedConsumable === cons.dbField ? null : cons.dbField)}
              className={`aspect-square bg-black/30 rounded-lg border ${selectedConsumable === cons.dbField ? 'border-cyan-500' : 'border-gray-600/50'}
                flex items-center justify-center relative hover:brightness-110 active:scale-95 transition-all`}
            >
              <span className="text-xl">{cons.icon}</span>
              <span className={`absolute top-0.5 right-1 text-[10px] font-bold ${cons.color}`}>
                {cons.count > 999 ? `${Math.floor(cons.count / 1000)}k` : cons.count}
              </span>
            </button>
          ))}

          {/* Equipment items */}
          {heroState.inventory.map((item) => {
            const style = RARITY_STYLES[item.rarity];
            const isBroken = item.isBroken;
            const enchantLevel = item.enchantLevel || 0;
            return (
              <button
                key={item.id}
                onClick={() => setSelectedItem({ item, isEquipped: false })}
                className={`aspect-square bg-black/30 rounded-lg border ${style.border} ${style.glow}
                  flex items-center justify-center hover:brightness-125 active:scale-95 transition-all relative
                  ${isBroken ? 'opacity-50 grayscale' : ''}`}
              >
                <span className="text-xl">{item.icon}</span>
                {/* Enchant level badge */}
                {enchantLevel > 0 && !isBroken && (
                  <span className="absolute -top-1 -right-1 bg-amber-500 text-black text-[8px] font-bold px-1 rounded">
                    +{enchantLevel}
                  </span>
                )}
                {/* Broken overlay */}
                {isBroken && (
                  <div className="absolute inset-0 flex items-center justify-center bg-red-900/60 rounded-lg">
                    <span className="text-red-400 text-sm">💔</span>
                  </div>
                )}
              </button>
            );
          })}

          {/* Empty slots */}
          {Array.from({ length: Math.max(0, 10 - totalSlots) }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="aspect-square bg-black/30 rounded-lg border border-gray-700/30 flex items-center justify-center"
            >
              <span className="text-gray-700 text-sm">•</span>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* MODALS */}
      {/* ═══════════════════════════════════════════════════════════ */}

      {/* Item Tooltip Modal */}
      {selectedItem && (
        <ItemTooltip
          item={selectedItem.item}
          isEquipped={selectedItem.isEquipped}
          slotHasItem={selectedItem.isEquipped ? false : !!heroState.equipment[selectedItem.item.slotType]}
          onEquip={() => handleEquip(selectedItem.item.id)}
          onUnequip={() => selectedItem.slotType && handleUnequip(selectedItem.slotType)}
          onClose={() => setSelectedItem(null)}
          lang={lang}
        />
      )}

      {/* Stats Popup */}
      {showStatsPopup && (
        <StatsPopup
          stats={stats}
          derived={derived}
          equipBonus={equipBonus}
          heroState={heroState}
          onClose={() => setShowStatsPopup(false)}
          lang={lang}
        />
      )}

      {/* Skills Popup */}
      {showSkillsPopup && (
        <SkillsPopup
          level={stats.level}
          skillLevels={{
            fireball: stats.skillFireball ?? 1,
            iceball: stats.skillIceball ?? 0,
            lightning: stats.skillLightning ?? 0,
          }}
          skillMastery={{
            fireball: stats.skillFireballMastery ?? 0,
            iceball: stats.skillIceballMastery ?? 0,
            lightning: stats.skillLightningMastery ?? 0,
          }}
          skillCasts={{
            fireball: stats.skillFireballCasts ?? 0,
            iceball: stats.skillIceballCasts ?? 0,
            lightning: stats.skillLightningCasts ?? 0,
          }}
          skillTiers={{
            fireball: stats.skillFireballTiers ?? 0,
            iceball: stats.skillIceballTiers ?? 0,
            lightning: stats.skillLightningTiers ?? 0,
          }}
          passiveRanks={{
            arcanePower: stats.passiveArcanePower ?? 0,
            critFocus: stats.passiveCritFocus ?? 0,
            critPower: stats.passiveCritPower ?? 0,
            staminaTraining: stats.passiveStaminaTraining ?? 0,
            manaFlow: stats.passiveManaFlow ?? 0,
            etherEfficiency: stats.passiveEtherEfficiency ?? 0,
          }}
          gold={stats.gold}
          sp={stats.sp ?? 0}
          onClose={() => setShowSkillsPopup(false)}
          onUpgrade={(skillId) => {
            getSocket().emit('skill:upgrade', { skillId });
          }}
          onTierActivate={(skillId, tier) => {
            getSocket().emit('skill:tier-activate', { skillId, tier });
          }}
          onPassiveUpgrade={(passiveId) => {
            getSocket().emit('skill:passive-upgrade', { passiveId });
          }}
          lang={lang}
        />
      )}
    </div>
  );
}
