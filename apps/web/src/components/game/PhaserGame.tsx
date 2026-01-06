'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Phaser from 'phaser';
import { gameConfig } from '@/game/config';
import { BattleScene } from '@/game/scenes/BattleScene';
import { getSocket } from '@/lib/socket';
import { detectLanguage, useTranslation, Language } from '@/lib/i18n';

// ═══════════════════════════════════════════════════════════
// PHASER GAME + REACT UI
//
// Phaser: Boss sprite + damage numbers + effects ONLY
// React: ALL UI (bars, buttons, feed, overlays)
//
// See docs/ARCHITECTURE.md
// ═══════════════════════════════════════════════════════════

const APP_VERSION = 'v1.0.34';

interface BossState {
  name: string;
  nameRu?: string;
  icon: string;
  image?: string;
  hp: number;
  maxHp: number;
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

  // Check exhaustion
  const isExhausted = useCallback(() => {
    return playerState.exhaustedUntil !== null && Date.now() < playerState.exhaustedUntil;
  }, [playerState.exhaustedUntil]);

  // Use skill
  const useSkill = useCallback((skill: Skill) => {
    const now = Date.now();
    if (now - skill.lastUsed < skill.cooldown) return;
    if (playerState.mana < skill.manaCost) return;
    if (bossState.hp <= 0) return;

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
      }));
    });

    // Auto-attack result
    socket.on('autoAttack:result', (data: any) => {
      setSessionDamage(data.sessionDamage || 0);
      setPlayerState(p => ({
        ...p,
        gold: data.gold ?? p.gold,
      }));
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
    });

    socket.on('boss:respawn', () => {
      setSessionDamage(0);
      setVictoryData(null);
      setRespawnCountdown(0);
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
        }));
      }
    });

    if (socket.connected) {
      setConnected(true);
      socket.emit('player:get');
    }

    // Регенерация теперь только на сервере (player:state каждую секунду)
    // Клиентский интервал убран чтобы избежать двойной регенерации и скачков

    return () => {
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
      {/* HEADER - Boss HP Bar (triple tap = show welcome) */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div
        className="absolute top-0 left-0 right-0 z-10 p-3 bg-gradient-to-b from-black/80 to-transparent"
        onClick={handleHeaderTap}
      >
        <div className="flex justify-between items-center mb-1">
          <div className="flex items-center gap-2">
            <span className="text-lg">{bossState.icon}</span>
            <div>
              <span className="font-bold text-sm text-l2-gold">{bossDisplayName}</span>
              <span className="text-xs text-gray-500 ml-2">({bossState.bossIndex}/{bossState.totalBosses})</span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs text-gray-400">
              {connected ? `${playersOnline} ${t.game.online}` : t.game.connecting}
            </span>
            <div className="text-[10px] text-gray-600">{APP_VERSION}</div>
          </div>
        </div>
        <div className="text-xs text-white mb-1">
          {bossState.hp.toLocaleString()} / {bossState.maxHp.toLocaleString()}
        </div>
        <div className="h-3 bg-black/50 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-100 ${
              hpPercent < 25 ? 'bg-red-600' : hpPercent < 50 ? 'bg-orange-500' : hpPercent < 75 ? 'bg-yellow-500' : 'bg-green-500'
            }`}
            style={{ width: `${hpPercent}%` }}
          />
        </div>
        <button
          onClick={() => setShowDropTable(true)}
          className="mt-2 px-3 py-1 bg-purple-500/30 text-purple-300 text-xs rounded-lg border border-purple-500/40"
        >
          🎁 {lang === 'ru' ? 'Дроп' : 'Drop'}
        </button>
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
        {/* Mana Bar */}
        <div className="mb-2">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-blue-400">💧 Mana</span>
            <span className="text-blue-400">{Math.floor(playerState.mana)}/{playerState.maxMana}</span>
          </div>
          <div className="h-3 bg-black/50 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 transition-all duration-100" style={{ width: `${manaPercent}%` }} />
          </div>
        </div>

        {/* Stamina Bar */}
        <div className="mb-3">
          <div className="flex justify-between text-xs mb-1">
            <span className={exhausted ? 'text-red-400' : 'text-green-400'}>
              {exhausted ? '😵 EXHAUSTED' : '⚡ Stamina'}
            </span>
            <span className={exhausted ? 'text-red-400' : 'text-green-400'}>
              {Math.floor(playerState.stamina)}/{playerState.maxStamina}
            </span>
          </div>
          <div className="h-3 bg-black/50 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-100 ${
                exhausted ? 'bg-red-500' : staminaPercent < 25 ? 'bg-orange-500' : 'bg-green-500'
              }`}
              style={{ width: `${staminaPercent}%` }}
            />
          </div>
        </div>

        {/* Skill Buttons */}
        <div className="flex justify-center gap-3">
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
                  transition-all active:scale-95
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

        {/* Session Damage */}
        <div className="mt-2 text-center text-xs">
          <span className="text-gray-400">{t.game.sessionDamage}: </span>
          <span className="text-l2-gold font-bold">{sessionDamage.toLocaleString()}</span>
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
                {Math.floor(respawnCountdown / 60000)}:{String(Math.floor((respawnCountdown % 60000) / 1000)).padStart(2, '0')}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-2 text-center">
                <div className="text-xs text-red-400">{t.boss.finalBlow}</div>
                <div className="text-sm font-bold text-white truncate">{victoryData.finalBlowBy}</div>
              </div>
              <div className="bg-purple-900/30 border border-purple-500/50 rounded-lg p-2 text-center">
                <div className="text-xs text-purple-400">{t.boss.topDamage}</div>
                <div className="text-sm font-bold text-white truncate">{victoryData.topDamageBy}</div>
              </div>
            </div>
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
