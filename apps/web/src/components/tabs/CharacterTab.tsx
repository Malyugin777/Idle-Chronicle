'use client';

import { useEffect, useState, useCallback } from 'react';
import { getSocket } from '@/lib/socket';
import { X, Sword, Shield, Crown, Shirt, Hand, Footprints, Gem, CircleDot, ChevronDown, ChevronUp } from 'lucide-react';
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
// STAT TOOLTIPS - описания что даёт каждый стат
// ═══════════════════════════════════════════════════════════

const STAT_TOOLTIPS: Record<string, { ru: string; en: string }> = {
  power: { ru: 'Сила — увеличивает физ. урон (+8% за единицу)', en: 'Power — increases P.Atk (+8% per point)' },
  vitality: { ru: 'Выносливость — увеличивает макс. стамину (+80 за единицу)', en: 'Vitality — increases max stamina (+80 per point)' },
  agility: { ru: 'Ловкость — увеличивает скорость атаки', en: 'Agility — increases attack speed' },
  intellect: { ru: 'Интеллект — увеличивает маг. урон', en: 'Intellect — increases M.Atk' },
  spirit: { ru: 'Дух — увеличивает макс. ману (+10 за единицу)', en: 'Spirit — increases max mana (+10 per point)' },
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
  color: string;
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
    color: 'from-orange-700/70 to-red-900/90',
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
    color: 'from-cyan-700/70 to-blue-900/90',
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
    color: 'from-yellow-600/70 to-amber-900/90',
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
  weapon: <Sword size={16} className="text-gray-600" />,
  shield: <Shield size={16} className="text-gray-600" />,
  helmet: <Crown size={16} className="text-gray-600" />,
  armor: <Shirt size={16} className="text-gray-600" />,
  gloves: <Hand size={16} className="text-gray-600" />,
  legs: <span className="text-sm text-gray-600">👖</span>,
  boots: <Footprints size={16} className="text-gray-600" />,
  ring1: <CircleDot size={14} className="text-gray-600" />,
  ring2: <CircleDot size={14} className="text-gray-600" />,
  necklace: <Gem size={14} className="text-gray-600" />,
};

const RARITY_STYLES: Record<Rarity, { border: string; glow: string; text: string; bg: string }> = {
  common: {
    border: 'border-gray-500/60',
    glow: '',
    text: 'text-gray-300',
    bg: 'from-gray-800/80 to-gray-900/80',
  },
  uncommon: {
    border: 'border-green-500/70',
    glow: 'shadow-[0_0_10px_rgba(34,197,94,0.4)]',
    text: 'text-green-400',
    bg: 'from-green-900/40 to-green-950/60',
  },
  rare: {
    border: 'border-blue-500/70',
    glow: 'shadow-[0_0_12px_rgba(59,130,246,0.5)]',
    text: 'text-blue-400',
    bg: 'from-blue-900/40 to-blue-950/60',
  },
  epic: {
    border: 'border-purple-500/70',
    glow: 'shadow-[0_0_14px_rgba(168,85,247,0.5)]',
    text: 'text-purple-400',
    bg: 'from-purple-900/40 to-purple-950/60',
  },
  legendary: {
    border: 'border-orange-500/80',
    glow: 'shadow-[0_0_16px_rgba(249,115,22,0.6)] animate-pulse',
    text: 'text-orange-400',
    bg: 'from-orange-900/40 to-orange-950/60',
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

// ═══════════════════════════════════════════════════════════
// SLOT COMPONENT
// ═══════════════════════════════════════════════════════════

interface SlotProps {
  slotType: SlotType;
  item: Item | null;
  size?: 'normal' | 'small';
  onClick?: () => void;
}

function Slot({ slotType, item, size = 'normal', onClick }: SlotProps) {
  const sizeClasses = size === 'normal' ? 'w-11 h-11' : 'w-9 h-9';
  const iconSize = size === 'normal' ? 'text-xl' : 'text-lg';

  if (!item) {
    return (
      <button
        onClick={onClick}
        className={`${sizeClasses} bg-gradient-to-b from-gray-800/60 to-gray-900/80 rounded-lg
          border border-gray-700/50 flex items-center justify-center
          hover:border-gray-600/70 active:scale-95 transition-all`}
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
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
      <span className={`${iconSize} relative z-10 drop-shadow-lg`}>{item.icon}</span>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={onClose}>
      <div
        className={`bg-gradient-to-b from-gray-800 to-gray-900 rounded-2xl w-full max-w-xs border-2 ${style.border} ${style.glow}`}
        onClick={e => e.stopPropagation()}
      >
        <div className={`bg-gradient-to-r ${style.bg} rounded-t-xl p-4 border-b border-white/10`}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-black/40 rounded-xl flex items-center justify-center border border-white/20">
              <span className="text-2xl drop-shadow-lg">{item.icon}</span>
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

        <div className="p-3 space-y-1.5">
          {(item.stats.pAtkFlat ?? 0) > 0 && (
            <div className="flex justify-between items-center bg-black/30 rounded px-2 py-1.5">
              <span className="text-gray-400 text-sm">⚔️ П. Атака</span>
              <span className="text-red-400 font-bold">+{item.stats.pAtkFlat}</span>
            </div>
          )}
          {(item.stats.pDefFlat ?? 0) > 0 && (
            <div className="flex justify-between items-center bg-black/30 rounded px-2 py-1.5">
              <span className="text-gray-400 text-sm">🛡️ П. Защита</span>
              <span className="text-blue-400 font-bold">+{item.stats.pDefFlat}</span>
            </div>
          )}
        </div>

        <div className="p-3 pt-0">
          {isEquipped ? (
            <button
              onClick={onUnequip}
              className="w-full py-2.5 bg-gradient-to-r from-red-600/80 to-red-700/80 text-white rounded-xl font-bold
                border border-red-500/50 hover:from-red-500/80 active:scale-95 transition-all"
            >
              {lang === 'ru' ? 'Снять' : 'Unequip'}
            </button>
          ) : (
            <button
              onClick={onEquip}
              className="w-full py-2.5 bg-gradient-to-r from-amber-600/80 to-amber-700/80 text-white rounded-xl font-bold
                border border-amber-500/50 hover:from-amber-500/80 active:scale-95 transition-all"
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

  // Accordion states
  const [statsExpanded, setStatsExpanded] = useState(false);
  const [skillsExpanded, setSkillsExpanded] = useState(false);

  // Selected stat for tooltip
  const [selectedStat, setSelectedStat] = useState<string | null>(null);

  const [lang] = useState<Language>(() => detectLanguage());
  const t = useTranslation(lang);

  // Load data
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

    socket.on('player:data', handlePlayerData);
    socket.on('auth:success', handlePlayerData);
    socket.on('equipment:data', handleEquipmentData);

    return () => {
      socket.off('player:data');
      socket.off('auth:success');
      socket.off('equipment:data');
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
      <div className="flex-1 flex items-center justify-center bg-gradient-to-b from-[#1a1f28] to-[#0a0d12]">
        <div className="text-center">
          <div className="text-4xl mb-3 animate-bounce">⚔️</div>
          <p className="text-gray-400">{t.game.loading}</p>
        </div>
      </div>
    );
  }

  const stats = heroState.baseStats;
  const derived = heroState.derivedStats;
  const expPercent = Math.min(100, (stats.exp / stats.expToNext) * 100);
  const setCounts = countSetPieces(heroState.equipment);

  return (
    <div className="flex-1 overflow-auto bg-gradient-to-b from-[#1a1f28] to-[#0a0d12]">
      {/* ═══════════════════════════════════════════════════════════ */}
      {/* HERO HEADER */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="bg-gradient-to-b from-black/90 via-black/70 to-transparent px-3 pt-2 pb-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            {stats.photoUrl ? (
              <img src={stats.photoUrl} alt="" className="w-12 h-12 rounded-xl border-2 border-amber-500/70 shadow-lg" />
            ) : (
              <div className="w-12 h-12 rounded-xl border-2 border-amber-500/70 bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center shadow-lg">
                <span className="text-xl">👤</span>
              </div>
            )}
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-gradient-to-br from-amber-500 to-amber-700 rounded flex items-center justify-center border-2 border-gray-900">
              <span className="text-[9px] font-bold text-black">{stats.level}</span>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-white mb-1 truncate">{stats.firstName || stats.username || 'Герой'}</div>
            <div className="relative h-2 bg-gray-900/80 rounded-full overflow-hidden border border-purple-500/30">
              <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-purple-600 to-purple-400 rounded-full" style={{ width: `${expPercent}%` }} />
              <span className="absolute inset-0 flex items-center justify-center text-[7px] text-white/80 font-medium">{expPercent.toFixed(0)}%</span>
            </div>
          </div>

          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1 bg-black/50 rounded px-1.5 py-0.5 border border-yellow-900/30">
              <span className="text-[10px]">🪙</span>
              <span className="text-[9px] text-l2-gold font-bold">{(stats.gold || 0).toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1 bg-black/50 rounded px-1.5 py-0.5 border border-purple-900/30">
              <span className="text-[10px]">💎</span>
              <span className="text-[9px] text-purple-400 font-bold">{stats.ancientCoin || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* EQUIPMENT PAPERDOLL */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="px-3 mb-2">
        <div className="bg-gradient-to-b from-gray-800/40 to-gray-900/60 rounded-xl p-3 border border-gray-700/30">
          <div className="text-[9px] text-gray-500 mb-2 uppercase tracking-wider">
            {lang === 'ru' ? 'Снаряжение' : 'Equipment'}
          </div>

          <div className="flex flex-col items-center gap-1.5">
            <Slot slotType="helmet" item={heroState.equipment.helmet || null} onClick={() => handleEquippedSlotClick('helmet')} />
            <div className="flex items-center gap-2">
              <Slot slotType="weapon" item={heroState.equipment.weapon || null} onClick={() => handleEquippedSlotClick('weapon')} />
              <Slot slotType="armor" item={heroState.equipment.armor || null} onClick={() => handleEquippedSlotClick('armor')} />
              <Slot slotType="shield" item={heroState.equipment.shield || null} onClick={() => handleEquippedSlotClick('shield')} />
            </div>
            <div className="flex items-center gap-2">
              <Slot slotType="gloves" item={heroState.equipment.gloves || null} onClick={() => handleEquippedSlotClick('gloves')} />
              <Slot slotType="legs" item={heroState.equipment.legs || null} onClick={() => handleEquippedSlotClick('legs')} />
              <Slot slotType="boots" item={heroState.equipment.boots || null} onClick={() => handleEquippedSlotClick('boots')} />
            </div>
            <div className="flex items-center gap-2">
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
              <div key={setId} className="mt-2 pt-2 border-t border-gray-700/50">
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[10px] font-bold ${activeBonuses.length > 0 ? 'text-l2-gold' : 'text-gray-400'}`}>
                    {lang === 'ru' ? set.nameRu : set.nameEn}
                  </span>
                  <span className={`text-[10px] ${activeBonuses.length > 0 ? 'text-l2-gold' : 'text-gray-500'}`}>
                    {count}/{set.totalPieces}
                  </span>
                </div>
                {activeBonuses.map((bonus, idx) => (
                  <div key={idx} className="text-[9px] text-green-400 bg-green-500/10 rounded px-1.5 py-0.5 mb-0.5">
                    ✓ {bonus.pieces} шт: {lang === 'ru' ? bonus.description.ru : bonus.description.en}
                  </div>
                ))}
                {nextBonus && (
                  <div className="text-[9px] text-gray-500">
                    ○ {nextBonus.pieces} шт: {lang === 'ru' ? nextBonus.description.ru : nextBonus.description.en}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ACCORDION: STATS */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="px-3 mb-2">
        <button
          onClick={() => { setStatsExpanded(!statsExpanded); setSelectedStat(null); }}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all ${
            statsExpanded
              ? 'bg-gradient-to-r from-amber-600/30 to-amber-800/30 border border-amber-500/50'
              : 'bg-black/30 border border-gray-700/30 hover:bg-black/40'
          }`}
        >
          <span className={`font-bold text-sm ${statsExpanded ? 'text-amber-400' : 'text-gray-400'}`}>
            📊 {lang === 'ru' ? 'Статы' : 'Stats'}
          </span>
          {statsExpanded ? (
            <ChevronUp size={18} className="text-amber-400" />
          ) : (
            <ChevronDown size={18} className="text-gray-500" />
          )}
        </button>

        {statsExpanded && (
          <div className="mt-2 bg-gradient-to-b from-gray-800/40 to-gray-900/60 rounded-xl p-3 border border-gray-700/30">
            {/* Combat Stats */}
            <div className="text-[9px] text-gray-500 mb-1.5 uppercase tracking-wider">
              {lang === 'ru' ? 'Боевые характеристики' : 'Combat Stats'}
            </div>
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              <div className="bg-black/40 rounded-lg p-2 text-center">
                <div className="text-[8px] text-gray-500">⚔️ АТК</div>
                <div className="text-sm font-bold text-red-400">{derived.pAtk}</div>
              </div>
              <div className="bg-black/40 rounded-lg p-2 text-center">
                <div className="text-[8px] text-gray-500">🛡️ ЗАЩ</div>
                <div className="text-sm font-bold text-blue-400">{derived.pDef}</div>
              </div>
              <div className="bg-black/40 rounded-lg p-2 text-center">
                <div className="text-[8px] text-gray-500">💥 КРИТ</div>
                <div className="text-sm font-bold text-yellow-400">{(derived.critChance * 100).toFixed(0)}%</div>
              </div>
              <div className="bg-black/40 rounded-lg p-2 text-center">
                <div className="text-[8px] text-gray-500">✨ М.АТК</div>
                <div className="text-sm font-bold text-purple-400">{derived.mAtk}</div>
              </div>
              <div className="bg-black/40 rounded-lg p-2 text-center">
                <div className="text-[8px] text-gray-500">🔮 М.ЗАЩ</div>
                <div className="text-sm font-bold text-cyan-400">{derived.mDef}</div>
              </div>
              <div className="bg-black/40 rounded-lg p-2 text-center">
                <div className="text-[8px] text-gray-500">⚡ СКР</div>
                <div className="text-sm font-bold text-green-400">{derived.attackSpeed}</div>
              </div>
            </div>

            {/* Base Stats - clickable */}
            <div className="text-[9px] text-gray-500 mb-1.5 uppercase tracking-wider">
              {lang === 'ru' ? 'Базовые атрибуты (нажми для описания)' : 'Base Attributes (tap for info)'}
            </div>
            <div className="grid grid-cols-5 gap-1">
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
                  className={`bg-black/40 rounded-lg p-1.5 text-center transition-all ${
                    selectedStat === attr.key ? 'ring-2 ring-l2-gold' : ''
                  }`}
                >
                  <div className="text-sm mb-0.5">{attr.icon}</div>
                  <div className={`text-xs font-bold ${attr.color}`}>{(stats as any)[attr.key] || 10}</div>
                  <div className="text-[7px] text-gray-500">{attr.label}</div>
                </button>
              ))}
            </div>

            {/* Stat Tooltip */}
            {selectedStat && STAT_TOOLTIPS[selectedStat] && (
              <div className="mt-2 bg-l2-gold/10 border border-l2-gold/30 rounded-lg p-2 text-[10px] text-l2-gold">
                {lang === 'ru' ? STAT_TOOLTIPS[selectedStat].ru : STAT_TOOLTIPS[selectedStat].en}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ACCORDION: SKILLS */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="px-3 mb-2">
        <button
          onClick={() => setSkillsExpanded(!skillsExpanded)}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all ${
            skillsExpanded
              ? 'bg-gradient-to-r from-purple-600/30 to-purple-800/30 border border-purple-500/50'
              : 'bg-black/30 border border-gray-700/30 hover:bg-black/40'
          }`}
        >
          <span className={`font-bold text-sm ${skillsExpanded ? 'text-purple-400' : 'text-gray-400'}`}>
            ⚡ {lang === 'ru' ? 'Скиллы' : 'Skills'}
          </span>
          {skillsExpanded ? (
            <ChevronUp size={18} className="text-purple-400" />
          ) : (
            <ChevronDown size={18} className="text-gray-500" />
          )}
        </button>

        {skillsExpanded && (
          <div className="mt-2 space-y-1.5">
            {SKILLS_DATA.map((skill) => {
              const isLocked = stats.level < skill.unlockLevel;

              return (
                <div
                  key={skill.id}
                  className={`bg-gradient-to-b ${isLocked ? 'from-gray-800/30 to-gray-900/50 opacity-60' : 'from-gray-800/50 to-gray-900/70'} rounded-xl p-2.5 border border-gray-700/30`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`w-11 h-11 rounded-xl bg-gradient-to-b ${skill.color} border ${isLocked ? 'border-gray-600/50' : 'border-amber-500/50'} flex items-center justify-center shadow-lg`}>
                      <span className="text-2xl drop-shadow-lg">{skill.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`font-bold text-sm ${isLocked ? 'text-gray-500' : 'text-white'}`}>
                          {lang === 'ru' ? skill.nameRu : skill.nameEn}
                        </span>
                        {isLocked && (
                          <span className="text-[9px] text-red-400 bg-red-900/30 px-1 py-0.5 rounded">🔒 Lv.{skill.unlockLevel}</span>
                        )}
                      </div>
                      <div className="text-[10px] text-gray-400 mb-1">{lang === 'ru' ? skill.descRu : skill.descEn}</div>
                      <div className="flex items-center gap-2 text-[9px]">
                        <span className="text-blue-400">💧 {skill.manaCost}</span>
                        <span className="text-yellow-400">⏱️ {skill.cooldown / 1000}s</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* INVENTORY */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="px-3 pb-3">
        <div className="bg-gradient-to-b from-gray-800/40 to-gray-900/60 rounded-xl p-3 border border-gray-700/30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] text-gray-500 uppercase tracking-wider">
              {lang === 'ru' ? 'Инвентарь' : 'Inventory'}
            </span>
            <span className="text-[9px] text-gray-500">{heroState.inventory.length}/20</span>
          </div>

          <div className="grid grid-cols-6 gap-1.5">
            {heroState.inventory.map((item) => {
              const style = RARITY_STYLES[item.rarity];
              return (
                <button
                  key={item.id}
                  onClick={() => setSelectedItem({ item, isEquipped: false })}
                  className={`aspect-square bg-gradient-to-b ${style.bg} rounded-lg border ${style.border} ${style.glow}
                    flex items-center justify-center hover:brightness-125 active:scale-95 transition-all relative overflow-hidden`}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                  <span className="text-base relative z-10 drop-shadow-lg">{item.icon}</span>
                </button>
              );
            })}
            {Array.from({ length: Math.max(0, 12 - heroState.inventory.length) }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="aspect-square bg-gradient-to-b from-gray-800/30 to-gray-900/50 rounded-lg border border-gray-700/20 flex items-center justify-center"
              >
                <span className="text-gray-700 text-xs">•</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Item Tooltip */}
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
    </div>
  );
}
