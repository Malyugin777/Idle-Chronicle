/**
 * Socket listener hooks - разбитые по категориям
 * Каждый хук регистрирует свою группу событий и возвращает cleanup
 */

import { Socket } from 'socket.io-client';
import { usePlayerStore } from '@/stores/playerStore';
import type {
  BossState,
  PlayerState,
  DamageFeedItem,
  VictoryData,
  PendingReward,
  SlotInfo,
  ActiveBuff,
  MeditationData,
  StarterItem,
  LoadingState,
} from '../types';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface AuthHandlers {
  setConnected: (v: boolean) => void;
  setPlayerState: React.Dispatch<React.SetStateAction<PlayerState>>;
  setAutoAttack: (v: boolean) => void;
  setAutoUseEther: (v: boolean) => void;
  setActiveBuffs: React.Dispatch<React.SetStateAction<ActiveBuff[]>>;
  setShowWelcome: (v: boolean) => void;
  setWelcomeStep: (v: number) => void;
  setMeditationData: (v: MeditationData | null) => void;
  setShowMeditation: (v: boolean) => void;
  setLoadingState: React.Dispatch<React.SetStateAction<LoadingState>>;
  meditationShownRef: React.MutableRefObject<boolean>;
  doAuth: () => void;
}

export interface BossHandlers {
  setPlayersOnline: (v: number) => void;
  setBossState: React.Dispatch<React.SetStateAction<BossState>>;
  setVictoryData: (v: VictoryData | null) => void;
  setRespawnCountdown: (v: number) => void;
  setSessionDamage: (v: number) => void;
  setSessionClicks: (v: number) => void;
  setCurrentRank: (v: number) => void;
  setPendingRewards: React.Dispatch<React.SetStateAction<PendingReward[]>>;
  setClaimError: (v: string | null) => void;
  setActivityStatus: (v: { time: number; eligible: boolean }) => void;
  setLoadingState: React.Dispatch<React.SetStateAction<LoadingState>>;
  currentBossImageRef: React.MutableRefObject<string>;
  sceneRef: React.MutableRefObject<any>;
}

export interface CombatHandlers {
  setSessionDamage: (v: number) => void;
  setSessionClicks: (v: number) => void;
  setCurrentRank: (v: number) => void;
  setPlayerState: React.Dispatch<React.SetStateAction<PlayerState>>;
  setDamageFeed: React.Dispatch<React.SetStateAction<DamageFeedItem[]>>;
  setActiveBuffs: React.Dispatch<React.SetStateAction<ActiveBuff[]>>;
  getTaskManager: () => any;
}

export interface RewardsHandlers {
  setPendingRewards: React.Dispatch<React.SetStateAction<PendingReward[]>>;
  setSlotInfo: React.Dispatch<React.SetStateAction<SlotInfo>>;
  setChestSelection: React.Dispatch<React.SetStateAction<{ wooden: number; bronze: number; silver: number; gold: number }>>;
  setClaimingReward: (v: boolean) => void;
  setBuyingSlot: (v: boolean) => void;
  setClaimError: (v: string | null) => void;
  setPlayerState: React.Dispatch<React.SetStateAction<PlayerState>>;
  setAutoUseEther: (v: boolean) => void;
  setShowMeditation: (v: boolean) => void;
}

export interface StarterHandlers {
  setStarterItems: (v: StarterItem[]) => void;
  setStarterOpening: (v: boolean) => void;
}

export interface MiscHandlers {
  setPlayerState: React.Dispatch<React.SetStateAction<PlayerState>>;
  setAutoAttack: (v: boolean) => void;
  setActivityStatus: (v: { time: number; eligible: boolean }) => void;
}

// ═══════════════════════════════════════════════════════════
// REGISTER: AUTH & CONNECTION
// ═══════════════════════════════════════════════════════════

export function registerAuthListeners(
  socket: Socket,
  handlers: AuthHandlers
): () => void {
  const {
    setConnected,
    setPlayerState,
    setAutoAttack,
    setAutoUseEther,
    setActiveBuffs,
    setShowWelcome,
    setWelcomeStep,
    setMeditationData,
    setShowMeditation,
    setLoadingState,
    meditationShownRef,
    doAuth,
  } = handlers;

  const onConnect = () => {
    setConnected(true);
    doAuth();
  };

  const onDisconnect = () => {
    setConnected(false);
  };

  const onSessionKicked = (data: { reason: string }) => {
    alert(data.reason);
    window.location.reload();
  };

  const onAuthSuccess = (data: any) => {
    console.log('[Auth] Success! isFirstLogin:', data.isFirstLogin);
    if (data.isFirstLogin) {
      console.log('[Welcome] Showing welcome carousel');
      setShowWelcome(true);
      setWelcomeStep(0);
    }
    // Set player state from auth data
    setPlayerState({
      stamina: data.stamina ?? 100,
      maxStamina: data.maxStamina ?? 100,
      mana: data.mana ?? 1000,
      maxMana: data.maxMana ?? 1000,
      exhaustedUntil: data.exhaustedUntil ?? null,
      gold: data.gold ?? 0,
      ether: data.ether ?? 0,
      etherDust: data.etherDust ?? 0,
      level: data.level ?? 1,
      crystals: data.ancientCoin ?? 0,
      photoUrl: data.photoUrl ?? null,
      firstName: data.firstName ?? '',
      skillFireball: data.skillFireball ?? 1,
      skillIceball: data.skillIceball ?? 0,
      skillLightning: data.skillLightning ?? 0,
      sp: data.sp ?? 0,
      ps: data.ps ?? 0,
      psCap: data.psCap ?? 24,
    });
    // v1.8.20: Initialize global Zustand store with auth data
    usePlayerStore.getState().setResources({
      gold: data.gold ?? 0,
      crystals: data.ancientCoin ?? 0,
      lotteryTickets: data.lotteryTickets ?? 0,
      ether: data.ether ?? 0,
      etherDust: data.etherDust ?? 0,
      enchantCharges: data.enchantCharges ?? 0,
      protectionCharges: data.protectionCharges ?? 0,
      potionHaste: data.potionHaste ?? 0,
      potionAcumen: data.potionAcumen ?? 0,
      potionLuck: data.potionLuck ?? 0,
      keyWooden: data.keyWooden ?? 0,
      keyBronze: data.keyBronze ?? 0,
      keySilver: data.keySilver ?? 0,
      keyGold: data.keyGold ?? 0,
      stamina: data.stamina ?? 100,
      maxStamina: data.maxStamina ?? 100,
      mana: data.mana ?? 1000,
      maxMana: data.maxMana ?? 1000,
      exhaustedUntil: data.exhaustedUntil ?? null,
      level: data.level ?? 1,
      exp: data.exp ?? 0,
      sp: data.sp ?? 0,
      ps: data.ps ?? 0,
      psCap: data.psCap ?? 24,
    });
    // Set auto-attack state from server
    setAutoAttack(data.autoAttack || false);
    // Sync autoEther from server
    const serverAutoEther = data.autoEther || false;
    setAutoUseEther(serverAutoEther);
    localStorage.setItem('ic_auto_ether', String(serverAutoEther));
    // Set active buffs
    if (data.activeBuffs && Array.isArray(data.activeBuffs)) {
      const now = Date.now();
      setActiveBuffs(data.activeBuffs.filter((b: ActiveBuff) => b.expiresAt > now));
    }
    // Show meditation modal only ONCE
    if (!meditationShownRef.current && data.offlineMinutes >= 5 && data.pendingDust > 0) {
      meditationShownRef.current = true;
      setMeditationData({
        pendingDust: data.pendingDust,
        offlineMinutes: data.offlineMinutes,
      });
      setShowMeditation(true);
    }
    // Mark auth and player data loaded
    setLoadingState(prev => ({ ...prev, auth: true, player: true }));
  };

  socket.on('connect', onConnect);
  socket.on('disconnect', onDisconnect);
  socket.on('session:kicked', onSessionKicked);
  socket.on('auth:success', onAuthSuccess);

  return () => {
    socket.off('connect', onConnect);
    socket.off('disconnect', onDisconnect);
    socket.off('session:kicked', onSessionKicked);
    socket.off('auth:success', onAuthSuccess);
  };
}

// ═══════════════════════════════════════════════════════════
// REGISTER: BOSS STATE
// ═══════════════════════════════════════════════════════════

export function registerBossListeners(
  socket: Socket,
  handlers: BossHandlers
): () => void {
  const {
    setPlayersOnline,
    setBossState,
    setVictoryData,
    setRespawnCountdown,
    setSessionDamage,
    setSessionClicks,
    setCurrentRank,
    setPendingRewards,
    setClaimError,
    setActivityStatus,
    setLoadingState,
    currentBossImageRef,
    sceneRef,
  } = handlers;

  const onBossState = (data: any) => {
    setPlayersOnline(data.playersOnline);
    const newImage = data.image || '/assets/bosses/boss_single.png';
    currentBossImageRef.current = newImage;
    setBossState(prev => {
      if (prev.image !== newImage && sceneRef.current) {
        sceneRef.current.updateBossImage(newImage);
      }
      return {
        name: data.name || 'Boss',
        nameRu: data.nameRu,
        icon: data.icon || '👹',
        image: newImage,
        hp: data.hp ?? 0,
        maxHp: data.maxHp ?? 1,
        defense: data.defense ?? 0,
        bossIndex: data.bossIndex || 1,
        totalBosses: data.totalBosses || 100,
      };
    });
    setLoadingState(prev => ({ ...prev, boss: true }));
  };

  const onBossKilled = (data: any) => {
    setVictoryData({
      bossName: data.bossName,
      bossIcon: data.bossIcon || '👹',
      finalBlowBy: data.finalBlowBy,
      topDamageBy: data.topDamageBy,
      respawnAt: data.respawnAt,
    });
    const updateCountdown = () => {
      const remaining = Math.max(0, data.respawnAt - Date.now());
      setRespawnCountdown(remaining);
      if (remaining > 0) setTimeout(updateCountdown, 1000);
    };
    updateCountdown();
    socket.emit('rewards:get');
  };

  const onBossRespawn = (data: any) => {
    setSessionDamage(0);
    setSessionClicks(0);
    setCurrentRank(0);
    setVictoryData(null);
    setRespawnCountdown(0);
    setPendingRewards([]);
    setClaimError(null);
    setActivityStatus({ time: 0, eligible: false });
    if (data) {
      const newImage = data.image || '/assets/bosses/boss_single.png';
      currentBossImageRef.current = newImage;
      setBossState(prev => {
        if (prev.image !== newImage && sceneRef.current) {
          sceneRef.current.updateBossImage(newImage);
        }
        return {
          name: data.name || prev.name,
          nameRu: data.nameRu || prev.nameRu,
          icon: data.icon || prev.icon,
          image: newImage,
          hp: data.hp || data.maxHp || prev.maxHp,
          maxHp: data.maxHp || prev.maxHp,
          defense: data.defense ?? 0,
          bossIndex: data.bossIndex || prev.bossIndex,
          totalBosses: data.totalBosses || prev.totalBosses,
        };
      });
    }
  };

  socket.on('boss:state', onBossState);
  socket.on('boss:killed', onBossKilled);
  socket.on('boss:respawn', onBossRespawn);

  return () => {
    socket.off('boss:state', onBossState);
    socket.off('boss:killed', onBossKilled);
    socket.off('boss:respawn', onBossRespawn);
  };
}

// ═══════════════════════════════════════════════════════════
// REGISTER: COMBAT (tap, skill, damage feed)
// ═══════════════════════════════════════════════════════════

export function registerCombatListeners(
  socket: Socket,
  handlers: CombatHandlers
): () => void {
  const {
    setSessionDamage,
    setSessionClicks,
    setCurrentRank,
    setPlayerState,
    setDamageFeed,
    setActiveBuffs,
    getTaskManager,
  } = handlers;

  const onTapResult = (data: any) => {
    setSessionDamage(data.sessionDamage || 0);
    setSessionClicks(data.sessionClicks || 0);
    setCurrentRank(data.currentRank || 0);
    setPlayerState(p => ({
      ...p,
      stamina: data.stamina ?? p.stamina,
      maxStamina: data.maxStamina ?? p.maxStamina,
      gold: data.gold ?? p.gold,
      ether: data.ether ?? p.ether,
      ps: data.ps ?? p.ps,
      psCap: data.psCap ?? p.psCap,
    }));
    if (data.damage > 0) {
      const tm = getTaskManager();
      tm.recordTap(data.tapCount || 1);
      tm.recordDamage(data.damage);
    }
  };

  const onAutoAttackResult = (data: any) => {
    setSessionDamage(data.sessionDamage || 0);
    setPlayerState(p => ({
      ...p,
      gold: data.gold ?? p.gold,
      ether: data.ether ?? p.ether,
      stamina: data.stamina ?? p.stamina,
    }));
    if (data.damage > 0) {
      getTaskManager().recordDamage(data.damage);
    }
  };

  const onSkillResult = (data: any) => {
    setPlayerState(p => ({
      ...p,
      mana: data.mana ?? p.mana,
      maxMana: data.maxMana ?? p.maxMana,
      gold: data.gold ?? p.gold,
    }));
    getTaskManager().recordSkillCast();
    if (data.damage > 0) {
      getTaskManager().recordDamage(data.damage);
    }
  };

  const onDamageFeed = (data: { playerName: string; damage: number; isCrit: boolean }) => {
    setDamageFeed(prev => [
      { ...data, timestamp: Date.now() },
      ...prev.slice(0, 4),
    ]);
  };

  const onBuffSuccess = (data: { buffId: string; expiresAt: number }) => {
    setActiveBuffs(prev => {
      const filtered = prev.filter(b => b.type !== data.buffId);
      const buffValues: Record<string, number> = { haste: 0.3, acumen: 0.5, luck: 0.1 };
      return [...filtered, {
        type: data.buffId as ActiveBuff['type'],
        value: buffValues[data.buffId] || 0,
        expiresAt: data.expiresAt,
      }];
    });
  };

  socket.on('tap:result', onTapResult);
  socket.on('autoAttack:result', onAutoAttackResult);
  socket.on('skill:result', onSkillResult);
  socket.on('damage:feed', onDamageFeed);
  socket.on('buff:success', onBuffSuccess);

  return () => {
    socket.off('tap:result', onTapResult);
    socket.off('autoAttack:result', onAutoAttackResult);
    socket.off('skill:result', onSkillResult);
    socket.off('damage:feed', onDamageFeed);
    socket.off('buff:success', onBuffSuccess);
  };
}

// ═══════════════════════════════════════════════════════════
// REGISTER: PLAYER STATE UPDATES
// ═══════════════════════════════════════════════════════════

export function registerPlayerListeners(
  socket: Socket,
  handlers: {
    setPlayerState: React.Dispatch<React.SetStateAction<PlayerState>>;
    setSessionDamage: (v: number) => void;
  }
): () => void {
  const { setPlayerState, setSessionDamage } = handlers;
  const { setResources } = usePlayerStore.getState();

  const onPlayerState = (data: any) => {
    // Update local React state
    setPlayerState(p => ({
      ...p,
      stamina: data.stamina ?? p.stamina,
      maxStamina: data.maxStamina ?? p.maxStamina,
      mana: data.mana ?? p.mana,
      maxMana: data.maxMana ?? p.maxMana,
      exhaustedUntil: data.exhaustedUntil ?? p.exhaustedUntil,
      gold: data.gold ?? p.gold,
      crystals: data.ancientCoin ?? p.crystals,
    }));

    // v1.8.20: Update global Zustand store for cross-tab sync
    const storeUpdate: Record<string, any> = {};
    if (data.stamina !== undefined) storeUpdate.stamina = data.stamina;
    if (data.maxStamina !== undefined) storeUpdate.maxStamina = data.maxStamina;
    if (data.mana !== undefined) storeUpdate.mana = data.mana;
    if (data.maxMana !== undefined) storeUpdate.maxMana = data.maxMana;
    if (data.exhaustedUntil !== undefined) storeUpdate.exhaustedUntil = data.exhaustedUntil;
    if (data.gold !== undefined) storeUpdate.gold = data.gold;
    if (data.ancientCoin !== undefined) storeUpdate.crystals = data.ancientCoin;
    if (data.lotteryTickets !== undefined) storeUpdate.lotteryTickets = data.lotteryTickets;
    if (data.enchantCharges !== undefined) storeUpdate.enchantCharges = data.enchantCharges;
    if (data.protectionCharges !== undefined) storeUpdate.protectionCharges = data.protectionCharges;
    if (Object.keys(storeUpdate).length > 0) {
      setResources(storeUpdate);
    }
  };

  const onPlayerData = (data: any) => {
    if (data?.sessionDamage !== undefined) {
      setSessionDamage(data.sessionDamage);
    }
    if (data?.stamina !== undefined) {
      setPlayerState(p => ({
        ...p,
        stamina: data.stamina ?? p.stamina,
        maxStamina: data.maxStamina ?? p.maxStamina,
        mana: data.mana ?? p.mana,
        maxMana: data.maxMana ?? p.maxMana,
        ether: data.ether ?? p.ether,
      }));
      // Update Zustand store
      setResources({
        stamina: data.stamina,
        maxStamina: data.maxStamina,
        mana: data.mana,
        maxMana: data.maxMana,
        ether: data.ether,
      });
    }
  };

  socket.on('player:state', onPlayerState);
  socket.on('player:data', onPlayerData);

  return () => {
    socket.off('player:state', onPlayerState);
    socket.off('player:data', onPlayerData);
  };
}

// ═══════════════════════════════════════════════════════════
// REGISTER: REWARDS & TREASURY
// ═══════════════════════════════════════════════════════════

export function registerRewardsListeners(
  socket: Socket,
  handlers: RewardsHandlers
): () => void {
  const {
    setPendingRewards,
    setSlotInfo,
    setChestSelection,
    setClaimingReward,
    setBuyingSlot,
    setClaimError,
    setPlayerState,
    setAutoUseEther,
    setShowMeditation,
  } = handlers;

  const onRewardsData = (data: any) => {
    if (data?.rewards) {
      setPendingRewards(data.rewards);
      setChestSelection({ wooden: 0, bronze: 0, silver: 0, gold: 0 });
    }
    if (data?.slots) {
      setSlotInfo(data.slots);
    }
  };

  const onRewardsClaimed = (data: any) => {
    setClaimingReward(false);
    setClaimError(null);
    setPendingRewards(prev => prev.filter(r => r.id !== data.rewardId));
    if (data?.chestsCreated) {
      setSlotInfo(prev => ({ ...prev, used: prev.used + data.chestsCreated, free: prev.free - data.chestsCreated }));
    }
    setChestSelection({ wooden: 0, bronze: 0, silver: 0, gold: 0 });
    if (data?.crystalsAwarded > 0) {
      setPlayerState(p => ({ ...p, crystals: p.crystals + data.crystalsAwarded }));
    }
  };

  const onRewardsError = (data: any) => {
    setClaimingReward(false);
    setClaimError(data?.message || 'Ошибка получения награды');
  };

  const onChestBuySlotSuccess = (data: any) => {
    setBuyingSlot(false);
    setSlotInfo(prev => ({
      ...prev,
      max: data.newSlots,
      free: prev.free + 1,
      nextPrice: data.nextPrice,
      crystals: data.crystalsRemaining,
    }));
    setPlayerState(p => ({ ...p, crystals: data.crystalsRemaining }));
  };

  const onChestBuySlotError = () => {
    setBuyingSlot(false);
  };

  const onShopSuccess = (data: { gold?: number; ether?: number }) => {
    setPlayerState(p => ({
      ...p,
      gold: data.gold ?? p.gold,
      ether: data.ether ?? p.ether,
    }));
  };

  const onEtherToggleAck = (data: { enabled: boolean; ether: number }) => {
    setAutoUseEther(data.enabled);
    localStorage.setItem('ic_auto_ether', String(data.enabled));
    setPlayerState(p => ({ ...p, ether: data.ether }));
  };

  const onEtherCraftSuccess = (data: { ether: number; etherDust: number; gold: number }) => {
    setPlayerState(p => ({
      ...p,
      ether: data.ether,
      etherDust: data.etherDust,
      gold: data.gold,
    }));
  };

  const onMeditationCollected = (data: { etherDust: number }) => {
    setPlayerState(p => ({ ...p, etherDust: data.etherDust }));
  };

  socket.on('rewards:data', onRewardsData);
  socket.on('rewards:claimed', onRewardsClaimed);
  socket.on('rewards:error', onRewardsError);
  socket.on('chest:buySlot:success', onChestBuySlotSuccess);
  socket.on('chest:buySlot:error', onChestBuySlotError);
  socket.on('shop:success', onShopSuccess);
  socket.on('ether:toggle:ack', onEtherToggleAck);
  socket.on('ether:craft:success', onEtherCraftSuccess);
  socket.on('meditation:collected', onMeditationCollected);

  return () => {
    socket.off('rewards:data', onRewardsData);
    socket.off('rewards:claimed', onRewardsClaimed);
    socket.off('rewards:error', onRewardsError);
    socket.off('chest:buySlot:success', onChestBuySlotSuccess);
    socket.off('chest:buySlot:error', onChestBuySlotError);
    socket.off('shop:success', onShopSuccess);
    socket.off('ether:toggle:ack', onEtherToggleAck);
    socket.off('ether:craft:success', onEtherCraftSuccess);
    socket.off('meditation:collected', onMeditationCollected);
  };
}

// ═══════════════════════════════════════════════════════════
// REGISTER: STARTER PACK
// ═══════════════════════════════════════════════════════════

export function registerStarterListeners(
  socket: Socket,
  handlers: StarterHandlers
): () => void {
  const { setStarterItems, setStarterOpening } = handlers;

  const onStarterOpened = (data: { equipment: StarterItem[] }) => {
    console.log('[Starter] Opened:', data.equipment);
    setStarterItems(data.equipment);
    setStarterOpening(false);
  };

  const onStarterError = (data: { message: string }) => {
    console.error('[Starter] Error:', data.message);
    setStarterOpening(false);
    if (data.message.includes('Already')) {
      setStarterItems([{ name: 'Уже получено', icon: '✅', slot: 'INFO' }]);
    }
  };

  socket.on('starter:opened', onStarterOpened);
  socket.on('starter:error', onStarterError);

  return () => {
    socket.off('starter:opened', onStarterOpened);
    socket.off('starter:error', onStarterError);
  };
}

// ═══════════════════════════════════════════════════════════
// REGISTER: MISC (exhaustion, level up, activity, auto-attack)
// ═══════════════════════════════════════════════════════════

export function registerMiscListeners(
  socket: Socket,
  handlers: MiscHandlers
): () => void {
  const { setPlayerState, setAutoAttack, setActivityStatus } = handlers;

  const onHeroExhausted = (data: { until: number; duration: number }) => {
    setPlayerState(p => ({ ...p, exhaustedUntil: data.until, stamina: 0 }));
    setTimeout(() => {
      setPlayerState(p => ({ ...p, exhaustedUntil: null }));
    }, data.duration);
  };

  const onLevelUp = (data: {
    level: number;
    exp: number;
    sp: number;
    skillFireball: number;
    skillIceball: number;
    skillLightning: number;
  }) => {
    console.log('[Level] Level up!', data);
    setPlayerState(p => ({
      ...p,
      level: data.level,
      sp: data.sp,
      skillFireball: data.skillFireball,
      skillIceball: data.skillIceball,
      skillLightning: data.skillLightning,
    }));
  };

  const onActivityStatus = (data: { activityTime: number; isEligible: boolean }) => {
    setActivityStatus({ time: data.activityTime, eligible: data.isEligible });
  };

  const onAutoAttackToggleAck = (data: { enabled: boolean }) => {
    setAutoAttack(data.enabled);
  };

  socket.on('hero:exhausted', onHeroExhausted);
  socket.on('level:up', onLevelUp);
  socket.on('activity:status', onActivityStatus);
  socket.on('autoAttack:toggle:ack', onAutoAttackToggleAck);

  return () => {
    socket.off('hero:exhausted', onHeroExhausted);
    socket.off('level:up', onLevelUp);
    socket.off('activity:status', onActivityStatus);
    socket.off('autoAttack:toggle:ack', onAutoAttackToggleAck);
  };
}
