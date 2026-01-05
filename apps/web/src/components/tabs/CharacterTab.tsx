'use client';

import { useEffect, useState } from 'react';
import { getSocket } from '@/lib/socket';
import { Sword, Zap, Clover, Coins } from 'lucide-react';

interface PlayerStats {
  id: string;
  username: string | null;
  firstName: string | null;
  level: number;
  str: number;
  dex: number;
  luck: number;
  pAtk: number;
  critChance: number;
  adena: number;
  totalDamage: number;
  bossesKilled: number;
}

export default function CharacterTab() {
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [upgrading, setUpgrading] = useState<string | null>(null);

  useEffect(() => {
    const socket = getSocket();

    // Request player data on mount
    socket.emit('player:get');

    socket.on('player:data', (data: PlayerStats) => {
      setStats(data);
    });

    socket.on('auth:success', (data: PlayerStats) => {
      setStats(data);
    });

    socket.on('upgrade:success', (data: { stat: string; value: number; adena: number; pAtk: number; critChance: number }) => {
      setStats(prev => prev ? {
        ...prev,
        [data.stat]: data.value,
        adena: data.adena,
        pAtk: data.pAtk,
        critChance: data.critChance,
      } : null);
      setUpgrading(null);
    });

    socket.on('upgrade:error', () => {
      setUpgrading(null);
    });

    return () => {
      socket.off('player:data');
      socket.off('auth:success');
      socket.off('upgrade:success');
      socket.off('upgrade:error');
    };
  }, []);

  const handleUpgrade = (stat: 'str' | 'dex' | 'luck') => {
    if (upgrading) return;
    setUpgrading(stat);
    getSocket().emit('upgrade:stat', { stat });
  };

  const getUpgradeCost = (level: number) => {
    return Math.floor(100 * Math.pow(1.5, level - 1));
  };

  if (!stats) {
    return (
      <div className="flex-1 flex items-center justify-center bg-l2-dark">
        <div className="text-center">
          <p className="text-gray-400 mb-2">Not authenticated</p>
          <p className="text-xs text-gray-500">Play in Telegram to save progress</p>
        </div>
      </div>
    );
  }

  const statItems = [
    {
      id: 'str' as const,
      name: 'STR',
      value: stats.str,
      icon: <Sword className="text-red-400" size={24} />,
      effect: '+8% damage',
      color: 'red',
    },
    {
      id: 'dex' as const,
      name: 'DEX',
      value: stats.dex,
      icon: <Zap className="text-yellow-400" size={24} />,
      effect: '+5% speed',
      color: 'yellow',
    },
    {
      id: 'luck' as const,
      name: 'LUCK',
      value: stats.luck,
      icon: <Clover className="text-green-400" size={24} />,
      effect: '+3% crit',
      color: 'green',
    },
  ];

  return (
    <div className="flex-1 overflow-auto bg-l2-dark p-4">
      {/* Header */}
      <div className="bg-l2-panel rounded-lg p-4 mb-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-l2-gold/20 flex items-center justify-center">
            <span className="text-2xl font-bold text-l2-gold">
              {stats.level}
            </span>
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-white">
              {stats.firstName || stats.username || 'Hero'}
            </h2>
            <p className="text-sm text-gray-400">Level {stats.level}</p>
          </div>
        </div>

        {/* Adena */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10">
          <div className="flex items-center gap-2">
            <Coins className="text-l2-gold" size={20} />
            <span className="text-l2-gold font-bold">{stats.adena.toLocaleString()}</span>
          </div>
          <span className="text-xs text-gray-400">Adena</span>
        </div>
      </div>

      {/* Derived Stats */}
      <div className="bg-l2-panel rounded-lg p-4 mb-4">
        <h3 className="text-sm text-gray-400 mb-3">Combat Stats</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500">P.Atk</p>
            <p className="text-lg font-bold text-white">{stats.pAtk}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Crit Chance</p>
            <p className="text-lg font-bold text-white">{(stats.critChance * 100).toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Damage</p>
            <p className="text-lg font-bold text-l2-gold">{stats.totalDamage.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Bosses Killed</p>
            <p className="text-lg font-bold text-white">{stats.bossesKilled}</p>
          </div>
        </div>
      </div>

      {/* Stats Upgrade */}
      <div className="bg-l2-panel rounded-lg p-4">
        <h3 className="text-sm text-gray-400 mb-3">Upgrade Stats</h3>
        <div className="space-y-3">
          {statItems.map((stat) => {
            const cost = getUpgradeCost(stat.value);
            const canAfford = stats.adena >= cost;

            return (
              <div
                key={stat.id}
                className="flex items-center gap-3 p-3 bg-black/30 rounded-lg"
              >
                {stat.icon}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{stat.name}</span>
                    <span className="text-l2-gold">{stat.value}</span>
                  </div>
                  <p className="text-xs text-gray-500">{stat.effect}</p>
                </div>
                <button
                  onClick={() => handleUpgrade(stat.id)}
                  disabled={!canAfford || upgrading === stat.id}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                    canAfford
                      ? 'bg-l2-gold text-black hover:bg-l2-gold/80'
                      : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  } ${upgrading === stat.id ? 'opacity-50' : ''}`}
                >
                  {upgrading === stat.id ? '...' : `${cost}`}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
