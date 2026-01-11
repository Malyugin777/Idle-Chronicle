'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Phaser from 'phaser';
import { Gem, Hammer, Sparkles } from 'lucide-react';
import { gameConfig } from '@/game/config';
import { BattleScene } from '@/game/scenes/BattleScene';
import { getSocket } from '@/lib/socket';
import { detectLanguage, useTranslation, Language } from '@/lib/i18n';
import { getTaskManager } from '@/lib/taskManager';
import TasksModal from './TasksModal';
import ForgeModal from './ForgeModal';
import EnchantModal from './EnchantModal';

// ═══════════════════════════════════════════════════════════
// Extracted types and components
// ═══════════════════════════════════════════════════════════
import type {
  BossState,
  PlayerState,
  Skill,
  DamageFeedItem,
  VictoryData,
  PendingReward,
  SlotInfo,
  ChestSelection,
  ActiveBuff,
  MeditationData,
  StarterItem,
  LoadingState,
} from './types';
import {
  APP_VERSION,
  SKILLS,
  COOLDOWNS_KEY,
  INITIAL_BOSS_STATE,
  INITIAL_PLAYER_STATE,
  INITIAL_SLOT_INFO,
  formatCompact,
} from './constants';
import { TopHUD, SkillBar, LoadingScreen } from './ui';

export default function PhaserGame() {
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<BattleScene | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // FIX: Store current boss image to apply when scene becomes ready
  const currentBossImageRef = useRef<string>('/assets/bosses/boss_single.png');

  // Language
  const [lang, setLang] = useState<Language>('en');
  const t = useTranslation(lang);

  // Connection
  const [connected, setConnected] = useState(false);
  const [playersOnline, setPlayersOnline] = useState(0);

  // Boss - initial values 0 so bars show 0% until real data arrives
  const [bossState, setBossState] = useState<BossState>(INITIAL_BOSS_STATE);

  // Player - initial values 0 so bars show 0% until real data arrives
  const [playerState, setPlayerState] = useState<PlayerState>(INITIAL_PLAYER_STATE);

  // Ether auto-use toggle (persisted in localStorage)
  const [autoUseEther, setAutoUseEther] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('ic_auto_ether') === 'true';
    }
    return false;
  });

  // Auto-attack toggle (Smart Auto-Hunt)
  const [autoAttack, setAutoAttack] = useState<boolean>(false);

  // Meditation modal (only show once per session)
  const [meditationData, setMeditationData] = useState<MeditationData | null>(null);
  const [showMeditation, setShowMeditation] = useState(false);
  const meditationShownRef = useRef(false);

  // Skills
  const [skills, setSkills] = useState<Skill[]>(() => {
    // Restore cooldowns from storage
    try {
      const stored = sessionStorage.getItem(COOLDOWNS_KEY);
      if (stored) {
        const cooldowns = JSON.parse(stored);
        return SKILLS.map(s => ({ ...s, lastUsed: cooldowns[s.id] || 0 }));
      }
    } catch {}
    return [...SKILLS];
  });

  // Damage feed
  const [damageFeed, setDamageFeed] = useState<DamageFeedItem[]>([]);

  // Session
  const [sessionDamage, setSessionDamage] = useState(0);
  const [sessionClicks, setSessionClicks] = useState(0);
  const [currentRank, setCurrentRank] = useState(0);

  // Resource feedback flash (for insufficient resources)
  const [staminaFlash, setStaminaFlash] = useState(false);
  const [manaFlash, setManaFlash] = useState(false);

  // Debug: triple tap counter
  const tapCountRef = useRef(0);
  const lastTapTimeRef = useRef(0);

  // Overlays
  const [victoryData, setVictoryData] = useState<VictoryData | null>(null);
  const [respawnCountdown, setRespawnCountdown] = useState(0);
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeStep, setWelcomeStep] = useState(0); // 0, 1, 2, 3 for 4-screen carousel
  const [starterItems, setStarterItems] = useState<StarterItem[]>([]);
  const [starterOpening, setStarterOpening] = useState(false);
  const [showDropTable, setShowDropTable] = useState(false);
  const [pendingRewards, setPendingRewards] = useState<PendingReward[]>([]);
  const [slotInfo, setSlotInfo] = useState<SlotInfo>(INITIAL_SLOT_INFO);
  const [chestSelection, setChestSelection] = useState<ChestSelection>({ wooden: 0, bronze: 0, silver: 0, gold: 0 });
  const [claimingReward, setClaimingReward] = useState(false);
  const [buyingSlot, setBuyingSlot] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [activityStatus, setActivityStatus] = useState<{ time: number; eligible: boolean }>({ time: 0, eligible: false });
  const [pressedSkill, setPressedSkill] = useState<string | null>(null);
  const [activeBuffs, setActiveBuffs] = useState<ActiveBuff[]>([]);
  const [showTasks, setShowTasks] = useState(false);
  const [showForge, setShowForge] = useState(false);
  const [showEnchant, setShowEnchant] = useState(false);
  const [hasClaimable, setHasClaimable] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [serverUptime, setServerUptime] = useState<string>('');

  // Loading screen state (show until all data received)
  const [loadingState, setLoadingState] = useState({
    auth: false,
    boss: false,
    player: false,
  });
  const isLoading = !loadingState.auth || !loadingState.boss || !loadingState.player;

  // Check exhaustion
  const isExhausted = useCallback(() => {
    return playerState.exhaustedUntil !== null && Date.now() < playerState.exhaustedUntil;
  }, [playerState.exhaustedUntil]);

  // Toggle auto-use ether
  const toggleAutoEther = useCallback(() => {
    setAutoUseEther(prev => {
      const newValue = !prev;
      localStorage.setItem('ic_auto_ether', String(newValue));
      // Notify server about toggle state
      getSocket().emit('ether:toggle', { enabled: newValue });
      return newValue;
    });
  }, []);

  // Toggle auto-attack (Smart Auto-Hunt)
  const toggleAutoAttack = useCallback(() => {
    setAutoAttack(prev => {
      const newValue = !prev;
      getSocket().emit('autoAttack:toggle', { enabled: newValue });
      return newValue;
    });
  }, []);

  // Collect meditation dust
  const collectMeditationDust = useCallback(() => {
    getSocket().emit('meditation:collect');
  }, []);

  // Craft all ether
  const craftAllEther = useCallback(() => {
    getSocket().emit('ether:craftAll');
    setShowMeditation(false);
  }, []);

  // Use skill
  const useSkill = useCallback((skill: Skill) => {
    const now = Date.now();
    if (now - skill.lastUsed < skill.cooldown) return;
    if (playerState.mana < skill.manaCost) {
      // Flash mana bar when insufficient
      setManaFlash(true);
      setTimeout(() => setManaFlash(false), 300);
      return;
    }
    if (bossState.hp <= 0) return;

    // Trigger press animation
    setPressedSkill(skill.id);
    setTimeout(() => setPressedSkill(null), 150);

    // Update state
    setPlayerState(p => ({ ...p, mana: p.mana - skill.manaCost }));
    setSkills(prev => {
      const updated = prev.map(s => s.id === skill.id ? { ...s, lastUsed: now } : s);
      // Save cooldowns
      try {
        const cooldowns: Record<string, number> = {};
        updated.forEach(s => cooldowns[s.id] = s.lastUsed);
        sessionStorage.setItem(COOLDOWNS_KEY, JSON.stringify(cooldowns));
      } catch {}
      return updated;
    });

    // Emit to server
    getSocket().emit('skill:use', { skillId: skill.id });

    // Play Phaser effect
    sceneRef.current?.playSkillEffect(skill.id);
  }, [playerState.mana, bossState.hp]);

  // Format helpers - show 1 decimal for better precision (1.5M instead of 1M)
  const formatCompact = (num: number) => {
    if (num >= 1000000) {
      const m = num / 1000000;
      return m % 1 === 0 ? m + 'M' : m.toFixed(1) + 'M';
    }
    if (num >= 1000) {
      const k = num / 1000;
      return k % 1 === 0 ? k + 'K' : k.toFixed(1) + 'K';
    }
    return num.toString();
  };

  // Debug: triple tap to reset isFirstLogin and show welcome
  const handleHeaderTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapTimeRef.current < 500) {
      tapCountRef.current++;
      if (tapCountRef.current >= 3) {
        console.log('[Debug] Triple tap - resetting isFirstLogin');
        getSocket().emit('admin:resetFirstLogin');
        setShowWelcome(true);
        setWelcomeStep(0);
        tapCountRef.current = 0;
      }
    } else {
      tapCountRef.current = 1;
    }
    lastTapTimeRef.current = now;
  }, []);

  // Socket & Phaser setup
  useEffect(() => {
    setLang(detectLanguage());
    const socket = getSocket();

    // Check for ?welcome=1 query param to force show welcome
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('welcome') === '1') {
        setShowWelcome(true);
        setWelcomeStep(0);
      }
    }

    // Initialize Phaser
    if (containerRef.current && !gameRef.current) {
      const config = {
        ...gameConfig,
        parent: containerRef.current,
        transparent: true,
        callbacks: {
          postBoot: (game: Phaser.Game) => {
            const scene = game.scene.getScene('BattleScene') as BattleScene;
            if (scene) {
              sceneRef.current = scene;
              scene.scene.restart({ socket });
              // FIX: After scene restart, apply current boss image from ref
              // Delay to ensure scene.create() has completed and bossSprite exists
              setTimeout(() => {
                if (sceneRef.current && currentBossImageRef.current) {
                  sceneRef.current.updateBossImage(currentBossImageRef.current);
                }
              }, 500);
            }
          },
        },
      };
      gameRef.current = new Phaser.Game(config);
    }

    // Auth
    const doAuth = () => {
      if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
        const webApp = window.Telegram.WebApp;
        const user = webApp.initDataUnsafe?.user;
        if (user) {
          socket.emit('auth', {
            telegramId: user.id,
            username: user.username,
            firstName: user.first_name,
            photoUrl: user.photo_url,
            languageCode: (user as any).language_code,
            initData: webApp.initData,
          });
          return;
        }
      }
      // DEV MODE: localhost fallback for browser testing
      if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
        console.log('[DEV] Using mock Telegram user for local testing');
        socket.emit('auth', {
          telegramId: 999999999,
          username: 'dev_tester',
          firstName: 'Developer',
          photoUrl: null,
          languageCode: 'en',
          initData: 'dev_mode',
        });
      }
    };

    socket.on('connect', () => { setConnected(true); doAuth(); });
    socket.on('disconnect', () => setConnected(false));

    // Session kicked (another device logged in)
    socket.on('session:kicked', (data: { reason: string }) => {
      alert(data.reason);
      window.location.reload();
    });

    // Boss state
    socket.on('boss:state', (data: any) => {
      setPlayersOnline(data.playersOnline);
      const newImage = data.image || '/assets/bosses/boss_single.png';
      // FIX: Always store current image in ref for scene ready callback
      currentBossImageRef.current = newImage;
      setBossState(prev => {
        // If boss image changed, update Phaser
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
      // Mark boss data loaded
      setLoadingState(prev => ({ ...prev, boss: true }));
    });

    // Starter chest opened
    socket.on('starter:opened', (data: { equipment: StarterItem[] }) => {
      console.log('[Starter] Opened:', data.equipment);
      setStarterItems(data.equipment);
      setStarterOpening(false);
    });

    // Starter chest error
    socket.on('starter:error', (data: { message: string }) => {
      console.error('[Starter] Error:', data.message);
      setStarterOpening(false);
      // If already has starter, show fake items to proceed
      if (data.message.includes('Already')) {
        setStarterItems([
          { name: 'Уже получено', icon: '✅', slot: 'INFO' }
        ]);
      }
    });

    // Tap result
    socket.on('tap:result', (data: any) => {
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
      // Track for tasks
      if (data.damage > 0) {
        const tm = getTaskManager();
        tm.recordTap(data.tapCount || 1);
        tm.recordDamage(data.damage);
      }
    });

    // Auto-attack result
    socket.on('autoAttack:result', (data: any) => {
      setSessionDamage(data.sessionDamage || 0);
      setPlayerState(p => ({
        ...p,
        gold: data.gold ?? p.gold,
        ether: data.ether ?? p.ether,
        stamina: data.stamina ?? p.stamina,
      }));
      // Track damage for tasks
      if (data.damage > 0) {
        getTaskManager().recordDamage(data.damage);
      }
    });

    // Player state (stamina/mana regen from server + currencies from task claims)
    socket.on('player:state', (data: any) => {
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
    });

    // Skill result (update mana after skill use)
    socket.on('skill:result', (data: any) => {
      setPlayerState(p => ({
        ...p,
        mana: data.mana ?? p.mana,
        maxMana: data.maxMana ?? p.maxMana,
        gold: data.gold ?? p.gold,
      }));
      // Track for tasks
      getTaskManager().recordSkillCast();
      if (data.damage > 0) {
        getTaskManager().recordDamage(data.damage);
      }
    });

    // Auth success - server sends data directly (not nested in user object)
    socket.on('auth:success', (data: any) => {
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
        ps: data.ps ?? 0,
        psCap: data.psCap ?? 24,
      });
      // Set auto-attack state from server
      setAutoAttack(data.autoAttack || false);
      // FIX: Sync autoEther from server (don't rely only on localStorage)
      // Server is the source of truth - update localStorage to match
      const serverAutoEther = data.autoEther || false;
      setAutoUseEther(serverAutoEther);
      localStorage.setItem('ic_auto_ether', String(serverAutoEther));
      // Set active buffs from auth data
      if (data.activeBuffs && Array.isArray(data.activeBuffs)) {
        const now = Date.now();
        setActiveBuffs(data.activeBuffs.filter((b: ActiveBuff) => b.expiresAt > now));
      }
      // Show meditation modal only ONCE on initial login (not on reconnect)
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
    });

    // Buff activated
    socket.on('buff:success', (data: { buffId: string; expiresAt: number }) => {
      setActiveBuffs(prev => {
        // Remove old buff of same type
        const filtered = prev.filter(b => b.type !== data.buffId);
        // Add new buff
        const buffValues: Record<string, number> = { haste: 0.3, acumen: 0.5, luck: 0.1 };
        return [...filtered, {
          type: data.buffId as ActiveBuff['type'],
          value: buffValues[data.buffId] || 0,
          expiresAt: data.expiresAt,
        }];
      });
    });

    // Meditation dust collected
    socket.on('meditation:collected', (data: { etherDust: number; collected: number }) => {
      setPlayerState(p => ({ ...p, etherDust: data.etherDust }));
    });

    // Level up (after boss kill)
    socket.on('level:up', (data: { level: number; skillFireball: number; skillIceball: number; skillLightning: number }) => {
      console.log('[Level] Level up!', data);
      setPlayerState(p => ({
        ...p,
        level: data.level,
        skillFireball: data.skillFireball,
        skillIceball: data.skillIceball,
        skillLightning: data.skillLightning,
      }));
    });

    // Ether crafted
    socket.on('ether:craft:success', (data: { ether: number; etherDust: number; gold: number }) => {
      setPlayerState(p => ({
        ...p,
        ether: data.ether,
        etherDust: data.etherDust,
        gold: data.gold,
      }));
    });

    // Auto-attack toggle ack
    socket.on('autoAttack:toggle:ack', (data: { enabled: boolean }) => {
      setAutoAttack(data.enabled);
    });

    // Ether toggle ack - sync client state with server
    socket.on('ether:toggle:ack', (data: { enabled: boolean; ether: number }) => {
      setAutoUseEther(data.enabled);
      localStorage.setItem('ic_auto_ether', String(data.enabled));
      setPlayerState(p => ({ ...p, ether: data.ether }));
    });

    // Shop purchase success - sync ether, gold, potions
    socket.on('shop:success', (data: { gold?: number; ether?: number; potionHaste?: number; potionAcumen?: number; potionLuck?: number }) => {
      setPlayerState(p => ({
        ...p,
        gold: data.gold ?? p.gold,
        ether: data.ether ?? p.ether,
      }));
    });

    // Exhaustion
    socket.on('hero:exhausted', (data: { until: number; duration: number }) => {
      setPlayerState(p => ({ ...p, exhaustedUntil: data.until, stamina: 0 }));
      setTimeout(() => {
        setPlayerState(p => ({ ...p, exhaustedUntil: null }));
      }, data.duration);
    });

    // Damage feed
    socket.on('damage:feed', (data: { playerName: string; damage: number; isCrit: boolean }) => {
      setDamageFeed(prev => [
        { ...data, timestamp: Date.now() },
        ...prev.slice(0, 4),
      ]);
    });

    // Boss killed
    socket.on('boss:killed', (data: any) => {
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
      // Запросить персональные награды
      socket.emit('rewards:get');
    });

    socket.on('boss:respawn', (data: any) => {
      setSessionDamage(0);
      setSessionClicks(0);
      setCurrentRank(0);
      setVictoryData(null);
      setRespawnCountdown(0);
      setPendingRewards([]);
      setClaimError(null);
      setActivityStatus({ time: 0, eligible: false });
      // Обновить состояние босса с новыми данными
      if (data) {
        const newImage = data.image || '/assets/bosses/boss_single.png';
        // FIX: Always store current image in ref
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
    });

    // Награды
    socket.on('rewards:data', (data: any) => {
      if (data?.rewards) {
        setPendingRewards(data.rewards);
        // Reset selection when new rewards arrive
        setChestSelection({ wooden: 0, bronze: 0, silver: 0, gold: 0 });
      }
      if (data?.slots) {
        setSlotInfo(data.slots);
      }
    });

    socket.on('rewards:claimed', (data: any) => {
      setClaimingReward(false);
      setClaimError(null);
      // Always remove reward (remaining chests are discarded)
      setPendingRewards(prev => prev.filter(r => r.id !== data.rewardId));
      // Update slot info
      if (data?.chestsCreated) {
        setSlotInfo(prev => ({ ...prev, used: prev.used + data.chestsCreated, free: prev.free - data.chestsCreated }));
      }
      // Reset selection
      setChestSelection({ wooden: 0, bronze: 0, silver: 0, gold: 0 });
      // Update player crystals if awarded
      if (data?.crystalsAwarded > 0) {
        setPlayerState(p => ({ ...p, crystals: p.crystals + data.crystalsAwarded }));
      }
    });

    socket.on('chest:buySlot:success', (data: any) => {
      setBuyingSlot(false);
      setSlotInfo(prev => ({
        ...prev,
        max: data.newSlots,
        free: prev.free + 1,
        nextPrice: data.nextPrice,
        crystals: data.crystalsRemaining,
      }));
      setPlayerState(p => ({ ...p, crystals: data.crystalsRemaining }));
    });

    socket.on('chest:buySlot:error', () => {
      setBuyingSlot(false);
    });

    socket.on('rewards:error', (data: any) => {
      setClaimingReward(false);
      setClaimError(data?.message || 'Ошибка получения награды');
    });

    // Activity status (eligibility for boss rewards)
    socket.on('activity:status', (data: { activityTime: number; isEligible: boolean }) => {
      setActivityStatus({ time: data.activityTime, eligible: data.isEligible });
    });

    // Player data (sent on player:get request - used when tab remounts)
    socket.on('player:data', (data: any) => {
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
      }
    });

    if (socket.connected) {
      setConnected(true);
      doAuth(); // Важно: вызываем авторизацию если сокет уже подключён
      socket.emit('player:get');
    }

    // Регенерация теперь только на сервере (player:state каждую секунду)
    // Клиентский интервал убран чтобы избежать двойной регенерации и скачков

    // TZ Этап 2: Activity ping каждые 5 сек для eligibility наград босса
    const activityPingInterval = setInterval(() => {
      socket.emit('activity:ping');
    }, 5000);

    return () => {
      clearInterval(activityPingInterval);
      socket.off('connect');
      socket.off('disconnect');
      socket.off('boss:state');
      socket.off('tap:result');
      socket.off('autoAttack:result');
      socket.off('player:state');
      socket.off('skill:result');
      socket.off('auth:success');
      socket.off('buff:success');
      socket.off('hero:exhausted');
      socket.off('damage:feed');
      socket.off('boss:killed');
      socket.off('boss:respawn');
      socket.off('player:data');
      socket.off('starter:opened');
      socket.off('starter:error');
      socket.off('rewards:data');
      socket.off('rewards:claimed');
      socket.off('rewards:error');
      socket.off('chest:buySlot:success');
      socket.off('chest:buySlot:error');
      socket.off('activity:status');
      socket.off('autoAttack:toggle:ack');
      socket.off('ether:toggle:ack');
      socket.off('shop:success');
      socket.off('meditation:collected');
      socket.off('ether:craft:success');
      socket.off('level:up');

      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  // Buff expiration checker - removes expired buffs every second
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setActiveBuffs(prev => prev.filter(b => b.expiresAt > now));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Tasks claimable badge checker - use SERVER data (not legacy localStorage)
  useEffect(() => {
    const socket = getSocket();

    const handleTasksData = (data: { daily?: any[]; weekly?: any[] }) => {
      const allTasks = [...(data.daily || []), ...(data.weekly || [])];
      const claimable = allTasks.some((t: any) => t.completed && !t.claimed);
      setHasClaimable(claimable);
    };

    socket.on('tasks:data', handleTasksData);

    // Request tasks on mount and periodically
    socket.emit('tasks:get');
    const interval = setInterval(() => {
      socket.emit('tasks:get');
    }, 30000); // Check every 30 sec

    return () => {
      socket.off('tasks:data', handleTasksData);
      clearInterval(interval);
    };
  }, []);

  const hpPercent = (bossState.hp / bossState.maxHp) * 100;
  const staminaPercent = (playerState.stamina / playerState.maxStamina) * 100;
  const manaPercent = (playerState.mana / playerState.maxMana) * 100;
  const bossDisplayName = lang === 'ru' && bossState.nameRu ? bossState.nameRu : bossState.name;
  const exhausted = isExhausted();

  return (
    <div className="flex flex-col h-full relative bg-gradient-to-b from-[#2a313b] to-[#0e141b]">
      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TOP HUD - Player info + Resources */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <TopHUD
        playerState={playerState}
        connected={connected}
        playersOnline={playersOnline}
        bossIndex={bossState.bossIndex}
        totalBosses={bossState.totalBosses}
        staminaPercent={staminaPercent}
        manaPercent={manaPercent}
        manaFlash={manaFlash}
        exhausted={exhausted}
        activeBuffs={activeBuffs}
        lang={lang}
        t={t}
        onShowDebug={() => setShowDebug(true)}
      />

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* FLOATING BOSS HP BAR or COUNTDOWN (centered, premium design) */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div
        className="absolute top-32 left-0 right-0 z-10 flex flex-col items-center px-4"
        onClick={handleHeaderTap}
      >
        {bossState.hp <= 0 && respawnCountdown > 0 ? (
          /* Boss dead - show countdown with premium styling */
          <div className="bg-gradient-to-b from-gray-900/95 to-black/90 rounded-xl px-6 py-4 border border-red-900/50 shadow-lg shadow-red-900/20">
            <div className="flex items-center justify-center gap-2 mb-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-900/80 to-red-950 border-2 border-red-700/50 flex items-center justify-center shadow-inner">
                <span className="text-xl">💀</span>
              </div>
              <div>
                <span className="text-red-400 font-bold text-sm block">
                  {lang === 'ru' ? 'Босс повержен' : 'Boss defeated'}
                </span>
                <span className="text-gray-500 text-[10px]">
                  {connected ? `${playersOnline} ${t.game.online}` : t.game.connecting}
                </span>
              </div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">
                {lang === 'ru' ? 'Следующий босс' : 'Next boss in'}
              </div>
              <div className="text-2xl font-bold text-l2-gold font-mono tracking-wide drop-shadow-[0_0_10px_rgba(251,191,36,0.3)]">
                {Math.floor(respawnCountdown / 3600000)}:{String(Math.floor((respawnCountdown % 3600000) / 60000)).padStart(2, '0')}:{String(Math.floor((respawnCountdown % 60000) / 1000)).padStart(2, '0')}
              </div>
            </div>
            <div className="text-center mt-2">
              <span
                className="text-[8px] text-gray-600 cursor-pointer hover:text-gray-400"
                onClick={() => setShowDebug(true)}
              >
                {APP_VERSION}
              </span>
            </div>
          </div>
        ) : (
          /* Boss alive - show HP bar with premium styling */
          <div className="w-[90%] max-w-sm">
            {/* HP Bar Row: [Boss icon] [HP bar] [Drop icon] - name inside bar */}
            <div className="flex items-center gap-2">
              {/* Boss icon (left) */}
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-800/60 to-amber-950/80 border border-amber-600/40 flex items-center justify-center shadow-lg shadow-amber-900/30 flex-shrink-0">
                <span className="text-lg drop-shadow-md">{bossState.icon}</span>
              </div>

              {/* HP Bar Container with frame (center) */}
              <div className="relative flex-1">
                {/* Decorative corners */}
                <div className="absolute -top-1 -left-1 w-2 h-2 border-l-2 border-t-2 border-amber-600/60" />
                <div className="absolute -top-1 -right-1 w-2 h-2 border-r-2 border-t-2 border-amber-600/60" />
                <div className="absolute -bottom-1 -left-1 w-2 h-2 border-l-2 border-b-2 border-amber-600/60" />
                <div className="absolute -bottom-1 -right-1 w-2 h-2 border-r-2 border-b-2 border-amber-600/60" />

                {/* Main HP bar - THICKER (h-7) */}
                <div className={`h-7 bg-gradient-to-b from-gray-900 to-black rounded-md overflow-hidden relative border shadow-inner ${
                  hpPercent < 20 ? 'border-red-500/70 animate-pulse' : 'border-gray-700/50'
                }`}>
                  {/* HP fill with gradient */}
                  <div
                    className={`h-full transition-all duration-150 relative ${
                      hpPercent < 20 ? 'hp-critical' : ''
                    }`}
                    style={{
                      width: `${hpPercent}%`,
                      background: hpPercent < 20
                        ? 'linear-gradient(to bottom, #dc2626, #991b1b)'
                        : hpPercent < 50
                          ? 'linear-gradient(to bottom, #ea580c, #c2410c)'
                          : hpPercent < 75
                            ? 'linear-gradient(to bottom, #eab308, #ca8a04)'
                            : 'linear-gradient(to bottom, #22c55e, #16a34a)'
                    }}
                  >
                    {/* Shine effect */}
                    <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/20 to-transparent" />
                  </div>

                  {/* Low HP danger glow */}
                  {hpPercent < 20 && (
                    <div className="absolute inset-0 bg-red-500/20 animate-pulse pointer-events-none" />
                  )}

                  {/* Boss name (left) + HP numbers (right) inside bar */}
                  <div className="absolute inset-0 flex items-center justify-between px-2">
                    <span className="text-[10px] text-l2-gold/90 font-bold truncate max-w-[80px] drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                      {bossDisplayName}
                    </span>
                    <span className="text-[10px] text-white font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                      {bossState.hp.toLocaleString()} / {bossState.maxHp.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Drop info button (right) */}
              <button
                onClick={(e) => { e.stopPropagation(); setShowDropTable(true); }}
                className="w-8 h-8 bg-gradient-to-b from-amber-700/50 to-amber-900/50 rounded-lg flex items-center justify-center
                           border border-amber-600/40 active:scale-90 transition-all hover:border-amber-500/60 shadow-lg flex-shrink-0"
              >
                <span className="text-sm">📦</span>
              </button>
            </div>

            {/* Your Damage display - accumulated damage to current boss */}
            {sessionDamage > 0 && (
              <div className="mt-2 bg-black/60 rounded-lg px-3 py-1.5 border border-amber-600/30">
                <div className="flex items-center justify-center gap-2 text-[10px]">
                  <span className="text-gray-400">⚔️ {lang === 'ru' ? 'Твой урон:' : 'Your Damage:'}</span>
                  <span className="text-amber-400 font-bold">{sessionDamage.toLocaleString()}</span>
                </div>
              </div>
            )}

            {/* Eligibility Debug Overlay - shows participation status */}
            {sessionDamage > 0 && (
              <div className="mt-1 bg-black/70 rounded-lg px-2 py-1 border border-gray-700/50">
                <div className="flex items-center justify-center gap-3 text-[9px]">
                  <span className={activityStatus.eligible ? 'text-green-400' : 'text-red-400'}>
                    {activityStatus.eligible ? '✅' : '⏳'} {activityStatus.eligible ? 'Eligible' : 'Not eligible'}
                  </span>
                  <span className="text-gray-500">|</span>
                  <span className="text-cyan-400">#{currentRank || '?'}</span>
                  <span className="text-gray-500">|</span>
                  <span className="text-gray-400">{Math.floor(activityStatus.time / 1000)}s</span>
                  <span className="text-gray-500">|</span>
                  <span className="text-gray-400">{sessionClicks} clicks</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* PHASER CANVAS - Boss only */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div
        ref={containerRef}
        id="game-container"
        className="flex-1 w-full"
      />

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* FORGE & ENCHANT BUTTONS - Left side, quick access */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <button
        onClick={() => setShowForge(true)}
        className="absolute top-64 left-2 z-10 w-12 h-12 bg-gradient-to-b from-amber-700/60 to-amber-900/80
                   rounded-lg border border-amber-600/50 flex flex-col items-center justify-center
                   active:scale-90 transition-all hover:border-amber-500/70 shadow-lg shadow-amber-900/30"
      >
        <Hammer className="text-amber-400" size={20} />
        <span className="text-[7px] text-amber-300 font-bold mt-0.5">
          {lang === 'ru' ? 'КОВКА' : 'FORGE'}
        </span>
      </button>
      <button
        onClick={() => setShowEnchant(true)}
        className="absolute top-[19rem] left-2 z-10 w-12 h-12 bg-gradient-to-b from-purple-700/60 to-purple-900/80
                   rounded-lg border border-purple-600/50 flex flex-col items-center justify-center
                   active:scale-90 transition-all hover:border-purple-500/70 shadow-lg shadow-purple-900/30"
      >
        <Sparkles className="text-purple-400" size={20} />
        <span className="text-[7px] text-purple-300 font-bold mt-0.5">
          {lang === 'ru' ? 'ЗАТОЧКА' : 'ENCHANT'}
        </span>
      </button>
      {/* Tasks Button */}
      <button
        onClick={() => setShowTasks(true)}
        className="absolute top-[23rem] left-2 z-10 w-12 h-12 bg-gradient-to-b from-cyan-700/60 to-cyan-900/80
                   rounded-lg border border-cyan-600/50 flex flex-col items-center justify-center
                   active:scale-90 transition-all hover:border-cyan-500/70 shadow-lg shadow-cyan-900/30"
      >
        <span className="text-xl">🎯</span>
        <span className="text-[7px] text-cyan-300 font-bold mt-0.5">
          {lang === 'ru' ? 'ЗАДАНИЯ' : 'TASKS'}
        </span>
        {hasClaimable && (
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse border border-red-400" />
        )}
      </button>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* DAMAGE FEED - Right side, premium combat log */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="absolute top-64 right-2 z-10 w-28">
        {damageFeed.length > 0 && (
          <div className="bg-black/50 rounded-lg border border-gray-800/50 overflow-hidden">
            <div className="px-1.5 py-0.5 bg-gray-900/80 border-b border-gray-800/50">
              <span className="text-[7px] text-gray-500 uppercase">Log</span>
            </div>
            <div className="px-1 py-1 space-y-0.5 max-h-28 overflow-hidden">
              {damageFeed.map((item, i) => {
                const isFirst = i === 0;
                const isFirstCrit = isFirst && item.isCrit;
                return (
                  <div
                    key={item.timestamp}
                    className={`text-[9px] px-1.5 py-0.5 rounded transition-all ${
                      isFirstCrit
                        ? 'bg-red-600/50 text-red-300 scale-105 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                        : isFirst
                          ? 'bg-amber-900/50 text-amber-300 scale-105'
                          : item.isCrit
                            ? 'bg-red-900/40 text-red-400'
                            : 'text-gray-400'
                    }`}
                    style={{ opacity: isFirst ? 1 : 1 - i * 0.18 }}
                  >
                    <div className="truncate">
                      <span className={isFirst ? 'text-white/70' : 'text-gray-500'}>{item.playerName.slice(0, 6)}</span>
                      <span className={`${isFirstCrit ? 'text-red-200 font-bold' : isFirst ? 'text-amber-200 font-bold' : item.isCrit ? 'text-red-400 font-bold' : 'text-gray-300'}`}>
                        {' '}-{formatCompact(item.damage)}
                      </span>
                      {isFirstCrit && <span className="ml-1 text-red-300">💥</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* BOTTOM UI - Action Bar (AUTO + Skills + Ether) */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <SkillBar
        skills={skills}
        playerState={playerState}
        bossState={bossState}
        autoAttack={autoAttack}
        autoUseEther={autoUseEther}
        pressedSkill={pressedSkill}
        lang={lang}
        onToggleAutoAttack={toggleAutoAttack}
        onToggleAutoEther={toggleAutoEther}
        onUseSkill={useSkill}
      />

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* EXHAUSTED OVERLAY */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {exhausted && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="text-4xl font-bold text-red-500 animate-pulse drop-shadow-lg">
            EXHAUSTED!
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* VICTORY OVERLAY */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {victoryData && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-l2-panel/95 rounded-lg p-4 m-2 max-w-sm w-full pointer-events-auto">
            <div className="text-center mb-3">
              <div className="text-3xl mb-1">{victoryData.bossIcon}</div>
              <div className="text-l2-gold text-lg font-bold">{t.boss.victory}</div>
              <div className="text-gray-300 text-sm">{victoryData.bossName} {t.boss.defeated}</div>
            </div>
            <div className="bg-black/40 rounded-lg p-3 mb-3 text-center">
              <div className="text-xs text-gray-400 mb-1">{t.boss.nextBossIn}</div>
              <div className="text-2xl font-bold text-white font-mono">
                {Math.floor(respawnCountdown / 3600000)}:{String(Math.floor((respawnCountdown % 3600000) / 60000)).padStart(2, '0')}:{String(Math.floor((respawnCountdown % 60000) / 1000)).padStart(2, '0')}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-2 text-center">
                <div className="text-xs text-red-400">{t.boss.finalBlow}</div>
                <div className="text-sm font-bold text-white truncate">{victoryData.finalBlowBy}</div>
              </div>
              <div className="bg-purple-900/30 border border-purple-500/50 rounded-lg p-2 text-center">
                <div className="text-xs text-purple-400">{t.boss.topDamage}</div>
                <div className="text-sm font-bold text-white truncate">{victoryData.topDamageBy}</div>
              </div>
            </div>

            {/* Персональная награда с выбором сундуков */}
            {pendingRewards.length > 0 && (() => {
              const reward = pendingRewards[0];
              const totalSelected = chestSelection.wooden + chestSelection.bronze + chestSelection.silver + chestSelection.gold;
              const canClaim = totalSelected > 0 && totalSelected <= slotInfo.free;

              return (
                <div className="bg-l2-gold/10 border border-l2-gold/50 rounded-lg p-3 mb-3">
                  {/* Header with rank, tickets, crystals, badge */}
                  <div className="flex justify-between items-center mb-2">
                    <div className="text-l2-gold font-bold text-sm">
                      {lang === 'ru' ? 'Твоя награда' : 'Your Reward'}
                      {reward.rank && ` (#${reward.rank})`}
                    </div>
                    <div className="flex items-center gap-1">
                      {reward.badgeId && (
                        <span className="bg-purple-500/30 px-2 py-0.5 rounded text-[10px] text-purple-400">
                          {reward.badgeId === 'slayer' ? '⚔️' : '🏆'}
                        </span>
                      )}
                      {reward.lotteryTickets > 0 && (
                        <span className="bg-yellow-500/30 px-2 py-0.5 rounded text-[10px] text-yellow-300">
                          +{reward.lotteryTickets}🎟️
                        </span>
                      )}
                      {reward.crystals > 0 && (
                        <div className="flex items-center gap-1 bg-purple-500/30 px-2 py-0.5 rounded">
                          <Gem className="text-purple-400" size={12} />
                          <span className="text-xs font-bold text-purple-400">+{reward.crystals}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Slot info */}
                  <div className="flex justify-between items-center mb-2 text-xs">
                    <span className="text-gray-400">
                      {lang === 'ru' ? 'Слоты:' : 'Slots:'} {slotInfo.used}/{slotInfo.max}
                    </span>
                    <span className={`font-bold ${slotInfo.free > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {slotInfo.free} {lang === 'ru' ? 'свободно' : 'free'}
                    </span>
                  </div>

                  {/* Chest selection grid */}
                  <div className="space-y-1.5 mb-3">
                    {[
                      { key: 'gold', label: '🟨 Gold', count: reward.chestsGold, color: 'yellow' },
                      { key: 'silver', label: '🥈 Silver', count: reward.chestsSilver, color: 'gray' },
                      { key: 'bronze', label: '🟫 Bronze', count: reward.chestsBronze, color: 'orange' },
                      { key: 'wooden', label: '🪵 Wooden', count: reward.chestsWooden, color: 'amber' },
                    ].filter(c => c.count > 0).map(chest => (
                      <div key={chest.key} className="flex items-center justify-between bg-black/30 rounded px-2 py-1.5">
                        <span className="text-sm">{chest.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">x{chest.count}</span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setChestSelection(prev => ({
                                ...prev,
                                [chest.key]: Math.max(0, prev[chest.key as keyof ChestSelection] - 1)
                              }))}
                              className="w-6 h-6 rounded bg-gray-700 text-white text-sm font-bold"
                            >−</button>
                            <span className="w-6 text-center font-bold text-white">
                              {chestSelection[chest.key as keyof ChestSelection]}
                            </span>
                            <button
                              onClick={() => setChestSelection(prev => ({
                                ...prev,
                                [chest.key]: Math.min(chest.count, prev[chest.key as keyof ChestSelection] + 1)
                              }))}
                              disabled={chestSelection[chest.key as keyof ChestSelection] >= chest.count}
                              className="w-6 h-6 rounded bg-gray-700 text-white text-sm font-bold disabled:opacity-30"
                            >+</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Selected count and buy slot */}
                  <div className="flex justify-between items-center mb-2">
                    <span className={`text-xs ${totalSelected > slotInfo.free ? 'text-red-400' : 'text-gray-400'}`}>
                      {lang === 'ru' ? 'Выбрано:' : 'Selected:'} {totalSelected}
                      {totalSelected > slotInfo.free && ` (${lang === 'ru' ? 'нет места!' : 'no space!'})`}
                    </span>
                    {slotInfo.free < (reward.chestsWooden + reward.chestsBronze + reward.chestsSilver + reward.chestsGold) && (
                      <button
                        onClick={() => {
                          if (!buyingSlot) {
                            setBuyingSlot(true);
                            getSocket().emit('chest:buySlot');
                          }
                        }}
                        disabled={buyingSlot || playerState.crystals < slotInfo.nextPrice}
                        className="text-xs px-2 py-1 rounded bg-purple-600 text-white disabled:opacity-50"
                      >
                        {buyingSlot ? '...' : `+1 ${lang === 'ru' ? 'слот' : 'slot'} (${slotInfo.nextPrice}💎)`}
                      </button>
                    )}
                  </div>

                  {/* Warning if not all selected */}
                  {(() => {
                    const totalAvailable = reward.chestsWooden + reward.chestsBronze + reward.chestsSilver + reward.chestsGold;
                    const willDiscard = totalAvailable - totalSelected;
                    if (totalSelected > 0 && willDiscard > 0) {
                      return (
                        <div className="text-orange-400 text-xs text-center mb-2 bg-orange-900/30 rounded p-1.5">
                          ⚠️ {lang === 'ru'
                            ? `${willDiscard} сундук(ов) будет потеряно!`
                            : `${willDiscard} chest(s) will be lost!`}
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* Claim button */}
                  <button
                    onClick={() => {
                      if (!claimingReward && canClaim) {
                        setClaimingReward(true);
                        setClaimError(null);
                        getSocket().emit('rewards:claim', {
                          rewardId: reward.id,
                          take: chestSelection,
                        });
                      }
                    }}
                    disabled={claimingReward || !canClaim}
                    className={`w-full py-2 rounded-lg font-bold text-sm transition-all ${
                      claimingReward || !canClaim
                        ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                        : 'bg-l2-gold text-black hover:bg-l2-gold/80'
                    }`}
                  >
                    {claimingReward
                      ? (lang === 'ru' ? 'Забираем...' : 'Claiming...')
                      : totalSelected === 0
                        ? (lang === 'ru' ? 'Выбери сундуки' : 'Select chests')
                        : (lang === 'ru' ? `Забрать ${totalSelected} сундук(ов)` : `Claim ${totalSelected} chest(s)`)}
                  </button>
                  {claimError && (
                    <div className="text-red-400 text-xs text-center mt-2">{claimError}</div>
                  )}
                </div>
              );
            })()}

            {/* Если нет награды */}
            {pendingRewards.length === 0 && (
              <div className="text-center text-gray-400 text-sm">
                {lang === 'ru' ? 'Участвуй 30+ сек для награды' : 'Participate 30+ sec for rewards'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* WELCOME CAROUSEL (4 screens) */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {showWelcome && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90">
          <div className="bg-gradient-to-b from-l2-panel to-black rounded-xl p-5 m-3 max-w-sm w-full border border-l2-gold/30">
            {/* Progress dots */}
            <div className="flex justify-center gap-2 mb-4">
              {[0, 1, 2, 3].map(i => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-all ${
                    i === welcomeStep ? 'bg-l2-gold w-6' : 'bg-gray-600'
                  }`}
                />
              ))}
            </div>

            {/* Screen 0: Welcome intro */}
            {welcomeStep === 0 && (
              <div className="text-center mb-6">
                <div className="text-5xl mb-3">⚔️</div>
                <h1 className="text-2xl font-bold text-l2-gold mb-2">{t.welcome.title}</h1>
                <p className="text-gray-300">{t.welcome.subtitle}</p>
              </div>
            )}

            {/* Screen 1: Bosses + Rewards */}
            {welcomeStep === 1 && (
              <div className="space-y-4 mb-6">
                <div className="bg-black/40 rounded-lg p-4 border border-red-500/30">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-3xl">👹</span>
                    <h2 className="text-lg font-bold text-red-400">{t.welcome.bosses}</h2>
                  </div>
                  <p className="text-gray-300 text-sm">{t.welcome.bossesDesc}</p>
                </div>
                <div className="bg-black/40 rounded-lg p-4 border border-l2-gold/30">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-3xl">🪙</span>
                    <h2 className="text-lg font-bold text-l2-gold">{t.welcome.rewards}</h2>
                  </div>
                  <p className="text-gray-300 text-sm">{t.welcome.rewardsDesc}</p>
                </div>
              </div>
            )}

            {/* Screen 2: Auto-Battle + Upgrade */}
            {welcomeStep === 2 && (
              <div className="space-y-4 mb-6">
                <div className="bg-black/40 rounded-lg p-4 border border-blue-500/30">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-3xl">🤖</span>
                    <h2 className="text-lg font-bold text-blue-400">{t.welcome.autoBattle}</h2>
                  </div>
                  <p className="text-gray-300 text-sm">{t.welcome.autoBattleDesc}</p>
                </div>
                <div className="bg-black/40 rounded-lg p-4 border border-green-500/30">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-3xl">📈</span>
                    <h2 className="text-lg font-bold text-green-400">{t.welcome.upgrade}</h2>
                  </div>
                  <p className="text-gray-300 text-sm">{t.welcome.upgradeDesc}</p>
                </div>
              </div>
            )}

            {/* Screen 3: Starter Chest */}
            {welcomeStep === 3 && (
              <div className="text-center mb-6">
                {starterItems.length === 0 ? (
                  <>
                    <div className="text-6xl mb-3 animate-bounce">🎁</div>
                    <h2 className="text-xl font-bold text-purple-400 mb-2">
                      {lang === 'ru' ? 'Стартовый Набор!' : 'Starter Pack!'}
                    </h2>
                    <p className="text-gray-300 text-sm mb-4">
                      {lang === 'ru' ? 'Открой сундук и получи стартовое снаряжение!' : 'Open the chest to get starter equipment!'}
                    </p>
                    <button
                      onClick={() => {
                        console.log('[Starter] Opening chest...');
                        setStarterOpening(true);
                        getSocket().emit('starter:open');
                      }}
                      disabled={starterOpening}
                      className="px-6 py-3 bg-purple-600 text-white font-bold rounded-lg disabled:opacity-50"
                    >
                      {starterOpening
                        ? (lang === 'ru' ? 'Открываем...' : 'Opening...')
                        : (lang === 'ru' ? '📦 Открыть Сундук' : '📦 Open Chest')}
                    </button>
                  </>
                ) : (
                  <>
                    <div className="text-4xl mb-2">✨</div>
                    <h2 className="text-xl font-bold text-green-400 mb-3">
                      {lang === 'ru' ? 'Получено!' : 'Received!'}
                    </h2>
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      {starterItems.map((item, i) => (
                        <div key={i} className="bg-black/40 rounded-lg p-2 border border-green-500/30">
                          <div className="text-2xl">{item.icon}</div>
                          <div className="text-xs text-gray-300 truncate">{item.name}</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Navigation buttons */}
            <div className="flex gap-3">
              {welcomeStep > 0 && welcomeStep < 3 && (
                <button
                  onClick={() => { console.log('[Welcome] Back to step', welcomeStep - 1); setWelcomeStep(s => s - 1); }}
                  className="flex-1 py-3 bg-gray-700 text-white font-bold rounded-lg active:scale-95 transition-transform"
                >
                  {lang === 'ru' ? 'Назад' : 'Back'}
                </button>
              )}
              {welcomeStep < 3 ? (
                <button
                  onClick={() => { console.log('[Welcome] Next to step', welcomeStep + 1); setWelcomeStep(s => s + 1); }}
                  className="flex-1 py-3 bg-l2-gold text-black font-bold rounded-lg active:scale-95 transition-transform"
                >
                  {lang === 'ru' ? 'Далее' : 'Next'}
                </button>
              ) : (
                <button
                  onClick={() => {
                    console.log('[Welcome] Complete!');
                    setShowWelcome(false);
                    setWelcomeStep(0);
                    setStarterItems([]);
                    getSocket().emit('firstLogin:complete');
                  }}
                  disabled={starterItems.length === 0 && !starterOpening}
                  className="flex-1 py-3 bg-gradient-to-r from-l2-gold to-yellow-600 text-black font-bold rounded-lg animate-pulse active:scale-95 transition-transform disabled:opacity-50 disabled:animate-none"
                >
                  {t.welcome.startButton}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* OFFLINE EARNINGS OVERLAY */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {/* DROP TABLE OVERLAY */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {showDropTable && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setShowDropTable(false)}>
          <div className="bg-l2-panel rounded-xl p-4 max-w-sm w-full border border-purple-500/30 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-4">
              <div className="text-2xl mb-1">🎁</div>
              <div className="text-lg font-bold text-purple-400">{lang === 'ru' ? 'Награды за босса' : 'Boss Rewards'}</div>
              <div className="text-xs text-gray-500">{lang === 'ru' ? '(нужно 30 сек активности)' : '(need 30s activity)'}</div>
            </div>
            <div className="space-y-1 text-sm">
              <div className="bg-yellow-500/20 rounded-lg p-2 border border-yellow-500/30">
                <div className="text-yellow-400 font-bold">🥇 1 место</div>
                <div className="text-gray-300 text-xs">1🟨 + 2🥈 + 2🟫 + 2🪵 + Slayer 7д</div>
              </div>
              <div className="bg-gray-400/20 rounded-lg p-2 border border-gray-400/30">
                <div className="text-gray-300 font-bold">🥈 2 место</div>
                <div className="text-gray-400 text-xs">1🟨 + 1🥈 + 2🟫 + 2🪵 + Elite 7д</div>
              </div>
              <div className="bg-orange-500/20 rounded-lg p-2 border border-orange-500/30">
                <div className="text-orange-400 font-bold">🥉 3 место</div>
                <div className="text-gray-400 text-xs">1🟨 + 1🪙 + 1🟫 + 2🪵 + Elite 3д</div>
              </div>
              <div className="bg-black/30 rounded-lg p-2">
                <div className="text-gray-400 font-bold">4-10 место</div>
                <div className="text-gray-500 text-xs">1🪙 + 1🟫 + 2🪵</div>
              </div>
              <div className="bg-black/30 rounded-lg p-2">
                <div className="text-gray-400 font-bold">11-25 место</div>
                <div className="text-gray-500 text-xs">1🪙 + 2🪵</div>
              </div>
              <div className="bg-black/30 rounded-lg p-2">
                <div className="text-gray-400 font-bold">26-100 место</div>
                <div className="text-gray-500 text-xs">1🟫 + 2🪵</div>
              </div>
              <div className="bg-black/30 rounded-lg p-2">
                <div className="text-gray-400 font-bold">101+ место</div>
                <div className="text-gray-500 text-xs">2🪵</div>
              </div>
            </div>
            <div className="mt-3 text-xs text-gray-500 text-center">
              🟨 Gold • 🪙 Silver • 🟫 Bronze • 🪵 Wooden
            </div>
            <button onClick={() => setShowDropTable(false)} className="mt-4 w-full py-2 bg-purple-500/20 text-purple-300 rounded-lg">
              {lang === 'ru' ? 'Закрыть' : 'Close'}
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* MEDITATION MODAL (Ether Dust from offline) */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {showMeditation && meditationData && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-gradient-to-b from-l2-panel to-black rounded-xl p-5 max-w-sm w-full border border-cyan-500/30">
            <div className="text-center mb-4">
              <div className="text-4xl mb-2">🧘</div>
              <h2 className="text-xl font-bold text-cyan-400">
                {lang === 'ru' ? 'Медитация завершена' : 'Meditation Complete'}
              </h2>
              <p className="text-gray-400 text-sm mt-1">
                {lang === 'ru'
                  ? `Вы медитировали ${Math.floor(meditationData.offlineMinutes / 60)}ч ${meditationData.offlineMinutes % 60}мин`
                  : `You meditated for ${Math.floor(meditationData.offlineMinutes / 60)}h ${meditationData.offlineMinutes % 60}m`}
              </p>
            </div>

            {/* Dust collected */}
            <div className="bg-black/40 rounded-lg p-4 mb-4 border border-cyan-500/20">
              <div className="flex items-center justify-center gap-3">
                <span className="text-3xl">🌫️</span>
                <div>
                  <div className="text-2xl font-bold text-cyan-300">+{meditationData.pendingDust}</div>
                  <div className="text-xs text-gray-500">
                    {lang === 'ru' ? 'Эфирная Пыль' : 'Ether Dust'}
                  </div>
                </div>
              </div>
            </div>

            {/* Crafting info */}
            <div className="bg-black/30 rounded-lg p-3 mb-4 text-center">
              <div className="text-sm text-gray-300 mb-2">
                {lang === 'ru' ? 'Крафт Эфира:' : 'Craft Ether:'}
              </div>
              <div className="flex items-center justify-center gap-2 text-sm">
                <span className="text-cyan-300">5 🌫️</span>
                <span className="text-gray-500">+</span>
                <span className="text-l2-gold">5 🪙</span>
                <span className="text-gray-500">=</span>
                <span className="text-cyan-400 font-bold">1 ✨</span>
              </div>
              {meditationData.pendingDust >= 5 && (
                <div className="text-xs text-gray-500 mt-2">
                  {lang === 'ru'
                    ? `≈ ${Math.floor(meditationData.pendingDust / 5)} Эфира (${Math.floor(meditationData.pendingDust / 5) * 5} золота)`
                    : `≈ ${Math.floor(meditationData.pendingDust / 5)} Ether (${Math.floor(meditationData.pendingDust / 5) * 5} gold)`}
                </div>
              )}
            </div>

            {/* Current stats */}
            <div className="flex justify-center gap-6 mb-4 text-sm">
              <div className="text-center">
                <div className="text-cyan-300">{playerState.etherDust + meditationData.pendingDust}</div>
                <div className="text-[10px] text-gray-500">🌫️ {lang === 'ru' ? 'Пыль' : 'Dust'}</div>
              </div>
              <div className="text-center">
                <div className="text-l2-gold">{playerState.gold}</div>
                <div className="text-[10px] text-gray-500">🪙 {lang === 'ru' ? 'Золото' : 'Gold'}</div>
              </div>
              <div className="text-center">
                <div className="text-cyan-400">{playerState.ether}</div>
                <div className="text-[10px] text-gray-500">✨ {lang === 'ru' ? 'Эфир' : 'Ether'}</div>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  collectMeditationDust();
                  setShowMeditation(false);
                  setMeditationData(null);
                }}
                className="flex-1 py-3 bg-gray-700 text-white font-bold rounded-lg active:scale-95 transition-transform"
              >
                {lang === 'ru' ? 'Собрать' : 'Collect'}
              </button>
              <button
                onClick={() => {
                  craftAllEther();
                  setMeditationData(null);
                }}
                className="flex-1 py-3 bg-gradient-to-r from-cyan-600 to-cyan-500 text-white font-bold rounded-lg active:scale-95 transition-transform"
              >
                {lang === 'ru' ? '✨ Крафт всё' : '✨ Craft All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TASKS MODAL */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <TasksModal isOpen={showTasks} onClose={() => setShowTasks(false)} />

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* FORGE MODAL */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <ForgeModal isOpen={showForge} onClose={() => setShowForge(false)} />

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ENCHANT MODAL */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <EnchantModal isOpen={showEnchant} onClose={() => setShowEnchant(false)} />

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* LOADING OVERLAY - Shows while data loading */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {isLoading && <LoadingScreen loadingState={loadingState} lang={lang} />}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* DEBUG MODAL - Tap version to open */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {showDebug && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setShowDebug(false)}
        >
          <div
            className="bg-gray-900 rounded-xl p-4 max-w-sm w-full border border-gray-700 max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-white">🔧 Debug Info</h2>
              <button onClick={() => setShowDebug(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>

            <div className="space-y-3 text-sm">
              {/* Version */}
              <div className="bg-black/40 rounded-lg p-3">
                <div className="text-gray-500 text-xs mb-1">Version</div>
                <div className="text-white font-mono">{APP_VERSION}</div>
              </div>

              {/* Boss State */}
              <div className="bg-black/40 rounded-lg p-3">
                <div className="text-gray-500 text-xs mb-1">Boss State</div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Name:</span>
                    <span className="text-white">{bossState.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">HP:</span>
                    <span className="text-l2-gold font-mono">
                      {bossState.hp.toLocaleString()} / {bossState.maxHp.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">HP %:</span>
                    <span className="text-white">{((bossState.hp / bossState.maxHp) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Index:</span>
                    <span className="text-white">{bossState.bossIndex} / {bossState.totalBosses}</span>
                  </div>
                </div>
              </div>

              {/* Player State */}
              <div className="bg-black/40 rounded-lg p-3">
                <div className="text-gray-500 text-xs mb-1">Player State</div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Stamina:</span>
                    <span className="text-green-400">{playerState.stamina} / {playerState.maxStamina}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Mana:</span>
                    <span className="text-blue-400">{playerState.mana} / {playerState.maxMana}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Gold:</span>
                    <span className="text-yellow-400">{playerState.gold.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Ether:</span>
                    <span className="text-cyan-400">{playerState.ether}</span>
                  </div>
                </div>
              </div>

              {/* Connection */}
              <div className="bg-black/40 rounded-lg p-3">
                <div className="text-gray-500 text-xs mb-1">Connection</div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Status:</span>
                    <span className={connected ? 'text-green-400' : 'text-red-400'}>
                      {connected ? 'Connected' : 'Disconnected'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Players:</span>
                    <span className="text-white">{playersOnline}</span>
                  </div>
                </div>
              </div>

              {/* Buffs */}
              {activeBuffs.length > 0 && (
                <div className="bg-black/40 rounded-lg p-3">
                  <div className="text-gray-500 text-xs mb-1">Active Buffs</div>
                  <div className="space-y-1">
                    {activeBuffs.map(buff => (
                      <div key={buff.type} className="flex justify-between">
                        <span className="text-gray-400">{buff.type}:</span>
                        <span className="text-white">
                          +{buff.value}% ({Math.ceil((buff.expiresAt - Date.now()) / 1000)}s)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Timestamp */}
              <div className="text-center text-[10px] text-gray-600">
                {new Date().toISOString()}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
