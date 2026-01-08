'use client';

import { useEffect, useState, useCallback } from 'react';
import { getSocket } from '@/lib/socket';
import { X, Sword, Shield, Crown, Shirt, Hand, Footprints, Gem, CircleDot } from 'lucide-react';
import { detectLanguage, useTranslation, Language } from '@/lib/i18n';

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
}

// ═══════════════════════════════════════════════════════════
// SET DEFINITIONS
// ═══════════════════════════════════════════════════════════

interface SetBonus {
  pieces: number;
  bonusPct?: { pAtk?: number; pDef?: number };
  description: { ru: string; en: string };
}

interface SetDefinition {
  id: string;
  nameRu: string;
  nameEn: string;
  totalPieces: number;
  bonuses: SetBonus[];
}

const SETS: Record<string, SetDefinition> = {
  novice: {
    id: 'novice',
    nameRu: 'Сет новичка',
    nameEn: 'Novice Set',
    totalPieces: 7,
    bonuses: [
      { pieces: 3, bonusPct: { pAtk: 0.03 }, description: { ru: '+3% физ. атака', en: '+3% P.Atk' } },
      { pieces: 6, bonusPct: { pAtk: 0.05, pDef: 0.05 }, description: { ru: '+5% физ. атака, +5% физ. защита', en: '+5% P.Atk, +5% P.Def' } },
    ],
  },
};

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
  scrollHaste: { ru: 'Свиток скорости — +30% скорость атаки на 30 сек', en: 'Haste Scroll — +30% attack speed for 30s' },
  scrollAcumen: { ru: 'Свиток силы магии — +50% урона на 30 сек', en: 'Acumen Scroll — +50% damage for 30s' },
  scrollLuck: { ru: 'Свиток удачи — +10% шанс крита на 60 сек', en: 'Luck Scroll — +10% crit chance for 60s' },
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
    descRu: 'Наносит 150% урона от физ. атаки',
    descEn: 'Deals 150% of P.Atk damage',
    icon: '🔥',
    gradient: 'from-orange-700/70 to-red-900/90',
    glow: 'shadow-[0_0_12px_rgba(249,115,22,0.4)]',
    manaCost: 30,
    cooldown: 5000,
    unlockLevel: 1,
  },
  {
    id: 'iceball',
    nameRu: 'Ледяная стрела',
    nameEn: 'Ice Arrow',
    descRu: 'Наносит 120% урона, замедляет',
    descEn: 'Deals 120% damage, slows',
    icon: '❄️',
    gradient: 'from-cyan-700/70 to-blue-900/90',
    glow: 'shadow-[0_0_12px_rgba(34,211,238,0.4)]',
    manaCost: 25,
    cooldown: 4000,
    unlockLevel: 3,
  },
  {
    id: 'lightning',
    nameRu: 'Молния',
    nameEn: 'Lightning',
    descRu: 'Наносит 200% урона, шанс крита +20%',
    descEn: 'Deals 200% damage, +20% crit',
    icon: '⚡',
    gradient: 'from-yellow-600/70 to-amber-900/90',
    glow: 'shadow-[0_0_12px_rgba(250,204,21,0.4)]',
    manaCost: 50,
    cooldown: 8000,
    unlockLevel: 5,
  },
];

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
  ether?: number;
  scrollHaste?: number;
  scrollAcumen?: number;
  scrollLuck?: number;
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
        className={`${sizeClasses} bg-gradient-to-b from-gray-800/60 to-gray-900/90 rounded-lg
          border-2 border-gray-700/50 flex items-center justify-center
          hover:border-gray-500/70 hover:from-gray-700/60 active:scale-95 transition-all
          shadow-inner`}
      >
        {SLOT_ICONS[slotType]}
      </button>
    );
  }

  const style = RARITY_STYLES[item.rarity];

  return (
    <button
      onClick={onClick}
      className={`${sizeClasses} bg-gradient-to-b ${style.bg} rounded-lg border-2 ${style.border} ${style.glow}
        flex items-center justify-center hover:brightness-125 active:scale-95 transition-all relative overflow-hidden`}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-transparent to-white/10 pointer-events-none" />
      <span className={`${iconSize} relative z-10 drop-shadow-lg`}>{item.icon}</span>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// ITEM TOOLTIP - Premium Modal
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`bg-gradient-to-b from-gray-800 to-gray-950 rounded-2xl w-full max-w-xs border-2 ${style.border} ${style.glow} overflow-hidden`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`bg-gradient-to-r ${style.bg} p-4 border-b border-white/10 relative`}>
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
          <div className="flex items-center gap-3 relative z-10">
            <div className={`w-14 h-14 bg-black/50 rounded-xl flex items-center justify-center border-2 ${style.border}`}>
              <span className="text-3xl drop-shadow-lg">{item.icon}</span>
            </div>
            <div className="flex-1">
              <div className={`font-bold text-lg ${style.text} drop-shadow-md`}>{item.name}</div>
              <div className="text-xs text-gray-300 capitalize mt-0.5">{item.rarity}</div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-all">
              <X size={22} />
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="p-4 space-y-2">
          {(item.stats.pAtkFlat ?? 0) > 0 && (
            <div className="flex justify-between items-center bg-gradient-to-r from-red-900/30 to-transparent rounded-lg px-3 py-2 border border-red-500/20">
              <span className="text-gray-300 text-sm flex items-center gap-2">
                <span className="text-base">⚔️</span> П. Атака
              </span>
              <span className="text-red-400 font-bold text-lg">+{item.stats.pAtkFlat}</span>
            </div>
          )}
          {(item.stats.pDefFlat ?? 0) > 0 && (
            <div className="flex justify-between items-center bg-gradient-to-r from-blue-900/30 to-transparent rounded-lg px-3 py-2 border border-blue-500/20">
              <span className="text-gray-300 text-sm flex items-center gap-2">
                <span className="text-base">🛡️</span> П. Защита
              </span>
              <span className="text-blue-400 font-bold text-lg">+{item.stats.pDefFlat}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 pt-0">
          {isEquipped ? (
            <button
              onClick={onUnequip}
              className="w-full py-3 bg-gradient-to-r from-red-700/80 to-red-900/90 text-white rounded-xl font-bold
                border-2 border-red-500/50 hover:from-red-600/80 active:scale-[0.98] transition-all
                shadow-lg shadow-red-900/30"
            >
              {lang === 'ru' ? 'Снять' : 'Unequip'}
            </button>
          ) : (
            <button
              onClick={onEquip}
              className="w-full py-3 bg-gradient-to-r from-amber-600/80 to-amber-800/90 text-white rounded-xl font-bold
                border-2 border-amber-500/50 hover:from-amber-500/80 active:scale-[0.98] transition-all
                shadow-lg shadow-amber-900/30"
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
// STATS POPUP - Premium Modal
// ═══════════════════════════════════════════════════════════

interface StatsPopupProps {
  stats: PlayerStats;
  derived: HeroState['derivedStats'];
  equipBonus: { pAtk: number; pDef: number; mAtk: number; mDef: number };
  onClose: () => void;
  lang: Language;
}

function StatsPopup({ stats, derived, equipBonus, onClose, lang }: StatsPopupProps) {
  const [selectedStat, setSelectedStat] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-gradient-to-b from-gray-800 to-gray-950 rounded-2xl w-full max-w-sm border-2 border-amber-500/50 shadow-[0_0_20px_rgba(251,191,36,0.2)] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-900/60 to-amber-800/40 p-4 border-b border-amber-500/30">
          <div className="flex items-center justify-between">
            <span className="font-bold text-amber-400 flex items-center gap-2 text-lg">
              <span>📊</span> {lang === 'ru' ? 'Статистика' : 'Statistics'}
            </span>
            <button onClick={onClose} className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-all">
              <X size={22} />
            </button>
          </div>
        </div>

        <div className="p-4">
          {/* Combat Stats Grid */}
          <div className="text-[10px] text-gray-400 mb-2 uppercase tracking-wider flex items-center gap-1">
            <span>⚔️</span> {lang === 'ru' ? 'Боевые характеристики' : 'Combat Stats'}
          </div>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { label: lang === 'ru' ? 'АТК' : 'ATK', value: derived.pAtk, bonus: equipBonus.pAtk, icon: '⚔️', color: 'from-red-900/50 to-red-950/70', border: 'border-red-500/30', text: 'text-red-400' },
              { label: lang === 'ru' ? 'ЗАЩ' : 'DEF', value: derived.pDef, bonus: equipBonus.pDef, icon: '🛡️', color: 'from-blue-900/50 to-blue-950/70', border: 'border-blue-500/30', text: 'text-blue-400' },
              { label: lang === 'ru' ? 'КРИТ' : 'CRIT', value: `${(derived.critChance * 100).toFixed(0)}%`, icon: '💥', color: 'from-yellow-900/50 to-yellow-950/70', border: 'border-yellow-500/30', text: 'text-yellow-400' },
              { label: lang === 'ru' ? 'М.АТК' : 'M.ATK', value: derived.mAtk, bonus: equipBonus.mAtk, icon: '✨', color: 'from-purple-900/50 to-purple-950/70', border: 'border-purple-500/30', text: 'text-purple-400' },
              { label: lang === 'ru' ? 'М.ЗАЩ' : 'M.DEF', value: derived.mDef, bonus: equipBonus.mDef, icon: '🔮', color: 'from-cyan-900/50 to-cyan-950/70', border: 'border-cyan-500/30', text: 'text-cyan-400' },
              { label: lang === 'ru' ? 'СКР' : 'SPD', value: derived.attackSpeed, icon: '⚡', color: 'from-green-900/50 to-green-950/70', border: 'border-green-500/30', text: 'text-green-400' },
            ].map((stat, idx) => (
              <div key={idx} className={`bg-gradient-to-b ${stat.color} rounded-xl p-2.5 text-center border ${stat.border} shadow-md`}>
                <div className="text-[10px] text-gray-400 mb-0.5 flex items-center justify-center gap-1">
                  <span>{stat.icon}</span> {stat.label}
                </div>
                <div className={`text-lg font-bold ${stat.text} drop-shadow-md`}>
                  {stat.value}
                  {stat.bonus && stat.bonus > 0 && (
                    <span className="text-[10px] text-green-400 ml-1">(+{stat.bonus})</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Base Attributes */}
          <div className="text-[10px] text-gray-400 mb-2 uppercase tracking-wider flex items-center gap-1">
            <span>💪</span> {lang === 'ru' ? 'Атрибуты (тап = инфо)' : 'Attributes (tap = info)'}
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {[
              { key: 'power', icon: '💪', color: 'text-red-400', bg: 'from-red-900/40', border: 'border-red-500/30', label: lang === 'ru' ? 'СИЛ' : 'STR' },
              { key: 'agility', icon: '🏃', color: 'text-green-400', bg: 'from-green-900/40', border: 'border-green-500/30', label: lang === 'ru' ? 'ЛОВ' : 'AGI' },
              { key: 'vitality', icon: '❤️', color: 'text-pink-400', bg: 'from-pink-900/40', border: 'border-pink-500/30', label: lang === 'ru' ? 'СТОЙ' : 'VIT' },
              { key: 'intellect', icon: '🧠', color: 'text-blue-400', bg: 'from-blue-900/40', border: 'border-blue-500/30', label: lang === 'ru' ? 'ИНТ' : 'INT' },
              { key: 'spirit', icon: '✨', color: 'text-purple-400', bg: 'from-purple-900/40', border: 'border-purple-500/30', label: lang === 'ru' ? 'ДУХ' : 'SPI' },
            ].map(attr => (
              <button
                key={attr.key}
                onClick={() => setSelectedStat(selectedStat === attr.key ? null : attr.key)}
                className={`bg-gradient-to-b ${attr.bg} to-gray-900/60 rounded-lg p-2 text-center transition-all border ${
                  selectedStat === attr.key ? 'ring-2 ring-amber-400 border-amber-500/50' : attr.border
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
            <div className="mt-3 bg-gradient-to-r from-amber-900/30 to-amber-950/40 border border-amber-500/30 rounded-xl p-3">
              <div className="text-[11px] text-amber-300 leading-relaxed">
                {lang === 'ru' ? STAT_TOOLTIPS[selectedStat].ru : STAT_TOOLTIPS[selectedStat].en}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SKILLS POPUP - Premium Modal
// ═══════════════════════════════════════════════════════════

interface SkillsPopupProps {
  level: number;
  onClose: () => void;
  lang: Language;
}

function SkillsPopup({ level, onClose, lang }: SkillsPopupProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-gradient-to-b from-gray-800 to-gray-950 rounded-2xl w-full max-w-sm border-2 border-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.2)] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-900/60 to-purple-800/40 p-4 border-b border-purple-500/30">
          <div className="flex items-center justify-between">
            <span className="font-bold text-purple-400 flex items-center gap-2 text-lg">
              <span>⚡</span> {lang === 'ru' ? 'Навыки' : 'Skills'}
            </span>
            <button onClick={onClose} className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-all">
              <X size={22} />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {SKILLS_DATA.map((skill) => {
            const isLocked = level < skill.unlockLevel;

            return (
              <div
                key={skill.id}
                className={`bg-gradient-to-r ${isLocked ? 'from-gray-800/40 to-gray-900/60 opacity-60' : `${skill.gradient}`}
                  rounded-xl p-3 border ${isLocked ? 'border-gray-700/40' : 'border-white/10'} ${!isLocked ? skill.glow : ''} shadow-lg overflow-hidden relative`}
              >
                {!isLocked && <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />}
                <div className="flex items-center gap-3 relative z-10">
                  <div className={`w-14 h-14 rounded-xl bg-black/40 flex items-center justify-center border-2 ${isLocked ? 'border-gray-600/50' : 'border-white/20'}`}>
                    <span className="text-3xl drop-shadow-lg">{skill.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`font-bold ${isLocked ? 'text-gray-400' : 'text-white'} drop-shadow-md`}>
                        {lang === 'ru' ? skill.nameRu : skill.nameEn}
                      </span>
                      {isLocked && (
                        <span className="text-[9px] text-red-400 bg-red-900/50 px-1.5 py-0.5 rounded-md border border-red-500/30">
                          Lv.{skill.unlockLevel}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-300 mb-1.5 drop-shadow-sm">
                      {lang === 'ru' ? skill.descRu : skill.descEn}
                    </div>
                    <div className="flex items-center gap-3 text-[10px]">
                      <span className="text-blue-300 flex items-center gap-1 bg-blue-900/30 px-1.5 py-0.5 rounded">
                        💧 {skill.manaCost}
                      </span>
                      <span className="text-yellow-300 flex items-center gap-1 bg-yellow-900/30 px-1.5 py-0.5 rounded">
                        ⏱️ {skill.cooldown / 1000}s
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
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
  const [consumables, setConsumables] = useState({ ether: 0, scrollHaste: 0, scrollAcumen: 0, scrollLuck: 0 });
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
        scrollHaste: data.scrollHaste || 0,
        scrollAcumen: data.scrollAcumen || 0,
        scrollLuck: data.scrollLuck || 0,
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

    const handleBuffSuccess = (data: { buffId: string; duration: number; stats: any }) => {
      if (data.stats) {
        setConsumables(prev => ({
          ether: data.stats.ether ?? prev.ether,
          scrollHaste: data.stats.scrollHaste ?? prev.scrollHaste,
          scrollAcumen: data.stats.scrollAcumen ?? prev.scrollAcumen,
          scrollLuck: data.stats.scrollLuck ?? prev.scrollLuck,
        }));
      }
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

    // Sync consumables when task rewards are claimed
    const handlePlayerState = (data: { ether?: number; potionHaste?: number; potionAcumen?: number; potionLuck?: number }) => {
      setConsumables(prev => ({
        ether: data.ether ?? prev.ether,
        scrollHaste: data.potionHaste ?? prev.scrollHaste,
        scrollAcumen: data.potionAcumen ?? prev.scrollAcumen,
        scrollLuck: data.potionLuck ?? prev.scrollLuck,
      }));
    };

    socket.on('player:data', handlePlayerData);
    socket.on('auth:success', handlePlayerData);
    socket.on('equipment:data', handleEquipmentData);
    socket.on('buff:success', handleBuffSuccess);
    socket.on('tap:result', handleTapResult);
    socket.on('ether:craft:success', handleEtherCraft);
    socket.on('player:state', handlePlayerState);

    return () => {
      // IMPORTANT: Pass handler reference to only remove THIS component's listeners
      socket.off('player:data', handlePlayerData);
      socket.off('auth:success', handlePlayerData);
      socket.off('equipment:data', handleEquipmentData);
      socket.off('buff:success', handleBuffSuccess);
      socket.off('tap:result', handleTapResult);
      socket.off('ether:craft:success', handleEtherCraft);
      socket.off('player:state', handlePlayerState);
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
      <div className="flex-1 flex items-center justify-center bg-gradient-to-b from-[#0d1117] to-[#161b22]">
        <div className="text-center">
          <div className="text-5xl mb-4 animate-bounce">⚔️</div>
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
  if (consumables.ether > 0) {
    consumableSlots.push({ id: 'ether', dbField: 'ether', icon: '💎', count: consumables.ether, color: 'text-cyan-400' });
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
    <div className="flex-1 overflow-auto bg-gradient-to-b from-[#0d1117] to-[#161b22]">
      {/* ═══════════════════════════════════════════════════════════ */}
      {/* COMPACT HEADER - Premium Style */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="bg-gradient-to-b from-black/90 to-black/60 p-3 border-b border-gray-700/50">
        <div className="flex items-center gap-3">
          {/* Level Badge */}
          <div className="relative">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-600/80 to-amber-800/90 flex items-center justify-center border-2 border-amber-500/60 shadow-lg shadow-amber-900/30">
              <span className="text-lg font-bold text-white drop-shadow-md">{stats.level}</span>
            </div>
          </div>

          {/* Name + EXP */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-bold text-white truncate drop-shadow-md">
                {stats.firstName || stats.username || 'Hero'}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-amber-400 font-bold flex items-center gap-1">
                  <span>🪙</span> {formatCompact(stats.gold || 0)}
                </span>
                <span className="text-sm text-purple-400 font-bold flex items-center gap-1">
                  <Gem size={14} /> {stats.ancientCoin || 0}
                </span>
              </div>
            </div>
            {/* EXP Bar */}
            <div className="h-3 bg-gray-900/90 rounded-md overflow-hidden relative border border-purple-500/30 shadow-inner">
              <div
                className="h-full bg-gradient-to-r from-purple-600 via-purple-500 to-purple-400 transition-all duration-300"
                style={{ width: `${expPercent}%` }}
              />
              <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
              <span className="absolute inset-0 flex items-center justify-center text-[9px] text-white font-bold drop-shadow-lg">
                {stats.exp}/{stats.expToNext} ({expPercent.toFixed(0)}%)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* EQUIPMENT PAPERDOLL - Premium Card */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="p-3">
        <div className="bg-gradient-to-b from-gray-800/50 to-gray-900/70 rounded-2xl p-4 border border-gray-700/40 shadow-xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🛡️</span>
              <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">
                {lang === 'ru' ? 'Снаряжение' : 'Equipment'}
              </span>
            </div>
            <div className="text-[10px] text-gray-500">
              {Object.values(heroState.equipment).filter(Boolean).length}/10
            </div>
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
              <div key={setId} className="mt-3 pt-3 border-t border-gray-700/50">
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-xs font-bold ${activeBonuses.length > 0 ? 'text-amber-400' : 'text-gray-400'}`}>
                    {lang === 'ru' ? set.nameRu : set.nameEn}
                  </span>
                  <span className={`text-xs font-bold ${activeBonuses.length > 0 ? 'text-amber-400' : 'text-gray-500'}`}>
                    {count}/{set.totalPieces}
                  </span>
                </div>
                {activeBonuses.map((bonus, idx) => (
                  <div key={idx} className="text-[10px] text-green-400 bg-green-500/15 rounded-lg px-2 py-1 mb-1 border border-green-500/20">
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
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* STATS & SKILLS BUTTONS - Premium Style */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="px-3 mb-3 flex gap-2">
        <button
          onClick={() => setShowStatsPopup(true)}
          className="flex-1 py-3 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-900/50 to-amber-800/40
            text-amber-400 border border-amber-500/40 hover:from-amber-800/60 hover:border-amber-500/60
            active:scale-[0.98] transition-all shadow-lg shadow-amber-900/20 flex items-center justify-center gap-2"
        >
          <span>📊</span> {lang === 'ru' ? 'Статы' : 'Stats'}
        </button>
        <button
          onClick={() => setShowSkillsPopup(true)}
          className="flex-1 py-3 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-purple-900/50 to-purple-800/40
            text-purple-400 border border-purple-500/40 hover:from-purple-800/60 hover:border-purple-500/60
            active:scale-[0.98] transition-all shadow-lg shadow-purple-900/20 flex items-center justify-center gap-2"
        >
          <span>⚡</span> {lang === 'ru' ? 'Скиллы' : 'Skills'}
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* INVENTORY - Premium Grid with Consumables */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="px-3 pb-4">
        <div className="bg-gradient-to-b from-gray-800/50 to-gray-900/70 rounded-2xl p-4 border border-gray-700/40 shadow-xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🎒</span>
              <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">
                {lang === 'ru' ? 'Инвентарь' : 'Inventory'}
              </span>
            </div>
            <div className="text-[10px] text-gray-500 bg-gray-800/50 px-2 py-0.5 rounded-md">
              {totalSlots}/20
            </div>
          </div>

          {/* Consumable Tooltip */}
          {selectedConsumable && CONSUMABLE_TOOLTIPS[selectedConsumable] && (
            <div className="mb-3 bg-gradient-to-r from-cyan-900/30 to-cyan-950/40 border border-cyan-500/30 rounded-xl p-3">
              <div className="text-[11px] text-cyan-300 mb-2">
                {lang === 'ru' ? CONSUMABLE_TOOLTIPS[selectedConsumable].ru : CONSUMABLE_TOOLTIPS[selectedConsumable].en}
              </div>
              {selectedConsumable.startsWith('scroll') && (
                <button
                  onClick={() => {
                    const buffId = selectedConsumable.replace('scroll', '').toLowerCase();
                    getSocket().emit('buff:use', { buffId });
                    setSelectedConsumable(null);
                  }}
                  className="w-full py-2 bg-gradient-to-r from-cyan-600/50 to-cyan-700/60 hover:from-cyan-500/60
                    border border-cyan-500/50 rounded-lg text-xs text-white font-bold active:scale-[0.98] transition-all"
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
                className={`aspect-square bg-gradient-to-b from-gray-700/50 to-gray-900/70 rounded-xl
                  border-2 ${selectedConsumable === cons.dbField ? 'border-cyan-500 ring-2 ring-cyan-500/50' : 'border-gray-600/50'}
                  flex items-center justify-center relative hover:brightness-110 active:scale-95 transition-all shadow-lg`}
              >
                <span className="text-xl drop-shadow-lg">{cons.icon}</span>
                <span className={`absolute top-0.5 right-1 text-[10px] font-bold ${cons.color} drop-shadow-md`}>
                  {cons.count > 999 ? `${Math.floor(cons.count / 1000)}k` : cons.count}
                </span>
              </button>
            ))}

            {/* Equipment items */}
            {heroState.inventory.map((item) => {
              const style = RARITY_STYLES[item.rarity];
              return (
                <button
                  key={item.id}
                  onClick={() => setSelectedItem({ item, isEquipped: false })}
                  className={`aspect-square bg-gradient-to-b ${style.bg} rounded-xl border-2 ${style.border} ${style.glow}
                    flex items-center justify-center hover:brightness-125 active:scale-95 transition-all relative overflow-hidden`}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                  <div className="absolute inset-0 bg-gradient-to-t from-transparent to-white/10 pointer-events-none" />
                  <span className="text-xl relative z-10 drop-shadow-lg">{item.icon}</span>
                </button>
              );
            })}

            {/* Empty slots */}
            {Array.from({ length: Math.max(0, 10 - totalSlots) }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="aspect-square bg-gradient-to-b from-gray-800/40 to-gray-900/60 rounded-xl border border-gray-700/30
                  flex items-center justify-center shadow-inner"
              >
                <span className="text-gray-700 text-sm">•</span>
              </div>
            ))}
          </div>
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
          onClose={() => setShowStatsPopup(false)}
          lang={lang}
        />
      )}

      {/* Skills Popup */}
      {showSkillsPopup && (
        <SkillsPopup
          level={stats.level}
          onClose={() => setShowSkillsPopup(false)}
          lang={lang}
        />
      )}
    </div>
  );
}
