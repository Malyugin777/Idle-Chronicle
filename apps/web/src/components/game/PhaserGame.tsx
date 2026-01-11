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
import WheelModal from './WheelModal';

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
  formatCompact as formatCompactUtil,
} from './constants';
import { TopHUD, SkillBar, LoadingScreen } from './ui';

// Socket listener hooks
import {
  registerAuthListeners,
  registerBossListeners,
  registerCombatListeners,
  registerPlayerListeners,
  registerRewardsListeners,
  registerStarterListeners,
  registerMiscListeners,
} from './hooks';

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
  const [showWheel, setShowWheel] = useState(false);
  const [hasClaimable, setHasClaimable] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [fps, setFps] = useState(0);
  const [showFps, setShowFps] = useState(false);

  // Loading screen state (show until all data received)
  const [loadingState, setLoadingState] = useState({
    auth: false,
    boss: false,
    player: false,
  });
  const isLoading = !loadingState.auth || !loadingState.boss || !loadingState.player;

  // FPS counter for GPU diagnostics
  useEffect(() => {
    if (!showFps) return;
    let frameCount = 0;
    let lastTime = performance.now();
    let animId: number;

    const measure = () => {
      frameCount++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        setFps(frameCount);
        frameCount = 0;
        lastTime = now;
      }
      animId = requestAnimationFrame(measure);
    };
    animId = requestAnimationFrame(measure);

    return () => cancelAnimationFrame(animId);
  }, [showFps]);

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

  // Format helpers - use unified version from constants
  const formatCompact = formatCompactUtil;

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

  // ═══════════════════════════════════════════════════════════
  // PHASER INITIALIZATION (separate effect)
  // ═══════════════════════════════════════════════════════════
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

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  // ═══════════════════════════════════════════════════════════
  // AUTH & CONNECTION LISTENERS
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    const socket = getSocket();

    // Auth function
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
      // DEV MODE
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

    const cleanup = registerAuthListeners(socket, {
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
    });

    // Initial auth if already connected
    if (socket.connected) {
      setConnected(true);
      doAuth();
      socket.emit('player:get');
    }

    return cleanup;
  }, []);

  // ═══════════════════════════════════════════════════════════
  // BOSS STATE LISTENERS
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    const socket = getSocket();

    const cleanup = registerBossListeners(socket, {
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
    });

    return cleanup;
  }, []);

  // ═══════════════════════════════════════════════════════════
  // COMBAT LISTENERS (tap, skill, damage feed)
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    const socket = getSocket();

    const cleanup = registerCombatListeners(socket, {
      setSessionDamage,
      setSessionClicks,
      setCurrentRank,
      setPlayerState,
      setDamageFeed,
      setActiveBuffs,
      getTaskManager,
    });

    return cleanup;
  }, []);

  // ═══════════════════════════════════════════════════════════
  // PLAYER STATE LISTENERS
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    const socket = getSocket();

    const cleanup = registerPlayerListeners(socket, {
      setPlayerState,
      setSessionDamage,
    });

    return cleanup;
  }, []);

  // ═══════════════════════════════════════════════════════════
  // REWARDS & TREASURY LISTENERS
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    const socket = getSocket();

    const cleanup = registerRewardsListeners(socket, {
      setPendingRewards,
      setSlotInfo,
      setChestSelection,
      setClaimingReward,
      setBuyingSlot,
      setClaimError,
      setPlayerState,
      setAutoUseEther,
      setShowMeditation,
    });

    return cleanup;
  }, []);

  // ═══════════════════════════════════════════════════════════
  // STARTER PACK LISTENERS
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    const socket = getSocket();

    const cleanup = registerStarterListeners(socket, {
      setStarterItems,
      setStarterOpening,
    });

    return cleanup;
  }, []);

  // ═══════════════════════════════════════════════════════════
  // MISC LISTENERS (exhaustion, level up, activity)
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    const socket = getSocket();

    const cleanup = registerMiscListeners(socket, {
      setPlayerState,
      setAutoAttack,
      setActivityStatus,
    });

    return cleanup;
  }, []);

  // ═══════════════════════════════════════════════════════════
  // ACTIVITY PING (for eligibility)
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    const socket = getSocket();
    const activityPingInterval = setInterval(() => {
      socket.emit('activity:ping');
    }, 5000);

    return () => clearInterval(activityPingInterval);
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
  const exhausted = playerState.exhaustedUntil !== null && Date.now() < playerState.exhaustedUntil;

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
            <div className="text-center mt-2 flex items-center justify-center gap-2">
              <span
                className="text-[8px] text-gray-600 cursor-pointer hover:text-gray-400"
                onClick={() => setShowDebug(true)}
              >
                {APP_VERSION}
              </span>
              {showFps && (
                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                  fps >= 50 ? 'bg-green-900/50 text-green-400' :
                  fps >= 30 ? 'bg-yellow-900/50 text-yellow-400' :
                  'bg-red-900/50 text-red-400'
                }`}>
                  {fps} FPS
                </span>
              )}
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
      {/* Wheel of Fortune Button */}
      <button
        onClick={() => setShowWheel(true)}
        className="absolute top-[27rem] left-2 z-10 w-12 h-12 bg-gradient-to-b from-yellow-700/60 to-amber-900/80
                   rounded-lg border border-yellow-600/50 flex flex-col items-center justify-center
                   active:scale-90 transition-all hover:border-yellow-500/70 shadow-lg shadow-yellow-900/30"
      >
        <span className="text-xl">🎡</span>
        <span className="text-[7px] text-yellow-300 font-bold mt-0.5">
          {lang === 'ru' ? 'КОЛЕСО' : 'WHEEL'}
        </span>
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
      {/* WHEEL OF FORTUNE MODAL */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <WheelModal isOpen={showWheel} onClose={() => setShowWheel(false)} lang={lang} />

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* FPS OVERLAY - Fixed position when enabled */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {showFps && (
        <div className="fixed top-2 right-2 z-[100] pointer-events-none">
          <div className={`px-2 py-1 rounded text-xs font-mono font-bold backdrop-blur-sm ${
            fps >= 50 ? 'bg-green-900/70 text-green-400 border border-green-500/30' :
            fps >= 30 ? 'bg-yellow-900/70 text-yellow-400 border border-yellow-500/30' :
            'bg-red-900/70 text-red-400 border border-red-500/30 animate-pulse'
          }`}>
            {fps} FPS
          </div>
        </div>
      )}

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

              {/* FPS Counter */}
              <div className="bg-black/40 rounded-lg p-3">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="text-gray-500 text-xs mb-1">FPS Counter</div>
                    <div className={`font-mono font-bold ${fps >= 50 ? 'text-green-400' : fps >= 30 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {showFps ? `${fps} FPS` : 'Disabled'}
                    </div>
                  </div>
                  <button
                    onClick={() => setShowFps(prev => !prev)}
                    className={`px-3 py-1.5 rounded text-xs font-bold ${
                      showFps ? 'bg-red-600 hover:bg-red-500' : 'bg-green-600 hover:bg-green-500'
                    }`}
                  >
                    {showFps ? 'Disable' : 'Enable'}
                  </button>
                </div>
                {showFps && (
                  <div className="mt-2 text-[10px] text-gray-500">
                    {fps < 30 && '⚠️ Low FPS - possible GPU issue'}
                    {fps >= 30 && fps < 50 && '⚡ Moderate FPS'}
                    {fps >= 50 && '✅ Good FPS'}
                  </div>
                )}
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
