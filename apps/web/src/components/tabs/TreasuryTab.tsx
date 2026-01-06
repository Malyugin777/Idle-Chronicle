'use client';

import { useEffect, useState } from 'react';
import { getSocket } from '@/lib/socket';
import { Package, Gem, Coins, Lock, X, ScrollText } from 'lucide-react';
import { detectLanguage, useTranslation, Language } from '@/lib/i18n';
import ChestOpenModal from '../modals/ChestOpenModal';

type ChestType = 'WOODEN' | 'BRONZE' | 'SILVER' | 'GOLD';

interface Chest {
  id: string;
  chestType: ChestType;
  openingStarted: number | null;
  openingDuration: number;
}

interface EquipmentReward {
  name: string;
  icon: string;
  rarity: 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC';
  slot: string;
  pAtk?: number;
  pDef?: number;
}

interface ClaimedReward {
  chestId: string;
  chestType: ChestType;
  rewards: {
    gold: number;
    equipment?: EquipmentReward;
    enchantScrolls?: number;
  };
}

interface LootStats {
  totalGoldEarned: number;
  chestSlots: number;
  totalChests: {
    WOODEN: number;
    BRONZE: number;
    SILVER: number;
    GOLD: number;
  };
}

// TZ Этап 2: Pending Rewards
interface PendingReward {
  id: string;
  bossSessionId: string;
  bossName: string;
  bossIcon: string;
  rank: number | null;
  wasEligible: boolean;
  chestsWooden: number;
  chestsBronze: number;
  chestsSilver: number;
  chestsGold: number;
  badgeId: string | null;
  badgeDuration: number | null;
  createdAt: number;
}

// Chest config - Types (not rarities!)
const CHEST_CONFIG: Record<ChestType, { icon: string; name: string; nameRu: string; color: string; bgColor: string; borderColor: string; duration: number }> = {
  WOODEN: { icon: '🪵', name: 'Wooden', nameRu: 'Деревянный', color: 'text-amber-600', bgColor: 'bg-amber-900/30', borderColor: 'border-amber-700', duration: 5 * 60 * 1000 },
  BRONZE: { icon: '🟫', name: 'Bronze', nameRu: 'Бронзовый', color: 'text-orange-400', bgColor: 'bg-orange-900/30', borderColor: 'border-orange-600', duration: 30 * 60 * 1000 },
  SILVER: { icon: '🪙', name: 'Silver', nameRu: 'Серебряный', color: 'text-gray-300', bgColor: 'bg-gray-500/30', borderColor: 'border-gray-400', duration: 4 * 60 * 60 * 1000 },
  GOLD: { icon: '🟨', name: 'Gold', nameRu: 'Золотой', color: 'text-yellow-400', bgColor: 'bg-yellow-600/30', borderColor: 'border-yellow-500', duration: 8 * 60 * 60 * 1000 },
};

const SLOT_UNLOCK_COST = 999; // crystals to unlock a slot
const BOOST_COST = 1; // gold to boost chest opening by 30 min

export default function TreasuryTab() {
  const [lang] = useState<Language>(() => detectLanguage());
  const t = useTranslation(lang);

  const [crystals, setCrystals] = useState(0);
  const [gold, setGold] = useState(0);
  const [chests, setChests] = useState<Chest[]>([]);
  const [lootStats, setLootStats] = useState<LootStats>({
    totalGoldEarned: 0,
    chestSlots: 5,
    totalChests: { WOODEN: 0, BRONZE: 0, SILVER: 0, GOLD: 0 },
  });
  const [now, setNow] = useState(Date.now());
  const [claimedReward, setClaimedReward] = useState<ClaimedReward | null>(null);
  const [isOpeningAnimation, setIsOpeningAnimation] = useState(false);  // Анимация открытия
  const [selectedChest, setSelectedChest] = useState<Chest | null>(null);
  const [selectedLockedSlot, setSelectedLockedSlot] = useState<number | null>(null);
  const [pendingRewards, setPendingRewards] = useState<PendingReward[]>([]);
  const [claimingRewardId, setClaimingRewardId] = useState<string | null>(null);

  // Update timer every second
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Socket connection
  useEffect(() => {
    const socket = getSocket();

    // Request chest data and player gold
    socket.emit('chest:get');
    socket.emit('loot:stats:get');
    socket.emit('rewards:get'); // TZ Этап 2: Request pending rewards
    socket.emit('player:get'); // Для получения gold

    // Listen for chest data
    socket.on('chest:data', (data: { chests: Chest[] }) => {
      setChests(data.chests);
    });

    // Listen for loot stats
    socket.on('loot:stats', (data: LootStats) => {
      setLootStats(data);
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
      setIsOpeningAnimation(true);
      setSelectedChest(null);
      // Refresh stats
      socket.emit('loot:stats:get');
    });

    // Chest boosted (30 min acceleration)
    socket.on('chest:boosted', (data: { chestId: string; newDuration: number; gold?: number }) => {
      setChests(prev => prev.map(c =>
        c.id === data.chestId ? { ...c, openingDuration: data.newDuration } : c
      ));
      // Update gold after boost
      if (data.gold !== undefined) {
        setGold(data.gold);
      }
      // Update selected chest if it's the one being boosted
      setSelectedChest(prev => prev?.id === data.chestId ? { ...prev, openingDuration: data.newDuration } : prev);
    });

    // Chest deleted
    socket.on('chest:deleted', (data: { chestId: string }) => {
      setChests(prev => prev.filter(c => c.id !== data.chestId));
    });

    // Slot unlocked
    socket.on('slot:unlocked', (data: { chestSlots: number; crystals: number }) => {
      setLootStats(prev => ({ ...prev, chestSlots: data.chestSlots }));
      setCrystals(data.crystals);
      setSelectedLockedSlot(null);
    });

    // Error handling
    socket.on('chest:error', (data: { message: string }) => {
      console.error('[Chest] Error:', data.message);
    });

    socket.on('slot:error', (data: { message: string }) => {
      console.error('[Slot] Error:', data.message);
      alert(data.message);
    });

    // TZ Этап 2: Pending rewards listeners
    socket.on('rewards:data', (data: { rewards: PendingReward[] }) => {
      setPendingRewards(data.rewards);
    });

    socket.on('rewards:available', () => {
      // New rewards available - refresh
      socket.emit('rewards:get');
    });

    socket.on('rewards:claimed', (data: { rewardId: string; chestsCreated: number; badgeAwarded: string | null }) => {
      setPendingRewards(prev => prev.filter(r => r.id !== data.rewardId));
      setClaimingRewardId(null);
      // Refresh chest data
      socket.emit('chest:get');
      socket.emit('loot:stats:get');
    });

    socket.on('rewards:error', (data: { message: string }) => {
      console.error('[Rewards] Error:', data.message);
      setClaimingRewardId(null);
    });

    // Get player data for crystals and gold
    socket.on('auth:success', (data: any) => {
      setCrystals(data.ancientCoin || 0);
      setGold(data.gold || 0);
    });

    socket.on('player:data', (data: any) => {
      if (data) {
        setCrystals(data.ancientCoin || 0);
        setGold(data.gold || 0);
      }
    });

    return () => {
      socket.off('chest:data');
      socket.off('loot:stats');
      socket.off('chest:opened');
      socket.off('chest:claimed');
      socket.off('chest:boosted');
      socket.off('chest:deleted');
      socket.off('slot:unlocked');
      socket.off('chest:error');
      socket.off('slot:error');
      socket.off('auth:success');
      socket.off('player:data');
      socket.off('rewards:data');
      socket.off('rewards:available');
      socket.off('rewards:claimed');
      socket.off('rewards:error');
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
    setSelectedChest(null);
  };

  // Boost chest opening by 30 min
  const boostChest = (chestId: string) => {
    if (gold < BOOST_COST) return;
    getSocket().emit('chest:boost', { chestId });
  };

  // Unlock slot
  const unlockSlot = () => {
    if (crystals < SLOT_UNLOCK_COST) return;
    getSocket().emit('slot:unlock');
  };

  // TZ Этап 2: Claim pending reward
  const claimReward = (rewardId: string) => {
    if (claimingRewardId) return;
    setClaimingRewardId(rewardId);
    getSocket().emit('rewards:claim', { rewardId });
  };

  // Format time remaining
  const formatTime = (ms: number) => {
    if (ms <= 0) return t.treasury.claim;
    const totalSeconds = Math.ceil(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}ч ${minutes}м`;
    }
    if (minutes > 0) {
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${seconds}с`;
  };

  // Get chest type label
  const getChestLabel = (chestType: ChestType) => {
    return lang === 'ru' ? CHEST_CONFIG[chestType].nameRu : CHEST_CONFIG[chestType].name;
  };

  // Format number
  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toLocaleString();
  };

  const totalSlots = 10;
  const unlockedSlots = lootStats.chestSlots;
  const lockedSlots = totalSlots - unlockedSlots;

  return (
    <div className="flex-1 overflow-auto bg-l2-dark relative">
      {/* Chest Open Modal with Animation */}
      {claimedReward && isOpeningAnimation && (
        <ChestOpenModal
          chestType={claimedReward.chestType}
          rewards={claimedReward.rewards}
          isOpening={true}
          onClose={() => {
            setClaimedReward(null);
            setIsOpeningAnimation(false);
          }}
          lang={lang}
        />
      )}

      {/* Header - Total Earnings */}
      <div className="bg-l2-panel p-3 border-b border-white/10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Package className="text-l2-gold" size={20} />
            <span className="font-bold text-white">Добыча</span>
          </div>
          <div className="flex items-center gap-1 bg-purple-500/20 px-2 py-1 rounded">
            <Gem className="text-purple-400" size={14} />
            <span className="text-sm font-bold text-purple-400">{crystals}</span>
          </div>
        </div>

        {/* Earnings Stats */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-black/30 rounded p-2 flex items-center gap-2">
            <Coins className="text-l2-gold" size={16} />
            <div>
              <div className="text-gray-500">Всего золота</div>
              <div className="text-l2-gold font-bold">{formatNumber(lootStats.totalGoldEarned)}</div>
            </div>
          </div>
          <div className="bg-black/30 rounded p-2">
            <div className="text-gray-500 mb-1">Сундуки открыто</div>
            <div className="flex gap-1 flex-wrap text-[10px]">
              <span className="text-amber-600">{lootStats.totalChests.WOODEN}🪵</span>
              <span className="text-orange-400">{lootStats.totalChests.BRONZE}🟫</span>
              <span className="text-gray-300">{lootStats.totalChests.SILVER}🪙</span>
              <span className="text-yellow-400">{lootStats.totalChests.GOLD}🟨</span>
            </div>
          </div>
        </div>
      </div>

      {/* TZ Этап 2: Pending Rewards Block */}
      {pendingRewards.length > 0 && (
        <div className="bg-gradient-to-r from-l2-gold/20 to-orange-500/20 p-3 border-y border-l2-gold/30">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🎁</span>
            <span className="font-bold text-l2-gold">Награды за босса</span>
            <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full font-bold animate-pulse">
              {pendingRewards.length}
            </span>
          </div>

          <div className="space-y-2">
            {pendingRewards.map((reward) => {
              const totalChests = reward.chestsWooden + reward.chestsBronze + reward.chestsSilver + reward.chestsGold;
              const isClaiming = claimingRewardId === reward.id;

              return (
                <div
                  key={reward.id}
                  className="bg-black/40 rounded-lg p-3 border border-l2-gold/20"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{reward.bossIcon}</span>
                      <div>
                        <div className="text-white font-bold text-sm">{reward.bossName}</div>
                        {reward.rank && (
                          <div className="text-xs text-gray-400">
                            Ранг: #{reward.rank}
                            {reward.rank === 1 && <span className="ml-1 text-l2-gold">👑</span>}
                            {reward.rank === 2 && <span className="ml-1 text-gray-300">🥈</span>}
                            {reward.rank === 3 && <span className="ml-1 text-orange-400">🥉</span>}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => claimReward(reward.id)}
                      disabled={isClaiming}
                      className={`px-3 py-1.5 rounded-lg font-bold text-sm transition-all ${
                        isClaiming
                          ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                          : 'bg-l2-gold text-black hover:brightness-110 active:scale-95'
                      }`}
                    >
                      {isClaiming ? '...' : 'Забрать'}
                    </button>
                  </div>

                  {/* Rewards breakdown */}
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {reward.chestsWooden > 0 && (
                      <span className="bg-amber-900/40 px-2 py-0.5 rounded text-amber-600">
                        {reward.chestsWooden}🪵
                      </span>
                    )}
                    {reward.chestsBronze > 0 && (
                      <span className="bg-orange-900/40 px-2 py-0.5 rounded text-orange-400">
                        {reward.chestsBronze}🟫
                      </span>
                    )}
                    {reward.chestsSilver > 0 && (
                      <span className="bg-gray-600/40 px-2 py-0.5 rounded text-gray-300">
                        {reward.chestsSilver}🪙
                      </span>
                    )}
                    {reward.chestsGold > 0 && (
                      <span className="bg-yellow-600/40 px-2 py-0.5 rounded text-yellow-400">
                        {reward.chestsGold}🟨
                      </span>
                    )}
                    {reward.badgeId && (
                      <span className="bg-purple-500/30 px-2 py-0.5 rounded text-purple-400">
                        {reward.badgeId === 'slayer' ? '⚔️ Slayer' : '🏆 Elite'} ({reward.badgeDuration}д)
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Chest Slots Grid */}
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400">Ячейки сундуков</span>
          <span className="text-xs text-gray-500">{chests.length}/{unlockedSlots} занято</span>
        </div>

        <div className="grid grid-cols-5 gap-2">
          {/* Unlocked slots with chests */}
          {Array.from({ length: totalSlots }).map((_, index) => {
            const isUnlocked = index < unlockedSlots;
            const chest = chests[index];

            if (!isUnlocked) {
              // Locked slot
              return (
                <button
                  key={`slot-${index}`}
                  onClick={() => setSelectedLockedSlot(index)}
                  className="aspect-square bg-black/50 rounded-lg border-2 border-dashed border-gray-700 flex flex-col items-center justify-center hover:border-gray-500 transition-all"
                >
                  <Lock className="text-gray-600" size={20} />
                </button>
              );
            }

            if (!chest) {
              // Empty unlocked slot
              return (
                <div
                  key={`slot-${index}`}
                  className="aspect-square bg-black/30 rounded-lg border border-white/10 flex items-center justify-center"
                >
                  <span className="text-gray-700 text-xs">-</span>
                </div>
              );
            }

            // Slot with chest
            const config = CHEST_CONFIG[chest.chestType];
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
                  isReady ? 'border-l2-gold animate-pulse' : config.borderColor
                } flex flex-col items-center justify-center relative hover:brightness-110 active:scale-95 transition-all`}
              >
                <span className="text-2xl">{config.icon}</span>
                {isOpening && !isReady && (
                  <>
                    <div className="absolute bottom-1 left-1 right-1 h-1 bg-black/50 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-l2-gold rounded-full transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="absolute top-0.5 right-0.5 text-[8px] text-gray-400">
                      {formatTime(remaining)}
                    </span>
                  </>
                )}
                {isReady && (
                  <span className="absolute -top-1 -right-1 text-xs">✨</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Info text */}
        {openingChest && (
          <div className="mt-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-2 text-xs text-yellow-400 text-center">
            ⏳ Открывается сундук... Другие открыть нельзя
          </div>
        )}

        {chests.length >= unlockedSlots && (
          <div className="mt-3 bg-red-500/10 border border-red-500/30 rounded-lg p-2 text-xs text-red-400 text-center">
            ⚠️ Все ячейки заняты! Откройте или удалите сундук, чтобы получить новый
          </div>
        )}
      </div>

      {/* Chest Action Popup */}
      {selectedChest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setSelectedChest(null)}>
          <div
            className={`${CHEST_CONFIG[selectedChest.chestType].bgColor} rounded-xl p-4 w-full max-w-xs border-2 ${CHEST_CONFIG[selectedChest.chestType].borderColor}`}
            onClick={e => e.stopPropagation()}
          >
            <div className="text-center mb-4">
              <div className="text-5xl mb-2">{CHEST_CONFIG[selectedChest.chestType].icon}</div>
              <div className={`text-lg font-bold ${CHEST_CONFIG[selectedChest.chestType].color}`}>
                {getChestLabel(selectedChest.chestType)}
              </div>
              {(() => {
                const isOpening = selectedChest.openingStarted !== null;
                const elapsed = isOpening ? now - selectedChest.openingStarted! : 0;
                const remaining = selectedChest.openingDuration - elapsed;
                const isReady = isOpening && remaining <= 0;

                if (isReady) {
                  return <div className="text-l2-gold text-sm mt-1">Готов к открытию!</div>;
                } else if (isOpening) {
                  return <div className="text-gray-400 text-sm mt-1">Осталось: {formatTime(remaining)}</div>;
                } else {
                  return <div className="text-gray-500 text-sm mt-1">Время открытия: {formatTime(selectedChest.openingDuration)}</div>;
                }
              })()}
            </div>

            {/* Drop rates info (matching TZ exactly) */}
            <div className="bg-black/30 rounded-lg p-2 mb-3 text-xs">
              <div className="text-gray-500 mb-1">Возможный дроп:</div>
              {selectedChest.chestType === 'WOODEN' && (
                <div className="text-gray-400 space-y-0.5">
                  <div>💰 1,000 золота</div>
                  <div><span className="text-gray-300">50%</span> Обычная экипировка</div>
                  <div><span className="text-green-400">7%</span> Необычная экипировка</div>
                  <div><span className="text-blue-400">3%</span> Свиток заточки +1</div>
                </div>
              )}
              {selectedChest.chestType === 'BRONZE' && (
                <div className="text-gray-400 space-y-0.5">
                  <div>💰 3,000 золота</div>
                  <div><span className="text-gray-300">60%</span> Обычная экипировка</div>
                  <div><span className="text-green-400">20%</span> Необычная экипировка</div>
                  <div><span className="text-purple-400">3%</span> Редкая экипировка</div>
                  <div><span className="text-blue-400">15%</span> Свиток заточки +1</div>
                </div>
              )}
              {selectedChest.chestType === 'SILVER' && (
                <div className="text-gray-400 space-y-0.5">
                  <div>💰 8,000 золота</div>
                  <div><span className="text-green-400">40%</span> Необычная экипировка</div>
                  <div><span className="text-purple-400">10%</span> Редкая экипировка</div>
                  <div><span className="text-orange-400">1%</span> Эпическая экипировка</div>
                  <div><span className="text-blue-400">25%</span> Свитки заточки +1-5</div>
                </div>
              )}
              {selectedChest.chestType === 'GOLD' && (
                <div className="text-gray-400 space-y-0.5">
                  <div>💰 20,000 золота</div>
                  <div><span className="text-purple-400">15%</span> Редкая экипировка</div>
                  <div><span className="text-orange-400">3%</span> Эпическая экипировка</div>
                  <div><span className="text-blue-400">45%</span> Свитки заточки +1-5</div>
                </div>
              )}
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
                      ✨ Забрать награду
                    </button>
                  );
                } else if (isOpening) {
                  return (
                    <>
                      <div className="py-3 bg-black/30 rounded-lg text-center">
                        <div className="text-sm text-gray-400">Открывается...</div>
                        <div className="w-full h-2 bg-black/50 rounded-full mt-2 overflow-hidden">
                          <div
                            className="h-full bg-l2-gold rounded-full transition-all"
                            style={{ width: `${Math.min(100, (elapsed / selectedChest.openingDuration) * 100)}%` }}
                          />
                        </div>
                      </div>
                      {/* Boost button */}
                      <button
                        onClick={() => boostChest(selectedChest.id)}
                        disabled={gold < BOOST_COST}
                        className={`w-full py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 ${
                          gold >= BOOST_COST
                            ? 'bg-purple-500/30 text-purple-300 hover:bg-purple-500/50 border border-purple-500/50'
                            : 'bg-gray-700/30 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        <span>⚡</span>
                        <span>Ускорить 30 мин</span>
                        <span className="flex items-center gap-1">
                          <Coins size={14} className="text-l2-gold" />
                          {BOOST_COST}
                        </span>
                      </button>
                    </>
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
                      {canOpen ? '🔓 Начать открытие' : '⏳ Другой сундук открывается'}
                    </button>
                  );
                }
              })()}

              <button
                onClick={() => deleteChest(selectedChest.id)}
                className="w-full py-2 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30"
              >
                🗑️ Удалить сундук
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

      {/* Locked Slot Popup */}
      {selectedLockedSlot !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setSelectedLockedSlot(null)}>
          <div
            className="bg-l2-panel rounded-xl p-4 w-full max-w-xs border-2 border-purple-500/50"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white">Ячейка заблокирована</h3>
              <button onClick={() => setSelectedLockedSlot(null)} className="text-gray-400">
                <X size={20} />
              </button>
            </div>

            <div className="text-center mb-4">
              <Lock className="mx-auto text-purple-400 mb-2" size={40} />
              <p className="text-gray-400 text-sm">
                Разблокируйте дополнительную ячейку для хранения сундуков
              </p>
            </div>

            <div className="bg-black/30 rounded-lg p-3 mb-4">
              <div className="flex items-center justify-center gap-2">
                <Gem className="text-purple-400" size={20} />
                <span className="text-xl font-bold text-purple-400">{SLOT_UNLOCK_COST}</span>
                <span className="text-gray-400">кристаллов</span>
              </div>
              <div className="text-center text-xs text-gray-500 mt-1">
                У вас: {crystals} кристаллов
              </div>
            </div>

            <button
              onClick={unlockSlot}
              disabled={crystals < SLOT_UNLOCK_COST}
              className={`w-full py-3 rounded-lg font-bold text-sm ${
                crystals >= SLOT_UNLOCK_COST
                  ? 'bg-purple-500 text-white hover:bg-purple-600'
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
              }`}
            >
              {crystals >= SLOT_UNLOCK_COST ? '🔓 Разблокировать' : '❌ Недостаточно кристаллов'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
