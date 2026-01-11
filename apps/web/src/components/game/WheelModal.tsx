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
// PHASER WHEEL SCENE - Classic pie-slice wheel
// Segments go from center to edge like pizza slices
// Text along radius (from center outward)
// ═══════════════════════════════════════════════════════════

// Bright alternating colors for pie slices
const SLICE_COLORS = [
  '#EF4444', // red
  '#F59E0B', // amber
  '#22C55E', // green
  '#3B82F6', // blue
  '#A855F7', // purple
  '#EC4899', // pink
  '#F97316', // orange
  '#14B8A6', // teal
  '#8B5CF6', // violet
  '#EAB308', // yellow
];

class WheelScene extends Phaser.Scene {
  private wheelContainer!: Phaser.GameObjects.Container;
  private pointer!: Phaser.GameObjects.Graphics;
  private segments: WheelSegment[] = [];
  private isSpinning = false;
  private currentAngle = 0;
  private lastSegmentIndex = -1;

  constructor() {
    super({ key: 'WheelScene' });
  }

  init(data: { segments: WheelSegment[] }) {
    this.segments = data.segments || [];
    this.currentAngle = 0;
    this.lastSegmentIndex = -1;
  }

  create() {
    const centerX = 160;
    const centerY = 160;
    const radius = 125;
    const numSegments = this.segments.length;
    const sliceAngle = (Math.PI * 2) / numSegments;

    // Container for the wheel
    this.wheelContainer = this.add.container(centerX, centerY);

    // Draw pie slices using Phaser Graphics
    const wheel = this.add.graphics();

    this.segments.forEach((segment, i) => {
      const startAngle = i * sliceAngle - Math.PI / 2;
      const endAngle = startAngle + sliceAngle;
      const color = parseInt(SLICE_COLORS[i % SLICE_COLORS.length].replace('#', '0x'));

      // Fill pie slice
      wheel.fillStyle(color, 1);
      wheel.beginPath();
      wheel.moveTo(0, 0);
      wheel.arc(0, 0, radius, startAngle, endAngle, false);
      wheel.closePath();
      wheel.fillPath();

      // Darker border between slices
      wheel.lineStyle(2, 0x000000, 0.4);
      wheel.beginPath();
      wheel.moveTo(0, 0);
      wheel.lineTo(Math.cos(startAngle) * radius, Math.sin(startAngle) * radius);
      wheel.stroke();

      // Light inner edge
      wheel.lineStyle(1, 0xffffff, 0.3);
      wheel.beginPath();
      wheel.moveTo(Math.cos(startAngle) * 25, Math.sin(startAngle) * 25);
      wheel.lineTo(Math.cos(startAngle) * (radius - 3), Math.sin(startAngle) * (radius - 3));
      wheel.stroke();
    });

    // Outer rim
    wheel.lineStyle(4, 0x000000, 0.5);
    wheel.strokeCircle(0, 0, radius);

    this.wheelContainer.add(wheel);

    // Add text labels - along the radius (from center to edge)
    this.segments.forEach((segment, i) => {
      const midAngle = i * sliceAngle - Math.PI / 2 + sliceAngle / 2;
      const labelRadius = radius * 0.55; // Position text at 55% of radius
      const labelX = Math.cos(midAngle) * labelRadius;
      const labelY = Math.sin(midAngle) * labelRadius;

      // Text rotated to point outward from center (along radius)
      const label = this.add.text(labelX, labelY, segment.label, {
        fontSize: '15px',
        fontFamily: 'Arial Black, sans-serif',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4,
      });
      label.setOrigin(0.5, 0.5);
      // Rotate so text reads from center outward
      label.setRotation(midAngle);
      this.wheelContainer.add(label);
    });

    // Center hub (gold button)
    const hub = this.add.graphics();
    hub.fillStyle(0x1f2937, 1);
    hub.fillCircle(0, 0, 22);
    hub.lineStyle(4, 0xfbbf24, 1);
    hub.strokeCircle(0, 0, 20);
    hub.fillStyle(0xfbbf24, 1);
    hub.fillCircle(0, 0, 14);
    hub.fillStyle(0xfef3c7, 0.6);
    hub.fillCircle(-3, -3, 5);
    this.wheelContainer.add(hub);

    // Golden outer frame
    const frame = this.add.graphics();
    frame.lineStyle(8, 0x78350f, 1);
    frame.strokeCircle(centerX, centerY, radius + 6);
    frame.lineStyle(4, 0xfbbf24, 1);
    frame.strokeCircle(centerX, centerY, radius + 2);

    // Pointer at top
    this.pointer = this.add.graphics();
    this.drawPointer(1);
  }

  private drawPointer(scale: number) {
    const cx = 160;
    this.pointer.clear();

    // Shadow
    this.pointer.fillStyle(0x000000, 0.3);
    this.pointer.fillTriangle(cx + 2, 28 * scale, cx - 12 * scale + 2, 4, cx + 12 * scale + 2, 4);

    // Red pointer
    this.pointer.fillStyle(0xdc2626, 1);
    this.pointer.fillTriangle(cx, 26 * scale, cx - 11 * scale, 2, cx + 11 * scale, 2);

    // Border
    this.pointer.lineStyle(2, 0x7f1d1d, 1);
    this.pointer.strokeTriangle(cx, 26 * scale, cx - 11 * scale, 2, cx + 11 * scale, 2);

    // Highlight
    this.pointer.fillStyle(0xfca5a5, 0.5);
    this.pointer.fillTriangle(cx - 2, 20 * scale, cx - 8 * scale, 4, cx - 4 * scale, 4);

    // Base circle
    this.pointer.fillStyle(0x991b1b, 1);
    this.pointer.fillCircle(cx, 5, 7 * scale);
  }

  spinTo(targetIndex: number, callback?: () => void) {
    if (this.isSpinning) return;
    this.isSpinning = true;
    this.lastSegmentIndex = -1;

    const numSegments = this.segments.length;
    const sliceAngle = 360 / numSegments; // 36° for 10 segments

    // Segment N center is at (N + 0.5) * sliceAngle CLOCKWISE from TOP
    // To bring it under the pointer (at TOP), wheel must rotate CLOCKWISE by that amount
    // In Phaser, positive angle = clockwise rotation
    const segmentCenterOffset = (targetIndex + 0.5) * sliceAngle;

    // Random offset within segment (±35% from center, stay inside segment)
    const randomOffset = (Math.random() - 0.5) * sliceAngle * 0.7;

    // Target angle (positive = clockwise)
    const targetAngle = segmentCenterOffset + randomOffset;

    // Normalize to [0, 360) then add full rotations (5-7 spins clockwise)
    const normalizedTarget = ((targetAngle % 360) + 360) % 360;
    const rotations = 5 + Math.floor(Math.random() * 3);
    const finalAngle = normalizedTarget + rotations * 360;

    console.log(`[Wheel] Target: ${this.segments[targetIndex]?.label} (idx ${targetIndex}), angle=${finalAngle.toFixed(1)}°`);

    // Main spin with tick tracking
    this.tweens.add({
      targets: this.wheelContainer,
      angle: finalAngle,
      duration: 4000,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        // Track current segment for tick effect
        const currentAngle = this.wheelContainer.angle;
        const normalizedAngle = ((currentAngle % 360) + 360) % 360;
        const currentSegment = Math.floor(normalizedAngle / sliceAngle) % numSegments;

        if (currentSegment !== this.lastSegmentIndex && this.lastSegmentIndex !== -1) {
          // Pointer tick pulse
          this.tweens.add({
            targets: { s: 1 },
            s: 1.1,
            duration: 30,
            yoyo: true,
            onUpdate: (tw) => this.drawPointer(tw.getValue() ?? 1),
          });
        }
        this.lastSegmentIndex = currentSegment;
      },
      onComplete: () => {
        this.currentAngle = finalAngle;
        this.isSpinning = false;

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
