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
// PHASER WHEEL SCENE
// ═══════════════════════════════════════════════════════════

class WheelScene extends Phaser.Scene {
  private wheelContainer!: Phaser.GameObjects.Container;
  private segments: WheelSegment[] = [];
  private isSpinning = false;
  private onSpinComplete?: (index: number) => void;

  constructor() {
    super({ key: 'WheelScene' });
  }

  init(data: { segments: WheelSegment[] }) {
    this.segments = data.segments || [];
  }

  create() {
    const centerX = 160;
    const centerY = 160;
    const radius = 140;

    // Create container for wheel
    this.wheelContainer = this.add.container(centerX, centerY);

    // Draw wheel segments
    const segmentAngle = (Math.PI * 2) / this.segments.length;
    const graphics = this.add.graphics();

    this.segments.forEach((segment, i) => {
      const startAngle = i * segmentAngle - Math.PI / 2;
      const endAngle = startAngle + segmentAngle;

      // Draw segment
      graphics.fillStyle(parseInt(segment.color.replace('#', '0x')), 1);
      graphics.beginPath();
      graphics.moveTo(0, 0);
      graphics.arc(0, 0, radius, startAngle, endAngle, false);
      graphics.closePath();
      graphics.fillPath();

      // Draw border
      graphics.lineStyle(2, 0x1f2937, 1);
      graphics.beginPath();
      graphics.moveTo(0, 0);
      graphics.arc(0, 0, radius, startAngle, endAngle, false);
      graphics.closePath();
      graphics.strokePath();

      // Add label
      const labelAngle = startAngle + segmentAngle / 2;
      const labelRadius = radius * 0.65;
      const labelX = Math.cos(labelAngle) * labelRadius;
      const labelY = Math.sin(labelAngle) * labelRadius;

      const label = this.add.text(labelX, labelY, segment.label, {
        fontSize: '12px',
        fontFamily: 'Arial, sans-serif',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      });
      label.setOrigin(0.5, 0.5);
      label.setRotation(labelAngle + Math.PI / 2);

      this.wheelContainer.add(label);
    });

    // Add graphics to container
    this.wheelContainer.addAt(graphics, 0);

    // Draw center circle
    const centerCircle = this.add.graphics();
    centerCircle.fillStyle(0x1f2937, 1);
    centerCircle.fillCircle(0, 0, 20);
    centerCircle.lineStyle(3, 0xfbbf24, 1);
    centerCircle.strokeCircle(0, 0, 20);
    this.wheelContainer.add(centerCircle);

    // Draw pointer (triangle at top)
    const pointer = this.add.graphics();
    pointer.fillStyle(0xef4444, 1);
    pointer.beginPath();
    pointer.moveTo(centerX, 10);
    pointer.lineTo(centerX - 12, 35);
    pointer.lineTo(centerX + 12, 35);
    pointer.closePath();
    pointer.fillPath();
    pointer.lineStyle(2, 0x7f1d1d, 1);
    pointer.strokePath();

    // Outer ring
    const outerRing = this.add.graphics();
    outerRing.lineStyle(6, 0xfbbf24, 1);
    outerRing.strokeCircle(centerX, centerY, radius + 5);
  }

  spinTo(targetIndex: number, callback?: () => void) {
    if (this.isSpinning) return;
    this.isSpinning = true;

    const segmentAngle = 360 / this.segments.length;
    // Target angle: pointer at top (270°), center of segment
    const targetAngle = 270 - (targetIndex * segmentAngle) - (segmentAngle / 2);
    // Add random offset within segment (±30% of segment)
    const randomOffset = (Math.random() - 0.5) * segmentAngle * 0.6;
    // Add 5-7 full rotations
    const rotations = 5 + Math.floor(Math.random() * 3);
    const finalAngle = targetAngle + randomOffset + (rotations * 360);

    this.tweens.add({
      targets: this.wheelContainer,
      angle: finalAngle,
      duration: 4000,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.isSpinning = false;
        if (callback) callback();
        if (this.onSpinComplete) this.onSpinComplete(targetIndex);
      },
    });
  }

  setOnSpinComplete(callback: (index: number) => void) {
    this.onSpinComplete = callback;
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
  const [tickets, setTickets] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [lastReward, setLastReward] = useState<{ label: string; type: string; amount: number } | null>(null);
  const [loading, setLoading] = useState(true);

  // Get tickets from Zustand (real-time sync)
  const zustandTickets = usePlayerStore((state) => state.resources.lotteryTickets);

  // Update local tickets when Zustand updates
  useEffect(() => {
    if (zustandTickets !== undefined) {
      setTickets(zustandTickets);
    }
  }, [zustandTickets]);

  // Fetch wheel data on open
  useEffect(() => {
    if (!isOpen) return;

    const socket = getSocket();
    setLoading(true);
    setLastReward(null);

    const handleWheelData = (data: { segments: WheelSegment[]; tickets: number; canSpin: boolean }) => {
      setSegments(data.segments);
      setTickets(data.tickets);
      setLoading(false);
    };

    socket.on('wheel:data', handleWheelData);
    socket.emit('wheel:get');

    return () => {
      socket.off('wheel:data', handleWheelData);
    };
  }, [isOpen]);

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
      backgroundColor: '#111827',
      scene: WheelScene,
      physics: { default: 'arcade' },
    };

    gameRef.current = new Phaser.Game(config);

    // Wait for scene to be ready
    gameRef.current.events.once('ready', () => {
      const scene = gameRef.current?.scene.getScene('WheelScene') as WheelScene;
      if (scene) {
        scene.scene.restart({ segments });
        sceneRef.current = scene;
      }
    });

    // Restart scene with segments after a short delay
    setTimeout(() => {
      const scene = gameRef.current?.scene.getScene('WheelScene') as WheelScene;
      if (scene) {
        scene.scene.restart({ segments });
        sceneRef.current = scene;
      }
    }, 100);

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
        sceneRef.current = null;
      }
    };
  }, [isOpen, segments]);

  // Handle spin
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

      const { winningIndex, reward, ticketsAfter } = response;

      // Animate wheel to winning segment
      sceneRef.current?.spinTo(winningIndex, () => {
        setLastReward(reward);
        setTickets(ticketsAfter);
        setSpinning(false);
      });
    });
  }, [spinning, tickets]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="bg-gradient-to-b from-gray-900 to-gray-950 rounded-2xl border border-yellow-600/50
                      shadow-2xl shadow-yellow-900/20 w-[340px] max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 bg-gradient-to-r from-yellow-900/40 to-amber-900/40
                        border-b border-yellow-700/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🎡</span>
            <span className="text-yellow-400 font-bold">
              {lang === 'ru' ? 'Колесо Фортуны' : 'Wheel of Fortune'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl font-bold w-8 h-8
                       flex items-center justify-center rounded-full hover:bg-gray-800/50"
          >
            ×
          </button>
        </div>

        {/* Tickets display */}
        <div className="px-4 py-2 bg-gray-800/50 border-b border-gray-700/50 flex items-center justify-center gap-2">
          <span className="text-gray-400">{lang === 'ru' ? 'Ваши билеты:' : 'Your tickets:'}</span>
          <span className="text-yellow-400 font-bold text-lg">🎟️ {tickets}</span>
        </div>

        {/* Wheel container */}
        <div className="p-4 flex flex-col items-center">
          {loading ? (
            <div className="w-[320px] h-[320px] flex items-center justify-center">
              <span className="text-gray-400">{lang === 'ru' ? 'Загрузка...' : 'Loading...'}</span>
            </div>
          ) : (
            <div ref={containerRef} className="w-[320px] h-[320px] rounded-xl overflow-hidden" />
          )}

          {/* Reward display */}
          {lastReward && (
            <div className="mt-3 px-4 py-2 bg-gradient-to-r from-green-900/50 to-emerald-900/50
                            rounded-lg border border-green-500/50 animate-pulse">
              <span className="text-green-400 font-bold">
                {lang === 'ru' ? 'Выигрыш: ' : 'Won: '}{lastReward.label}
              </span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="px-4 pb-4 flex gap-3">
          <button
            onClick={handleSpin}
            disabled={spinning || tickets < 1 || loading}
            className={`flex-1 py-3 rounded-lg font-bold text-lg transition-all
                        ${spinning || tickets < 1 || loading
                          ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                          : 'bg-gradient-to-r from-yellow-600 to-amber-600 text-white hover:from-yellow-500 hover:to-amber-500 active:scale-95'
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
            className="px-4 py-3 bg-gray-700 text-gray-300 rounded-lg font-bold
                       hover:bg-gray-600 transition-all"
          >
            {lang === 'ru' ? 'Закрыть' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
