// ═══════════════════════════════════════════════════════════
// WHEEL OF FORTUNE MODAL - React + Phaser integration
// Server determines result (SSOT), client only animates
// ═══════════════════════════════════════════════════════════

import React, { useEffect, useRef, useState, useCallback } from 'react';
import Phaser from 'phaser';
import { getSocket } from '@/lib/socket';
import { usePlayerStore } from '@/stores/playerStore';

interface WheelSegment {
  id: number;
  label: string;
  color: string;
  weight: number;
  rewardType: string;
  rewardAmount: number;
}

interface WheelModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang?: string;
}

// ═══════════════════════════════════════════════════════════
// PHASER WHEEL SCENE - Premium visuals with CanvasTexture
// ═══════════════════════════════════════════════════════════

class WheelScene extends Phaser.Scene {
  private wheelContainer!: Phaser.GameObjects.Container;
  private pointer!: Phaser.GameObjects.Graphics;
  private winHighlight!: Phaser.GameObjects.Graphics;
  private segments: WheelSegment[] = [];
  private isSpinning = false;
  private currentAngle = 0;
  private lastSegmentIndex = -1;
  private winningIndex = -1;

  constructor() {
    super({ key: 'WheelScene' });
  }

  init(data: { segments: WheelSegment[] }) {
    this.segments = data.segments || [];
    this.currentAngle = 0;
    this.lastSegmentIndex = -1;
    this.winningIndex = -1;
  }

  create() {
    const centerX = 160;
    const centerY = 160;
    const radius = 125;
    const numSegments = this.segments.length;
    const sliceAngle = (Math.PI * 2) / numSegments;

    // Create wheel texture via offscreen canvas (gradients + premium look)
    const wheelTexture = this.createWheelTexture(radius, numSegments);
    this.textures.addCanvas('wheel', wheelTexture);

    // Create container for wheel (will rotate)
    this.wheelContainer = this.add.container(centerX, centerY);

    // Add wheel sprite from canvas texture
    const wheelSprite = this.add.image(0, 0, 'wheel');
    this.wheelContainer.add(wheelSprite);

    // Add labels on top of wheel
    this.segments.forEach((segment, i) => {
      const midAngle = i * sliceAngle - Math.PI / 2 + sliceAngle / 2;
      const labelRadius = radius * 0.62;
      const labelX = Math.cos(midAngle) * labelRadius;
      const labelY = Math.sin(midAngle) * labelRadius;

      const label = this.add.text(labelX, labelY, segment.label, {
        fontSize: '16px',
        fontFamily: 'Arial Black, sans-serif',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 5,
        shadow: { offsetX: 1, offsetY: 2, color: '#000', blur: 4, fill: true },
      });
      label.setOrigin(0.5, 0.5);
      label.setRotation(midAngle + Math.PI / 2);
      this.wheelContainer.add(label);
    });

    // Golden center hub with depth
    const hub = this.add.graphics();
    // Outer dark ring
    hub.fillStyle(0x1f2937, 1);
    hub.fillCircle(0, 0, 26);
    // Gold gradient ring
    hub.lineStyle(6, 0xb45309, 1);
    hub.strokeCircle(0, 0, 24);
    hub.lineStyle(3, 0xfbbf24, 1);
    hub.strokeCircle(0, 0, 22);
    // Inner gold center
    hub.fillStyle(0xfbbf24, 1);
    hub.fillCircle(0, 0, 12);
    hub.fillStyle(0xfef3c7, 0.6);
    hub.fillCircle(-3, -3, 5); // Highlight
    this.wheelContainer.add(hub);

    // Outer decorative golden frame (3D effect)
    const frame = this.add.graphics();
    frame.lineStyle(10, 0x78350f, 1); // Dark bronze base
    frame.strokeCircle(centerX, centerY, radius + 8);
    frame.lineStyle(6, 0xb45309, 1); // Bronze middle
    frame.strokeCircle(centerX, centerY, radius + 5);
    frame.lineStyle(3, 0xfbbf24, 1); // Gold highlight
    frame.strokeCircle(centerX, centerY, radius + 2);

    // Win highlight overlay (hidden initially)
    this.winHighlight = this.add.graphics();
    this.winHighlight.setVisible(false);

    // Premium pointer with 3D effect
    this.pointer = this.add.graphics();
    this.drawPointer(1);

    // Add gloss overlay on wheel (subtle shine)
    const gloss = this.add.graphics();
    gloss.fillStyle(0xffffff, 0.08);
    gloss.fillEllipse(centerX - 20, centerY - 30, radius * 1.2, radius * 0.7);
  }

  private createWheelTexture(radius: number, numSegments: number): HTMLCanvasElement {
    const size = radius * 2 + 20;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const cx = size / 2;
    const cy = size / 2;
    const sliceAngle = (Math.PI * 2) / numSegments;

    // Draw each segment with radial gradient
    this.segments.forEach((segment, i) => {
      const startAngle = i * sliceAngle - Math.PI / 2;
      const endAngle = startAngle + sliceAngle;
      const midAngle = startAngle + sliceAngle / 2;

      // Create radial gradient (lighter center, darker edge)
      const baseColor = segment.color;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grad.addColorStop(0, this.lightenColor(baseColor, 30));
      grad.addColorStop(0.5, baseColor);
      grad.addColorStop(1, this.darkenColor(baseColor, 25));

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Segment divider (dark line)
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(startAngle) * radius, cy + Math.sin(startAngle) * radius);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Inner light line on divider
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(startAngle) * 5, cy + Math.sin(startAngle) * 5);
      ctx.lineTo(cx + Math.cos(startAngle) * (radius - 5), cy + Math.sin(startAngle) * (radius - 5));
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Outer ring shadow
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 4;
    ctx.stroke();

    return canvas;
  }

  private lightenColor(hex: string, percent: number): string {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, (num >> 16) + percent);
    const g = Math.min(255, ((num >> 8) & 0x00FF) + percent);
    const b = Math.min(255, (num & 0x0000FF) + percent);
    return `rgb(${r},${g},${b})`;
  }

  private darkenColor(hex: string, percent: number): string {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.max(0, (num >> 16) - percent);
    const g = Math.max(0, ((num >> 8) & 0x00FF) - percent);
    const b = Math.max(0, (num & 0x0000FF) - percent);
    return `rgb(${r},${g},${b})`;
  }

  private drawPointer(scale: number) {
    const centerX = 160;
    this.pointer.clear();

    // Shadow
    this.pointer.fillStyle(0x000000, 0.3);
    this.pointer.beginPath();
    this.pointer.moveTo(centerX + 2, 30 * scale);
    this.pointer.lineTo(centerX - 16 * scale + 2, 6);
    this.pointer.lineTo(centerX + 16 * scale + 2, 6);
    this.pointer.closePath();
    this.pointer.fillPath();

    // Main pointer (red with gradient effect)
    this.pointer.fillStyle(0xdc2626, 1);
    this.pointer.beginPath();
    this.pointer.moveTo(centerX, 28 * scale);
    this.pointer.lineTo(centerX - 15 * scale, 4);
    this.pointer.lineTo(centerX + 15 * scale, 4);
    this.pointer.closePath();
    this.pointer.fillPath();

    // Dark border
    this.pointer.lineStyle(2, 0x7f1d1d, 1);
    this.pointer.strokePath();

    // Highlight stripe
    this.pointer.fillStyle(0xfca5a5, 0.5);
    this.pointer.beginPath();
    this.pointer.moveTo(centerX - 3, 24 * scale);
    this.pointer.lineTo(centerX - 10 * scale, 6);
    this.pointer.lineTo(centerX - 5 * scale, 6);
    this.pointer.lineTo(centerX - 1, 22 * scale);
    this.pointer.closePath();
    this.pointer.fillPath();

    // Base circle
    this.pointer.fillStyle(0x991b1b, 1);
    this.pointer.fillCircle(centerX, 6, 8 * scale);
    this.pointer.lineStyle(2, 0x7f1d1d, 1);
    this.pointer.strokeCircle(centerX, 6, 8 * scale);
    this.pointer.fillStyle(0xfecaca, 0.4);
    this.pointer.fillCircle(centerX - 2, 4, 3 * scale);
  }

  private tickPointer() {
    // Quick pulse animation on pointer
    this.tweens.add({
      targets: { scale: 1 },
      scale: 1.15,
      duration: 50,
      yoyo: true,
      onUpdate: (tween) => {
        this.drawPointer(tween.getValue() ?? 1);
      },
    });
  }

  private showWinHighlight(segmentIndex: number) {
    const centerX = 160;
    const centerY = 160;
    const radius = 125;
    const numSegments = this.segments.length;
    const sliceAngle = (Math.PI * 2) / numSegments;
    const startAngle = segmentIndex * sliceAngle - Math.PI / 2;
    const endAngle = startAngle + sliceAngle;

    // Flash the winning segment
    let flashCount = 0;
    const flashInterval = setInterval(() => {
      this.winHighlight.clear();
      if (flashCount % 2 === 0) {
        this.winHighlight.lineStyle(6, 0xfbbf24, 0.9);
        this.winHighlight.beginPath();
        this.winHighlight.arc(centerX, centerY, radius - 3,
          startAngle + this.wheelContainer.rotation * Math.PI / 180,
          endAngle + this.wheelContainer.rotation * Math.PI / 180);
        this.winHighlight.strokePath();
      }
      this.winHighlight.setVisible(true);
      flashCount++;
      if (flashCount >= 6) {
        clearInterval(flashInterval);
        this.winHighlight.setVisible(false);
      }
    }, 150);
  }

  spinTo(targetIndex: number, callback?: () => void) {
    if (this.isSpinning) return;
    this.isSpinning = true;
    this.winningIndex = targetIndex;
    this.lastSegmentIndex = -1;

    const numSegments = this.segments.length;
    const sliceAngle = 360 / numSegments;

    // CENTER of segment N is at (N + 0.5) * sliceAngle from starting position
    const segmentCenterOffset = (targetIndex + 0.5) * sliceAngle;
    const targetAngle = -segmentCenterOffset;

    // Random offset within segment (±35% from center)
    const randomOffset = (Math.random() - 0.5) * sliceAngle * 0.7;

    // Normalize target to [0, -360) range
    const normalizedTarget = ((targetAngle + randomOffset) % 360 + 360) % 360 - 360;

    // 5-7 full rotations
    const rotations = 5 + Math.floor(Math.random() * 3);
    const finalAngle = normalizedTarget - rotations * 360;

    console.log(`[Wheel] Target: ${this.segments[targetIndex]?.label}, final=${finalAngle.toFixed(1)}°`);

    // Main spin with tick tracking
    this.tweens.add({
      targets: this.wheelContainer,
      angle: finalAngle,
      duration: 4000,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        // Track current segment for tick effect
        const currentAngle = this.wheelContainer.angle;
        const normalizedAngle = (((-currentAngle) % 360) + 360) % 360;
        const currentSegment = Math.floor(normalizedAngle / sliceAngle) % numSegments;

        if (currentSegment !== this.lastSegmentIndex && this.lastSegmentIndex !== -1) {
          this.tickPointer();
        }
        this.lastSegmentIndex = currentSegment;
      },
      onComplete: () => {
        this.currentAngle = finalAngle;
        this.isSpinning = false;

        // Show win highlight
        this.showWinHighlight(targetIndex);

        // Bounce effect at the end
        this.tweens.add({
          targets: this.wheelContainer,
          angle: finalAngle + 3,
          duration: 100,
          yoyo: true,
          ease: 'Sine.easeInOut',
          onComplete: () => {
            if (callback) callback();
          },
        });
      },
    });
  }

  getIsSpinning() {
    return this.isSpinning;
  }
}

// ═══════════════════════════════════════════════════════════
// WHEEL MODAL COMPONENT
// ═══════════════════════════════════════════════════════════

export default function WheelModal({ isOpen, onClose, lang = 'ru' }: WheelModalProps) {
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<WheelScene | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [segments, setSegments] = useState<WheelSegment[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [lastReward, setLastReward] = useState<{ label: string; type: string; amount: number } | null>(null);
  const [loading, setLoading] = useState(true);

  // Get tickets from Zustand (SSOT - only source of truth)
  const tickets = usePlayerStore((state) => state.resources.lotteryTickets);
  const setResources = usePlayerStore((state) => state.setResources);

  // Fetch wheel config on open
  useEffect(() => {
    if (!isOpen) return;

    const socket = getSocket();
    setLoading(true);
    setLastReward(null);

    const handleWheelData = (data: { segments: WheelSegment[]; tickets: number }) => {
      setSegments(data.segments);
      // Update Zustand with server tickets (in case out of sync)
      setResources({ lotteryTickets: data.tickets });
      setLoading(false);
    };

    socket.on('wheel:data', handleWheelData);
    socket.emit('wheel:get');

    return () => {
      socket.off('wheel:data', handleWheelData);
    };
  }, [isOpen, setResources]);

  // Initialize Phaser when segments are ready
  useEffect(() => {
    if (!isOpen || segments.length === 0 || !containerRef.current) return;

    // Destroy existing game
    if (gameRef.current) {
      gameRef.current.destroy(true);
      gameRef.current = null;
    }

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.CANVAS,
      width: 320,
      height: 320,
      parent: containerRef.current,
      backgroundColor: '#0f172a',
      scene: WheelScene,
    };

    gameRef.current = new Phaser.Game(config);

    // Wait for scene to initialize
    setTimeout(() => {
      const scene = gameRef.current?.scene.getScene('WheelScene') as WheelScene;
      if (scene) {
        scene.scene.restart({ segments });
        sceneRef.current = scene;
      }
    }, 150);

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
        sceneRef.current = null;
      }
    };
  }, [isOpen, segments]);

  // Handle spin - SSOT: server decides everything
  const handleSpin = useCallback(() => {
    if (spinning || tickets < 1 || !sceneRef.current) return;

    const socket = getSocket();
    setSpinning(true);
    setLastReward(null);

    socket.emit('wheel:spin', null, (response: any) => {
      if (response.error) {
        console.error('[Wheel] Spin error:', response.error);
        setSpinning(false);
        return;
      }

      const { winningIndex, reward } = response;

      console.log(`[Wheel] Server says: segment ${winningIndex}, reward: ${reward.label}`);

      // Animate wheel to the winning segment
      // Resources will be updated via player:state event from server
      sceneRef.current?.spinTo(winningIndex, () => {
        setLastReward(reward);
        setSpinning(false);
      });
    });
  }, [spinning, tickets]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85">
      <div className="bg-gradient-to-b from-slate-900 to-slate-950 rounded-2xl border-2 border-amber-600/60
                      shadow-2xl shadow-amber-900/30 w-[350px] max-h-[95vh] overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 bg-gradient-to-r from-amber-900/50 to-yellow-900/50
                        border-b border-amber-700/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🎰</span>
            <span className="text-amber-400 font-bold text-lg">
              {lang === 'ru' ? 'Колесо Фортуны' : 'Wheel of Fortune'}
            </span>
          </div>
          <button
            onClick={onClose}
            disabled={spinning}
            className="text-gray-400 hover:text-white text-2xl font-bold w-8 h-8
                       flex items-center justify-center rounded-full hover:bg-gray-800/50
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ×
          </button>
        </div>

        {/* Tickets display */}
        <div className="px-4 py-2 bg-slate-800/60 border-b border-slate-700/50
                        flex items-center justify-center gap-3">
          <span className="text-slate-400 text-sm">{lang === 'ru' ? 'Ваши билеты:' : 'Your tickets:'}</span>
          <span className="text-amber-400 font-bold text-xl">🎟️ {tickets}</span>
        </div>

        {/* Wheel container */}
        <div className="p-3 flex flex-col items-center bg-gradient-to-b from-slate-800/30 to-transparent">
          {loading ? (
            <div className="w-[320px] h-[320px] flex items-center justify-center">
              <div className="text-slate-400 animate-pulse">
                {lang === 'ru' ? 'Загрузка...' : 'Loading...'}
              </div>
            </div>
          ) : (
            <div
              ref={containerRef}
              className="w-[320px] h-[320px] rounded-2xl overflow-hidden shadow-lg shadow-black/50"
            />
          )}

          {/* Reward display */}
          {lastReward && (
            <div className="mt-3 px-5 py-2.5 bg-gradient-to-r from-emerald-900/60 to-green-900/60
                            rounded-xl border-2 border-emerald-500/60 shadow-lg shadow-emerald-900/30">
              <span className="text-emerald-400 font-bold text-lg">
                🎉 {lang === 'ru' ? 'Выигрыш: ' : 'Won: '}{lastReward.label}
              </span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="px-4 pb-4 pt-2 flex gap-3">
          <button
            onClick={handleSpin}
            disabled={spinning || tickets < 1 || loading}
            className={`flex-1 py-3 rounded-xl font-bold text-lg transition-all shadow-lg
                        ${spinning || tickets < 1 || loading
                          ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                          : 'bg-gradient-to-r from-amber-600 to-yellow-600 text-white hover:from-amber-500 hover:to-yellow-500 active:scale-95 shadow-amber-900/40'
                        }`}
          >
            {spinning
              ? (lang === 'ru' ? '🎰 Крутится...' : '🎰 Spinning...')
              : tickets < 1
                ? (lang === 'ru' ? 'Нет билетов' : 'No tickets')
                : (lang === 'ru' ? '🎟️ Крутить (1)' : '🎟️ Spin (1)')
            }
          </button>
          <button
            onClick={onClose}
            disabled={spinning}
            className="px-5 py-3 bg-slate-700 text-slate-300 rounded-xl font-bold
                       hover:bg-slate-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {lang === 'ru' ? 'Закрыть' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
