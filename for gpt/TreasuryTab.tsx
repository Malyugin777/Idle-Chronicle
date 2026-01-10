'use client';

import { useEffect, useState } from 'react';
import { getSocket } from '@/lib/socket';
import { Package, Gem, Coins, Lock, X, ScrollText, Hammer } from 'lucide-react';
import { detectLanguage, useTranslation, Language } from '@/lib/i18n';
import ChestOpenModal from '../modals/ChestOpenModal';
import ForgeModal from '../game/ForgeModal';
import { getTaskManager } from '@/lib/taskManager';

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

interface ChestKeys {
  keyWooden: number;
  keyBronze: number;
  keySilver: number;
  keyGold: number;
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
  lotteryTickets: number;
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
const BOOST_COST = 999; // crystals to boost chest opening by 30 min

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
  const [selectedReward, setSelectedReward] = useState<PendingReward | null>(null); // For selection popup
  const [rewardSelection, setRewardSelection] = useState<{ wooden: number; bronze: number; silver: number; gold: number }>({ wooden: 0, bronze: 0, silver: 0, gold: 0 });
  const [showForge, setShowForge] = useState(false);
  const [usingKey, setUsingKey] = useState<string | null>(null); // Track which chest is being opened with key
  const [chestKeys, setChestKeys] = useState<ChestKeys>({
    keyWooden: 0,
    keyBronze: 0,
    keySilver: 0,
    keyGold: 0,
  });

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

    // Define all handlers as named functions for proper cleanup
    const handleChestData = (data: { chests: Chest[] }) => {
      setChests(data.chests);
    };

    const handleLootStats = (data: LootStats) => {
      setLootStats(data);
    };

    const handleChestOpened = (chest: Chest) => {
      setChests(prev => prev.map(c =>
        c.id === chest.id ? { ...c, openingStarted: chest.openingStarted } : c
      ));
      setSelectedChest(prev => prev?.id === chest.id ? { ...prev, openingStarted: chest.openingStarted } : prev);
    };

    const handleChestClaimed = (data: ClaimedReward) => {
      setChests(prev => prev.filter(c => c.id !== data.chestId));
      setClaimedReward(data);
      setIsOpeningAnimation(true);
      setSelectedChest(null);
      setUsingKey(null); // Clear loading state
      getTaskManager().recordChestOpened();
      socket.emit('loot:stats:get');
    };

    const handleChestBoosted = (data: { chestId: string; newDuration: number; crystals?: number }) => {
      setChests(prev => prev.map(c =>
        c.id === data.chestId ? { ...c, openingDuration: data.newDuration } : c
      ));
      if (data.crystals !== undefined) {
        setCrystals(data.crystals);
      }
      setSelectedChest(prev => prev?.id === data.chestId ? { ...prev, openingDuration: data.newDuration } : prev);
    };

    const handleChestDeleted = (data: { chestId: string }) => {
      setChests(prev => prev.filter(c => c.id !== data.chestId));
    };

    const handleSlotUnlocked = (data: { chestSlots: number; crystals: number }) => {
      setLootStats(prev => ({ ...prev, chestSlots: data.chestSlots }));
      setCrystals(data.crystals);
      setSelectedLockedSlot(null);
    };

    const handleChestError = (data: { message: string }) => {
      console.error('[Chest] Error:', data.message);
      setUsingKey(null); // Clear loading state
      alert(data.message); // Show error to user
    };

    const handleSlotError = (data: { message: string }) => {
      console.error('[Slot] Error:', data.message);
      alert(data.message);
    };

    const handleRewardsData = (data: { rewards: PendingReward[] }) => {
      setPendingRewards(data.rewards);
    };

    const handleRewardsAvailable = () => {
      socket.emit('rewards:get');
    };

    const handleRewardsClaimed = (data: { rewardId: string; chestsCreated: number; badgeAwarded: string | null }) => {
      console.log('[Rewards] Claimed successfully:', data);
      setPendingRewards(prev => prev.filter(r => r.id !== data.rewardId));
      setClaimingRewardId(null);
      socket.emit('chest:get');
      socket.emit('loot:stats:get');
    };

    const handleRewardsError = (data: { message: string }) => {
      console.error('[Rewards] Server error:', data.message);
      setClaimingRewardId(null);
    };

    const handleAuthSuccess = (data: any) => {
      setCrystals(data.ancientCoin || 0);
      setGold(data.gold || 0);
    };

    const handlePlayerData = (data: any) => {
      if (data) {
        setCrystals(data.ancientCoin || 0);
        setGold(data.gold || 0);
        setChestKeys({
          keyWooden: data.keyWooden || 0,
          keyBronze: data.keyBronze || 0,
          keySilver: data.keySilver || 0,
          keyGold: data.keyGold || 0,
        });
      }
    };

    const handlePlayerKeys = (data: ChestKeys) => {
      setChestKeys(data);
    };

    const handleEtherCraft = (data: { gold?: number }) => {
      if (data.gold !== undefined) {
        setGold(data.gold);
      }
    };

    // Sync crystals when task rewards are claimed
    const handlePlayerState = (data: { ancientCoin?: number }) => {
      if (data.ancientCoin !== undefined) {
        setCrystals(data.ancientCoin);
      }
    };

    // Register all listeners
    socket.on('chest:data', handleChestData);
    socket.on('loot:stats', handleLootStats);
    socket.on('chest:opened', handleChestOpened);
    socket.on('chest:claimed', handleChestClaimed);
    socket.on('chest:boosted', handleChestBoosted);
    socket.on('chest:deleted', handleChestDeleted);
    socket.on('slot:unlocked', handleSlotUnlocked);
    socket.on('chest:error', handleChestError);
    socket.on('slot:error', handleSlotError);
    socket.on('rewards:data', handleRewardsData);
    socket.on('rewards:available', handleRewardsAvailable);
    socket.on('rewards:claimed', handleRewardsClaimed);
    socket.on('rewards:error', handleRewardsError);
    socket.on('auth:success', handleAuthSuccess);
    socket.on('player:data', handlePlayerData);
    socket.on('ether:craft:success', handleEtherCraft);
    socket.on('player:state', handlePlayerState);
    socket.on('player:keys', handlePlayerKeys);

    return () => {
      // IMPORTANT: Pass handler reference to only remove THIS component's listeners
      socket.off('chest:data', handleChestData);
      socket.off('loot:stats', handleLootStats);
      socket.off('chest:opened', handleChestOpened);
      socket.off('chest:claimed', handleChestClaimed);
      socket.off('chest:boosted', handleChestBoosted);
      socket.off('chest:deleted', handleChestDeleted);
      socket.off('slot:unlocked', handleSlotUnlocked);
      socket.off('chest:error', handleChestError);
      socket.off('slot:error', handleSlotError);
      socket.off('rewards:data', handleRewardsData);
      socket.off('rewards:available', handleRewardsAvailable);
      socket.off('rewards:claimed', handleRewardsClaimed);
      socket.off('rewards:error', handleRewardsError);
      socket.off('auth:success', handleAuthSuccess);
      socket.off('player:data', handlePlayerData);
      socket.off('ether:craft:success', handleEtherCraft);
      socket.off('player:state', handlePlayerState);
      socket.off('player:keys', handlePlayerKeys);
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
    if (crystals < BOOST_COST) return;
    getSocket().emit('chest:boost', { chestId });
  };

  // Unlock slot
  const unlockSlot = () => {
    if (crystals < SLOT_UNLOCK_COST) return;
    getSocket().emit('slot:unlock');
  };

  // TZ Этап 2: Open reward selection popup
  const openRewardSelection = (reward: PendingReward) => {
    if (claimingRewardId) return;
    setSelectedReward(reward);
    // Pre-select all available (user can deselect)
    setRewardSelection({
      wooden: reward.chestsWooden,
      bronze: reward.chestsBronze,
      silver: reward.chestsSilver,
      gold: reward.chestsGold,
    });
  };

  // Actually claim the selected chests
  const confirmRewardClaim = () => {
    if (!selectedReward || claimingRewardId) return;

    const totalToTake = rewardSelection.wooden + rewardSelection.bronze + rewardSelection.silver + rewardSelection.gold;
    if (totalToTake === 0) {
      setSelectedReward(null);
      return;
    }

    setClaimingRewardId(selectedReward.id);

    // Safety timeout
    setTimeout(() => {
      setClaimingRewardId(prev => prev === selectedReward.id ? null : prev);
    }, 10000);

    getSocket().emit('rewards:claim', {
      rewardId: selectedReward.id,
      take: rewardSelection,
    });

    setSelectedReward(null);
  };

  // Discard remaining chests (take 0)
  const discardRemainingReward = () => {
    if (!selectedReward) return;
    // Just close popup - remaining stay for later
    setSelectedReward(null);
  };

  // Use key to instantly open chest
  const openWithKey = (chestId: string) => {
    if (usingKey) return; // Prevent double-click
    setUsingKey(chestId);
    getSocket().emit('chest:use-key', { chestId });
    // Safety timeout - clear loading after 10 sec if no response
    setTimeout(() => {
      setUsingKey(prev => prev === chestId ? null : prev);
    }, 10000);
    // Don't close modal - wait for server response
  };

  // Get key count for chest type
  const getKeyForChest = (chestType: ChestType): number => {
    const keyMap: Record<ChestType, keyof ChestKeys> = {
      WOODEN: 'keyWooden',
      BRONZE: 'keyBronze',
      SILVER: 'keySilver',
      GOLD: 'keyGold',
    };
    return chestKeys[keyMap[chestType]] || 0;
  };

  // Key icons per type
  const KEY_ICONS: Record<ChestType, string> = {
    WOODEN: '🗝️',
    BRONZE: '🔑',
    SILVER: '🔐',
    GOLD: '🏆',
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

      {/* Forge Modal */}
      <ForgeModal isOpen={showForge} onClose={() => setShowForge(false)} />

      {/* Header - Total Earnings */}
      <div className="bg-l2-panel p-3 border-b border-white/10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Package className="text-l2-gold" size={20} />
            <span className="font-bold text-white">{lang === 'ru' ? 'Добыча' : 'Loot'}</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Forge Button */}
            <button
              onClick={() => setShowForge(true)}
              className="flex items-center gap-1 bg-amber-500/20 hover:bg-amber-500/30 px-2 py-1 rounded transition-colors"
            >
              <Hammer className="text-amber-400" size={14} />
              <span className="text-sm font-bold text-amber-400">
                {lang === 'ru' ? 'Кузница' : 'Forge'}
              </span>
            </button>
            {/* Keys display */}
            {(chestKeys.keyWooden > 0 || chestKeys.keyBronze > 0 || chestKeys.keySilver > 0 || chestKeys.keyGold > 0) && (
              <div className="flex items-center gap-1 bg-amber-900/30 px-2 py-1 rounded text-xs">
                {chestKeys.keyWooden > 0 && <span title="Wooden Keys">🗝️{chestKeys.keyWooden}</span>}
                {chestKeys.keyBronze > 0 && <span title="Bronze Keys">🔑{chestKeys.keyBronze}</span>}
                {chestKeys.keySilver > 0 && <span title="Silver Keys">🔐{chestKeys.keySilver}</span>}
                {chestKeys.keyGold > 0 && <span title="Gold Keys">🏆{chestKeys.keyGold}</span>}
              </div>
            )}
            <div className="flex items-center gap-1 bg-purple-500/20 px-2 py-1 rounded">
              <Gem className="text-purple-400" size={14} />
              <span className="text-sm font-bold text-purple-400">{crystals}</span>
            </div>
          </div>
        </div>

        {/* Earnings Stats */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-black/30 rounded p-2 flex items-center gap-2">
            <Coins className="text-l2-gold" size={16} />
            <div>
              <div className="text-gray-500">{lang === 'ru' ? 'Всего золота' : 'Total Gold'}</div>
              <div className="text-l2-gold font-bold">{formatNumber(lootStats.totalGoldEarned)}</div>
            </div>
          </div>
          <div className="bg-black/30 rounded p-2">
            <div className="text-gray-500 mb-1">{lang === 'ru' ? 'Сундуки открыто' : 'Chests Opened'}</div>
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
            <span className="font-bold text-l2-gold">{lang === 'ru' ? 'Награды за босса' : 'Boss Rewards'}</span>
            <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full font-bold animate-pulse">
              {pendingRewards.length}
            </span>
          </div>

          <div className="space-y-2">
            {pendingRewards.map((reward) => {
              const isClaiming = claimingRewardId === reward.id;
              const freeSlots = Math.max(0, lootStats.chestSlots - chests.length);
              const noSlots = freeSlots === 0;

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
                            {lang === 'ru' ? 'Ранг' : 'Rank'}: #{reward.rank}
                            {reward.rank === 1 && <span className="ml-1 text-l2-gold">👑</span>}
                            {reward.rank === 2 && <span className="ml-1 text-gray-300">🥈</span>}
                            {reward.rank === 3 && <span className="ml-1 text-orange-400">🥉</span>}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => openRewardSelection(reward)}
                      disabled={isClaiming || noSlots}
                      className={`px-3 py-1.5 rounded-lg font-bold text-sm transition-all ${
                        isClaiming || noSlots
                          ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                          : 'bg-l2-gold text-black hover:brightness-110 active:scale-95'
                      }`}
                    >
                      {isClaiming ? '...' : noSlots ? (lang === 'ru' ? 'Нет слотов' : 'No slots') : (lang === 'ru' ? 'Забрать' : 'Claim')}
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
                        {reward.badgeId === 'slayer'
                          ? (lang === 'ru' ? '⚔️ Убийца' : '⚔️ Slayer')
                          : (lang === 'ru' ? '🏆 Элита' : '🏆 Elite')} ({reward.badgeDuration}{lang === 'ru' ? 'д' : 'd'})
                      </span>
                    )}
                    {reward.lotteryTickets > 0 && (
                      <span className="bg-yellow-500/30 px-2 py-0.5 rounded text-yellow-300">
                        {reward.lotteryTickets}🎟️
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
          <span className="text-xs text-gray-400">{lang === 'ru' ? 'Ячейки сундуков' : 'Chest Slots'}</span>
          <span className="text-xs text-gray-500">{chests.length}/{unlockedSlots} {lang === 'ru' ? 'занято' : 'filled'}</span>
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
            const remaining = Math.max(0, chest.openingDuration - elapsed);
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
            {lang === 'ru' ? '⏳ Открывается сундук... Другие открыть нельзя' : '⏳ Opening a chest... Others cannot be opened'}
          </div>
        )}

        {chests.length >= unlockedSlots && (
          <div className="mt-3 bg-red-500/10 border border-red-500/30 rounded-lg p-2 text-xs text-red-400 text-center">
            {lang === 'ru' ? '⚠️ Все ячейки заняты! Откройте или удалите сундук, чтобы получить новый' : '⚠️ All slots are full! Open or delete a chest to receive a new one'}
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
                const remaining = Math.max(0, selectedChest.openingDuration - elapsed);
                const isReady = isOpening && remaining <= 0;

                if (isReady) {
                  return <div className="text-l2-gold text-sm mt-1">{lang === 'ru' ? 'Готов к открытию!' : 'Ready to open!'}</div>;
                } else if (isOpening) {
                  return (
                    <div className="text-gray-400 text-sm mt-1">
                      {lang === 'ru' ? 'Осталось: ' : 'Remaining: '}{formatTime(remaining)}
                    </div>
                  );
                } else {
                  return (
                    <div className="text-gray-500 text-sm mt-1">
                      {lang === 'ru' ? 'Время открытия: ' : 'Opening time: '}{formatTime(selectedChest.openingDuration)}
                    </div>
                  );
                }
              })()}
            </div>

            {/* Drop rates info (matching TZ exactly) */}
            <div className="bg-black/30 rounded-lg p-2 mb-3 text-xs">
              <div className="text-gray-500 mb-1">{lang === 'ru' ? 'Возможный дроп:' : 'Possible drop:'}</div>
              {selectedChest.chestType === 'WOODEN' && (
                <div className="text-gray-400 space-y-0.5">
                  <div>💰 1,000 {lang === 'ru' ? 'золота' : 'gold'}</div>
                  <div><span className="text-gray-300">50%</span> {lang === 'ru' ? 'Обычная экипировка' : 'Common equipment'}</div>
                  <div><span className="text-green-400">7%</span> {lang === 'ru' ? 'Необычная экипировка' : 'Uncommon equipment'}</div>
                  <div><span className="text-blue-400">3%</span> {lang === 'ru' ? 'Свиток заточки +1' : 'Enchant Scroll +1'}</div>
                </div>
              )}
              {selectedChest.chestType === 'BRONZE' && (
                <div className="text-gray-400 space-y-0.5">
                  <div>💰 3,000 {lang === 'ru' ? 'золота' : 'gold'}</div>
                  <div><span className="text-gray-300">60%</span> {lang === 'ru' ? 'Обычная экипировка' : 'Common equipment'}</div>
                  <div><span className="text-green-400">20%</span> {lang === 'ru' ? 'Необычная экипировка' : 'Uncommon equipment'}</div>
                  <div><span className="text-purple-400">3%</span> {lang === 'ru' ? 'Редкая экипировка' : 'Rare equipment'}</div>
                  <div><span className="text-blue-400">15%</span> {lang === 'ru' ? 'Свиток заточки +1' : 'Enchant Scroll +1'}</div>
                </div>
              )}
              {selectedChest.chestType === 'SILVER' && (
                <div className="text-gray-400 space-y-0.5">
                  <div>💰 8,000 {lang === 'ru' ? 'золота' : 'gold'}</div>
                  <div><span className="text-green-400">40%</span> {lang === 'ru' ? 'Необычная экипировка' : 'Uncommon equipment'}</div>
                  <div><span className="text-purple-400">10%</span> {lang === 'ru' ? 'Редкая экипировка' : 'Rare equipment'}</div>
                  <div><span className="text-orange-400">1%</span> {lang === 'ru' ? 'Эпическая экипировка' : 'Epic equipment'}</div>
                  <div><span className="text-blue-400">25%</span> {lang === 'ru' ? 'Свитки заточки +1-5' : 'Enchant Scrolls +1-5'}</div>
                </div>
              )}
              {selectedChest.chestType === 'GOLD' && (
                <div className="text-gray-400 space-y-0.5">
                  <div>💰 20,000 {lang === 'ru' ? 'золота' : 'gold'}</div>
                  <div><span className="text-purple-400">15%</span> {lang === 'ru' ? 'Редкая экипировка' : 'Rare equipment'}</div>
                  <div><span className="text-orange-400">3%</span> {lang === 'ru' ? 'Эпическая экипировка' : 'Epic equipment'}</div>
                  <div><span className="text-blue-400">45%</span> {lang === 'ru' ? 'Свитки заточки +1-5' : 'Enchant Scrolls +1-5'}</div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              {(() => {
                const isOpening = selectedChest.openingStarted !== null;
                const elapsed = isOpening ? now - selectedChest.openingStarted! : 0;
                const remaining = Math.max(0, selectedChest.openingDuration - elapsed);
                const isReady = isOpening && remaining <= 0;
                const canOpen = !openingChest || openingChest.id === selectedChest.id;
                const progressPercent = Math.min(100, (elapsed / selectedChest.openingDuration) * 100);

                if (isReady) {
                  return (
                    <button
                      onClick={() => {
                        claimChest(selectedChest.id);
                        setSelectedChest(null);
                      }}
                      className="w-full py-3 bg-l2-gold text-black font-bold rounded-lg text-sm"
                    >
                      ✨ {lang === 'ru' ? 'Забрать награду' : 'Claim Reward'}
                    </button>
                  );
                } else if (isOpening) {
                  return (
                    <>
                      <div className="py-3 bg-black/30 rounded-lg text-center">
                        <div className="text-sm text-gray-400">
                          {lang === 'ru' ? 'Открывается...' : 'Opening...'}
                        </div>
                        <div className="w-full h-2 bg-black/50 rounded-full mt-2 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all bg-l2-gold"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                      </div>
                      {/* Boost button */}
                      <button
                        onClick={() => boostChest(selectedChest.id)}
                        disabled={crystals < BOOST_COST}
                        className={`w-full py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 ${
                          crystals >= BOOST_COST
                            ? 'bg-purple-500/30 text-purple-300 hover:bg-purple-500/50 border border-purple-500/50'
                            : 'bg-gray-700/30 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        <span>⚡</span>
                        <span>{lang === 'ru' ? 'Ускорить 30 мин' : 'Boost 30 min'}</span>
                        <span className="flex items-center gap-1">
                          <Gem size={14} className="text-cyan-400" />
                          {BOOST_COST}
                        </span>
                      </button>
                      {/* Use key to instantly complete */}
                      {(() => {
                        const keyCount = getKeyForChest(selectedChest.chestType);
                        const isLoading = usingKey === selectedChest.id;
                        return (
                          <button
                            onClick={() => openWithKey(selectedChest.id)}
                            disabled={keyCount < 1 || isLoading}
                            className={`w-full py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 ${
                              isLoading
                                ? 'bg-amber-500/50 text-amber-200 border border-amber-500/50 cursor-wait'
                                : keyCount >= 1
                                  ? 'bg-amber-500/30 text-amber-300 hover:bg-amber-500/50 border border-amber-500/50'
                                  : 'bg-gray-700/30 text-gray-500 cursor-not-allowed'
                            }`}
                          >
                            {isLoading ? (
                              <>
                                <span className="animate-spin">⏳</span>
                                <span>{lang === 'ru' ? 'Открываем...' : 'Opening...'}</span>
                              </>
                            ) : (
                              <>
                                <span>{KEY_ICONS[selectedChest.chestType]}</span>
                                <span>{lang === 'ru' ? 'Открыть ключом' : 'Use Key'}</span>
                                <span className="text-xs text-gray-400">({keyCount})</span>
                              </>
                            )}
                          </button>
                        );
                      })()}
                    </>
                  );
                } else {
                  const keyCount = getKeyForChest(selectedChest.chestType);
                  return (
                    <>
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
                        {canOpen
                          ? (lang === 'ru' ? '🔓 Начать открытие' : '🔓 Start Opening')
                          : (lang === 'ru' ? '⏳ Другой сундук открывается' : '⏳ Another chest is opening')}
                      </button>
                      {/* Use key to instantly open */}
                      {(() => {
                        const isLoading = usingKey === selectedChest.id;
                        return (
                          <button
                            onClick={() => openWithKey(selectedChest.id)}
                            disabled={keyCount < 1 || isLoading}
                            className={`w-full py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 ${
                              isLoading
                                ? 'bg-amber-500/50 text-amber-200 border border-amber-500/50 cursor-wait'
                                : keyCount >= 1
                                  ? 'bg-amber-500/30 text-amber-300 hover:bg-amber-500/50 border border-amber-500/50'
                                  : 'bg-gray-700/30 text-gray-500 cursor-not-allowed'
                            }`}
                          >
                            {isLoading ? (
                              <>
                                <span className="animate-spin">⏳</span>
                                <span>{lang === 'ru' ? 'Открываем...' : 'Opening...'}</span>
                              </>
                            ) : (
                              <>
                                <span>{KEY_ICONS[selectedChest.chestType]}</span>
                                <span>{lang === 'ru' ? 'Открыть ключом' : 'Use Key'}</span>
                                <span className="text-xs text-gray-400">({keyCount})</span>
                              </>
                            )}
                          </button>
                        );
                      })()}
                    </>
                  );
                }
              })()}

              <button
                onClick={() => deleteChest(selectedChest.id)}
                className="w-full py-2 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30"
              >
                {lang === 'ru' ? '🗑️ Удалить сундук' : '🗑️ Delete Chest'}
              </button>

              <button
                onClick={() => setSelectedChest(null)}
                className="w-full py-2 bg-black/30 text-gray-400 rounded-lg text-sm hover:bg-black/40"
              >
                {lang === 'ru' ? 'Закрыть' : 'Close'}
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
              <h3 className="text-lg font-bold text-white">{lang === 'ru' ? 'Ячейка заблокирована' : 'Slot Locked'}</h3>
              <button onClick={() => setSelectedLockedSlot(null)} className="text-gray-400">
                <X size={20} />
              </button>
            </div>

            <div className="text-center mb-4">
              <Lock className="mx-auto text-purple-400 mb-2" size={40} />
              <p className="text-gray-400 text-sm">
                {lang === 'ru' ? 'Разблокируйте дополнительную ячейку для хранения сундуков' : 'Unlock an additional slot for storing chests'}
              </p>
            </div>

            <div className="bg-black/30 rounded-lg p-3 mb-4">
              <div className="flex items-center justify-center gap-2">
                <Gem className="text-purple-400" size={20} />
                <span className="text-xl font-bold text-purple-400">{SLOT_UNLOCK_COST}</span>
                <span className="text-gray-400">{lang === 'ru' ? 'кристаллов' : 'crystals'}</span>
              </div>
              <div className="text-center text-xs text-gray-500 mt-1">
                {lang === 'ru' ? `У вас: ${crystals} кристаллов` : `You have: ${crystals} crystals`}
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
              {crystals >= SLOT_UNLOCK_COST
                ? (lang === 'ru' ? '🔓 Разблокировать' : '🔓 Unlock')
                : (lang === 'ru' ? '❌ Недостаточно кристаллов' : '❌ Not enough crystals')}
            </button>
          </div>
        </div>
      )}

      {/* REWARD SELECTION POPUP */}
      {selectedReward && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-gradient-to-b from-gray-800 to-gray-900 rounded-xl w-full max-w-sm border border-l2-gold/30">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <div className="flex items-center gap-2">
                <span className="text-xl">{selectedReward.bossIcon}</span>
                <span className="font-bold text-l2-gold">{lang === 'ru' ? 'Выбор наград' : 'Select Rewards'}</span>
              </div>
              <button onClick={() => setSelectedReward(null)} className="p-1 hover:bg-gray-700 rounded">
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            {/* Free slots info */}
            <div className="px-4 py-2 bg-black/30 text-center text-sm">
              <span className="text-gray-400">{lang === 'ru' ? 'Свободных слотов:' : 'Free slots:'}</span>
              <span className="ml-2 text-l2-gold font-bold">{Math.max(0, lootStats.chestSlots - chests.length)}</span>
            </div>

            {/* Chest selection */}
            <div className="p-4 space-y-3">
              {[
                { key: 'gold' as const, icon: '🎁', label: 'Gold', color: 'text-yellow-400', max: selectedReward.chestsGold },
                { key: 'silver' as const, icon: '📦', label: 'Silver', color: 'text-gray-300', max: selectedReward.chestsSilver },
                { key: 'bronze' as const, icon: '📦', label: 'Bronze', color: 'text-orange-400', max: selectedReward.chestsBronze },
                { key: 'wooden' as const, icon: '🪵', label: 'Wooden', color: 'text-amber-600', max: selectedReward.chestsWooden },
              ].filter(c => c.max > 0).map(chest => (
                <div key={chest.key} className="flex items-center justify-between bg-black/30 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{chest.icon}</span>
                    <span className={`font-bold ${chest.color}`}>{chest.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setRewardSelection(prev => ({ ...prev, [chest.key]: Math.max(0, prev[chest.key] - 1) }))}
                      className="w-8 h-8 rounded bg-gray-700 hover:bg-gray-600 text-white font-bold"
                    >-</button>
                    <span className="w-8 text-center font-bold text-white">{rewardSelection[chest.key]}</span>
                    <button
                      onClick={() => setRewardSelection(prev => ({ ...prev, [chest.key]: Math.min(chest.max, prev[chest.key] + 1) }))}
                      className="w-8 h-8 rounded bg-gray-700 hover:bg-gray-600 text-white font-bold"
                    >+</button>
                    <span className="text-gray-500 text-sm">/ {chest.max}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Selected count warning */}
            {(() => {
              const totalSelected = rewardSelection.wooden + rewardSelection.bronze + rewardSelection.silver + rewardSelection.gold;
              const freeSlots = Math.max(0, lootStats.chestSlots - chests.length);
              const isOverLimit = totalSelected > freeSlots;
              return (
                <div className={`mx-4 mb-4 p-2 rounded text-center text-sm ${isOverLimit ? 'bg-red-900/50 text-red-400' : 'bg-black/30 text-gray-400'}`}>
                  {lang === 'ru' ? 'Выбрано:' : 'Selected:'} {totalSelected}
                  {isOverLimit && ` (${lang === 'ru' ? 'макс' : 'max'} ${freeSlots})`}
                </div>
              );
            })()}

            {/* Actions */}
            <div className="p-4 pt-0 flex gap-2">
              <button
                onClick={() => setSelectedReward(null)}
                className="flex-1 py-2 rounded-lg bg-gray-700 text-gray-300 font-bold text-sm hover:bg-gray-600"
              >
                {lang === 'ru' ? 'Отмена' : 'Cancel'}
              </button>
              <button
                onClick={confirmRewardClaim}
                disabled={(() => {
                  const total = rewardSelection.wooden + rewardSelection.bronze + rewardSelection.silver + rewardSelection.gold;
                  const free = Math.max(0, lootStats.chestSlots - chests.length);
                  return total === 0 || total > free;
                })()}
                className={`flex-1 py-2 rounded-lg font-bold text-sm ${
                  (() => {
                    const total = rewardSelection.wooden + rewardSelection.bronze + rewardSelection.silver + rewardSelection.gold;
                    const free = Math.max(0, lootStats.chestSlots - chests.length);
                    return total > 0 && total <= free;
                  })()
                    ? 'bg-l2-gold text-black hover:brightness-110'
                    : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                }`}
              >
                {lang === 'ru' ? 'Забрать' : 'Claim'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
