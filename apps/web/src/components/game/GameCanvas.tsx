'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { THEME } from '@/lib/constants';
import { getSocket } from '@/lib/socket';
import { detectLanguage, useTranslation, Language } from '@/lib/i18n';

interface BossState {
  id: string;
  name: string;
  title?: string;
  hp: number;
  maxHp: number;
  defense?: number;
  ragePhase: number;
  playersOnline: number;
  icon?: string;
  bossIndex?: number;
  totalBosses?: number;
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
  const [stamina, setStamina] = useState(30);
  const [maxStamina, setMaxStamina] = useState(30);
  const [exhaustedUntil, setExhaustedUntil] = useState<number | null>(null);
  const [sessionDamage, setSessionDamage] = useState(0);
  const [connected, setConnected] = useState(false);
  const [damageFeed, setDamageFeed] = useState<DamageFeed[]>([]);
  const [offlineEarnings, setOfflineEarnings] = useState<{ adena: number; hours: number } | null>(null);
  const [victoryData, setVictoryData] = useState<VictoryData | null>(null);
  const [respawnCountdown, setRespawnCountdown] = useState(0);
  const [showWelcome, setShowWelcome] = useState(false);
  const [autoAttackDamage, setAutoAttackDamage] = useState(0);
  const [lang, setLang] = useState<Language>('en');
  const t = useTranslation(lang);

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

    // Check if already connected (when returning to tab)
    if (socket.connected) {
      console.log('[Game] Socket already connected');
      setConnected(true);
      // Request current player state
      socket.emit('player:get');
    }

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

    socket.on('auth:success', (data) => {
      console.log('[Auth] Success! User:', data.firstName || data.username || data.id);
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
      if (data.isFirstLogin) {
        setShowWelcome(true);
      }
      setMana(data.mana || 1000);
      // L2 Stamina (NEW)
      if (data.stamina !== undefined) setStamina(data.stamina);
      if (data.maxStamina !== undefined) setMaxStamina(data.maxStamina);
      if (data.exhaustedUntil !== undefined) setExhaustedUntil(data.exhaustedUntil);
    });

    // Offline earnings notification
    socket.on('offline:earnings', (data: { adena: number; hours: number }) => {
      setOfflineEarnings(data);
    });

    // Tap batching - flush every 100ms
    tapFlushIntervalRef.current = setInterval(() => {
      if (tapQueueRef.current > 0) {
        socket.emit('tap:batch', { count: tapQueueRef.current });
        tapQueueRef.current = 0;
      }
    }, 100);

    return () => {
      if (tapFlushIntervalRef.current) {
        clearInterval(tapFlushIntervalRef.current);
      }
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
      socket.off('offline:earnings');
      socket.off('auth:success');
      socket.off('auth:error');
      socket.off('hero:exhausted');  // L2 (NEW)
    };
  }, []);

  // Load boss image
  useEffect(() => {
    const img = new Image();
    img.src = '/assets/bosses/boss_single.png';
    img.onload = () => {
      bossImgRef.current = img;
    };
  }, []);

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

    // Queue tap for batching
    tapQueueRef.current++;

    // Optimistic UI update for stamina (server will correct if wrong)
    setStamina(prev => Math.max(0, prev - 1));

    // Trigger hit animation
    hitT0Ref.current = performance.now();

    // Spawn spark effect (damage numbers come from server via tap:result)
    sparksRef.current.push({
      x: w / 2 + Math.floor(Math.random() * 80 - 40),
      y: h / 2 + Math.floor(Math.random() * 90 - 50),
      born: performance.now(),
      life: 260,
    });
  }, [bossState.hp, stamina, isExhausted]);

  const hpPercent = (bossState.hp / bossState.maxHp) * 100;
  const manaPercent = (mana / maxMana) * 100;
  const staminaPercent = (stamina / maxStamina) * 100;  // L2 (NEW)

  // Handle welcome popup close
  const handleWelcomeClose = () => {
    setShowWelcome(false);
    getSocket().emit('firstLogin:complete');
  };

  return (
    <div className="flex flex-col h-full">
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
              <div className="text-2xl font-bold text-white font-mono">
                {Math.floor(respawnCountdown / 60000)}:{String(Math.floor((respawnCountdown % 60000) / 1000)).padStart(2, '0')}
              </div>
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

      {/* Welcome Popup for First-Time Players */}
      {showWelcome && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="bg-gradient-to-b from-l2-panel to-black rounded-xl p-5 m-3 max-w-sm w-full border border-l2-gold/30">
            {/* Header */}
            <div className="text-center mb-4">
              <div className="text-4xl mb-2">&#9876;</div>
              <h1 className="text-xl font-bold text-l2-gold mb-1">
                {t.welcome.title}
              </h1>
              <p className="text-gray-300 text-sm">
                {t.welcome.subtitle}
              </p>
            </div>

            {/* Features */}
            <div className="space-y-3 mb-4">
              <div className="bg-black/40 rounded-lg p-3 border-l-2 border-l2-gold">
                <div className="flex items-center gap-2 text-l2-gold font-bold text-sm mb-1">
                  <span>&#128081;</span> {t.welcome.bosses}
                </div>
                <p className="text-gray-400 text-xs">
                  {t.welcome.bossesDesc}
                </p>
              </div>

              <div className="bg-black/40 rounded-lg p-3 border-l-2 border-purple-500">
                <div className="flex items-center gap-2 text-purple-400 font-bold text-sm mb-1">
                  <span>&#128176;</span> {t.welcome.rewards}
                </div>
                <p className="text-gray-400 text-xs">
                  {t.welcome.rewardsDesc}
                </p>
              </div>

              <div className="bg-black/40 rounded-lg p-3 border-l-2 border-blue-500">
                <div className="flex items-center gap-2 text-blue-400 font-bold text-sm mb-1">
                  <span>&#9889;</span> {t.welcome.autoBattle}
                </div>
                <p className="text-gray-400 text-xs">
                  {t.welcome.autoBattleDesc}
                </p>
              </div>

              <div className="bg-black/40 rounded-lg p-3 border-l-2 border-green-500">
                <div className="flex items-center gap-2 text-green-400 font-bold text-sm mb-1">
                  <span>&#128200;</span> {t.welcome.upgrade}
                </div>
                <p className="text-gray-400 text-xs">
                  {t.welcome.upgradeDesc}
                </p>
              </div>
            </div>

            {/* CTA Button */}
            <button
              onClick={handleWelcomeClose}
              className="w-full py-3 bg-gradient-to-r from-l2-gold to-yellow-600 text-black font-bold rounded-lg hover:from-yellow-500 hover:to-l2-gold transition-all text-lg"
            >
              {t.welcome.startButton}
            </button>
          </div>
        </div>
      )}

      {/* Offline Earnings Modal */}
      {offlineEarnings && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-l2-panel rounded-lg p-6 m-4 max-w-sm text-center">
            <div className="text-l2-gold text-lg font-bold mb-2">{t.offline.welcomeBack}</div>
            <p className="text-gray-300 text-sm mb-4">
              {t.offline.awayFor} {offlineEarnings.hours} {t.offline.hours}
            </p>
            <div className="bg-black/30 rounded-lg p-4 mb-4">
              <div className="text-xs text-gray-400 mb-1">{t.offline.earnings}</div>
              <div className="text-2xl font-bold text-l2-gold">
                +{offlineEarnings.adena.toLocaleString()} {t.character.adena}
              </div>
            </div>
            <button
              onClick={() => setOfflineEarnings(null)}
              className="w-full py-3 bg-l2-gold text-black font-bold rounded-lg hover:bg-l2-gold/80 transition-colors"
            >
              {t.offline.collect}
            </button>
          </div>
        </div>
      )}

      {/* Header with HP */}
      <div className="p-4 bg-l2-panel/80">
        <div className="flex justify-between items-center mb-1">
          <div className="flex items-center gap-2">
            <span className="text-lg">{bossState.icon || '👹'}</span>
            <div>
              <span className="font-pixel text-sm text-l2-gold">{bossState.name}</span>
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
      </div>

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
