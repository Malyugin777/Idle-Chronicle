'use client';

import { useEffect, useState } from 'react';
import { getSocket } from '@/lib/socket';
import { Package, Gem, Coins } from 'lucide-react';
import { detectLanguage, useTranslation, Language } from '@/lib/i18n';

type ChestRarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';

interface Chest {
  id: string;
  rarity: ChestRarity;
  openingStarted: number | null;
  openingDuration: number;
}

interface ClaimedReward {
  chestId: string;
  rarity: ChestRarity;
  rewards: {
    adena: number;
    exp: number;
    ton: number;
  };
}

// Chest config
const CHEST_CONFIG: Record<ChestRarity, { icon: string; color: string; bgColor: string; duration: number }> = {
  COMMON: { icon: '📦', color: 'text-gray-300', bgColor: 'bg-gray-500/20', duration: 5 * 60 * 1000 },
  UNCOMMON: { icon: '🎁', color: 'text-green-400', bgColor: 'bg-green-500/20', duration: 30 * 60 * 1000 },
  RARE: { icon: '💎', color: 'text-blue-400', bgColor: 'bg-blue-500/20', duration: 4 * 60 * 60 * 1000 },
  EPIC: { icon: '👑', color: 'text-purple-400', bgColor: 'bg-purple-500/20', duration: 8 * 60 * 60 * 1000 },
  LEGENDARY: { icon: '🏆', color: 'text-orange-400', bgColor: 'bg-orange-500/20', duration: 24 * 60 * 60 * 1000 },
};

export default function TreasuryTab() {
  const [lang] = useState<Language>(() => detectLanguage());
  const t = useTranslation(lang);

  const [crystals, setCrystals] = useState(0);
  const [chests, setChests] = useState<Chest[]>([]);
  const [now, setNow] = useState(Date.now());
  const [claimedReward, setClaimedReward] = useState<ClaimedReward | null>(null);
  const [selectedChest, setSelectedChest] = useState<Chest | null>(null);

  // Update timer every second
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Socket connection
  useEffect(() => {
    const socket = getSocket();

    // Request chest data
    socket.emit('chest:get');

    // Listen for chest data
    socket.on('chest:data', (data: { chests: Chest[] }) => {
      setChests(data.chests);
    });

    // Chest opened (timer started)
    socket.on('chest:opened', (chest: Chest) => {
      setChests(prev => prev.map(c =>
        c.id === chest.id ? { ...c, openingStarted: chest.openingStarted } : c
      ));
    });

    // Chest claimed (rewards received)
    socket.on('chest:claimed', (data: ClaimedReward) => {
      setChests(prev => prev.filter(c => c.id !== data.chestId));
      setClaimedReward(data);
      // Auto-hide reward popup after 3 seconds
      setTimeout(() => setClaimedReward(null), 3000);
    });

    // Error handling
    socket.on('chest:error', (data: { message: string }) => {
      console.error('[Chest] Error:', data.message);
    });

    // Get player data for crystals
    socket.on('auth:success', (data: any) => {
      setCrystals(data.ancientCoin || 0);
    });

    socket.on('player:data', (data: any) => {
      if (data) {
        setCrystals(data.ancientCoin || 0);
      }
    });

    return () => {
      socket.off('chest:data');
      socket.off('chest:opened');
      socket.off('chest:claimed');
      socket.off('chest:error');
      socket.off('auth:success');
      socket.off('player:data');
    };
  }, []);

  // Check if any chest is currently opening
  const openingChest = chests.find(c => {
    if (!c.openingStarted) return false;
    const elapsed = now - c.openingStarted;
    return elapsed < c.openingDuration;
  });

  // Start opening a chest
  const startOpening = (chestId: string) => {
    if (openingChest) return;
    getSocket().emit('chest:open', { chestId });
  };

  // Claim opened chest
  const claimChest = (chestId: string) => {
    const chest = chests.find(c => c.id === chestId);
    if (!chest || !chest.openingStarted) return;

    const elapsed = now - chest.openingStarted;
    if (elapsed < chest.openingDuration) return;

    getSocket().emit('chest:claim', { chestId });
  };

  // Delete chest
  const deleteChest = (chestId: string) => {
    getSocket().emit('chest:delete', { chestId });
    setChests(prev => prev.filter(c => c.id !== chestId));
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

  // Format number
  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toLocaleString();
  };

  return (
    <div className="flex-1 overflow-auto bg-l2-dark relative">
      {/* Claimed Reward Popup */}
      {claimedReward && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className={`${CHEST_CONFIG[claimedReward.rarity].bgColor} rounded-xl p-6 text-center mx-4 animate-bounce`}>
            <div className="text-5xl mb-3">{CHEST_CONFIG[claimedReward.rarity].icon}</div>
            <div className={`text-lg font-bold ${CHEST_CONFIG[claimedReward.rarity].color} mb-4`}>
              {getRarityLabel(claimedReward.rarity)} {t.treasury.claim}!
            </div>
            <div className="space-y-2">
              {claimedReward.rewards.adena > 0 && (
                <div className="flex items-center justify-center gap-2">
                  <Coins className="text-l2-gold" size={18} />
                  <span className="text-l2-gold font-bold">+{formatNumber(claimedReward.rewards.adena)}</span>
                </div>
              )}
              {claimedReward.rewards.exp > 0 && (
                <div className="flex items-center justify-center gap-2">
                  <span className="text-green-400">⭐</span>
                  <span className="text-green-400 font-bold">+{formatNumber(claimedReward.rewards.exp)} EXP</span>
                </div>
              )}
              {claimedReward.rewards.ton > 0 && (
                <div className="flex items-center justify-center gap-2">
                  <Gem className="text-blue-400" size={18} />
                  <span className="text-blue-400 font-bold">+{claimedReward.rewards.ton} TON</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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

      {/* Chests in Inventory Slots */}
      <div className="p-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400">{t.treasury.chests}</span>
          <span className="text-xs text-gray-500">{chests.length}/10</span>
        </div>

        {chests.length === 0 ? (
          <div className="bg-black/30 rounded-lg p-6 text-center">
            <Package size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-gray-500 text-sm">{t.treasury.noChests}</p>
            <p className="text-gray-600 text-xs mt-1">{t.treasury.defeatBosses}</p>
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-2">
            {chests.slice(0, 10).map((chest) => {
              const config = CHEST_CONFIG[chest.rarity];
              const isOpening = chest.openingStarted !== null;
              const elapsed = isOpening ? now - chest.openingStarted! : 0;
              const remaining = chest.openingDuration - elapsed;
              const isReady = isOpening && remaining <= 0;
              const progress = isOpening ? Math.min(100, (elapsed / chest.openingDuration) * 100) : 0;

              return (
                <button
                  key={chest.id}
                  onClick={() => setSelectedChest(chest)}
                  className={`aspect-square ${config.bgColor} rounded-lg border-2 ${
                    isReady ? 'border-l2-gold animate-pulse' : 'border-white/20'
                  } flex flex-col items-center justify-center relative hover:brightness-110 active:scale-95 transition-all`}
                >
                  <span className="text-2xl">{config.icon}</span>
                  {isOpening && !isReady && (
                    <div className="absolute bottom-1 left-1 right-1 h-1 bg-black/50 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-l2-gold rounded-full transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  )}
                  {isReady && (
                    <span className="absolute -top-1 -right-1 text-xs">✨</span>
                  )}
                </button>
              );
            })}
            {/* Empty slots */}
            {Array.from({ length: Math.max(0, 10 - chests.length) }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="aspect-square bg-black/30 rounded-lg border border-white/5 flex items-center justify-center"
              >
                <span className="text-[10px] text-gray-700">-</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Chest Action Popup */}
      {selectedChest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setSelectedChest(null)}>
          <div
            className={`${CHEST_CONFIG[selectedChest.rarity].bgColor} rounded-xl p-4 w-full max-w-xs border-2 border-white/20`}
            onClick={e => e.stopPropagation()}
          >
            <div className="text-center mb-4">
              <div className="text-5xl mb-2">{CHEST_CONFIG[selectedChest.rarity].icon}</div>
              <div className={`text-lg font-bold ${CHEST_CONFIG[selectedChest.rarity].color}`}>
                {getRarityLabel(selectedChest.rarity)}
              </div>
              {(() => {
                const isOpening = selectedChest.openingStarted !== null;
                const elapsed = isOpening ? now - selectedChest.openingStarted! : 0;
                const remaining = selectedChest.openingDuration - elapsed;
                const isReady = isOpening && remaining <= 0;

                if (isReady) {
                  return <div className="text-l2-gold text-sm mt-1">{t.treasury.claim}!</div>;
                } else if (isOpening) {
                  return <div className="text-gray-400 text-sm mt-1">{formatTime(remaining)}</div>;
                } else {
                  return <div className="text-gray-500 text-sm mt-1">{formatTime(selectedChest.openingDuration)}</div>;
                }
              })()}
            </div>

            <div className="space-y-2">
              {(() => {
                const isOpening = selectedChest.openingStarted !== null;
                const elapsed = isOpening ? now - selectedChest.openingStarted! : 0;
                const remaining = selectedChest.openingDuration - elapsed;
                const isReady = isOpening && remaining <= 0;
                const canOpen = !openingChest || openingChest.id === selectedChest.id;

                if (isReady) {
                  return (
                    <button
                      onClick={() => {
                        claimChest(selectedChest.id);
                        setSelectedChest(null);
                      }}
                      className="w-full py-3 bg-l2-gold text-black font-bold rounded-lg text-sm"
                    >
                      {t.treasury.claim}
                    </button>
                  );
                } else if (isOpening) {
                  return (
                    <div className="py-3 bg-black/30 rounded-lg text-center">
                      <div className="text-sm text-gray-400">{t.treasury.opening}</div>
                      <div className="w-full h-2 bg-black/50 rounded-full mt-2 overflow-hidden">
                        <div
                          className="h-full bg-l2-gold rounded-full transition-all"
                          style={{ width: `${Math.min(100, (elapsed / selectedChest.openingDuration) * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                } else {
                  return (
                    <button
                      onClick={() => {
                        if (canOpen) {
                          startOpening(selectedChest.id);
                        }
                      }}
                      disabled={!canOpen}
                      className={`w-full py-3 rounded-lg text-sm font-bold ${
                        canOpen
                          ? 'bg-white/10 text-white hover:bg-white/20'
                          : 'bg-black/30 text-gray-600 cursor-not-allowed'
                      }`}
                    >
                      {t.treasury.openChest}
                    </button>
                  );
                }
              })()}

              <button
                onClick={() => {
                  deleteChest(selectedChest.id);
                  setSelectedChest(null);
                }}
                className="w-full py-2 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30"
              >
                🗑️ Удалить
              </button>

              <button
                onClick={() => setSelectedChest(null)}
                className="w-full py-2 bg-black/30 text-gray-400 rounded-lg text-sm hover:bg-black/40"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
