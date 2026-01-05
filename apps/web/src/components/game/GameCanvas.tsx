'use client';

import { useEffect, useRef, useState } from 'react';
import { VIEWPORT, THEME } from '@world-boss/shared';

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hp, setHp] = useState(1_000_000);
  const [maxHp] = useState(1_000_000);
  const [damage, setDamage] = useState(0);

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

  // Constants from friend's code
  const HIT_MS = 240;
  const SHAKE_MS = 120;
  const FLASH_MS = 120;
  const PUNCH_MS = 190;
  const CUT_Y_RATIO = 0.46;
  const MAX_TILT = -0.22;
  const MAX_BACK = 10;
  const DMG_MIN = 8;
  const DMG_MAX = 20;

  useEffect(() => {
    // Load boss image
    const img = new Image();
    img.src = '/assets/bosses/boss_single.png';
    img.onload = () => {
      bossImgRef.current = img;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize canvas
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
    const randInt = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1) + a);

    // Draw boss with split (top/bottom recoil)
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

    // Animation loop
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
      if (hp <= 0) {
        ctx.fillStyle = 'rgba(0,0,0,.45)';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = THEME.COLORS.GOLD;
        ctx.textAlign = 'center';
        ctx.font = '800 28px system-ui';
        ctx.fillText('VICTORY!', w / 2, 80);
        ctx.textAlign = 'left';
      }

      animationId = requestAnimationFrame(draw);
    };

    animationId = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, [hp]);

  // Handle tap/click
  const handleTap = () => {
    if (hp <= 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    // Calculate damage
    const isCrit = Math.random() < 0.15; // 15% crit chance
    const baseDmg = Math.floor(Math.random() * (DMG_MAX - DMG_MIN + 1) + DMG_MIN);
    const dmg = isCrit ? baseDmg * 2 : baseDmg;

    setHp((prev) => Math.max(0, prev - dmg));
    setDamage((prev) => prev + dmg);

    // Trigger hit animation
    hitT0Ref.current = performance.now();

    // Spawn floating text
    floatsRef.current.push({
      text: '-' + dmg,
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
  };

  const hpPercent = (hp / maxHp) * 100;

  return (
    <div className="flex flex-col h-full">
      {/* Header with HP */}
      <div className="p-4 bg-l2-panel/80">
        <div className="flex justify-between items-center mb-2">
          <span className="font-pixel text-xs text-l2-gold">WORLD BOSS</span>
          <span className="text-sm">
            {hp.toLocaleString()} / {maxHp.toLocaleString()}
          </span>
        </div>
        <div className="h-4 bg-black/50 rounded-full overflow-hidden">
          <div
            className={`h-full bg-l2-health transition-all duration-100 ${hpPercent < 25 ? 'hp-critical' : ''}`}
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
      </div>

      {/* Stats footer */}
      <div className="p-4 bg-l2-panel/80 flex justify-between items-center">
        <div>
          <span className="text-xs text-gray-400">Your Damage</span>
          <div className="text-l2-gold font-bold">{damage.toLocaleString()}</div>
        </div>
        <div className="text-right">
          <span className="text-xs text-gray-400">DMG/Click</span>
          <div className="text-white">{DMG_MIN}-{DMG_MAX}</div>
        </div>
      </div>
    </div>
  );
}
