'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { THEME } from '@/lib/constants';
import { getSocket } from '@/lib/socket';

interface BossState {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  ragePhase: number;
  playersOnline: number;
}

interface DamageFeed {
  playerName: string;
  damage: number;
  isCrit: boolean;
  timestamp: number;
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

  const [energy, setEnergy] = useState(1000);
  const [maxEnergy] = useState(1000);
  const [sessionDamage, setSessionDamage] = useState(0);
  const [connected, setConnected] = useState(false);
  const [damageFeed, setDamageFeed] = useState<DamageFeed[]>([]);
  const [offlineEarnings, setOfflineEarnings] = useState<{ adena: number; hours: number } | null>(null);

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

    socket.on('connect', () => {
      setConnected(true);

      // Auth with Telegram if available
      if (typeof window !== 'undefined' && window.Telegram?.WebApp?.initDataUnsafe?.user) {
        const user = window.Telegram.WebApp.initDataUnsafe.user;
        socket.emit('auth', {
          telegramId: user.id,
          username: user.username,
          firstName: user.first_name,
          photoUrl: user.photo_url,
        });
      }
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    // Boss state updates
    socket.on('boss:state', (data: BossState) => {
      setBossState(data);
    });

    // Tap results
    socket.on('tap:result', (data: { damage: number; crits: number; energy: number; sessionDamage: number }) => {
      setEnergy(data.energy);
      setSessionDamage(data.sessionDamage);
    });

    // Damage feed from other players
    socket.on('damage:feed', (data: { playerName: string; damage: number; isCrit: boolean }) => {
      setDamageFeed(prev => [
        { ...data, timestamp: Date.now() },
        ...prev.slice(0, 9), // Keep last 10
      ]);
    });

    // Boss killed
    socket.on('boss:killed', (data: { bossName: string; finalBlowBy: string; leaderboard: any[] }) => {
      console.log('[Boss] Killed!', data);
      // Could show victory modal here
    });

    // Boss respawn
    socket.on('boss:respawn', (data: BossState) => {
      setBossState(prev => ({ ...prev, ...data }));
      setSessionDamage(0);
    });

    // Boss rage phase
    socket.on('boss:rage', (data: { phase: number; multiplier: number }) => {
      console.log('[Boss] Rage phase:', data.phase, 'x', data.multiplier);
    });

    // Player state
    socket.on('player:state', (data: { energy: number; maxEnergy: number; sessionDamage: number }) => {
      setEnergy(data.energy);
      setSessionDamage(data.sessionDamage);
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
      socket.off('disconnect');
      socket.off('boss:state');
      socket.off('tap:result');
      socket.off('damage:feed');
      socket.off('boss:killed');
      socket.off('boss:respawn');
      socket.off('boss:rage');
      socket.off('player:state');
      socket.off('offline:earnings');
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

      // Victory screen
      if (bossState.hp <= 0) {
        ctx.fillStyle = 'rgba(0,0,0,.45)';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = THEME.COLORS.GOLD;
        ctx.textAlign = 'center';
        ctx.font = '800 28px system-ui';
        ctx.fillText('VICTORY!', w / 2, 80);
        ctx.font = '600 16px system-ui';
        ctx.fillStyle = '#fff';
        ctx.fillText('Boss respawning...', w / 2, 120);
        ctx.textAlign = 'left';
      }

      animationId = requestAnimationFrame(draw);
    };

    animationId = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, [bossState.hp]);

  // Handle tap/click
  const handleTap = useCallback(() => {
    if (bossState.hp <= 0) return;
    if (energy <= 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    // Queue tap for batching
    tapQueueRef.current++;

    // Optimistic UI update
    setEnergy(prev => Math.max(0, prev - 1));

    // Trigger hit animation
    hitT0Ref.current = performance.now();

    // Spawn floating text (estimated damage)
    const estimatedDmg = Math.floor(10 + Math.random() * 10);
    const isCrit = Math.random() < 0.15;
    floatsRef.current.push({
      text: '-' + (isCrit ? estimatedDmg * 2 : estimatedDmg),
      x: w / 2 + Math.floor(Math.random() * 160 - 80),
      y: h / 2 + Math.floor(Math.random() * 60 - 30),
      vy: -0.35,
      born: performance.now(),
      life: 950,
      crit: isCrit,
    });

    // Spawn spark
    sparksRef.current.push({
      x: w / 2 + Math.floor(Math.random() * 80 - 40),
      y: h / 2 + Math.floor(Math.random() * 90 - 50),
      born: performance.now(),
      life: 260,
    });
  }, [bossState.hp, energy]);

  const hpPercent = (bossState.hp / bossState.maxHp) * 100;
  const energyPercent = (energy / maxEnergy) * 100;

  return (
    <div className="flex flex-col h-full">
      {/* Offline Earnings Modal */}
      {offlineEarnings && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-l2-panel rounded-lg p-6 m-4 max-w-sm text-center">
            <div className="text-l2-gold text-lg font-bold mb-2">Welcome Back!</div>
            <p className="text-gray-300 text-sm mb-4">
              You were away for {offlineEarnings.hours} hours
            </p>
            <div className="bg-black/30 rounded-lg p-4 mb-4">
              <div className="text-xs text-gray-400 mb-1">Offline Earnings</div>
              <div className="text-2xl font-bold text-l2-gold">
                +{offlineEarnings.adena.toLocaleString()} Adena
              </div>
            </div>
            <button
              onClick={() => setOfflineEarnings(null)}
              className="w-full py-3 bg-l2-gold text-black font-bold rounded-lg hover:bg-l2-gold/80 transition-colors"
            >
              Collect
            </button>
          </div>
        </div>
      )}

      {/* Header with HP */}
      <div className="p-4 bg-l2-panel/80">
        <div className="flex justify-between items-center mb-1">
          <span className="font-pixel text-xs text-l2-gold">{bossState.name}</span>
          <span className="text-xs text-gray-400">
            {connected ? `${bossState.playersOnline} online` : 'Connecting...'}
          </span>
        </div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm">
            {bossState.hp.toLocaleString()} / {bossState.maxHp.toLocaleString()}
          </span>
          {bossState.ragePhase > 0 && (
            <span className="text-xs text-red-500 font-bold">
              RAGE x{[1, 1.2, 1.5, 2][bossState.ragePhase]}
            </span>
          )}
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
        {/* Energy bar */}
        <div className="mb-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-l2-energy">Energy</span>
            <span>{energy} / {maxEnergy}</span>
          </div>
          <div className="h-2 bg-black/50 rounded-full overflow-hidden">
            <div
              className="h-full bg-l2-energy transition-all duration-100"
              style={{ width: `${energyPercent}%` }}
            />
          </div>
        </div>

        <div className="flex justify-between items-center">
          <div>
            <span className="text-xs text-gray-400">Session Damage</span>
            <div className="text-l2-gold font-bold">{sessionDamage.toLocaleString()}</div>
          </div>
          <div className="text-right">
            <span className="text-xs text-gray-400">Status</span>
            <div className={connected ? 'text-green-400' : 'text-red-400'}>
              {connected ? 'Online' : 'Offline'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
