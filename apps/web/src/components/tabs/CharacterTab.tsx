'use client';

import { useEffect, useState, useCallback } from 'react';
import { getSocket } from '@/lib/socket';
import { X, Sword, Shield, Crown, Shirt, Hand, Footprints, Gem, CircleDot } from 'lucide-react';
import { detectLanguage, useTranslation, Language } from '@/lib/i18n';
import TasksModal from '../game/TasksModal';

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
  setId?: string | null;  // ID сета (например "novice")
}

// ═══════════════════════════════════════════════════════════
// SET DEFINITIONS (локальная копия из shared/data/sets.ts)
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

// Описания базовых статов
const STAT_TOOLTIPS: Record<string, { ru: string; en: string }> = {
  power: { ru: 'Сила — увеличивает физ. урон (+8% за единицу)', en: 'Power — increases P.Atk (+8% per point)' },
  vitality: { ru: 'Выносливость — увеличивает макс. стамину (+80 за единицу)', en: 'Vitality — increases max stamina (+80 per point)' },
  agility: { ru: 'Ловкость — увеличивает скорость атаки', en: 'Agility — increases attack speed' },
  intellect: { ru: 'Интеллект — увеличивает маг. урон', en: 'Intellect — increases M.Atk' },
  spirit: { ru: 'Дух — увеличивает макс. ману (+10 за единицу)', en: 'Spirit — increases max mana (+10 per point)' },
};

// Описания consumables
const CONSUMABLE_TOOLTIPS: Record<string, { ru: string; en: string }> = {
  soulshotNG: { ru: 'Заряд души (NG) — x2 урона на 1 тап', en: 'Soulshot (NG) — x2 damage per tap' },
  soulshotD: { ru: 'Заряд души (D) — x2.2 урона на 1 тап', en: 'Soulshot (D) — x2.2 damage per tap' },
  soulshotC: { ru: 'Заряд души (C) — x3.5 урона на 1 тап', en: 'Soulshot (C) — x3.5 damage per tap' },
  potionHaste: { ru: 'Свиток скорости — +30% скорость атаки на 30 сек', en: 'Haste Scroll — +30% attack speed for 30s' },
  potionAcumen: { ru: 'Свиток силы магии — +50% урона на 30 сек', en: 'Acumen Scroll — +50% damage for 30s' },
  potionLuck: { ru: 'Свиток удачи — +10% шанс крита на 60 сек', en: 'Luck Scroll — +10% crit chance for 60s' },
};

interface PlayerStats {
  id: string;
  username: string | null;
  firstName: string | null;
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
  // Consumables
  soulshotNG?: number;
  soulshotD?: number;
  soulshotC?: number;
  potionHaste?: number;
  potionAcumen?: number;
  potionLuck?: number;
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
  weapon: <Sword size={16} className="opacity-30" />,
  shield: <Shield size={16} className="opacity-30" />,
  helmet: <Crown size={16} className="opacity-30" />,
  armor: <Shirt size={16} className="opacity-30" />,
  gloves: <Hand size={16} className="opacity-30" />,
  legs: <span className="text-sm opacity-30">👖</span>,
  boots: <Footprints size={16} className="opacity-30" />,
  ring1: <CircleDot size={14} className="opacity-30" />,
  ring2: <CircleDot size={14} className="opacity-30" />,
  necklace: <Gem size={14} className="opacity-30" />,
};

const RARITY_STYLES: Record<Rarity, { border: string; glow: string; text: string }> = {
  common: {
    border: 'border-gray-500/50',
    glow: '',
    text: 'text-gray-400',
  },
  uncommon: {
    border: 'border-green-500/70',
    glow: 'shadow-[0_0_8px_rgba(34,197,94,0.4)]',
    text: 'text-green-400',
  },
  rare: {
    border: 'border-blue-500/70',
    glow: 'shadow-[0_0_10px_rgba(59,130,246,0.5)]',
    text: 'text-blue-400',
  },
  epic: {
    border: 'border-purple-500/70',
    glow: 'shadow-[0_0_12px_rgba(168,85,247,0.5)]',
    text: 'text-purple-400',
  },
  legendary: {
    border: 'border-orange-500/70',
    glow: 'shadow-[0_0_14px_rgba(249,115,22,0.6)] animate-pulse',
    text: 'text-orange-400',
  },
};

// Map server slot names to client slot types
const SLOT_MAP: Record<string, SlotType> = {
  weapon: 'weapon',
  shield: 'shield',
  helmet: 'helmet',
  chest: 'armor',
  armor: 'armor',
  gloves: 'gloves',
  legs: 'legs',
  boots: 'boots',
  ring: 'ring1',
  ring1: 'ring1',
  ring2: 'ring2',
  necklace: 'necklace',
};

// ═══════════════════════════════════════════════════════════
// SET BONUS HELPERS
// ═══════════════════════════════════════════════════════════

function countSetPieces(equipment: Partial<Record<SlotType, Item | null>>): Record<string, number> {
  const counts: Record<string, number> = {};
  Object.values(equipment).forEach(item => {
    if (item?.setId) {
      counts[item.setId] = (counts[item.setId] || 0) + 1;
    }
  });
  return counts;
}

function getActiveSetBonuses(setId: string, count: number): SetBonus[] {
  const set = SETS[setId];
  if (!set) return [];
  return set.bonuses.filter(b => count >= b.pieces);
}

// ═══════════════════════════════════════════════════════════
// STAT SYSTEM (local recalculation with set bonuses)
// ═══════════════════════════════════════════════════════════

// Вычисляет бонусы от экипировки (для показа дельты)
function calculateEquipmentBonuses(heroState: HeroState): { pAtk: number; pDef: number; mAtk: number; mDef: number } {
  let pAtk = 0;
  let pDef = 0;
  let mAtk = 0;
  let mDef = 0;

  // Flat bonuses from equipment
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
  if (!base) {
    return { pAtk: 10, pDef: 0, mAtk: 10, mDef: 0, critChance: 0.05, attackSpeed: 300 };
  }

  // Start with base stats (голый персонаж)
  let pAtk = base.pAtk;  // 10 база
  let pDef = base.pDef;  // 0 голый
  let mAtk = base.mAtk;
  let mDef = base.mDef;
  let critChance = base.critChance;
  let attackSpeed = base.attackSpeed;

  // Add equipment flat bonuses
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

  // Apply set bonuses (percentage bonuses applied AFTER flat bonuses)
  const setCounts = countSetPieces(heroState.equipment);
  for (const [setId, count] of Object.entries(setCounts)) {
    const activeBonuses = getActiveSetBonuses(setId, count);
    for (const bonus of activeBonuses) {
      if (bonus.bonusPct) {
        if (bonus.bonusPct.pAtk) pAtk = Math.floor(pAtk * (1 + bonus.bonusPct.pAtk));
        if (bonus.bonusPct.pDef) pDef = Math.floor(pDef * (1 + bonus.bonusPct.pDef));
      }
    }
  }

  return { pAtk, pDef, mAtk, mDef, critChance, attackSpeed };
}

// ═══════════════════════════════════════════════════════════
// EQUIPMENT HELPERS
// ═══════════════════════════════════════════════════════════

function equipItem(heroState: HeroState, itemId: string): HeroState {
  const item = heroState.inventory.find(i => i.id === itemId);
  if (!item) return heroState;

  const currentEquipped = heroState.equipment[item.slotType];
  const newInventory = heroState.inventory.filter(i => i.id !== itemId);

  // If slot has item, move it to inventory
  if (currentEquipped) {
    newInventory.push(currentEquipped);
  }

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
    // Empty slot with placeholder
    return (
      <button
        onClick={onClick}
        className={`${sizeClasses} bg-black/40 rounded-lg border border-white/10 flex items-center justify-center
          hover:bg-black/30 hover:border-white/20 active:scale-95 transition-all`}
      >
        {SLOT_ICONS[slotType]}
      </button>
    );
  }

  const style = RARITY_STYLES[item.rarity];

  return (
    <button
      onClick={onClick}
      className={`${sizeClasses} bg-black/60 rounded-lg border-2 ${style.border} ${style.glow}
        flex items-center justify-center hover:brightness-110 active:scale-95 transition-all`}
    >
      <span className={iconSize}>{item.icon}</span>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// ITEM TOOLTIP COMPONENT
// ═══════════════════════════════════════════════════════════

interface ItemTooltipProps {
  item: Item;
  isEquipped: boolean;
  slotHasItem: boolean;
  onEquip: () => void;
  onUnequip: () => void;
  onClose: () => void;
  t: any;
}

function ItemTooltip({ item, isEquipped, slotHasItem, onEquip, onUnequip, onClose, t }: ItemTooltipProps) {
  const style = RARITY_STYLES[item.rarity];
  const rarityLabel = t.character[item.rarity] || item.rarity;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div
        className={`bg-l2-panel rounded-lg w-full max-w-xs border-2 ${style.border} ${style.glow}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{item.icon}</span>
            <div>
              <div className={`font-bold ${style.text}`}>{item.name}</div>
              <div className="text-[10px] text-gray-400">{rarityLabel}</div>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* Stats */}
        <div className="p-3 space-y-1">
          {(item.stats.pAtkFlat ?? 0) > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">П атака</span>
              <span className="text-red-400 font-bold">+{item.stats.pAtkFlat}</span>
            </div>
          )}
          {(item.stats.pDefFlat ?? 0) > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">П защита</span>
              <span className="text-blue-400 font-bold">+{item.stats.pDefFlat}</span>
            </div>
          )}
          {(item.stats.mAtkFlat ?? 0) > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">М атака</span>
              <span className="text-purple-400 font-bold">+{item.stats.mAtkFlat}</span>
            </div>
          )}
          {(item.stats.mDefFlat ?? 0) > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">М защита</span>
              <span className="text-cyan-400 font-bold">+{item.stats.mDefFlat}</span>
            </div>
          )}
          {(item.stats.critFlat ?? 0) > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Крит</span>
              <span className="text-yellow-400 font-bold">+{((item.stats.critFlat ?? 0) * 100).toFixed(0)}%</span>
            </div>
          )}
          {(item.stats.atkSpdFlat ?? 0) > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Скор. атаки</span>
              <span className="text-green-400 font-bold">+{item.stats.atkSpdFlat}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-3 pt-0 flex gap-2">
          {isEquipped ? (
            <button
              onClick={onUnequip}
              className="flex-1 py-2 bg-red-500/20 text-red-400 rounded font-bold text-sm hover:bg-red-500/30"
            >
              {t.character.unequip}
            </button>
          ) : (
            <button
              onClick={onEquip}
              className="flex-1 py-2 bg-l2-gold/20 text-l2-gold rounded font-bold text-sm hover:bg-l2-gold/30"
            >
              {slotHasItem ? t.character.replace : t.character.equip}
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 bg-black/30 text-gray-400 rounded font-bold text-sm hover:bg-black/40"
          >
            {t.character.close}
          </button>
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
    inventory: [], // Load from server
    baseStats: null,
    derivedStats: { pAtk: 10, pDef: 40, mAtk: 10, mDef: 30, critChance: 0.05, attackSpeed: 300 },
  });
  const [isLoading, setIsLoading] = useState(true);
  const [showStatsPopup, setShowStatsPopup] = useState(false);
  const [showSkillsPopup, setShowSkillsPopup] = useState(false);
  const [showTasks, setShowTasks] = useState(false);
  const [selectedItem, setSelectedItem] = useState<{ item: Item; isEquipped: boolean; slotType?: SlotType } | null>(null);
  const [selectedStat, setSelectedStat] = useState<string | null>(null); // Подсказка по стату
  const [selectedConsumable, setSelectedConsumable] = useState<string | null>(null); // Описание consumable
  const [consumables, setConsumables] = useState<{
    soulshotNG: number;
    soulshotD: number;
    soulshotC: number;
    potionHaste: number;
    potionAcumen: number;
    potionLuck: number;
  }>({ soulshotNG: 0, soulshotD: 0, soulshotC: 0, potionHaste: 0, potionAcumen: 0, potionLuck: 0 });
  const [lang] = useState<Language>(() => detectLanguage());
  const t = useTranslation(lang);

  // Skills
  const skills = [
    { id: 'fireball', icon: '🔥', level: 1 },
    { id: 'iceball', icon: '❄️', level: 1 },
    { id: 'lightning', icon: '⚡', level: 1 },
  ];

  // Load player data and equipment
  useEffect(() => {
    const socket = getSocket();
    socket.emit('player:get');
    socket.emit('equipment:get');

    const handlePlayerData = (data: PlayerStats) => {
      const baseStats = {
        ...data,
        exp: data.exp || 0,
        expToNext: data.expToNext || 1000,
        power: data.power || 10,
        vitality: data.vitality || 10,
        agility: data.agility || 10,
        intellect: data.intellect || 10,
        spirit: data.spirit || 10,
        pDef: data.pDef || 40,
        mAtk: data.mAtk || 10,
        mDef: data.mDef || 30,
        attackSpeed: data.attackSpeed || 300,
      };

      setHeroState(prev => {
        const newState = { ...prev, baseStats };
        newState.derivedStats = recalculateDerivedStats(newState);
        return newState;
      });

      // Update consumables from player data
      setConsumables({
        soulshotNG: data.soulshotNG || 0,
        soulshotD: data.soulshotD || 0,
        soulshotC: data.soulshotC || 0,
        potionHaste: data.potionHaste || 0,
        potionAcumen: data.potionAcumen || 0,
        potionLuck: data.potionLuck || 0,
      });

      setIsLoading(false);
    };

    // Handle equipment data from server
    const handleEquipmentData = (data: { equipped: any[]; inventory: any[] }) => {
      console.log('[Equipment] Received:', data);

      const serverToItem = (item: any): Item => ({
        id: item.id,
        name: item.name || item.nameRu || 'Unknown',
        slotType: SLOT_MAP[item.slot] || 'weapon',
        rarity: (item.rarity || 'common') as Rarity,
        icon: item.icon || '📦',
        stats: {
          pAtkFlat: item.pAtk || 0,
          pDefFlat: item.pDef || 0,
        },
        setId: item.setId || null,  // Set ID for set bonuses
      });

      const newEquipment: Partial<Record<SlotType, Item | null>> = {};
      const newInventory: Item[] = [];

      // Process equipped items
      for (const item of data.equipped) {
        const clientItem = serverToItem(item);
        newEquipment[clientItem.slotType] = clientItem;
      }

      // Process inventory items
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

    // Buff usage feedback
    const handleBuffSuccess = (data: { buffId: string; expiresAt: number; [key: string]: any }) => {
      console.log('[Buff] Used:', data.buffId);
      // Update consumables count
      const potionKey = `potion${data.buffId.charAt(0).toUpperCase() + data.buffId.slice(1)}` as keyof typeof data;
      if (data[potionKey] !== undefined) {
        setConsumables(prev => ({
          ...prev,
          [potionKey]: data[potionKey] as number,
        }));
      }
    };

    const handleBuffError = (data: { message: string }) => {
      console.error('[Buff] Error:', data.message);
    };

    socket.on('buff:success', handleBuffSuccess);
    socket.on('buff:error', handleBuffError);

    return () => {
      socket.off('player:data');
      socket.off('auth:success');
      socket.off('equipment:data');
      socket.off('buff:success');
      socket.off('buff:error');
    };
  }, []);

  // Equip handler - update local state AND save to server
  const handleEquip = useCallback((itemId: string) => {
    setHeroState(prev => equipItem(prev, itemId));
    setSelectedItem(null);
    // Save to server
    getSocket().emit('equipment:equip', { itemId });
  }, []);

  // Unequip handler - update local state AND save to server
  const handleUnequip = useCallback((slotType: SlotType) => {
    const item = heroState.equipment[slotType];
    if (!item) return;
    setHeroState(prev => unequipItem(prev, slotType));
    setSelectedItem(null);
    // Save to server
    getSocket().emit('equipment:unequip', { itemId: item.id });
  }, [heroState.equipment]);

  // Click on equipped slot
  const handleEquippedSlotClick = useCallback((slotType: SlotType) => {
    const item = heroState.equipment[slotType];
    if (item) {
      setSelectedItem({ item, isEquipped: true, slotType });
    }
  }, [heroState.equipment]);

  if (isLoading || !heroState.baseStats) {
    return (
      <div className="flex-1 flex items-center justify-center bg-l2-dark">
        <div className="text-center">
          <div className="text-2xl mb-2 animate-pulse">⚔️</div>
          <p className="text-gray-400">{t.game.loading}</p>
        </div>
      </div>
    );
  }

  const stats = heroState.baseStats;
  const derived = heroState.derivedStats;
  const equipBonus = calculateEquipmentBonuses(heroState); // Дельта от экипировки
  const expPercent = Math.min(100, (stats.exp / stats.expToNext) * 100);

  return (
    <div className="flex-1 overflow-auto bg-l2-dark">
      {/* Compact Header */}
      <div className="bg-l2-panel p-2 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-l2-gold/20 flex items-center justify-center">
            <span className="text-sm font-bold text-l2-gold">{stats.level}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-white truncate">
                {stats.firstName || stats.username || 'Hero'}
              </span>
              <span className="text-xs text-l2-gold ml-2">
                🪙 {stats.gold.toLocaleString()}
              </span>
            </div>
            <div className="mt-1 h-2 bg-black/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-600 to-purple-400 transition-all"
                style={{ width: `${expPercent}%` }}
              />
            </div>
            <div className="text-[10px] text-gray-500 text-right">
              {t.character.exp} {expPercent.toFixed(0)}%
            </div>
          </div>
        </div>
      </div>

      {/* Paperdoll Equipment Layout */}
      <div className="p-2">
        <div className="text-xs text-gray-400 mb-2">{t.character.equipment}</div>

        {/* Cross/Human layout */}
        <div className="bg-black/20 rounded-lg p-3">
          {/* Top row: Helmet */}
          <div className="flex justify-center mb-2">
            <Slot
              slotType="helmet"
              item={heroState.equipment.helmet || null}
              onClick={() => handleEquippedSlotClick('helmet')}
            />
          </div>

          {/* Middle row: Weapon - Armor - Shield */}
          <div className="flex justify-center items-center gap-2 mb-2">
            <Slot
              slotType="weapon"
              item={heroState.equipment.weapon || null}
              onClick={() => handleEquippedSlotClick('weapon')}
            />
            <Slot
              slotType="armor"
              item={heroState.equipment.armor || null}
              onClick={() => handleEquippedSlotClick('armor')}
            />
            <Slot
              slotType="shield"
              item={heroState.equipment.shield || null}
              onClick={() => handleEquippedSlotClick('shield')}
            />
          </div>

          {/* Lower row: Gloves - Legs - Boots */}
          <div className="flex justify-center gap-2 mb-2">
            <Slot
              slotType="gloves"
              item={heroState.equipment.gloves || null}
              onClick={() => handleEquippedSlotClick('gloves')}
            />
            <Slot
              slotType="legs"
              item={heroState.equipment.legs || null}
              onClick={() => handleEquippedSlotClick('legs')}
            />
            <Slot
              slotType="boots"
              item={heroState.equipment.boots || null}
              onClick={() => handleEquippedSlotClick('boots')}
            />
          </div>

          {/* Jewelry row: Ring1 - Necklace - Ring2 */}
          <div className="flex justify-center gap-2">
            <Slot
              slotType="ring1"
              item={heroState.equipment.ring1 || null}
              size="small"
              onClick={() => handleEquippedSlotClick('ring1')}
            />
            <Slot
              slotType="necklace"
              item={heroState.equipment.necklace || null}
              size="small"
              onClick={() => handleEquippedSlotClick('necklace')}
            />
            <Slot
              slotType="ring2"
              item={heroState.equipment.ring2 || null}
              size="small"
              onClick={() => handleEquippedSlotClick('ring2')}
            />
          </div>

          {/* Set Bonuses Display */}
          {(() => {
            const setCounts = countSetPieces(heroState.equipment);
            const setEntries = Object.entries(setCounts).filter(([_, count]) => count > 0);

            if (setEntries.length === 0) return null;

            return (
              <div className="mt-3 pt-3 border-t border-white/10">
                {setEntries.map(([setId, count]) => {
                  const set = SETS[setId];
                  if (!set) return null;

                  const setName = lang === 'ru' ? set.nameRu : set.nameEn;
                  const activeBonuses = getActiveSetBonuses(setId, count);
                  const nextBonus = set.bonuses.find(b => b.pieces > count);

                  return (
                    <div key={setId} className="mb-2 last:mb-0">
                      {/* Set header */}
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-bold ${activeBonuses.length > 0 ? 'text-l2-gold' : 'text-gray-400'}`}>
                          {setName}
                        </span>
                        <span className={`text-xs ${activeBonuses.length > 0 ? 'text-l2-gold' : 'text-gray-500'}`}>
                          {count}/{set.totalPieces}
                        </span>
                      </div>

                      {/* Active bonuses */}
                      {activeBonuses.map((bonus, idx) => (
                        <div key={idx} className="text-[10px] text-green-400 pl-2">
                          ✓ {bonus.pieces}/{set.totalPieces}: {lang === 'ru' ? bonus.description.ru : bonus.description.en}
                        </div>
                      ))}

                      {/* Next bonus hint */}
                      {nextBonus && (
                        <div className="text-[10px] text-gray-500 pl-2">
                          ○ {nextBonus.pieces}/{set.totalPieces}: {lang === 'ru' ? nextBonus.description.ru : nextBonus.description.en}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Stats, Skills & Tasks Buttons */}
      <div className="px-2 mb-2 flex gap-2">
        <button
          onClick={() => setShowStatsPopup(true)}
          className="flex-1 py-2 px-3 rounded-lg text-xs font-bold bg-black/30 text-gray-400 hover:text-white hover:bg-black/40 transition-all"
        >
          📊 {t.character.stats}
        </button>
        <button
          onClick={() => setShowSkillsPopup(true)}
          className="flex-1 py-2 px-3 rounded-lg text-xs font-bold bg-black/30 text-gray-400 hover:text-white hover:bg-black/40 transition-all"
        >
          ✨ {t.character.skills}
        </button>
        <button
          onClick={() => setShowTasks(true)}
          className="flex-1 py-2 px-3 rounded-lg text-xs font-bold bg-green-500/20 text-green-400 hover:text-green-300 hover:bg-green-500/30 transition-all"
        >
          🎯 {lang === 'ru' ? 'Задачи' : 'Tasks'}
        </button>
      </div>

      {/* Inventory */}
      <div className="px-2 pb-2">
        {(() => {
          // Build consumables array for inventory display
          const consumableSlots: { id: string; dbField: string; icon: string; count: number; color: string }[] = [];
          if (consumables.soulshotNG > 0) {
            consumableSlots.push({ id: 'ssNG', dbField: 'soulshotNG', icon: '💚', count: consumables.soulshotNG, color: 'text-green-400' });
          }
          if (consumables.soulshotD > 0) {
            consumableSlots.push({ id: 'ssD', dbField: 'soulshotD', icon: '💙', count: consumables.soulshotD, color: 'text-blue-400' });
          }
          if (consumables.soulshotC > 0) {
            consumableSlots.push({ id: 'ssC', dbField: 'soulshotC', icon: '💜', count: consumables.soulshotC, color: 'text-purple-400' });
          }
          if (consumables.potionHaste > 0) {
            consumableSlots.push({ id: 'potHaste', dbField: 'potionHaste', icon: '⚡', count: consumables.potionHaste, color: 'text-yellow-400' });
          }
          if (consumables.potionAcumen > 0) {
            consumableSlots.push({ id: 'potAcumen', dbField: 'potionAcumen', icon: '🔥', count: consumables.potionAcumen, color: 'text-orange-400' });
          }
          if (consumables.potionLuck > 0) {
            consumableSlots.push({ id: 'potLuck', dbField: 'potionLuck', icon: '🍀', count: consumables.potionLuck, color: 'text-green-400' });
          }

          const totalSlots = heroState.inventory.length + consumableSlots.length;

          return (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400">{t.character.inventory || 'Инвентарь'}</span>
                <span className="text-xs text-gray-500">{totalSlots}/20</span>
              </div>
              {/* Tooltip для выбранного consumable */}
              {selectedConsumable && CONSUMABLE_TOOLTIPS[selectedConsumable] && (
                <div className="mb-2 bg-purple-500/10 border border-purple-500/30 rounded p-2">
                  <div className="text-[10px] text-purple-300 mb-1">
                    {lang === 'ru' ? CONSUMABLE_TOOLTIPS[selectedConsumable].ru : CONSUMABLE_TOOLTIPS[selectedConsumable].en}
                  </div>
                  {/* Кнопка использования для баффов (не соулшотов) */}
                  {selectedConsumable.startsWith('potion') && (
                    <button
                      onClick={() => {
                        const buffId = selectedConsumable.replace('potion', '').toLowerCase(); // potionHaste → haste
                        getSocket().emit('buff:use', { buffId });
                        setSelectedConsumable(null);
                      }}
                      className="w-full mt-1 px-2 py-1 bg-purple-600/50 hover:bg-purple-600/70 border border-purple-500/50 rounded text-[10px] text-white font-medium active:scale-95 transition-all"
                    >
                      {lang === 'ru' ? '⚡ Использовать' : '⚡ Use'}
                    </button>
                  )}
                </div>
              )}
              <div className="grid grid-cols-5 gap-2">
                {/* Consumable slots (soulshots, potions) */}
                {consumableSlots.map((cons) => (
                  <button
                    key={cons.id}
                    onClick={() => setSelectedConsumable(selectedConsumable === cons.dbField ? null : cons.dbField)}
                    className={`aspect-square bg-black/40 rounded-lg border ${selectedConsumable === cons.dbField ? 'border-purple-500 ring-1 ring-purple-500' : 'border-white/20'} flex items-center justify-center relative hover:brightness-110 active:scale-95 transition-all`}
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
                  return (
                    <button
                      key={item.id}
                      onClick={() => setSelectedItem({ item, isEquipped: false })}
                      className={`aspect-square bg-black/40 rounded-lg border-2 ${style.border} ${style.glow}
                        flex items-center justify-center hover:brightness-110 active:scale-95 transition-all`}
                    >
                      <span className="text-xl">{item.icon}</span>
                    </button>
                  );
                })}
                {/* Empty slots */}
                {Array.from({ length: Math.max(0, 20 - totalSlots) }).map((_, i) => (
                  <div
                    key={`empty-${i}`}
                    className="aspect-square bg-black/20 rounded-lg border border-white/5 flex items-center justify-center"
                  >
                    <span className="text-[10px] text-gray-700">-</span>
                  </div>
                ))}
              </div>
            </>
          );
        })()}
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
          t={t}
        />
      )}

      {/* Stats Popup */}
      {showStatsPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setShowStatsPopup(false)}>
          <div
            className="bg-l2-panel rounded-lg w-full max-w-xs border border-white/20"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-3 border-b border-white/10">
              <span className="font-bold text-l2-gold">📊 {t.character.stats}</span>
              <button onClick={() => setShowStatsPopup(false)} className="text-gray-400 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="p-3">
              {/* Combat Stats */}
              <div className="text-[10px] text-gray-400 mb-1">{t.character.combatStats}</div>
              <div className="grid grid-cols-3 gap-1 mb-3">
                <div className="bg-black/30 rounded p-1.5 text-center">
                  <div className="text-[9px] text-gray-500">{t.character.pAtk}</div>
                  <div className="text-xs font-bold text-red-400">
                    {derived.pAtk}
                    {equipBonus.pAtk > 0 && <span className="text-[8px] text-green-400 ml-0.5">(+{equipBonus.pAtk})</span>}
                  </div>
                </div>
                <div className="bg-black/30 rounded p-1.5 text-center">
                  <div className="text-[9px] text-gray-500">{t.character.pDef}</div>
                  <div className="text-xs font-bold text-blue-400">
                    {derived.pDef}
                    {equipBonus.pDef > 0 && <span className="text-[8px] text-green-400 ml-0.5">(+{equipBonus.pDef})</span>}
                  </div>
                </div>
                <div className="bg-black/30 rounded p-1.5 text-center">
                  <div className="text-[9px] text-gray-500">{t.character.critChance}</div>
                  <div className="text-xs font-bold text-yellow-400">{(derived.critChance * 100).toFixed(0)}%</div>
                </div>
                <div className="bg-black/30 rounded p-1.5 text-center">
                  <div className="text-[9px] text-gray-500">{t.character.mAtk}</div>
                  <div className="text-xs font-bold text-purple-400">
                    {derived.mAtk}
                    {equipBonus.mAtk > 0 && <span className="text-[8px] text-green-400 ml-0.5">(+{equipBonus.mAtk})</span>}
                  </div>
                </div>
                <div className="bg-black/30 rounded p-1.5 text-center">
                  <div className="text-[9px] text-gray-500">{t.character.mDef}</div>
                  <div className="text-xs font-bold text-cyan-400">
                    {derived.mDef}
                    {equipBonus.mDef > 0 && <span className="text-[8px] text-green-400 ml-0.5">(+{equipBonus.mDef})</span>}
                  </div>
                </div>
                <div className="bg-black/30 rounded p-1.5 text-center">
                  <div className="text-[9px] text-gray-500">{t.character.atkSpd}</div>
                  <div className="text-xs font-bold text-green-400">{derived.attackSpeed}</div>
                </div>
              </div>

              {/* Base Stats */}
              <div className="text-[10px] text-gray-400 mb-1">{t.character.baseStats}</div>
              <div className="grid grid-cols-5 gap-1">
                <button onClick={() => setSelectedStat(selectedStat === 'power' ? null : 'power')} className={`bg-black/30 rounded p-1.5 text-center ${selectedStat === 'power' ? 'ring-1 ring-l2-gold' : ''}`}>
                  <div className="text-[8px] text-gray-500">{t.character.power}</div>
                  <div className="text-xs font-bold text-white">{stats.power}</div>
                </button>
                <button onClick={() => setSelectedStat(selectedStat === 'vitality' ? null : 'vitality')} className={`bg-black/30 rounded p-1.5 text-center ${selectedStat === 'vitality' ? 'ring-1 ring-l2-gold' : ''}`}>
                  <div className="text-[8px] text-gray-500">{t.character.vitality}</div>
                  <div className="text-xs font-bold text-white">{stats.vitality}</div>
                </button>
                <button onClick={() => setSelectedStat(selectedStat === 'agility' ? null : 'agility')} className={`bg-black/30 rounded p-1.5 text-center ${selectedStat === 'agility' ? 'ring-1 ring-l2-gold' : ''}`}>
                  <div className="text-[8px] text-gray-500">{t.character.agility}</div>
                  <div className="text-xs font-bold text-white">{stats.agility}</div>
                </button>
                <button onClick={() => setSelectedStat(selectedStat === 'intellect' ? null : 'intellect')} className={`bg-black/30 rounded p-1.5 text-center ${selectedStat === 'intellect' ? 'ring-1 ring-l2-gold' : ''}`}>
                  <div className="text-[8px] text-gray-500">{t.character.intellect}</div>
                  <div className="text-xs font-bold text-white">{stats.intellect}</div>
                </button>
                <button onClick={() => setSelectedStat(selectedStat === 'spirit' ? null : 'spirit')} className={`bg-black/30 rounded p-1.5 text-center ${selectedStat === 'spirit' ? 'ring-1 ring-l2-gold' : ''}`}>
                  <div className="text-[8px] text-gray-500">{t.character.spirit}</div>
                  <div className="text-xs font-bold text-white">{stats.spirit}</div>
                </button>
              </div>
              {/* Tooltip для выбранного стата */}
              {selectedStat && STAT_TOOLTIPS[selectedStat] && (
                <div className="mt-2 bg-l2-gold/10 border border-l2-gold/30 rounded p-2 text-[10px] text-l2-gold">
                  {lang === 'ru' ? STAT_TOOLTIPS[selectedStat].ru : STAT_TOOLTIPS[selectedStat].en}
                </div>
              )}
            </div>
            <div className="p-3 pt-0">
              <button
                onClick={() => setShowStatsPopup(false)}
                className="w-full py-2 bg-black/30 text-gray-400 rounded font-bold text-sm hover:bg-black/40"
              >
                {t.character.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Skills Popup */}
      {showSkillsPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setShowSkillsPopup(false)}>
          <div
            className="bg-l2-panel rounded-lg w-full max-w-xs border border-white/20"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-3 border-b border-white/10">
              <span className="font-bold text-l2-gold">✨ {t.character.skills}</span>
              <button onClick={() => setShowSkillsPopup(false)} className="text-gray-400 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="p-3 space-y-2">
              {skills.map((skill) => {
                const skillName = skill.id === 'fireball' ? t.character.skillFireball
                  : skill.id === 'iceball' ? t.character.skillIceball
                  : t.character.skillLightning;
                const skillDesc = skill.id === 'fireball' ? t.character.skillFireballDesc
                  : skill.id === 'iceball' ? t.character.skillIceballDesc
                  : t.character.skillLightningDesc;

                return (
                  <div key={skill.id} className="flex items-center gap-3 bg-black/30 rounded-lg p-2">
                    <div className="w-10 h-10 bg-black/50 rounded-lg flex items-center justify-center text-2xl">
                      {skill.icon}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-bold text-white">{skillName}</div>
                      <div className="text-[10px] text-gray-500">{skillDesc}</div>
                      <div className="text-[10px] text-l2-gold">Lv.{skill.level}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-3 pt-0">
              <button
                onClick={() => setShowSkillsPopup(false)}
                className="w-full py-2 bg-black/30 text-gray-400 rounded font-bold text-sm hover:bg-black/40"
              >
                {t.character.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tasks Modal */}
      <TasksModal isOpen={showTasks} onClose={() => setShowTasks(false)} />
    </div>
  );
}
