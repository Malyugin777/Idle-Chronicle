'use client';

import { useEffect, useState } from 'react';
import { getSocket } from '@/lib/socket';
import { Sword, Zap, Clover, Coins, Timer, Bot, Droplets } from 'lucide-react';
import { detectLanguage, useTranslation, Language } from '@/lib/i18n';

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
  tapsPerSecond: number;
  autoAttackSpeed: number;
  manaRegen: number;
}

export default function CharacterTab() {
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [lang] = useState<Language>(() => detectLanguage());
  const t = useTranslation(lang);

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

    socket.on('upgrade:success', (data: { stat: string; value: number; adena: number; pAtk?: number; critChance?: number }) => {
      setStats(prev => {
        if (!prev) return null;
        const updated = { ...prev, adena: data.adena };
        if (data.stat === 'tapsPerSecond') updated.tapsPerSecond = data.value;
        else if (data.stat === 'autoAttackSpeed') updated.autoAttackSpeed = data.value;
        else if (data.stat === 'manaRegen') updated.manaRegen = data.value;
        else {
          updated[data.stat as 'str' | 'dex' | 'luck'] = data.value;
          if (data.pAtk) updated.pAtk = data.pAtk;
          if (data.critChance) updated.critChance = data.critChance;
        }
        return updated;
      });
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

  const handleUpgradeTapSpeed = () => {
    if (upgrading || !stats || stats.tapsPerSecond >= 10) return;
    setUpgrading('tapsPerSecond');
    getSocket().emit('upgrade:tapSpeed');
  };

  const handleUpgradeAutoAttack = () => {
    if (upgrading || !stats || stats.autoAttackSpeed >= 10) return;
    setUpgrading('autoAttackSpeed');
    getSocket().emit('upgrade:autoAttack');
  };

  const handleUpgradeManaRegen = () => {
    if (upgrading || !stats || stats.manaRegen >= 10) return;
    setUpgrading('manaRegen');
    getSocket().emit('upgrade:manaRegen');
  };

  const getUpgradeCost = (level: number) => {
    return Math.floor(100 * Math.pow(1.5, level - 1));
  };

  const getTapSpeedCost = (level: number) => {
    return Math.floor(500 * Math.pow(2, level - 3));
  };

  const getAutoAttackCost = (level: number) => {
    return Math.floor(5000 * Math.pow(2.5, level));
  };

  const getManaRegenCost = (currentRegen: number) => {
    const level = Math.round(currentRegen * 5);
    return Math.floor(1000 * Math.pow(2, level));
  };

  if (!stats) {
    return (
      <div className="flex-1 flex items-center justify-center bg-l2-dark">
        <div className="text-center">
          <p className="text-gray-400 mb-2">{t.character.notAuth}</p>
          <p className="text-xs text-gray-500">{t.character.playInTelegram}</p>
        </div>
      </div>
    );
  }

  const statItems = [
    {
      id: 'str' as const,
      name: t.character.str,
      value: stats.str,
      icon: <Sword className="text-red-400" size={24} />,
      effect: t.character.strEffect,
      color: 'red',
    },
    {
      id: 'dex' as const,
      name: t.character.dex,
      value: stats.dex,
      icon: <Zap className="text-yellow-400" size={24} />,
      effect: t.character.dexEffect,
      color: 'yellow',
    },
    {
      id: 'luck' as const,
      name: t.character.luck,
      value: stats.luck,
      icon: <Clover className="text-green-400" size={24} />,
      effect: t.character.luckEffect,
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
            <p className="text-sm text-gray-400">{t.character.level} {stats.level}</p>
          </div>
        </div>

        {/* Adena */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10">
          <div className="flex items-center gap-2">
            <Coins className="text-l2-gold" size={20} />
            <span className="text-l2-gold font-bold">{stats.adena.toLocaleString()}</span>
          </div>
          <span className="text-xs text-gray-400">{t.character.adena}</span>
        </div>
      </div>

      {/* Derived Stats */}
      <div className="bg-l2-panel rounded-lg p-4 mb-4">
        <h3 className="text-sm text-gray-400 mb-3">{t.character.combatStats}</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500">{t.character.pAtk}</p>
            <p className="text-lg font-bold text-white">{stats.pAtk}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">{t.character.critChance}</p>
            <p className="text-lg font-bold text-white">{(stats.critChance * 100).toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">{t.character.totalDamage}</p>
            <p className="text-lg font-bold text-l2-gold">{stats.totalDamage.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">{t.character.bossesKilled}</p>
            <p className="text-lg font-bold text-white">{stats.bossesKilled}</p>
          </div>
        </div>
      </div>

      {/* Base Stats Upgrade */}
      <div className="bg-l2-panel rounded-lg p-4 mb-4">
        <h3 className="text-sm text-gray-400 mb-3">{t.character.baseStats}</h3>
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
                  {upgrading === stat.id ? '...' : cost.toLocaleString()}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Combat Skills */}
      <div className="bg-l2-panel rounded-lg p-4">
        <h3 className="text-sm text-gray-400 mb-3">{t.character.combatSkills}</h3>
        <div className="space-y-3">
          {/* Tap Speed */}
          <div className="flex items-center gap-3 p-3 bg-black/30 rounded-lg">
            <Timer className="text-cyan-400" size={24} />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white">{t.character.tapSpeed}</span>
                <span className="text-cyan-400">{stats.tapsPerSecond || 3}/10</span>
              </div>
              <p className="text-xs text-gray-500">{t.character.tapSpeedDesc}</p>
            </div>
            {(stats.tapsPerSecond || 3) < 10 ? (
              <button
                onClick={handleUpgradeTapSpeed}
                disabled={stats.adena < getTapSpeedCost(stats.tapsPerSecond || 3) || upgrading === 'tapsPerSecond'}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  stats.adena >= getTapSpeedCost(stats.tapsPerSecond || 3)
                    ? 'bg-cyan-500 text-black hover:bg-cyan-400'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                } ${upgrading === 'tapsPerSecond' ? 'opacity-50' : ''}`}
              >
                {upgrading === 'tapsPerSecond' ? '...' : getTapSpeedCost(stats.tapsPerSecond || 3).toLocaleString()}
              </button>
            ) : (
              <span className="text-green-400 text-sm font-bold">{t.character.max}</span>
            )}
          </div>

          {/* Auto Attack */}
          <div className="flex items-center gap-3 p-3 bg-black/30 rounded-lg border border-purple-500/30">
            <Bot className="text-purple-400" size={24} />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white">{t.character.autoAttack}</span>
                <span className="text-purple-400">{stats.autoAttackSpeed || 0}/10</span>
              </div>
              <p className="text-xs text-gray-500">{t.character.autoAttackDesc}</p>
            </div>
            {(stats.autoAttackSpeed || 0) < 10 ? (
              <button
                onClick={handleUpgradeAutoAttack}
                disabled={stats.adena < getAutoAttackCost(stats.autoAttackSpeed || 0) || upgrading === 'autoAttackSpeed'}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  stats.adena >= getAutoAttackCost(stats.autoAttackSpeed || 0)
                    ? 'bg-purple-500 text-white hover:bg-purple-400'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                } ${upgrading === 'autoAttackSpeed' ? 'opacity-50' : ''}`}
              >
                {upgrading === 'autoAttackSpeed' ? '...' : getAutoAttackCost(stats.autoAttackSpeed || 0).toLocaleString()}
              </button>
            ) : (
              <span className="text-green-400 text-sm font-bold">{t.character.max}</span>
            )}
          </div>

          {/* Mana Regen */}
          <div className="flex items-center gap-3 p-3 bg-black/30 rounded-lg">
            <Droplets className="text-blue-400" size={24} />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white">{t.character.manaRegen}</span>
                <span className="text-blue-400">{(stats.manaRegen || 0.2).toFixed(1)}/s</span>
              </div>
              <p className="text-xs text-gray-500">{t.character.manaRegenDesc}</p>
            </div>
            {(stats.manaRegen || 0.2) < 10 ? (
              <button
                onClick={handleUpgradeManaRegen}
                disabled={stats.adena < getManaRegenCost(stats.manaRegen || 0.2) || upgrading === 'manaRegen'}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  stats.adena >= getManaRegenCost(stats.manaRegen || 0.2)
                    ? 'bg-blue-500 text-white hover:bg-blue-400'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                } ${upgrading === 'manaRegen' ? 'opacity-50' : ''}`}
              >
                {upgrading === 'manaRegen' ? '...' : getManaRegenCost(stats.manaRegen || 0.2).toLocaleString()}
              </button>
            ) : (
              <span className="text-green-400 text-sm font-bold">{t.character.max}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
