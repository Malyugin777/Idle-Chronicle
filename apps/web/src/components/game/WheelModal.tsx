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
// PHASER WHEEL SCENE - Proper angle calculation
// ═══════════════════════════════════════════════════════════

class WheelScene extends Phaser.Scene {
  private wheelContainer!: Phaser.GameObjects.Container;
  private segments: WheelSegment[] = [];
  private isSpinning = false;
  private currentAngle = 0;

  constructor() {
    super({ key: 'WheelScene' });
  }

  init(data: { segments: WheelSegment[] }) {
    this.segments = data.segments || [];
    this.currentAngle = 0;
  }

  create() {
    const centerX = 160;
    const centerY = 160;
    const radius = 130;
    const numSegments = this.segments.length;
    const sliceAngle = (Math.PI * 2) / numSegments;

    // Create container for wheel (will rotate)
    this.wheelContainer = this.add.container(centerX, centerY);

    const graphics = this.add.graphics();

    // Draw segments - segment 0 starts at TOP (-π/2)
    this.segments.forEach((segment, i) => {
      const startAngle = i * sliceAngle - Math.PI / 2;
      const endAngle = startAngle + sliceAngle;

      // Fill segment
      graphics.fillStyle(parseInt(segment.color.replace('#', '0x')), 1);
      graphics.beginPath();
      graphics.moveTo(0, 0);
      graphics.arc(0, 0, radius, startAngle, endAngle, false);
      graphics.closePath();
      graphics.fillPath();

      // Segment border (darker)
      graphics.lineStyle(3, 0x1f2937, 1);
      graphics.beginPath();
      graphics.moveTo(0, 0);
      graphics.lineTo(Math.cos(startAngle) * radius, Math.sin(startAngle) * radius);
      graphics.stroke();
    });

    // Outer circle border
    graphics.lineStyle(4, 0x374151, 1);
    graphics.strokeCircle(0, 0, radius);

    this.wheelContainer.add(graphics);

    // Add labels - positioned at center of each segment
    this.segments.forEach((segment, i) => {
      const midAngle = i * sliceAngle - Math.PI / 2 + sliceAngle / 2;
      const labelRadius = radius * 0.65;
      const labelX = Math.cos(midAngle) * labelRadius;
      const labelY = Math.sin(midAngle) * labelRadius;

      const label = this.add.text(labelX, labelY, segment.label, {
        fontSize: '14px',
        fontFamily: 'Arial Black, sans-serif',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4,
      });
      label.setOrigin(0.5, 0.5);
      // Rotate text to be readable (perpendicular to radius)
      label.setRotation(midAngle + Math.PI / 2);

      this.wheelContainer.add(label);
    });

    // Center hub
    const hub = this.add.graphics();
    hub.fillStyle(0x1f2937, 1);
    hub.fillCircle(0, 0, 22);
    hub.lineStyle(4, 0xfbbf24, 1);
    hub.strokeCircle(0, 0, 22);
    hub.fillStyle(0xfbbf24, 1);
    hub.fillCircle(0, 0, 8);
    this.wheelContainer.add(hub);

    // Outer decorative ring (golden)
    const outerRing = this.add.graphics();
    outerRing.lineStyle(8, 0xb45309, 1);
    outerRing.strokeCircle(centerX, centerY, radius + 6);
    outerRing.lineStyle(3, 0xfbbf24, 1);
    outerRing.strokeCircle(centerX, centerY, radius + 10);

    // Pointer (triangle at top, pointing DOWN into wheel)
    const pointer = this.add.graphics();
    pointer.fillStyle(0xdc2626, 1);
    pointer.beginPath();
    pointer.moveTo(centerX, 25);          // tip pointing down
    pointer.lineTo(centerX - 14, 5);      // top-left
    pointer.lineTo(centerX + 14, 5);      // top-right
    pointer.closePath();
    pointer.fillPath();
    pointer.lineStyle(3, 0x7f1d1d, 1);
    pointer.strokePath();
    // Small circle at base
    pointer.fillStyle(0x991b1b, 1);
    pointer.fillCircle(centerX, 8, 6);
  }

  /**
   * Spin to a specific segment index
   *
   * MATH:
   * - Segment 0 STARTS at TOP (-π/2), its CENTER is at sliceAngle/2 clockwise from TOP
   * - Pointer points DOWN at TOP position
   * - To land pointer on CENTER of segment N:
   *   Wheel must rotate so that segment N's center aligns with TOP
   *
   * Segment N center = N * sliceAngle + sliceAngle/2 (clockwise from initial)
   * To bring it to TOP: rotate wheel by -(N * sliceAngle + sliceAngle/2)
   */
  spinTo(targetIndex: number, callback?: () => void) {
    if (this.isSpinning) return;
    this.isSpinning = true;

    const numSegments = this.segments.length;
    const sliceAngle = 360 / numSegments; // 36° for 10 segments

    // CENTER of segment N is at (N + 0.5) * sliceAngle from starting position
    // To bring it under pointer: rotate by negative of that
    const segmentCenterOffset = (targetIndex + 0.5) * sliceAngle;
    const targetAngle = -segmentCenterOffset;

    // Random offset within segment (±35% from center, stay inside segment)
    const randomOffset = (Math.random() - 0.5) * sliceAngle * 0.7;

    // Normalize target to [0, -360) range
    const normalizedTarget = ((targetAngle + randomOffset) % 360 + 360) % 360 - 360;

    // Add 5-7 full rotations (clockwise = negative in Phaser when going this direction)
    const rotations = 5 + Math.floor(Math.random() * 3);
    const finalAngle = normalizedTarget - rotations * 360;

    console.log(`[Wheel] Target segment ${targetIndex} (${this.segments[targetIndex]?.label}), center=${segmentCenterOffset.toFixed(1)}°, final=${finalAngle.toFixed(1)}°`);

    this.tweens.add({
      targets: this.wheelContainer,
      angle: finalAngle,
      duration: 3500,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.currentAngle = finalAngle;
        this.isSpinning = false;
        if (callback) callback();
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
