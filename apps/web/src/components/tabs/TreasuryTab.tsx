'use client';

import { useEffect, useState } from 'react';
import { getSocket } from '@/lib/socket';
import { Package, Lock, Gem } from 'lucide-react';
import { detectLanguage, useTranslation, Language } from '@/lib/i18n';

type ChestRarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';

interface Chest {
  id: string;
  rarity: ChestRarity;
  openingStarted: number | null; // timestamp when opening started
  openingDuration: number; // ms to open
}

interface InventoryItem {
  id: string;
  name: string;
  icon: string;
  quantity: number;
  rarity: ChestRarity;
}

// Chest config
const CHEST_CONFIG: Record<ChestRarity, { icon: string; color: string; bgColor: string; duration: number }> = {
  COMMON: { icon: '📦', color: 'text-gray-300', bgColor: 'bg-gray-500/20', duration: 5 * 60 * 1000 }, // 5 min
  UNCOMMON: { icon: '🎁', color: 'text-green-400', bgColor: 'bg-green-500/20', duration: 30 * 60 * 1000 }, // 30 min
  RARE: { icon: '💎', color: 'text-blue-400', bgColor: 'bg-blue-500/20', duration: 4 * 60 * 60 * 1000 }, // 4h
  EPIC: { icon: '👑', color: 'text-purple-400', bgColor: 'bg-purple-500/20', duration: 8 * 60 * 60 * 1000 }, // 8h
  LEGENDARY: { icon: '🏆', color: 'text-orange-400', bgColor: 'bg-orange-500/20', duration: 24 * 60 * 60 * 1000 }, // 24h
};

const SLOT_UNLOCK_COST = 50; // crystals per slot

export default function TreasuryTab() {
  const [lang] = useState<Language>(() => detectLanguage());
  const t = useTranslation(lang);

  // Mock data - in real app this comes from server
  const [crystals, setCrystals] = useState(120);
  const [unlockedSlots, setUnlockedSlots] = useState(5);
  const [chests, setChests] = useState<Chest[]>([
    { id: '1', rarity: 'COMMON', openingStarted: null, openingDuration: CHEST_CONFIG.COMMON.duration },
    { id: '2', rarity: 'UNCOMMON', openingStarted: null, openingDuration: CHEST_CONFIG.UNCOMMON.duration },
    { id: '3', rarity: 'RARE', openingStarted: null, openingDuration: CHEST_CONFIG.RARE.duration },
  ]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [now, setNow] = useState(Date.now());

  // Update timer every second
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Check if any chest is currently opening
  const openingChest = chests.find(c => c.openingStarted !== null);

  // Start opening a chest
  const startOpening = (chestId: string) => {
    if (openingChest) return; // Already opening one

    setChests(prev => prev.map(c =>
      c.id === chestId ? { ...c, openingStarted: Date.now() } : c
    ));

    // In real app: socket.emit('chest:open', { chestId })
  };

  // Claim opened chest
  const claimChest = (chestId: string) => {
    const chest = chests.find(c => c.id === chestId);
    if (!chest || !chest.openingStarted) return;

    const elapsed = now - chest.openingStarted;
    if (elapsed < chest.openingDuration) return; // Not ready

    // Remove chest and add random loot
    setChests(prev => prev.filter(c => c.id !== chestId));

    // Mock loot based on rarity
    const lootCount = chest.rarity === 'LEGENDARY' ? 5 : chest.rarity === 'EPIC' ? 4 : chest.rarity === 'RARE' ? 3 : 2;
    // In real app: server sends actual loot

    // In real app: socket.emit('chest:claim', { chestId })
  };

  // Unlock new slot
  const unlockSlot = () => {
    if (crystals < SLOT_UNLOCK_COST || unlockedSlots >= 10) return;
    setCrystals(prev => prev - SLOT_UNLOCK_COST);
    setUnlockedSlots(prev => prev + 1);
    // In real app: socket.emit('slot:unlock')
  };

  // Format time remaining
  const formatTime = (ms: number) => {
    if (ms <= 0) return t.treasury.claim;
    const totalSeconds = Math.ceil(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}${t.treasury.hours} ${minutes}${t.treasury.minutes}`;
    }
    if (minutes > 0) {
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${seconds}s`;
  };

  // Get rarity label
  const getRarityLabel = (rarity: ChestRarity) => {
    switch (rarity) {
      case 'COMMON': return t.treasury.common;
      case 'UNCOMMON': return t.treasury.uncommon;
      case 'RARE': return t.treasury.rare;
      case 'EPIC': return t.treasury.epic;
      case 'LEGENDARY': return t.treasury.legendary;
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-l2-dark">
      {/* Header with crystals */}
      <div className="bg-l2-panel p-2 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="text-l2-gold" size={20} />
            <span className="font-bold text-white">{t.treasury.title}</span>
          </div>
          <div className="flex items-center gap-1 bg-purple-500/20 px-2 py-1 rounded">
            <Gem className="text-purple-400" size={14} />
            <span className="text-sm font-bold text-purple-400">{crystals}</span>
          </div>
        </div>
      </div>

      {/* Chests Section */}
      <div className="p-2">
        <div className="text-xs text-gray-400 mb-2">{t.treasury.chests}</div>

        {chests.length === 0 ? (
          <div className="bg-black/30 rounded p-4 text-center">
            <Package size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-gray-500 text-sm">{t.treasury.noChests}</p>
            <p className="text-gray-600 text-xs">{t.treasury.defeatBosses}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {chests.map((chest) => {
              const config = CHEST_CONFIG[chest.rarity];
              const isOpening = chest.openingStarted !== null;
              const elapsed = isOpening ? now - chest.openingStarted! : 0;
              const remaining = chest.openingDuration - elapsed;
              const isReady = isOpening && remaining <= 0;
              const progress = isOpening ? Math.min(100, (elapsed / chest.openingDuration) * 100) : 0;
              const canOpen = !openingChest || openingChest.id === chest.id;

              return (
                <div
                  key={chest.id}
                  className={`${config.bgColor} rounded-lg p-3 border border-white/10`}
                >
                  <div className="flex items-center gap-3">
                    {/* Chest icon */}
                    <div className="text-3xl">{config.icon}</div>

                    {/* Info */}
                    <div className="flex-1">
                      <div className={`font-bold ${config.color}`}>
                        {getRarityLabel(chest.rarity)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatTime(chest.openingDuration)}
                      </div>
                    </div>

                    {/* Action button */}
                    {isReady ? (
                      <button
                        onClick={() => claimChest(chest.id)}
                        className="px-4 py-2 bg-l2-gold text-black font-bold rounded text-sm"
                      >
                        {t.treasury.claim}
                      </button>
                    ) : isOpening ? (
                      <div className="text-right">
                        <div className="text-sm font-bold text-white">{formatTime(remaining)}</div>
                        <div className="w-20 h-1 bg-black/50 rounded-full mt-1">
                          <div
                            className="h-full bg-l2-gold rounded-full transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => startOpening(chest.id)}
                        disabled={!canOpen}
                        className={`px-4 py-2 rounded text-sm font-bold ${
                          canOpen
                            ? 'bg-white/10 text-white hover:bg-white/20'
                            : 'bg-black/30 text-gray-600 cursor-not-allowed'
                        }`}
                      >
                        {t.treasury.openChest}
                      </button>
                    )}
                  </div>

                  {/* Opening progress bar */}
                  {isOpening && !isReady && (
                    <div className="mt-2 h-1 bg-black/30 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${config.color.replace('text-', 'bg-')} transition-all`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Inventory Section */}
      <div className="p-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400">{t.treasury.inventory}</span>
          <span className="text-xs text-gray-500">{unlockedSlots}/10 {t.treasury.slots}</span>
        </div>

        <div className="grid grid-cols-5 gap-1">
          {Array.from({ length: 10 }).map((_, i) => {
            const isLocked = i >= unlockedSlots;
            const item = inventory[i];

            if (isLocked) {
              return (
                <button
                  key={i}
                  onClick={unlockSlot}
                  disabled={crystals < SLOT_UNLOCK_COST}
                  className="aspect-square bg-black/50 rounded border border-white/5 flex flex-col items-center justify-center hover:bg-black/40 transition-colors"
                  title={`${t.treasury.unlockFor} ${SLOT_UNLOCK_COST} 💎`}
                >
                  <Lock size={14} className="text-gray-600" />
                  <span className="text-[8px] text-gray-600 mt-0.5">{SLOT_UNLOCK_COST}💎</span>
                </button>
              );
            }

            if (item) {
              const config = CHEST_CONFIG[item.rarity];
              return (
                <div
                  key={i}
                  className={`aspect-square ${config.bgColor} rounded border border-white/10 flex flex-col items-center justify-center relative`}
                >
                  <span className="text-lg">{item.icon}</span>
                  {item.quantity > 1 && (
                    <span className="absolute bottom-0.5 right-1 text-[10px] text-white font-bold">
                      x{item.quantity}
                    </span>
                  )}
                </div>
              );
            }

            return (
              <div
                key={i}
                className="aspect-square bg-black/30 rounded border border-white/5 flex items-center justify-center"
              >
                <span className="text-[10px] text-gray-700">-</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
