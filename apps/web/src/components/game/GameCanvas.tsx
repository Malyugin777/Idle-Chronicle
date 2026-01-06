'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { THEME } from '@/lib/constants';
import { getSocket } from '@/lib/socket';
import { detectLanguage, useTranslation, Language } from '@/lib/i18n';

interface BossState {
  id: string;
  name: string;
  nameRu?: string;
  title?: string;
  hp: number;
  maxHp: number;
  defense?: number;
  ragePhase: number;
  playersOnline: number;
  icon?: string;
  image?: string | null;
  bossIndex?: number;
  totalBosses?: number;
  // Respawn timer
  isRespawning?: boolean;
  respawnAt?: number | null;
}

interface DamageFeed {
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
  topDamage: number;
  rewards: Array<{
    visitorName: string;
    damage: number;
    damagePercent: number;
    adenaReward: number;
    expReward: number;
    isFinalBlow: boolean;
    isTopDamage: boolean;
  }>;
  respawnAt: number;
}

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Server state
  const [bossState, setBossState] = useState<BossState>({
    id: '',
    name: 'Loading...',
    hp: 1_000_000,
    maxHp: 1_000_000,
    ragePhase: 0,
    playersOnline: 0,
  });

  // Legacy mana (for skills - future)
  const [mana, setMana] = useState(1000);
  const [maxMana] = useState(1000);
  // L2 Stamina System (NEW)
  const [stamina, setStamina] = useState(100);
  const [maxStamina, setMaxStamina] = useState(100);
  const [exhaustedUntil, setExhaustedUntil] = useState<number | null>(null);
  const [sessionDamage, setSessionDamage] = useState(0);
  const [connected, setConnected] = useState(false);
  const [damageFeed, setDamageFeed] = useState<DamageFeed[]>([]);
  const [victoryData, setVictoryData] = useState<VictoryData | null>(null);
  const [respawnCountdown, setRespawnCountdown] = useState(0);
  const [waitingForRespawn, setWaitingForRespawn] = useState(false); // Keep showing countdown screen until boss respawns
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeStage, setWelcomeStage] = useState(1); // 1 = intro, 2 = details + chest, 3 = chest opened
  const [starterEquipment, setStarterEquipment] = useState<Array<{
    id: string;
    code: string;
    name: string;
    icon: string;
    slot: string;
    pAtk: number;
    pDef: number;
    rarity: string;
  }>>([]);
  const [openingChest, setOpeningChest] = useState(false);
  const [autoAttackDamage, setAutoAttackDamage] = useState(0);
  const [lang, setLang] = useState<Language>('en');
  const [showDropTable, setShowDropTable] = useState(false);
  const t = useTranslation(lang);

  // Helper to format large numbers
  const formatCompact = (num: number) => {
    if (num >= 1000000) return Math.floor(num / 1000000) + 'M';
    if (num >= 1000) return Math.floor(num / 1000) + 'K';
    return num.toString();
  };

  // Boss image
  const bossImgRef = useRef<HTMLImageElement | null>(null);

  // Animation state
  const hitT0Ref = useRef(-1);
  const floatsRef = useRef<Array<{
    text: string;
    x: number;
    y: number;
    vy: number;
    born: number;
    life: number;
    crit: boolean;
  }>>([]);
  const sparksRef = useRef<Array<{
    x: number;
    y: number;
    born: number;
    life: number;
  }>>([]);

  // Tap batching
  const tapQueueRef = useRef(0);
  const tapFlushIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Constants
  const HIT_MS = 240;
  const SHAKE_MS = 120;
  const FLASH_MS = 120;
  const PUNCH_MS = 190;
  const CUT_Y_RATIO = 0.46;
  const MAX_TILT = -0.22;
  const MAX_BACK = 10;

  // Socket connection
  useEffect(() => {
    const socket = getSocket();

    // Detect language on mount
    const detectedLang = detectLanguage();
    setLang(detectedLang);

    // Auth function - reusable for connect and reconnect
    const doAuth = () => {
      if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
        const webApp = window.Telegram.WebApp;
        const user = webApp.initDataUnsafe?.user;

        if (user) {
          const langCode = (user as { language_code?: string }).language_code;
          console.log('[Auth] Sending auth for user:', user.id, 'lang:', langCode);
          socket.emit('auth', {
            telegramId: user.id,
            username: user.username,
            firstName: user.first_name,
            photoUrl: user.photo_url,
            languageCode: langCode,
            initData: webApp.initData,
          });
        } else {
          console.log('[Auth] No Telegram user found, playing as guest');
        }
      } else {
        console.log('[Auth] Not in Telegram WebApp');
      }
    };

    socket.on('connect', () => {
      console.log('[Game] Socket connected');
      setConnected(true);
      doAuth();
    });

    socket.on('reconnect', () => {
      console.log('[Game] Socket reconnected');
      setConnected(true);
      doAuth();
    });

    socket.on('auth:error', (data) => {
      console.error('[Auth] Error:', data.message);
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    // Boss state updates
    socket.on('boss:state', (data: BossState) => {
      setBossState(data);

      // Handle respawn timer from persistent state (when page loads during respawn)
      if (data.isRespawning && data.respawnAt && !victoryData) {
        const remaining = Math.max(0, data.respawnAt - Date.now());
        setRespawnCountdown(remaining);
        setWaitingForRespawn(true); // Keep showing until boss respawns
      } else if (!data.isRespawning && !victoryData) {
        // Boss is alive - clear waiting state
        setRespawnCountdown(0);
        setWaitingForRespawn(false);
      }
    });

    // Tap results - show actual damage from server
    socket.on('tap:result', (data: {
      damage: number;
      crits: number;
      mana: number;
      sessionDamage: number;
      // L2 Stamina (NEW)
      stamina?: number;
      maxStamina?: number;
      thornsTaken?: number;
      staminaCost?: number;
    }) => {
      setMana(data.mana);
      setSessionDamage(data.sessionDamage);
      // L2 Stamina (NEW)
      if (data.stamina !== undefined) setStamina(data.stamina);
      if (data.maxStamina !== undefined) setMaxStamina(data.maxStamina);

      // Show actual damage number from server
      const canvas = document.querySelector('canvas');
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;

        floatsRef.current.push({
          text: '-' + data.damage.toLocaleString(),
          x: w / 2 + Math.floor(Math.random() * 120 - 60),
          y: h / 2 + Math.floor(Math.random() * 40 - 20),
          vy: -0.4,
          born: performance.now(),
          life: 1200,
          crit: data.crits > 0,
        });
      }
    });

    // L2: Hero exhausted event (NEW)
    socket.on('hero:exhausted', (data: { until: number; duration: number }) => {
      console.log('[Hero] Exhausted until:', new Date(data.until).toLocaleTimeString());
      setExhaustedUntil(data.until);
      // Auto-clear exhaustion when it expires
      setTimeout(() => {
        setExhaustedUntil(null);
      }, data.duration);
    });

    // Auto-attack results
    socket.on('autoAttack:result', (data: { damage: number; sessionDamage: number }) => {
      setSessionDamage(data.sessionDamage);
      setAutoAttackDamage(data.damage);
      // Clear auto attack indicator after a moment
      setTimeout(() => setAutoAttackDamage(0), 500);
    });

    // Damage feed from other players
    socket.on('damage:feed', (data: { playerName: string; damage: number; isCrit: boolean }) => {
      setDamageFeed(prev => [
        { ...data, timestamp: Date.now() },
        ...prev.slice(0, 9), // Keep last 10
      ]);
    });

    // Boss killed
    socket.on('boss:killed', (data: {
      bossName: string;
      bossIcon: string;
      finalBlowBy: string;
      topDamageBy: string;
      topDamage: number;
      rewards: any[];
      respawnAt: number;
    }) => {
      console.log('[Boss] Killed!', data);
      setVictoryData({
        bossName: data.bossName,
        bossIcon: data.bossIcon || '👹',
        finalBlowBy: data.finalBlowBy,
        topDamageBy: data.topDamageBy,
        topDamage: data.topDamage,
        rewards: data.rewards || [],
        respawnAt: data.respawnAt,
      });
      setWaitingForRespawn(true); // Keep showing until boss respawns
      // Start countdown
      const updateCountdown = () => {
        const remaining = Math.max(0, data.respawnAt - Date.now());
        setRespawnCountdown(remaining);
        if (remaining > 0) {
          setTimeout(updateCountdown, 1000);
        }
      };
      updateCountdown();
    });

    // Boss respawn
    socket.on('boss:respawn', (data: BossState) => {
      setBossState(prev => ({ ...prev, ...data }));
      setSessionDamage(0);
      setVictoryData(null);
      setRespawnCountdown(0);
      setWaitingForRespawn(false); // Boss is back - clear waiting state
    });

    // Boss rage phase
    socket.on('boss:rage', (data: { phase: number; multiplier: number }) => {
      console.log('[Boss] Rage phase:', data.phase, 'x', data.multiplier);
    });

    // Player state
    socket.on('player:state', (data: {
      mana: number;
      maxMana: number;
      sessionDamage: number;
      isFirstLogin?: boolean;
      // L2 Stamina (NEW)
      stamina?: number;
      maxStamina?: number;
      exhaustedUntil?: number | null;
    }) => {
      setMana(data.mana);
      setSessionDamage(data.sessionDamage);
      // L2 Stamina (NEW)
      if (data.stamina !== undefined) setStamina(data.stamina);
      if (data.maxStamina !== undefined) setMaxStamina(data.maxStamina);
      if (data.exhaustedUntil !== undefined) setExhaustedUntil(data.exhaustedUntil);
      if (data.isFirstLogin) {
        setShowWelcome(true);
      }
    });

    // Player data (from player:get request)
    socket.on('player:data', (data: any) => {
      if (data) {
        setMana(data.mana || 1000);
        if (data.isFirstLogin) {
          setShowWelcome(true);
        }
      }
    });

    // Auth success - check first login
    socket.on('auth:success', (data: any) => {
      console.log('[Auth] Success! isFirstLogin:', data.isFirstLogin, 'User:', data.firstName || data.username);
      if (data.isFirstLogin) {
        console.log('[Welcome] Showing welcome popup for first-time user');
        setShowWelcome(true);
      }
      setMana(data.mana || 1000);
      // L2 Stamina (NEW)
      if (data.stamina !== undefined) setStamina(data.stamina);
      if (data.maxStamina !== undefined) setMaxStamina(data.maxStamina);
      if (data.exhaustedUntil !== undefined) setExhaustedUntil(data.exhaustedUntil);
    });

    // Starter chest opened - show equipment received
    socket.on('starter:opened', (data: { equipment: Array<{
      id: string;
      code: string;
      name: string;
      icon: string;
      slot: string;
      pAtk: number;
      pDef: number;
      rarity: string;
    }> }) => {
      console.log('[Starter] Chest opened, received:', data.equipment);
      setStarterEquipment(data.equipment);
      setOpeningChest(false);
      setWelcomeStage(3);
    });

    socket.on('starter:error', (data: { message: string }) => {
      console.error('[Starter] Error:', data.message);
      setOpeningChest(false);
      // If already opened or other error, just close welcome and let them play
      setShowWelcome(false);
      setWelcomeStage(1);
    });

    // IMPORTANT: Check if already connected AFTER setting up all listeners
    // This ensures we don't miss the auth:success event
    if (socket.connected) {
      console.log('[Game] Socket already connected, re-authenticating');
      setConnected(true);
      // Small delay to ensure React state is ready, then re-auth
      setTimeout(doAuth, 100);
    }

    // Tap batching - flush every 100ms
    tapFlushIntervalRef.current = setInterval(() => {
      if (tapQueueRef.current > 0) {
        socket.emit('tap:batch', { count: tapQueueRef.current });
        tapQueueRef.current = 0;
      }
    }, 100);

    // TZ Этап 2: Activity ping every 5 seconds for boss reward eligibility
    const activityPingInterval = setInterval(() => {
      socket.emit('activity:ping');
    }, 5000);

    return () => {
      if (tapFlushIntervalRef.current) {
        clearInterval(tapFlushIntervalRef.current);
      }
      clearInterval(activityPingInterval);
      socket.off('connect');
      socket.off('reconnect');
      socket.off('disconnect');
      socket.off('boss:state');
      socket.off('tap:result');
      socket.off('autoAttack:result');
      socket.off('damage:feed');
      socket.off('boss:killed');
      socket.off('boss:respawn');
      socket.off('boss:rage');
      socket.off('player:state');
      socket.off('player:data');
      socket.off('auth:success');
      socket.off('auth:error');
      socket.off('hero:exhausted');  // L2 (NEW)
      socket.off('starter:opened');
      socket.off('starter:error');
    };
  }, []);

  // Load boss image (dynamic based on bossState.image)
  useEffect(() => {
    const imageSrc = bossState.image || '/assets/bosses/boss_single.png';
    const img = new Image();
    img.src = imageSrc;
    img.onload = () => {
      bossImgRef.current = img;
    };
    img.onerror = () => {
      // Fallback to default image
      img.src = '/assets/bosses/boss_single.png';
    };
  }, [bossState.image]);

  // Canvas drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener('resize', resize);

    // Helper functions
    const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const easeOutCubic = (t: number) => {
      t = clamp01(t);
      return 1 - Math.pow(1 - t, 3);
    };

    // Draw boss with split
    const drawBossSplit = (
      img: HTMLImageElement,
      dx: number,
      dy: number,
      drawW: number,
      drawH: number,
      recoil: number
    ) => {
      const cutY = Math.floor(img.height * CUT_Y_RATIO);

      // Bottom part
      const bottomSh = img.height - cutY;
      const bottomDh = Math.round(drawH * (bottomSh / img.height));
      const bottomDy = Math.round(dy + drawH * (cutY / img.height));

      ctx.drawImage(
        img,
        0, cutY, img.width, bottomSh,
        Math.round(dx), bottomDy, Math.round(drawW), bottomDh
      );

      // Top part with rotation
      const topSh = cutY;
      const topDh = Math.round(drawH * (topSh / img.height));
      const topDx = Math.round(dx);
      const topDy = Math.round(dy);

      const pivotX = Math.round(dx + drawW / 2);
      const pivotY = Math.round(dy + drawH * (cutY / img.height));

      const angle = MAX_TILT * recoil;
      const back = MAX_BACK * recoil;

      ctx.save();
      ctx.translate(pivotX, pivotY);
      ctx.rotate(angle);
      ctx.translate(-pivotX, -pivotY);
      ctx.translate(-back, -back * 0.35);

      ctx.drawImage(
        img,
        0, 0, img.width, topSh,
        topDx, topDy, Math.round(drawW), topDh
      );

      ctx.restore();
    };

    let animationId: number;

    const draw = (now: number) => {
      const img = bossImgRef.current;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      // Reset transform matrix to prevent accumulation issues
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const dpr = window.devicePixelRatio || 1;
      ctx.scale(dpr, dpr);

      ctx.clearRect(0, 0, w, h);

      // Draw gradient background
      const gradient = ctx.createLinearGradient(0, 0, 0, h);
      gradient.addColorStop(0, '#2a313b');
      gradient.addColorStop(1, '#0e141b');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);

      if (!img) {
        animationId = requestAnimationFrame(draw);
        return;
      }

      // Calculate boss size and position
      const scaleFit = Math.min((w * 0.62) / img.width, (h * 0.78) / img.height);
      let scale = scaleFit;
      let drawW = img.width * scale;
      let drawH = img.height * scale;
      let dx = (w - drawW) / 2;
      let dy = (h - drawH) / 2 + 10;

      const t = now - hitT0Ref.current;
      const inHit = t >= 0 && t <= HIT_MS;

      // Shake effect
      if (inHit && t <= SHAKE_MS) {
        const k = 1 - t / SHAKE_MS;
        dx += (Math.random() * 2 - 1) * 10 * k;
        dy += (Math.random() * 2 - 1) * 6 * k;
      }

      // Scale punch and recoil
      let recoil = 0;
      if (inHit && t <= PUNCH_MS) {
        const p = t / PUNCH_MS;
        const up = p < 0.45 ? easeOutCubic(p / 0.45) : (1 - easeOutCubic((p - 0.45) / 0.55));
        const punch = lerp(1.0, 1.045, up);
        scale *= punch;
        recoil = up;

        drawW = img.width * scale;
        drawH = img.height * scale;
        dx = (w - drawW) / 2;
        dy = (h - drawH) / 2 + 10;
      }

      // Draw boss
      ctx.imageSmoothingEnabled = true;
      drawBossSplit(img, dx, dy, drawW, drawH, recoil);

      // Flash overlay
      if (inHit && t <= FLASH_MS) {
        const a = (1 - t / FLASH_MS) * 0.35;
        ctx.globalAlpha = a;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
      }

      // Draw sparks
      const sparks = sparksRef.current;
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        const age = now - s.born;
        if (age > s.life) {
          sparks.splice(i, 1);
          continue;
        }
        const p = age / s.life;
        const alpha = 1 - p;
        const cx = s.x;
        const cy = s.y;
        const r = 28 * (0.6 + 0.6 * p);

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(cx, cy);
        ctx.rotate(p * 2.2);

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let k = 0; k < 8; k++) {
          const ang = (Math.PI * 2) * (k / 8);
          ctx.moveTo(Math.cos(ang) * r * 0.25, Math.sin(ang) * r * 0.25);
          ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
        }
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(0, 0, 6 * (1 - p), 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
        ctx.globalAlpha = 1;
      }

      // Draw floating damage numbers
      const floats = floatsRef.current;
      ctx.textAlign = 'center';
      for (let i = floats.length - 1; i >= 0; i--) {
        const f = floats[i];
        const age = now - f.born;
        if (age > f.life) {
          floats.splice(i, 1);
          continue;
        }
        const p = age / f.life;
        const y = f.y + f.vy * age;

        ctx.globalAlpha = 1 - p;
        ctx.font = f.crit ? '700 28px system-ui' : '700 22px system-ui';
        ctx.fillStyle = f.crit ? THEME.COLORS.CRIT_RED : '#fff';
        if (f.crit) {
          ctx.shadowColor = THEME.COLORS.CRIT_RED;
          ctx.shadowBlur = 10;
        }
        ctx.fillText(f.text, f.x, y);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }
      ctx.textAlign = 'left';

      // Victory overlay (dimmed) - actual UI is rendered via React
      if (bossState.hp <= 0) {
        ctx.fillStyle = 'rgba(0,0,0,.6)';
        ctx.fillRect(0, 0, w, h);
      }

      animationId = requestAnimationFrame(draw);
    };

    animationId = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, [bossState.hp]);

  // Check if currently exhausted (L2)
  const isExhausted = exhaustedUntil !== null && Date.now() < exhaustedUntil;

  // Handle tap/click
  const handleTap = useCallback(() => {
    if (bossState.hp <= 0) return;
    // L2: Check exhaustion first, then stamina
    if (isExhausted) return;
    if (stamina <= 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const now = performance.now();

    // Queue tap for batching
    tapQueueRef.current++;

    // Optimistic UI update for stamina (server will correct if wrong)
    setStamina(prev => Math.max(0, prev - 1));

    // Trigger hit animation only if previous one is mostly done (prevents accumulation)
    const timeSinceLastHit = now - hitT0Ref.current;
    if (timeSinceLastHit > 150 || hitT0Ref.current < 0) {
      hitT0Ref.current = now;
    }

    // Spawn spark effect (damage numbers come from server via tap:result)
    sparksRef.current.push({
      x: w / 2 + Math.floor(Math.random() * 80 - 40),
      y: h / 2 + Math.floor(Math.random() * 90 - 50),
      born: now,
      life: 260,
    });
  }, [bossState.hp, stamina, isExhausted]);

  const hpPercent = (bossState.hp / bossState.maxHp) * 100;
  const manaPercent = (mana / maxMana) * 100;
  const staminaPercent = (stamina / maxStamina) * 100;  // L2 (NEW)

  // Handle welcome popup navigation
  const handleWelcomeNext = () => {
    if (welcomeStage === 1) {
      setWelcomeStage(2);
    } else if (welcomeStage === 3) {
      // Final stage - close welcome
      setShowWelcome(false);
      setWelcomeStage(1);
      setStarterEquipment([]);
    }
  };

  // Handle starter chest open
  const handleOpenStarterChest = () => {
    setOpeningChest(true);
    getSocket().emit('starter:open');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Respawn Countdown Screen (when loaded during respawn or waiting for boss) */}
      {!victoryData && waitingForRespawn && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-l2-panel/95 rounded-lg p-6 m-4 max-w-sm w-full pointer-events-auto text-center">
            <div className="text-4xl mb-3">{bossState.icon || '👹'}</div>
            <div className="text-gray-300 text-sm mb-2">
              {lang === 'ru' && bossState.nameRu ? bossState.nameRu : bossState.name} {t.boss.defeated}
            </div>
            <div className="bg-black/40 rounded-lg p-4 mb-3">
              <div className="text-xs text-gray-400 mb-1">{t.boss.nextBossIn}</div>
              {respawnCountdown > 0 ? (
                <div className="text-3xl font-bold text-l2-gold font-mono">
                  {Math.floor(respawnCountdown / 60000)}:{String(Math.floor((respawnCountdown % 60000) / 1000)).padStart(2, '0')}
                </div>
              ) : (
                <div className="text-xl font-bold text-l2-gold animate-pulse">
                  {lang === 'ru' ? 'Скоро появится...' : 'Spawning soon...'}
                </div>
              )}
            </div>
            <div className="text-xs text-gray-500">
              {t.leaderboard.waitForKill}
            </div>
          </div>
        </div>
      )}

      {/* Victory Screen with Respawn Countdown */}
      {victoryData && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-l2-panel/95 rounded-lg p-4 m-2 max-w-sm w-full pointer-events-auto">
            {/* Header */}
            <div className="text-center mb-3">
              <div className="text-3xl mb-1">{victoryData.bossIcon}</div>
              <div className="text-l2-gold text-lg font-bold">{t.boss.victory}</div>
              <div className="text-gray-300 text-sm">{victoryData.bossName} {t.boss.defeated}</div>
            </div>

            {/* Countdown */}
            <div className="bg-black/40 rounded-lg p-3 mb-3 text-center">
              <div className="text-xs text-gray-400 mb-1">{t.boss.nextBossIn}</div>
              {respawnCountdown > 0 ? (
                <div className="text-2xl font-bold text-white font-mono">
                  {Math.floor(respawnCountdown / 60000)}:{String(Math.floor((respawnCountdown % 60000) / 1000)).padStart(2, '0')}
                </div>
              ) : (
                <div className="text-xl font-bold text-l2-gold animate-pulse">
                  {lang === 'ru' ? 'Скоро появится...' : 'Spawning soon...'}
                </div>
              )}
            </div>

            {/* Bonuses */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-2 text-center">
                <div className="text-xs text-red-400">{t.boss.finalBlow}</div>
                <div className="text-sm font-bold text-white truncate">{victoryData.finalBlowBy}</div>
                <div className="text-xs text-green-400">+20% {t.boss.bonus}</div>
              </div>
              <div className="bg-purple-900/30 border border-purple-500/50 rounded-lg p-2 text-center">
                <div className="text-xs text-purple-400">{t.boss.topDamage}</div>
                <div className="text-sm font-bold text-white truncate">{victoryData.topDamageBy}</div>
                <div className="text-xs text-green-400">+15% {t.boss.bonus}</div>
              </div>
            </div>

            {/* Top Players */}
            <div className="bg-black/30 rounded-lg p-2">
              <div className="text-xs text-gray-400 mb-2 text-center">{t.boss.topParticipants}</div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {victoryData.rewards.slice(0, 5).map((reward, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between text-xs p-1 rounded ${
                      reward.isFinalBlow || reward.isTopDamage ? 'bg-l2-gold/20' : ''
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500 w-4">{i + 1}.</span>
                      <span className="text-white truncate max-w-[80px]">{reward.visitorName}</span>
                      {reward.isFinalBlow && <span className="text-red-400 text-[10px]">FB</span>}
                      {reward.isTopDamage && <span className="text-purple-400 text-[10px]">TD</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">{reward.damagePercent}%</span>
                      <span className="text-l2-gold">+{reward.adenaReward.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Your session damage */}
            {sessionDamage > 0 && (
              <div className="mt-2 text-center text-xs text-gray-400">
                {t.boss.yourDamage}: {sessionDamage.toLocaleString()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Welcome Popup for First-Time Players - Three Stages */}
      {showWelcome && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90">
          {welcomeStage === 1 ? (
            /* Stage 1: Welcome Intro */
            <div className="bg-gradient-to-b from-l2-panel to-black rounded-xl p-6 m-3 max-w-sm w-full border border-l2-gold/50 shadow-2xl shadow-l2-gold/20">
              {/* Animated glow effect */}
              <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-l2-gold/10 via-transparent to-l2-gold/10 animate-pulse pointer-events-none" />

              {/* Header */}
              <div className="text-center mb-6 relative">
                <div className="text-6xl mb-4 animate-bounce">&#9876;</div>
                <h1 className="text-2xl font-bold text-l2-gold mb-3">
                  {lang === 'ru' ? 'Добро пожаловать, Герой!' : 'Welcome, Hero!'}
                </h1>
                <p className="text-gray-300 text-sm leading-relaxed">
                  {lang === 'ru'
                    ? 'Ты попал в самое загадочное место — мир, где древние боссы пробудились ото сна и угрожают всему живому.'
                    : 'You have arrived at the most mysterious place — a world where ancient bosses have awakened and threaten all living things.'}
                </p>
              </div>

              {/* Mystical decorative line */}
              <div className="flex items-center gap-3 mb-6">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-l2-gold/50 to-transparent" />
                <span className="text-l2-gold text-xs">&#10022;</span>
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-l2-gold/50 to-transparent" />
              </div>

              <p className="text-gray-400 text-xs text-center mb-6">
                {lang === 'ru'
                  ? 'Объединись с другими воинами, сражайся с монстрами и стань легендой!'
                  : 'Unite with other warriors, fight monsters and become a legend!'}
              </p>

              {/* CTA Button */}
              <button
                onClick={handleWelcomeNext}
                className="w-full py-4 bg-gradient-to-r from-l2-gold via-yellow-500 to-l2-gold text-black font-bold rounded-lg hover:from-yellow-400 hover:to-yellow-500 transition-all text-lg shadow-lg shadow-l2-gold/30"
              >
                {lang === 'ru' ? 'Начать игру' : 'Start Game'} &#10140;
              </button>
            </div>
          ) : welcomeStage === 2 ? (
            /* Stage 2: Game Mechanics Info + Starter Chest */
            <div className="bg-gradient-to-b from-l2-panel to-black rounded-xl p-5 m-3 max-w-sm w-full border border-l2-gold/30 max-h-[85vh] overflow-y-auto">
              {/* Header */}
              <div className="text-center mb-4">
                <div className="text-3xl mb-2">&#128214;</div>
                <h2 className="text-lg font-bold text-l2-gold">
                  {lang === 'ru' ? 'Как играть' : 'How to Play'}
                </h2>
              </div>

              {/* Game mechanics */}
              <div className="space-y-3 mb-4">
                {/* Bosses */}
                <div className="bg-black/40 rounded-lg p-3 border-l-2 border-red-500">
                  <div className="flex items-center gap-2 text-red-400 font-bold text-sm mb-1">
                    <span>&#128121;</span> {lang === 'ru' ? 'Мировые Боссы' : 'World Bosses'}
                  </div>
                  <p className="text-gray-400 text-xs">
                    {lang === 'ru'
                      ? 'Тапай по боссу вместе с другими игроками! Чем больше урона нанесёшь — тем больше награда.'
                      : 'Tap the boss with other players! More damage = bigger rewards.'}
                  </p>
                </div>

                {/* Stamina */}
                <div className="bg-black/40 rounded-lg p-3 border-l-2 border-green-500">
                  <div className="flex items-center gap-2 text-green-400 font-bold text-sm mb-1">
                    <span>&#9889;</span> {lang === 'ru' ? 'Выносливость' : 'Stamina'}
                  </div>
                  <p className="text-gray-400 text-xs">
                    {lang === 'ru'
                      ? 'Каждый удар тратит 1 выносливость. Восстанавливается со временем. Прокачивай Vitality!'
                      : 'Each hit costs 1 stamina. Regenerates over time. Upgrade Vitality!'}
                  </p>
                </div>

                {/* Chests */}
                <div className="bg-black/40 rounded-lg p-3 border-l-2 border-amber-500">
                  <div className="flex items-center gap-2 text-amber-400 font-bold text-sm mb-1">
                    <span>&#127873;</span> {lang === 'ru' ? 'Сундуки' : 'Chests'}
                  </div>
                  <p className="text-gray-400 text-xs">
                    {lang === 'ru'
                      ? '🪵 Деревянный (5мин), 🟫 Бронзовый (30мин), 🪙 Серебряный (4ч), 🟨 Золотой (8ч). Чем дольше — тем лучше лут!'
                      : '🪵 Wooden (5m), 🟫 Bronze (30m), 🪙 Silver (4h), 🟨 Gold (8h). Longer = better loot!'}
                  </p>
                </div>

                {/* Equipment */}
                <div className="bg-black/40 rounded-lg p-3 border-l-2 border-purple-500">
                  <div className="flex items-center gap-2 text-purple-400 font-bold text-sm mb-1">
                    <span>&#128737;</span> {lang === 'ru' ? 'Экипировка' : 'Equipment'}
                  </div>
                  <p className="text-gray-400 text-xs">
                    {lang === 'ru'
                      ? 'Из сундуков падает экипировка: Обычная (белая), Необычная (зелёная), Редкая (фиолетовая), Эпическая (оранжевая).'
                      : 'Chests drop equipment: Common (white), Uncommon (green), Rare (purple), Epic (orange).'}
                  </p>
                </div>

                {/* Stats */}
                <div className="bg-black/40 rounded-lg p-3 border-l-2 border-blue-500">
                  <div className="flex items-center gap-2 text-blue-400 font-bold text-sm mb-1">
                    <span>&#128200;</span> {lang === 'ru' ? 'Характеристики' : 'Stats'}
                  </div>
                  <p className="text-gray-400 text-xs">
                    {lang === 'ru'
                      ? 'Power = урон, Agility = скорость атаки и крит, Vitality = здоровье и выносливость.'
                      : 'Power = damage, Agility = attack speed & crit, Vitality = health & stamina.'}
                  </p>
                </div>

                {/* Starter Chest Gift */}
                <div className="bg-gradient-to-r from-l2-gold/30 to-amber-500/20 rounded-lg p-4 border border-l2-gold/50 animate-pulse">
                  <div className="flex items-center gap-2 text-l2-gold font-bold text-sm mb-2">
                    <span className="text-2xl">🎁</span> {lang === 'ru' ? 'Подарок новичка!' : 'Starter Gift!'}
                  </div>
                  <p className="text-gray-200 text-xs">
                    {lang === 'ru'
                      ? 'Мы дарим тебе сундук новичка с полным сетом стартовой экипировки!'
                      : 'We give you a starter chest with a full set of starter equipment!'}
                  </p>
                </div>
              </div>

              {/* CTA Button - Open Starter Chest */}
              <button
                onClick={handleOpenStarterChest}
                disabled={openingChest}
                className={`w-full py-3 bg-gradient-to-r from-l2-gold to-yellow-600 text-black font-bold rounded-lg transition-all text-lg ${
                  openingChest ? 'opacity-50 cursor-not-allowed' : 'hover:from-yellow-500 hover:to-l2-gold'
                }`}
              >
                {openingChest ? (
                  <span className="animate-pulse">{lang === 'ru' ? 'Открываем...' : 'Opening...'}</span>
                ) : (
                  <>{lang === 'ru' ? 'Открыть сундук' : 'Open Chest'} 🎁</>
                )}
              </button>
            </div>
          ) : (
            /* Stage 3: Chest Opened - Show Equipment */
            <div className="bg-gradient-to-b from-l2-panel to-black rounded-xl p-5 m-3 max-w-sm w-full border border-l2-gold/50 shadow-2xl shadow-l2-gold/30">
              {/* Header */}
              <div className="text-center mb-4">
                <div className="text-5xl mb-2 animate-bounce">🎉</div>
                <h2 className="text-xl font-bold text-l2-gold">
                  {lang === 'ru' ? 'Сундук открыт!' : 'Chest Opened!'}
                </h2>
                <p className="text-gray-400 text-xs mt-1">
                  {lang === 'ru' ? 'Ты получил стартовую экипировку:' : 'You received starter equipment:'}
                </p>
              </div>

              {/* Equipment Grid */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                {starterEquipment.map((item) => (
                  <div
                    key={item.id}
                    className="bg-black/40 rounded-lg p-2 border border-gray-600/50 flex items-center gap-2"
                  >
                    <span className="text-xl">{item.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-xs font-bold truncate">{item.name}</div>
                      <div className="text-gray-500 text-[10px]">
                        {item.pAtk > 0 && <span className="text-red-400">+{item.pAtk} ATK</span>}
                        {item.pDef > 0 && <span className="text-blue-400">+{item.pDef} DEF</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Info */}
              <div className="text-center text-xs text-gray-400 mb-4">
                {lang === 'ru'
                  ? 'Экипировка уже надета! Можешь посмотреть её в инвентаре.'
                  : 'Equipment is already equipped! Check it in your inventory.'}
              </div>

              {/* CTA Button */}
              <button
                onClick={handleWelcomeNext}
                className="w-full py-3 bg-gradient-to-r from-l2-gold to-yellow-600 text-black font-bold rounded-lg hover:from-yellow-500 hover:to-l2-gold transition-all text-lg"
              >
                {lang === 'ru' ? 'Играть!' : 'Play!'} &#9876;
              </button>
            </div>
          )}
        </div>
      )}

      {/* Header with HP */}
      <div className="p-4 bg-l2-panel/80">
        <div className="flex justify-between items-center mb-1">
          <div className="flex items-center gap-2">
            <span className="text-lg">{bossState.icon || '👹'}</span>
            <div>
              <span className="font-pixel text-sm text-l2-gold">
                {lang === 'ru' && bossState.nameRu ? bossState.nameRu : bossState.name}
              </span>
              {bossState.bossIndex && (
                <span className="text-xs text-gray-500 ml-2">
                  ({bossState.bossIndex}/{bossState.totalBosses})
                </span>
              )}
            </div>
          </div>
          <span className="text-xs text-gray-400">
            {connected ? `${bossState.playersOnline} ${t.game.online}` : t.game.connecting}
          </span>
        </div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm">
            {bossState.hp.toLocaleString()} / {bossState.maxHp.toLocaleString()}
          </span>
          <div className="flex items-center gap-2">
            {bossState.defense && bossState.defense > 0 && (
              <span className="text-xs text-blue-400">🛡️ {bossState.defense}</span>
            )}
            {bossState.ragePhase > 0 && (
              <span className="text-xs text-red-500 font-bold">
                {t.game.rage} x{[1, 1.2, 1.5, 2][bossState.ragePhase]}
              </span>
            )}
          </div>
        </div>
        <div className="h-4 bg-black/50 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-100 ${
              hpPercent < 25 ? 'bg-red-600 hp-critical' :
              hpPercent < 50 ? 'bg-orange-500' :
              hpPercent < 75 ? 'bg-yellow-500' : 'bg-l2-health'
            }`}
            style={{ width: `${hpPercent}%` }}
          />
        </div>
        {/* Drop Button */}
        <button
          onClick={() => setShowDropTable(true)}
          className="mt-2 px-3 py-1 bg-purple-500/20 text-purple-300 text-xs rounded-lg border border-purple-500/30 hover:bg-purple-500/30 transition-colors"
        >
          🎁 {lang === 'ru' ? 'Дроп' : 'Drop'}
        </button>
      </div>

      {/* Drop Table Popup */}
      {showDropTable && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setShowDropTable(false)}
        >
          <div
            className="bg-l2-panel rounded-xl p-4 max-w-sm w-full border border-purple-500/30"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-4">
              <div className="text-2xl mb-1">🎁</div>
              <div className="text-lg font-bold text-purple-400">
                {lang === 'ru' ? 'Награды за босса' : 'Boss Rewards'}
              </div>
              <div className="text-xs text-gray-500">
                {lang === 'ru' && bossState.nameRu ? bossState.nameRu : bossState.name}
                {bossState.bossIndex && ` (${bossState.bossIndex}/${bossState.totalBosses})`}
              </div>
            </div>

            <div className="space-y-2">
              {/* Adena */}
              <div className="flex items-center justify-between bg-black/30 rounded-lg p-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🪙</span>
                  <span className="text-sm text-gray-300">Adena</span>
                </div>
                <div className="text-right">
                  <div className="text-l2-gold font-bold text-sm">
                    {formatCompact(1000000 * Math.pow(2, (bossState.bossIndex || 1) - 1))}
                  </div>
                  <div className="text-[10px] text-gray-500">100%</div>
                </div>
              </div>

              {/* EXP */}
              <div className="flex items-center justify-between bg-black/30 rounded-lg p-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">⭐</span>
                  <span className="text-sm text-gray-300">EXP</span>
                </div>
                <div className="text-right">
                  <div className="text-green-400 font-bold text-sm">
                    {formatCompact(1000000 * Math.pow(2, (bossState.bossIndex || 1) - 1))}
                  </div>
                  <div className="text-[10px] text-gray-500">100%</div>
                </div>
              </div>

              {/* Алмазики (Ancient Coins) */}
              <div className="flex items-center justify-between bg-black/30 rounded-lg p-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">💎</span>
                  <span className="text-sm text-gray-300">{lang === 'ru' ? 'Алмазики' : 'Diamonds'}</span>
                </div>
                <div className="text-right">
                  <div className="text-purple-400 font-bold text-sm">
                    {10 * Math.pow(2, (bossState.bossIndex || 1) - 1)}
                  </div>
                  <div className="text-[10px] text-gray-500">50% FB + 50% TD</div>
                </div>
              </div>

              {/* Chests */}
              <div className="flex items-center justify-between bg-black/30 rounded-lg p-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📦</span>
                  <span className="text-sm text-gray-300">{lang === 'ru' ? 'Сундуки' : 'Chests'}</span>
                </div>
                <div className="text-right">
                  <div className="text-purple-400 font-bold text-sm">
                    {10 * Math.pow(2, (bossState.bossIndex || 1) - 1)}
                  </div>
                  <div className="text-[10px] text-gray-500">50% FB + 50% TD</div>
                </div>
              </div>
            </div>

            {/* Chest Rarity */}
            <div className="mt-3 p-2 bg-black/20 rounded-lg">
              <div className="text-xs text-gray-400 mb-2 text-center">
                {lang === 'ru' ? 'Шанс редкости сундука' : 'Chest Rarity Chances'}
              </div>
              <div className="grid grid-cols-5 gap-1 text-center text-[9px]">
                <div>
                  <div className="text-gray-300">📦</div>
                  <div className="text-gray-400">50%</div>
                </div>
                <div>
                  <div className="text-green-400">🎁</div>
                  <div className="text-gray-400">30%</div>
                </div>
                <div>
                  <div className="text-blue-400">💎</div>
                  <div className="text-gray-400">15%</div>
                </div>
                <div>
                  <div className="text-purple-400">👑</div>
                  <div className="text-gray-400">4%</div>
                </div>
                <div>
                  <div className="text-orange-400">🏆</div>
                  <div className="text-gray-400">1%</div>
                </div>
              </div>
            </div>

            {/* Info */}
            <div className="mt-3 text-center text-[10px] text-gray-500">
              {lang === 'ru'
                ? 'Награды делятся по % нанесённого урона. FB = Добивание, TD = Топ урон'
                : 'Rewards split by damage %. FB = Final Blow, TD = Top Damage'}
            </div>

            <button
              onClick={() => setShowDropTable(false)}
              className="mt-4 w-full py-2 bg-purple-500/20 text-purple-300 rounded-lg font-bold text-sm hover:bg-purple-500/30 transition-colors"
            >
              {lang === 'ru' ? 'Закрыть' : 'Close'}
            </button>
          </div>
        </div>
      )}

      {/* Canvas */}
      <div className="flex-1 relative">
        <canvas
          ref={canvasRef}
          className="w-full h-full cursor-pointer"
          onClick={handleTap}
          onTouchStart={(e) => {
            e.preventDefault();
            handleTap();
          }}
        />

        {/* Damage feed overlay */}
        <div className="absolute top-2 right-2 text-xs space-y-1 pointer-events-none">
          {damageFeed.slice(0, 5).map((item, i) => (
            <div
              key={item.timestamp}
              className={`${item.isCrit ? 'text-red-400' : 'text-gray-300'} opacity-${100 - i * 20}`}
              style={{ opacity: 1 - i * 0.2 }}
            >
              {item.playerName}: -{item.damage.toLocaleString()}
            </div>
          ))}
        </div>
      </div>

      {/* Stats footer */}
      <div className="p-4 bg-l2-panel/80">
        {/* L2 Stamina bar (NEW) */}
        <div className="mb-3">
          <div className="flex justify-between text-xs mb-1">
            <span className={`${isExhausted ? 'text-red-400' : 'text-green-400'}`}>
              {isExhausted ? t.game.exhausted : t.game.stamina}
            </span>
            <span>{Math.floor(stamina)} / {maxStamina}</span>
          </div>
          <div className="h-2 bg-black/50 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-100 ${
                isExhausted ? 'bg-red-500 animate-pulse' :
                staminaPercent < 25 ? 'bg-orange-500' : 'bg-green-500'
              }`}
              style={{ width: `${staminaPercent}%` }}
            />
          </div>
        </div>

        <div className="flex justify-between items-center">
          <div>
            <span className="text-xs text-gray-400">{t.game.sessionDamage}</span>
            <div className="text-l2-gold font-bold">{sessionDamage.toLocaleString()}</div>
          </div>
          {autoAttackDamage > 0 && (
            <div className="text-center">
              <span className="text-xs text-purple-400">{t.game.auto}</span>
              <div className="text-purple-300 font-bold text-sm">-{autoAttackDamage.toLocaleString()}</div>
            </div>
          )}
          <div className="text-right">
            <span className="text-xs text-gray-400">{t.game.status}</span>
            <div className={connected ? 'text-green-400' : 'text-red-400'}>
              {connected ? t.game.onlineStatus : t.game.offline}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
