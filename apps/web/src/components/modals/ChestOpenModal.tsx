'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Coins, ScrollText } from 'lucide-react';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

type ChestType = 'WOODEN' | 'BRONZE' | 'SILVER' | 'GOLD';
type Rarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC';

interface EquipmentReward {
  name: string;
  icon: string;
  rarity: Rarity;
  slot: string;
  pAtk?: number;
  pDef?: number;
}

interface ChestRewards {
  gold: number;
  equipment?: EquipmentReward;
  enchantScrolls?: number;
  enchantCharges?: number;     // v1.6: charges instead of scrolls
  protectionDrop?: number;      // Protection charges
  crystals?: number;            // v1.6: bonus crystals (ancientCoin)
  tickets?: number;             // v1.6: lottery tickets
  keyDrop?: ChestType | null;   // v1.6: key type dropped
}

interface ChestOpenModalProps {
  chestType: ChestType;
  rewards: ChestRewards | null;
  isOpening: boolean;
  onClose: () => void;
  lang: 'ru' | 'en';
}

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════

const CHEST_CONFIG: Record<ChestType, { icon: string; nameRu: string; nameEn: string; color: string; bgColor: string }> = {
  WOODEN: { icon: '🪵', nameRu: 'Деревянный', nameEn: 'Wooden', color: 'text-amber-500', bgColor: 'from-amber-900/80 to-amber-950/90' },
  BRONZE: { icon: '🟫', nameRu: 'Бронзовый', nameEn: 'Bronze', color: 'text-orange-400', bgColor: 'from-orange-900/80 to-orange-950/90' },
  SILVER: { icon: '🪙', nameRu: 'Серебряный', nameEn: 'Silver', color: 'text-gray-300', bgColor: 'from-gray-700/80 to-gray-900/90' },
  GOLD: { icon: '🟨', nameRu: 'Золотой', nameEn: 'Gold', color: 'text-yellow-400', bgColor: 'from-yellow-700/80 to-yellow-900/90' },
};

const RARITY_STYLES: Record<Rarity, { color: string; glow: string; bgGlow: string }> = {
  COMMON: {
    color: 'text-gray-300',
    glow: '',
    bgGlow: '',
  },
  UNCOMMON: {
    color: 'text-green-400',
    glow: 'drop-shadow-[0_0_12px_rgba(74,222,128,0.8)]',
    bgGlow: 'shadow-[0_0_40px_rgba(74,222,128,0.4)]',
  },
  RARE: {
    color: 'text-blue-400',
    glow: 'drop-shadow-[0_0_14px_rgba(96,165,250,0.9)]',
    bgGlow: 'shadow-[0_0_50px_rgba(96,165,250,0.5)]',
  },
  EPIC: {
    color: 'text-purple-400',
    glow: 'drop-shadow-[0_0_18px_rgba(192,132,252,1)]',
    bgGlow: 'shadow-[0_0_60px_rgba(192,132,252,0.6)]',
  },
};

// ═══════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════

export default function ChestOpenModal({ chestType, rewards, isOpening, onClose, lang }: ChestOpenModalProps) {
  const [phase, setPhase] = useState<'shake' | 'burst' | 'reveal'>('shake');
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; angle: number }>>([]);

  const config = CHEST_CONFIG[chestType];
  const chestName = lang === 'ru' ? config.nameRu : config.nameEn;

  // Generate burst particles
  const generateParticles = useCallback(() => {
    const newParticles = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * 100 - 50,
      y: Math.random() * 100 - 50,
      angle: Math.random() * 360,
    }));
    setParticles(newParticles);
  }, []);

  // Animation sequence
  useEffect(() => {
    if (!isOpening) return;

    // Phase 1: Shake (1 second)
    setPhase('shake');

    const burstTimeout = setTimeout(() => {
      // Phase 2: Burst (0.5 seconds)
      setPhase('burst');
      generateParticles();
    }, 1000);

    const revealTimeout = setTimeout(() => {
      // Phase 3: Reveal rewards
      setPhase('reveal');
    }, 1500);

    return () => {
      clearTimeout(burstTimeout);
      clearTimeout(revealTimeout);
    };
  }, [isOpening, generateParticles]);

  // Get best reward for highlight effect
  const bestRarity = rewards?.equipment?.rarity || null;
  const rarityStyle = bestRarity ? RARITY_STYLES[bestRarity] : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={phase === 'reveal' ? onClose : undefined}
    >
      {/* Close button */}
      {phase === 'reveal' && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white z-10"
        >
          <X size={24} />
        </button>
      )}

      <div className="relative w-full max-w-sm mx-4">
        {/* Background glow for rare+ items */}
        {phase === 'reveal' && rarityStyle?.bgGlow && (
          <div className={`absolute inset-0 rounded-3xl ${rarityStyle.bgGlow} animate-pulse`} />
        )}

        {/* Main content */}
        <div
          className={`relative bg-gradient-to-b ${config.bgColor} rounded-2xl p-6 border border-white/20 overflow-hidden`}
          onClick={e => e.stopPropagation()}
        >
          {/* Particles */}
          {phase === 'burst' && particles.map(p => (
            <div
              key={p.id}
              className="absolute w-2 h-2 bg-yellow-400 rounded-full animate-particle"
              style={{
                left: '50%',
                top: '50%',
                transform: `translate(${p.x}px, ${p.y}px) rotate(${p.angle}deg)`,
                animation: 'particle-burst 0.5s ease-out forwards',
              }}
            />
          ))}

          {/* Light rays during burst */}
          {phase === 'burst' && (
            <div className="absolute inset-0 bg-gradient-radial from-yellow-400/50 to-transparent animate-pulse" />
          )}

          {/* Chest */}
          <div className="text-center mb-6">
            <div
              className={`text-7xl mb-3 inline-block transition-transform duration-200 ${
                phase === 'shake' ? 'animate-shake' : ''
              } ${phase === 'burst' ? 'scale-125 opacity-0' : ''}`}
            >
              {config.icon}
            </div>
            <h2 className={`text-xl font-bold ${config.color}`}>
              {chestName}
            </h2>
          </div>

          {/* Opening animation */}
          {phase !== 'reveal' && (
            <div className="text-center py-8">
              <div className="text-lg text-white animate-pulse">
                {lang === 'ru' ? 'Открывается...' : 'Opening...'}
              </div>
              <div className="mt-4 flex justify-center gap-1">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-3 h-3 bg-l2-gold rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Rewards */}
          {phase === 'reveal' && rewards && (
            <div className="space-y-4 animate-fade-in">
              {/* Gold - always present */}
              <div className="flex items-center justify-center gap-3 bg-black/30 rounded-xl p-4">
                <Coins className="text-l2-gold" size={28} />
                <span className="text-2xl font-bold text-l2-gold">
                  +{rewards.gold.toLocaleString()}
                </span>
              </div>

              {/* Equipment */}
              {rewards.equipment && (
                <div className={`bg-black/30 rounded-xl p-4 ${rarityStyle?.bgGlow}`}>
                  <div className="flex items-center justify-center gap-4">
                    <span className={`text-5xl ${rarityStyle?.glow}`}>
                      {rewards.equipment.icon}
                    </span>
                    <div className="text-left">
                      <div className={`font-bold text-lg ${rarityStyle?.color}`}>
                        {rewards.equipment.name}
                      </div>
                      <div className="text-sm text-gray-400">
                        {rewards.equipment.pAtk && <span className="text-red-400">{lang === 'ru' ? 'Ф.Атк' : 'P.Atk'} +{rewards.equipment.pAtk}</span>}
                        {rewards.equipment.pDef && <span className="text-blue-400 ml-2">{lang === 'ru' ? 'Ф.Защ' : 'P.Def'} +{rewards.equipment.pDef}</span>}
                      </div>
                      <div className={`text-xs ${rarityStyle?.color} opacity-80`}>
                        {lang === 'ru'
                          ? (rewards.equipment.rarity === 'COMMON' ? 'Обычный' :
                             rewards.equipment.rarity === 'UNCOMMON' ? 'Необычный' :
                             rewards.equipment.rarity === 'RARE' ? 'Редкий' : 'Эпический')
                          : rewards.equipment.rarity.charAt(0) + rewards.equipment.rarity.slice(1).toLowerCase()
                        }
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Enchant Charges */}
              {rewards.enchantCharges && rewards.enchantCharges > 0 && (
                <div className="flex items-center justify-center gap-3 bg-black/30 rounded-xl p-4">
                  <span className="text-2xl">⚡</span>
                  <span className="text-lg font-bold text-blue-400">
                    +{rewards.enchantCharges} {lang === 'ru' ? 'Заряды заточки' : 'Enchant Charges'}
                  </span>
                </div>
              )}

              {/* Protection Charges */}
              {rewards.protectionDrop && rewards.protectionDrop > 0 && (
                <div className="flex items-center justify-center gap-3 bg-purple-500/20 rounded-xl p-4 border border-purple-500/30">
                  <span className="text-2xl">🛡️</span>
                  <span className="text-lg font-bold text-purple-400">
                    +{rewards.protectionDrop} {lang === 'ru' ? 'Защита' : 'Protection'}
                  </span>
                </div>
              )}

              {/* Crystals (bonus drop) */}
              {rewards.crystals && rewards.crystals > 0 && (
                <div className="flex items-center justify-center gap-3 bg-cyan-500/20 rounded-xl p-4 border border-cyan-500/30">
                  <span className="text-2xl">💎</span>
                  <span className="text-lg font-bold text-cyan-400">
                    +{rewards.crystals} {lang === 'ru' ? 'Кристаллы' : 'Crystals'}
                  </span>
                </div>
              )}

              {/* Lottery Tickets (bonus drop) */}
              {rewards.tickets && rewards.tickets > 0 && (
                <div className="flex items-center justify-center gap-3 bg-yellow-500/20 rounded-xl p-4 border border-yellow-500/30">
                  <span className="text-2xl">🎟️</span>
                  <span className="text-lg font-bold text-yellow-400">
                    +{rewards.tickets} {lang === 'ru' ? 'Лотерейные билеты' : 'Lottery Tickets'}
                  </span>
                </div>
              )}

              {/* Key Drop (rare!) */}
              {rewards.keyDrop && (
                <div className="flex items-center justify-center gap-3 bg-gradient-to-r from-amber-500/30 to-yellow-500/30 rounded-xl p-4 border border-amber-500/50 animate-pulse">
                  <span className="text-2xl">🔑</span>
                  <span className="text-lg font-bold text-amber-400">
                    +1 {rewards.keyDrop === 'WOODEN' ? '🗝️' : rewards.keyDrop === 'BRONZE' ? '🔑' : rewards.keyDrop === 'SILVER' ? '🔐' : '🏆'}
                    {lang === 'ru' ? ' Ключ!' : ' Key!'}
                  </span>
                </div>
              )}

              {/* Tap to close hint */}
              <div className="text-center text-sm text-gray-500 pt-2">
                {lang === 'ru' ? 'Нажмите, чтобы закрыть' : 'Tap to close'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CSS animations */}
      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0) rotate(0); }
          10% { transform: translateX(-8px) rotate(-3deg); }
          20% { transform: translateX(8px) rotate(3deg); }
          30% { transform: translateX(-6px) rotate(-2deg); }
          40% { transform: translateX(6px) rotate(2deg); }
          50% { transform: translateX(-4px) rotate(-1deg); }
          60% { transform: translateX(4px) rotate(1deg); }
          70% { transform: translateX(-2px) rotate(0); }
          80% { transform: translateX(2px) rotate(0); }
          90% { transform: translateX(-1px) rotate(0); }
        }

        .animate-shake {
          animation: shake 0.5s ease-in-out infinite;
        }

        @keyframes particle-burst {
          0% {
            opacity: 1;
            transform: translate(0, 0) scale(1);
          }
          100% {
            opacity: 0;
            transform: translate(var(--tx, 50px), var(--ty, -50px)) scale(0);
          }
        }

        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fade-in {
          animation: fade-in 0.5s ease-out;
        }
      `}</style>
    </div>
  );
}
