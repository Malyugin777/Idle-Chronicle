'use client';

import { useEffect, useState, useCallback } from 'react';
import { getSocket } from '@/lib/socket';
import { X, Sword, Shield, Crown, Shirt, Hand, Footprints, Gem, CircleDot } from 'lucide-react';
import { detectLanguage, useTranslation, Language } from '@/lib/i18n';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
type SlotType = 'weapon' | 'shield' | 'helmet' | 'armor' | 'gloves' | 'boots' | 'ring1' | 'ring2' | 'necklace';

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
}

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

// Starter items for new players - simple common items with +1 stats
const STARTER_ITEMS: Item[] = [
  { id: 'starter-sword', name: 'Wooden Sword', slotType: 'weapon', rarity: 'common', icon: '🗡️', stats: { pAtkFlat: 1 } },
  { id: 'starter-shield', name: 'Wooden Shield', slotType: 'shield', rarity: 'common', icon: '🛡️', stats: { pDefFlat: 1 } },
  { id: 'starter-helmet', name: 'Leather Cap', slotType: 'helmet', rarity: 'common', icon: '🪖', stats: { pDefFlat: 1 } },
  { id: 'starter-armor', name: 'Cloth Tunic', slotType: 'armor', rarity: 'common', icon: '👕', stats: { pDefFlat: 1 } },
  { id: 'starter-gloves', name: 'Cloth Gloves', slotType: 'gloves', rarity: 'common', icon: '🧤', stats: { atkSpdFlat: 1 } },
  { id: 'starter-boots', name: 'Leather Boots', slotType: 'boots', rarity: 'common', icon: '👢', stats: { pDefFlat: 1 } },
  { id: 'starter-ring1', name: 'Copper Ring', slotType: 'ring1', rarity: 'common', icon: '💍', stats: { critFlat: 0.01 } },
  { id: 'starter-ring2', name: 'Iron Ring', slotType: 'ring2', rarity: 'common', icon: '💍', stats: { pAtkFlat: 1 } },
  { id: 'starter-necklace', name: 'Bead Necklace', slotType: 'necklace', rarity: 'common', icon: '📿', stats: { mDefFlat: 1 } },
];

// ═══════════════════════════════════════════════════════════
// STAT SYSTEM (local recalculation)
// ═══════════════════════════════════════════════════════════

function recalculateDerivedStats(heroState: HeroState): HeroState['derivedStats'] {
  const base = heroState.baseStats;
  if (!base) {
    return { pAtk: 10, pDef: 40, mAtk: 10, mDef: 30, critChance: 0.05, attackSpeed: 300 };
  }

  let pAtk = base.pAtk;
  let pDef = base.pDef;
  let mAtk = base.mAtk;
  let mDef = base.mDef;
  let critChance = base.critChance;
  let attackSpeed = base.attackSpeed;

  // Add equipment bonuses
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
          {item.stats.pAtkFlat && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">P.Atk</span>
              <span className="text-red-400 font-bold">+{item.stats.pAtkFlat}</span>
            </div>
          )}
          {item.stats.pDefFlat && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">P.Def</span>
              <span className="text-blue-400 font-bold">+{item.stats.pDefFlat}</span>
            </div>
          )}
          {item.stats.mAtkFlat && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">M.Atk</span>
              <span className="text-purple-400 font-bold">+{item.stats.mAtkFlat}</span>
            </div>
          )}
          {item.stats.mDefFlat && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">M.Def</span>
              <span className="text-cyan-400 font-bold">+{item.stats.mDefFlat}</span>
            </div>
          )}
          {item.stats.critFlat && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Crit</span>
              <span className="text-yellow-400 font-bold">+{(item.stats.critFlat * 100).toFixed(0)}%</span>
            </div>
          )}
          {item.stats.atkSpdFlat && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Atk.Spd</span>
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
    inventory: [...STARTER_ITEMS], // Give all players starter items
    baseStats: null,
    derivedStats: { pAtk: 10, pDef: 40, mAtk: 10, mDef: 30, critChance: 0.05, attackSpeed: 300 },
  });
  const [showStatsPopup, setShowStatsPopup] = useState(false);
  const [showSkillsPopup, setShowSkillsPopup] = useState(false);
  const [selectedItem, setSelectedItem] = useState<{ item: Item; isEquipped: boolean; slotType?: SlotType } | null>(null);
  const [lang] = useState<Language>(() => detectLanguage());
  const t = useTranslation(lang);

  // Skills
  const skills = [
    { id: 'fireball', icon: '🔥', level: 1 },
    { id: 'iceball', icon: '❄️', level: 1 },
    { id: 'lightning', icon: '⚡', level: 1 },
  ];

  // Load player data
  useEffect(() => {
    const socket = getSocket();
    socket.emit('player:get');

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
    };

    socket.on('player:data', handlePlayerData);
    socket.on('auth:success', handlePlayerData);

    return () => {
      socket.off('player:data');
      socket.off('auth:success');
    };
  }, []);

  // Equip handler
  const handleEquip = useCallback((itemId: string) => {
    setHeroState(prev => equipItem(prev, itemId));
    setSelectedItem(null);
  }, []);

  // Unequip handler
  const handleUnequip = useCallback((slotType: SlotType) => {
    setHeroState(prev => unequipItem(prev, slotType));
    setSelectedItem(null);
  }, []);

  // Click on equipped slot
  const handleEquippedSlotClick = useCallback((slotType: SlotType) => {
    const item = heroState.equipment[slotType];
    if (item) {
      setSelectedItem({ item, isEquipped: true, slotType });
    }
  }, [heroState.equipment]);

  if (!heroState.baseStats) {
    return (
      <div className="flex-1 flex items-center justify-center bg-l2-dark">
        <div className="text-center">
          <p className="text-gray-400 mb-2">{t.character.notAuth}</p>
          <p className="text-xs text-gray-500">{t.character.playInTelegram}</p>
        </div>
      </div>
    );
  }

  const stats = heroState.baseStats;
  const derived = heroState.derivedStats;
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

          {/* Lower row: Gloves - Boots */}
          <div className="flex justify-center gap-2 mb-2">
            <Slot
              slotType="gloves"
              item={heroState.equipment.gloves || null}
              onClick={() => handleEquippedSlotClick('gloves')}
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
        </div>
      </div>

      {/* Stats & Skills Buttons */}
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
      </div>

      {/* Inventory */}
      <div className="px-2 pb-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400">{t.character.inventory || 'Инвентарь'}</span>
          <span className="text-xs text-gray-500">{heroState.inventory.length}/20</span>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {/* Filled slots */}
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
          {Array.from({ length: Math.max(0, 20 - heroState.inventory.length) }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="aspect-square bg-black/20 rounded-lg border border-white/5 flex items-center justify-center"
            >
              <span className="text-[10px] text-gray-700">-</span>
            </div>
          ))}
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
                  <div className="text-xs font-bold text-red-400">{derived.pAtk}</div>
                </div>
                <div className="bg-black/30 rounded p-1.5 text-center">
                  <div className="text-[9px] text-gray-500">{t.character.pDef}</div>
                  <div className="text-xs font-bold text-blue-400">{derived.pDef}</div>
                </div>
                <div className="bg-black/30 rounded p-1.5 text-center">
                  <div className="text-[9px] text-gray-500">{t.character.critChance}</div>
                  <div className="text-xs font-bold text-yellow-400">{(derived.critChance * 100).toFixed(0)}%</div>
                </div>
                <div className="bg-black/30 rounded p-1.5 text-center">
                  <div className="text-[9px] text-gray-500">{t.character.mAtk}</div>
                  <div className="text-xs font-bold text-purple-400">{derived.mAtk}</div>
                </div>
                <div className="bg-black/30 rounded p-1.5 text-center">
                  <div className="text-[9px] text-gray-500">{t.character.mDef}</div>
                  <div className="text-xs font-bold text-cyan-400">{derived.mDef}</div>
                </div>
                <div className="bg-black/30 rounded p-1.5 text-center">
                  <div className="text-[9px] text-gray-500">{t.character.atkSpd}</div>
                  <div className="text-xs font-bold text-green-400">{derived.attackSpeed}</div>
                </div>
              </div>

              {/* Base Stats */}
              <div className="text-[10px] text-gray-400 mb-1">{t.character.baseStats}</div>
              <div className="grid grid-cols-5 gap-1">
                <div className="bg-black/30 rounded p-1.5 text-center">
                  <div className="text-[8px] text-gray-500">{t.character.power}</div>
                  <div className="text-xs font-bold text-white">{stats.power}</div>
                </div>
                <div className="bg-black/30 rounded p-1.5 text-center">
                  <div className="text-[8px] text-gray-500">{t.character.vitality}</div>
                  <div className="text-xs font-bold text-white">{stats.vitality}</div>
                </div>
                <div className="bg-black/30 rounded p-1.5 text-center">
                  <div className="text-[8px] text-gray-500">{t.character.agility}</div>
                  <div className="text-xs font-bold text-white">{stats.agility}</div>
                </div>
                <div className="bg-black/30 rounded p-1.5 text-center">
                  <div className="text-[8px] text-gray-500">{t.character.intellect}</div>
                  <div className="text-xs font-bold text-white">{stats.intellect}</div>
                </div>
                <div className="bg-black/30 rounded p-1.5 text-center">
                  <div className="text-[8px] text-gray-500">{t.character.spirit}</div>
                  <div className="text-xs font-bold text-white">{stats.spirit}</div>
                </div>
              </div>
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
    </div>
  );
}
