'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Phaser from 'phaser';
import { Gem } from 'lucide-react';
import { gameConfig } from '@/game/config';
import { BattleScene } from '@/game/scenes/BattleScene';
import { getSocket } from '@/lib/socket';
import { detectLanguage, useTranslation, Language } from '@/lib/i18n';
import { getTaskManager } from '@/lib/taskManager';

// ═══════════════════════════════════════════════════════════
// PHASER GAME + REACT UI
//
// Phaser: Boss sprite + damage numbers + effects ONLY
// React: ALL UI (bars, buttons, feed, overlays)
//
// See docs/ARCHITECTURE.md
// ═══════════════════════════════════════════════════════════

const APP_VERSION = 'v1.0.51';

interface BossState {
  name: string;
  nameRu?: string;
  icon: string;
  image?: string;
  hp: number;
  maxHp: number;
  defense: number;
  bossIndex: number;
  totalBosses: number;
}

interface StarterItem {
  name: string;
  icon: string;
  slot: string;
}

interface PlayerState {
  stamina: number;
  maxStamina: number;
  mana: number;
  maxMana: number;
  exhaustedUntil: number | null;
  gold: number;
  soulshotNG: number;
  // HUD fields
  level: number;
  crystals: number;
  photoUrl: string | null;
}

interface Skill {
  id: string;
  name: string;
  icon: string;
  manaCost: number;
  cooldown: number;
  lastUsed: number;
  color: string;
}

interface DamageFeedItem {
  playerName: string;
  damage: number;
  isCrit: boolean;
  timestamp: number;
}

interface VictoryData {
  bossName: string;
  bossIcon: string;
  finalBlowBy: string;
  topDamageBy: string;
  respawnAt: number;
}

interface PendingReward {
  id: string;
  bossName: string;
  bossIcon: string;
  rank: number | null;
  chestsWooden: number;
  chestsBronze: number;
  chestsSilver: number;
  chestsGold: number;
}

const SKILLS: Skill[] = [
  { id: 'fireball', name: 'Fireball', icon: '🔥', manaCost: 100, cooldown: 10000, lastUsed: 0, color: 'border-orange-500' },
  { id: 'iceball', name: 'Ice Ball', icon: '❄️', manaCost: 100, cooldown: 10000, lastUsed: 0, color: 'border-cyan-400' },
  { id: 'lightning', name: 'Lightning', icon: '⚡', manaCost: 100, cooldown: 10000, lastUsed: 0, color: 'border-yellow-400' },
];

const COOLDOWNS_KEY = 'battle_skill_cooldowns';

export default function PhaserGame() {
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<BattleScene | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Language
  const [lang, setLang] = useState<Language>('en');
  const t = useTranslation(lang);

  // Connection
  const [connected, setConnected] = useState(false);
  const [playersOnline, setPlayersOnline] = useState(0);

  // Boss - initial values 0 so bars show 0% until real data arrives
  const [bossState, setBossState] = useState<BossState>({
    name: 'Loading...',
    nameRu: '',
    icon: '⏳',
    hp: 0,
    maxHp: 1,
    defense: 0,
    bossIndex: 0,
    totalBosses: 100,
  });

  // Player - initial values 0 so bars show 0% until real data arrives
  const [playerState, setPlayerState] = useState<PlayerState>({
    stamina: 0,
    maxStamina: 1,
    mana: 0,
    maxMana: 1,
    exhaustedUntil: null,
    gold: 0,
    soulshotNG: 0,
    level: 1,
    crystals: 0,
    photoUrl: null,
  });

  // Soulshot auto-use toggle (persisted in localStorage)
  const [autoUseSoulshot, setAutoUseSoulshot] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('ic_auto_soulshot') === 'true';
    }
    return false;
  });

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

  // Debug: triple tap counter
  const tapCountRef = useRef(0);
  const lastTapTimeRef = useRef(0);

  // Overlays
  const [victoryData, setVictoryData] = useState<VictoryData | null>(null);
  const [respawnCountdown, setRespawnCountdown] = useState(0);
  const [offlineEarnings, setOfflineEarnings] = useState<{ gold: number; hours: number } | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeStep, setWelcomeStep] = useState(0); // 0, 1, 2, 3 for 4-screen carousel
  const [starterItems, setStarterItems] = useState<StarterItem[]>([]);
  const [starterOpening, setStarterOpening] = useState(false);
  const [showDropTable, setShowDropTable] = useState(false);
  const [pendingRewards, setPendingRewards] = useState<PendingReward[]>([]);
  const [claimingReward, setClaimingReward] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [activityStatus, setActivityStatus] = useState<{ time: number; eligible: boolean }>({ time: 0, eligible: false });
  const [pressedSkill, setPressedSkill] = useState<string | null>(null);

  // Check exhaustion
  const isExhausted = useCallback(() => {
    return playerState.exhaustedUntil !== null && Date.now() < playerState.exhaustedUntil;
  }, [playerState.exhaustedUntil]);

  // Toggle auto-use soulshot
  const toggleAutoSoulshot = useCallback(() => {
    setAutoUseSoulshot(prev => {
      const newValue = !prev;
      localStorage.setItem('ic_auto_soulshot', String(newValue));
      // Notify server about toggle state
      getSocket().emit('soulshot:autoUse', { enabled: newValue });
      return newValue;
    });
  }, []);

  // Use skill
  const useSkill = useCallback((skill: Skill) => {
    const now = Date.now();
    if (now - skill.lastUsed < skill.cooldown) return;
    if (playerState.mana < skill.manaCost) return;
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

  // Format helpers
  const formatCompact = (num: number) => {
    if (num >= 1000000) return Math.floor(num / 1000000) + 'M';
    if (num >= 1000) return Math.floor(num / 1000) + 'K';
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
        transparent: true, // Transparent background
        callbacks: {
          postBoot: (game: Phaser.Game) => {
            const scene = game.scene.getScene('BattleScene') as BattleScene;
            if (scene) {
              sceneRef.current = scene;
              scene.scene.restart({ socket });
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
        }
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
          hp: data.hp,
          maxHp: data.maxHp,
          defense: data.defense ?? 0,
          bossIndex: data.bossIndex || 1,
          totalBosses: data.totalBosses || 100,
        };
      });
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
      setPlayerState(p => ({
        ...p,
        stamina: data.stamina ?? p.stamina,
        maxStamina: data.maxStamina ?? p.maxStamina,
        gold: data.gold ?? p.gold,
        soulshotNG: data.soulshotNG ?? p.soulshotNG,
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
        soulshotNG: data.soulshotNG ?? p.soulshotNG,
      }));
      // Track damage for tasks
      if (data.damage > 0) {
        getTaskManager().recordDamage(data.damage);
      }
    });

    // Player state (stamina/mana regen from server)
    socket.on('player:state', (data: any) => {
      setPlayerState(p => ({
        ...p,
        stamina: data.stamina ?? p.stamina,
        maxStamina: data.maxStamina ?? p.maxStamina,
        mana: data.mana ?? p.mana,
        maxMana: data.maxMana ?? p.maxMana,
        exhaustedUntil: data.exhaustedUntil ?? p.exhaustedUntil,
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
        soulshotNG: data.soulshotNG ?? 0,
        level: data.level ?? 1,
        crystals: data.ancientCoin ?? 0,
        photoUrl: data.photoUrl ?? null,
      });
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

    // Offline earnings
    socket.on('offline:earnings', (data: { gold: number; hours: number }) => {
      setOfflineEarnings(data);
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
      setVictoryData(null);
      setRespawnCountdown(0);
      setPendingRewards([]);
      setClaimError(null);
      setActivityStatus({ time: 0, eligible: false });
      // Обновить состояние босса с новыми данными
      if (data) {
        const newImage = data.image || '/assets/bosses/boss_single.png';
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
      }
    });

    socket.on('rewards:claimed', () => {
      setClaimingReward(false);
      setPendingRewards([]);
      setClaimError(null);
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
          soulshotNG: data.soulshotNG ?? p.soulshotNG,
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
      socket.off('hero:exhausted');
      socket.off('damage:feed');
      socket.off('offline:earnings');
      socket.off('boss:killed');
      socket.off('boss:respawn');
      socket.off('player:data');
      socket.off('starter:opened');
      socket.off('starter:error');
      socket.off('rewards:data');
      socket.off('rewards:claimed');
      socket.off('rewards:error');
      socket.off('activity:status');

      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
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
      {/* COMPACT PLAYER HUD - Top bar */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="absolute top-0 left-0 right-0 z-20 px-3 py-1.5 bg-black/60">
        <div className="flex items-center justify-between">
          {/* Left: Avatar + Level */}
          <div className="flex items-center gap-1.5">
            {playerState.photoUrl ? (
              <img
                src={playerState.photoUrl}
                alt=""
                className="w-7 h-7 rounded-full border border-l2-gold/50"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-l2-panel flex items-center justify-center">
                <span className="text-xs">👤</span>
              </div>
            )}
            <div className="bg-l2-gold/20 px-1.5 py-0.5 rounded">
              <span className="text-[10px] font-bold text-l2-gold">Lv.{playerState.level}</span>
            </div>
          </div>

          {/* Right: Gold + Crystals */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <span className="text-xs">🪙</span>
              <span className="text-xs font-bold text-l2-gold">{formatCompact(playerState.gold)}</span>
            </div>
            <div className="flex items-center gap-1 bg-purple-500/20 px-1.5 py-0.5 rounded">
              <Gem className="text-purple-400" size={12} />
              <span className="text-xs font-bold text-purple-400">{playerState.crystals}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* COMPACT BOSS HP BAR (triple tap = show welcome) */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div
        className="absolute top-9 left-0 right-0 z-10 px-3 pt-1 pb-1"
        onClick={handleHeaderTap}
      >
        {/* Boss name + online + drop button */}
        <div className="flex justify-between items-center mb-0.5">
          <div className="flex items-center gap-1 text-[10px]">
            <span>{bossState.icon}</span>
            <span className="text-l2-gold font-bold">{bossDisplayName}</span>
            <span className="text-gray-500">({bossState.bossIndex}/{bossState.totalBosses})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500">
              {connected ? `${playersOnline} ${t.game.online}` : t.game.connecting}
            </span>
            {/* Drop button - compact icon */}
            <button
              onClick={(e) => { e.stopPropagation(); setShowDropTable(true); }}
              className="w-6 h-6 bg-purple-500/30 rounded-full flex items-center justify-center
                         border border-purple-500/40 active:scale-90 transition-transform"
            >
              <span className="text-sm">🎁</span>
            </button>
          </div>
        </div>

        {/* HP bar - thinner (h-2) with HP numbers inside */}
        <div className="h-2.5 bg-black/60 rounded-full overflow-hidden relative">
          <div
            className={`h-full transition-all duration-100 ${
              hpPercent < 25 ? 'bg-red-600 hp-critical' :
              hpPercent < 50 ? 'bg-orange-500' :
              hpPercent < 75 ? 'bg-yellow-500' : 'bg-green-500'
            }`}
            style={{ width: `${hpPercent}%` }}
          />
          {/* HP numbers centered inside bar */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[9px] text-white/90 font-bold drop-shadow-md">
              {formatCompact(bossState.hp)} / {formatCompact(bossState.maxHp)}
            </span>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* PHASER CANVAS - Boss only */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div ref={containerRef} id="game-container" className="flex-1 w-full" />

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* DAMAGE FEED - Right side, between HP bar and Mana bar */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="absolute top-28 bottom-48 right-3 z-10 text-right overflow-hidden flex flex-col justify-start">
        <div className="space-y-1">
          {damageFeed.map((item, i) => (
            <div
              key={item.timestamp}
              className={`text-xs ${item.isCrit ? 'text-red-400' : 'text-gray-400'}`}
              style={{ opacity: 1 - i * 0.2 }}
            >
              {item.playerName}: -{item.damage.toLocaleString()}
            </div>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* BOTTOM UI - Bars + Skills */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-3 bg-gradient-to-t from-black/80 to-transparent">
        {/* Compact Resource Bars - 50% width, side by side */}
        <div className="flex gap-2 mb-2">
          {/* Mana Bar - 50% */}
          <div className="flex-1">
            <div className="flex justify-between text-[10px] mb-0.5">
              <span className="text-blue-400">💧</span>
              <span className="text-blue-400">{Math.floor(playerState.mana)}/{playerState.maxMana}</span>
            </div>
            <div className="h-2 bg-black/50 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 transition-all duration-100" style={{ width: `${manaPercent}%` }} />
            </div>
          </div>

          {/* Stamina Bar - 50% */}
          <div className="flex-1">
            <div className="flex justify-between text-[10px] mb-0.5">
              <span className={exhausted ? 'text-red-400' : 'text-green-400'}>
                {exhausted ? '😵' : '⚡'}
              </span>
              <span className={exhausted ? 'text-red-400' : 'text-green-400'}>
                {Math.floor(playerState.stamina)}/{playerState.maxStamina}
              </span>
            </div>
            <div className="h-2 bg-black/50 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-100 ${
                  exhausted ? 'bg-red-500' : staminaPercent < 25 ? 'bg-orange-500' : 'bg-green-500'
                }`}
                style={{ width: `${staminaPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Skill Buttons + Soulshot Slot */}
        <div className="flex justify-center items-center gap-3">
          {/* Soulshot Slot */}
          <button
            onClick={toggleAutoSoulshot}
            className={`
              relative w-14 h-14 rounded-lg border-2
              ${autoUseSoulshot && playerState.soulshotNG > 0 ? 'border-orange-500 bg-orange-900/30' : 'border-gray-600 bg-gray-900/90'}
              flex flex-col items-center justify-center
              transition-all active:scale-95
            `}
          >
            <span className="text-2xl">💥</span>
            <span className="absolute -top-1 -right-1 bg-black/80 text-[10px] px-1 rounded text-gray-300">
              {playerState.soulshotNG > 999 ? '999+' : playerState.soulshotNG}
            </span>
            {autoUseSoulshot && playerState.soulshotNG > 0 && (
              <span className="absolute bottom-0.5 text-[8px] text-orange-400 font-bold">AUTO</span>
            )}
            {playerState.soulshotNG === 0 && (
              <div className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center">
                <span className="text-xs text-red-400">0</span>
              </div>
            )}
          </button>

          {skills.map(skill => {
            const now = Date.now();
            const remaining = Math.max(0, skill.cooldown - (now - skill.lastUsed));
            const onCooldown = remaining > 0;
            // Check if real data loaded (maxHp > 1 means server sent boss:state)
            const dataLoaded = bossState.maxHp > 1;
            const canUse = dataLoaded && !onCooldown && playerState.mana >= skill.manaCost && bossState.hp > 0;

            return (
              <button
                key={skill.id}
                onClick={() => useSkill(skill)}
                disabled={!canUse}
                className={`
                  relative w-14 h-14 rounded-lg border-2 ${skill.color}
                  bg-gray-900/90 flex flex-col items-center justify-center
                  ${canUse ? 'opacity-100' : 'opacity-50'}
                  transition-all
                  ${pressedSkill === skill.id ? 'skill-btn-press' : ''}
                `}
              >
                <span className="text-2xl">{skill.icon}</span>
                {onCooldown && (
                  <>
                    <div
                      className="absolute inset-0 bg-black/70 rounded-lg"
                      style={{ height: `${(remaining / skill.cooldown) * 100}%`, top: 'auto', bottom: 0 }}
                    />
                    <span className="absolute text-xs font-bold text-white">
                      {Math.ceil(remaining / 1000)}
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>

        {/* Session Damage + Activity Status */}
        <div className="mt-2 text-center text-xs">
          <div>
            <span className="text-gray-400">{t.game.sessionDamage}: </span>
            <span className="text-l2-gold font-bold">{sessionDamage.toLocaleString()}</span>
          </div>
          <div className={activityStatus.eligible ? 'text-green-400' : 'text-gray-500'}>
            {activityStatus.eligible
              ? (lang === 'ru' ? '✓ Награда доступна' : '✓ Reward eligible')
              : `⏱️ ${Math.floor(activityStatus.time / 1000)}/30s`}
          </div>
        </div>
      </div>

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

            {/* Персональная награда */}
            {pendingRewards.length > 0 && (
              <div className="bg-l2-gold/10 border border-l2-gold/50 rounded-lg p-3 mb-3">
                <div className="text-center mb-2">
                  <div className="text-l2-gold font-bold text-sm">
                    {lang === 'ru' ? 'Твоя награда' : 'Your Reward'}
                    {pendingRewards[0].rank && ` (#${pendingRewards[0].rank})`}
                  </div>
                </div>
                <div className="flex justify-center gap-2 text-sm">
                  {pendingRewards[0].chestsWooden > 0 && (
                    <span className="bg-amber-900/50 px-2 py-1 rounded">{pendingRewards[0].chestsWooden}x Wooden</span>
                  )}
                  {pendingRewards[0].chestsBronze > 0 && (
                    <span className="bg-orange-900/50 px-2 py-1 rounded">{pendingRewards[0].chestsBronze}x Bronze</span>
                  )}
                  {pendingRewards[0].chestsSilver > 0 && (
                    <span className="bg-gray-600/50 px-2 py-1 rounded">{pendingRewards[0].chestsSilver}x Silver</span>
                  )}
                  {pendingRewards[0].chestsGold > 0 && (
                    <span className="bg-yellow-600/50 px-2 py-1 rounded">{pendingRewards[0].chestsGold}x Gold</span>
                  )}
                </div>
                <button
                  onClick={() => {
                    if (!claimingReward && pendingRewards[0]) {
                      setClaimingReward(true);
                      setClaimError(null);
                      getSocket().emit('rewards:claim', { rewardId: pendingRewards[0].id });
                    }
                  }}
                  disabled={claimingReward}
                  className={`w-full mt-3 py-2 rounded-lg font-bold text-sm transition-all ${
                    claimingReward
                      ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      : 'bg-l2-gold text-black hover:bg-l2-gold/80'
                  }`}
                >
                  {claimingReward
                    ? (lang === 'ru' ? 'Забираем...' : 'Claiming...')
                    : (lang === 'ru' ? 'Забрать награду' : 'Claim Reward')}
                </button>
                {claimError && (
                  <div className="text-red-400 text-xs text-center mt-2">{claimError}</div>
                )}
              </div>
            )}

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
      {offlineEarnings && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-l2-panel rounded-lg p-6 m-4 max-w-sm text-center">
            <div className="text-l2-gold text-lg font-bold mb-2">{t.offline.welcomeBack}</div>
            <div className="bg-black/30 rounded-lg p-4 mb-4">
              <div className="text-2xl font-bold text-l2-gold">
                +{offlineEarnings.gold.toLocaleString()} {t.character.gold}
              </div>
            </div>
            <button
              onClick={() => setOfflineEarnings(null)}
              className="w-full py-3 bg-l2-gold text-black font-bold rounded-lg"
            >
              {t.offline.collect}
            </button>
          </div>
        </div>
      )}

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
                <div className="text-gray-300 text-xs">1🟨 + 2🪙 + 2🟫 + 2🪵 + Slayer 7д</div>
              </div>
              <div className="bg-gray-400/20 rounded-lg p-2 border border-gray-400/30">
                <div className="text-gray-300 font-bold">🥈 2 место</div>
                <div className="text-gray-400 text-xs">1🟨 + 1🪙 + 2🟫 + 2🪵 + Elite 7д</div>
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

    </div>
  );
}
