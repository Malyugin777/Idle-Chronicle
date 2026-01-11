'use client';

import { useEffect, useState } from 'react';
import { getSocket } from '@/lib/socket';
import { Trophy, Medal, Crown, Swords, Package, Gem, Coins, Star } from 'lucide-react';
import { detectLanguage, useTranslation, Language } from '@/lib/i18n';

interface LeaderboardEntry {
  visitorId: string;
  visitorName: string;
  photoUrl?: string;
  damage: number;
  damagePercent?: number;
  isFinalBlow?: boolean;
  isTopDamage?: boolean;
  ps?: number; // Participation Score
}

interface PrizePool {
  ton: number;
  chests: number;
  exp: number;
  gold: number;
}

interface CurrentBossData {
  leaderboard: LeaderboardEntry[];
  bossName: string;
  bossIcon: string;
  bossHp: number;
  bossMaxHp: number;
  prizePool: PrizePool;
  totalDamage: number;
}

interface PreviousBossData {
  bossName: string;
  bossIcon: string;
  maxHp: number;
  totalDamage: number;
  finalBlowBy: string;
  finalBlowPhoto?: string;
  finalBlowDamage: number;
  topDamageBy: string;
  topDamagePhoto?: string;
  topDamage: number;
  prizePool: PrizePool;
  leaderboard: LeaderboardEntry[];
  rewards: any[];
  killedAt: number;
}

type TabType = 'current' | 'previous' | 'legend';

export default function LeaderboardTab() {
  const [currentData, setCurrentData] = useState<CurrentBossData | null>(null);
  const [previousData, setPreviousData] = useState<PreviousBossData | null>(null);
  const [legendBoard, setLegendBoard] = useState<LeaderboardEntry[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('current');
  const [loading, setLoading] = useState(true);
  const [lang] = useState<Language>(() => detectLanguage());
  const t = useTranslation(lang);

  useEffect(() => {
    const socket = getSocket();

    // Request current leaderboard
    socket.emit('leaderboard:get');

    // Define all handlers as named functions for proper cleanup
    const handleLeaderboardData = (data: any) => {
      setCurrentData({
        ...data,
        bossName: lang === 'ru' ? (data.bossNameRu || data.bossName) : data.bossName,
      });
      setLoading(false);
    };

    const handleBossState = (data: any) => {
      setCurrentData(prev => prev ? {
        ...prev,
        bossHp: data.hp,
        bossMaxHp: data.maxHp,
        bossName: lang === 'ru' ? (data.nameRu || data.name) : data.name,
        bossIcon: data.icon,
      } : null);
    };

    const handlePreviousData = (data: any | null) => {
      if (data) {
        setPreviousData({
          ...data,
          bossName: lang === 'ru' ? (data.bossNameRu || data.bossName) : data.bossName,
        });
      } else {
        setPreviousData(null);
      }
    };

    const handleAlltimeData = (data: LeaderboardEntry[]) => {
      setLegendBoard(data);
    };

    const handleBossKilled = () => {
      socket.emit('leaderboard:get');
      socket.emit('leaderboard:previous:get');
    };

    // Register listeners
    socket.on('leaderboard:data', handleLeaderboardData);
    socket.on('boss:state', handleBossState);
    socket.on('leaderboard:previous', handlePreviousData);
    socket.on('leaderboard:alltime', handleAlltimeData);
    socket.on('boss:killed', handleBossKilled);

    // Refresh current leaderboard periodically (v1.8.19: 15s + visibility-aware)
    const interval = setInterval(() => {
      // Only poll when tab is visible AND we're on current boss tab
      if (activeTab === 'current' && document.visibilityState === 'visible') {
        socket.emit('leaderboard:get');
      }
    }, 15000); // Changed from 2s to 15s to reduce server load

    return () => {
      // IMPORTANT: Pass handler reference to only remove THIS component's listeners
      socket.off('leaderboard:data', handleLeaderboardData);
      socket.off('boss:state', handleBossState);
      socket.off('leaderboard:previous', handlePreviousData);
      socket.off('leaderboard:alltime', handleAlltimeData);
      socket.off('boss:killed', handleBossKilled);
      clearInterval(interval);
    };
  }, [activeTab]);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    const socket = getSocket();

    if (tab === 'current') {
      socket.emit('leaderboard:get');
    } else if (tab === 'previous') {
      socket.emit('leaderboard:previous:get');
    } else if (tab === 'legend') {
      socket.emit('leaderboard:alltime:get');
    }
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className="text-yellow-400" size={18} />;
      case 2:
        return <Medal className="text-gray-300" size={18} />;
      case 3:
        return <Medal className="text-amber-600" size={18} />;
      default:
        return <span className="text-gray-500 w-4 text-center text-xs">{rank}</span>;
    }
  };

  const getRankBg = (rank: number) => {
    switch (rank) {
      case 1:
        return 'bg-yellow-500/10 border-l-2 border-yellow-500';
      case 2:
        return 'bg-gray-400/10 border-l-2 border-gray-400';
      case 3:
        return 'bg-amber-600/10 border-l-2 border-amber-600';
      default:
        return 'bg-black/20';
    }
  };

  const formatNumber = (num: number | undefined | null) => {
    if (num === undefined || num === null) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toLocaleString();
  };

  const renderAvatar = (photoUrl?: string, name?: string, size = 32) => {
    if (photoUrl) {
      return (
        <img
          src={photoUrl}
          alt={name || 'Player'}
          className="rounded-full object-cover"
          style={{ width: size, height: size }}
        />
      );
    }
    return (
      <div
        className="rounded-full bg-l2-panel flex items-center justify-center text-gray-400"
        style={{ width: size, height: size }}
      >
        {(name || '?')[0].toUpperCase()}
      </div>
    );
  };

  const renderPrizePool = (pool: PrizePool | null | undefined) => {
    if (!pool) return null;
    return (
      <div className="bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-lg p-3 mb-3">
        <div className="text-xs text-gray-400 mb-2">{t.leaderboard.prizePool}</div>
        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <div className="text-blue-400 font-bold text-sm">{pool.ton ?? 0}</div>
            <div className="text-[10px] text-gray-500">{t.leaderboard.ton}</div>
          </div>
          <div>
            <div className="text-purple-400 font-bold text-sm">{pool.chests ?? 0}</div>
            <div className="text-[10px] text-gray-500">{t.leaderboard.chests}</div>
          </div>
          <div>
            <div className="text-green-400 font-bold text-sm">{formatNumber(pool.exp)}</div>
            <div className="text-[10px] text-gray-500">{t.leaderboard.exp}</div>
          </div>
          <div>
            <div className="text-l2-gold font-bold text-sm">{formatNumber(pool.gold)}</div>
            <div className="text-[10px] text-gray-500">{t.shop.gold}</div>
          </div>
        </div>
        <div className="text-[10px] text-center text-gray-500 mt-2">
          50% {t.leaderboard.finalBlow} + 50% {t.leaderboard.topDamage}
        </div>
      </div>
    );
  };

  const renderLeaderboard = (entries: LeaderboardEntry[], showPercent = true) => (
    <div className="space-y-1">
      {entries.map((entry, index) => (
        <div
          key={entry.visitorId}
          className={`flex items-center gap-2 p-2 rounded ${getRankBg(index + 1)}`}
        >
          <div className="w-6 flex justify-center">
            {getRankIcon(index + 1)}
          </div>
          {renderAvatar(entry.photoUrl, entry.visitorName, 28)}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <p className="font-medium text-white text-sm truncate">{entry.visitorName}</p>
              {entry.isFinalBlow && <Star className="text-yellow-400" size={12} />}
              {entry.isTopDamage && <Trophy className="text-l2-gold" size={12} />}
            </div>
          </div>
          {/* PS indicator */}
          {entry.ps !== undefined && (
            <div className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
              entry.ps >= 6
                ? 'bg-green-900/60 text-green-300'
                : entry.ps > 0
                  ? 'bg-purple-900/60 text-purple-300'
                  : 'bg-gray-800/60 text-gray-500'
            }`}>
              ⭐{entry.ps}
            </div>
          )}
          <div className="text-right">
            <p className="font-bold text-l2-gold text-sm">
              {formatNumber(entry.damage)}
            </p>
            {showPercent && entry.damagePercent !== undefined && (
              <p className="text-[10px] text-gray-500">{entry.damagePercent}%</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  const renderCurrentBoss = () => {
    if (!currentData) {
      return (
        <div className="p-8 text-center text-gray-400">
          <Swords size={32} className="mx-auto mb-2 opacity-50" />
          <p>{t.leaderboard.noDamage}</p>
          <p className="text-xs mt-1">{t.leaderboard.beFirst}</p>
        </div>
      );
    }

    const hpPercent = Math.round((currentData.bossHp / currentData.bossMaxHp) * 100);

    return (
      <div>
        {/* Boss Info */}
        <div className="bg-l2-panel rounded-lg p-3 mb-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{currentData.bossIcon}</span>
            <div className="flex-1">
              <div className="font-bold text-white">{currentData.bossName}</div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-black/50 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-500 transition-all"
                    style={{ width: `${hpPercent}%` }}
                  />
                </div>
                <span className="text-xs text-gray-400">{hpPercent}%</span>
              </div>
              <div className="text-xs text-gray-500">
                {formatNumber(currentData.bossHp)} / {formatNumber(currentData.bossMaxHp)}
              </div>
            </div>
          </div>
        </div>

        {/* Leaderboard */}
        {!currentData.leaderboard || currentData.leaderboard.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <Swords size={32} className="mx-auto mb-2 opacity-50" />
            <p>{t.leaderboard.noDamage}</p>
            <p className="text-xs mt-1">{t.leaderboard.beFirst}</p>
          </div>
        ) : (
          renderLeaderboard(currentData.leaderboard)
        )}
      </div>
    );
  };

  const renderPreviousBoss = () => {
    if (!previousData) {
      return (
        <div className="p-8 text-center text-gray-400">
          <Package size={32} className="mx-auto mb-2 opacity-50" />
          <p>{t.leaderboard.noPrevious}</p>
          <p className="text-xs mt-1">{t.leaderboard.waitForKill}</p>
        </div>
      );
    }

    return (
      <div>
        {/* Boss Info */}
        <div className="bg-l2-panel rounded-lg p-3 mb-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{previousData.bossIcon}</span>
            <div className="flex-1">
              <div className="font-bold text-white">{previousData.bossName}</div>
              <div className="text-xs text-gray-500">
                {t.boss.defeated} • {formatNumber(previousData.totalDamage)} {t.leaderboard.damage}
              </div>
            </div>
          </div>
        </div>

        {/* Winners */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          {/* Final Blow */}
          <div className="bg-yellow-500/10 rounded-lg p-2 text-center">
            <div className="text-[10px] text-yellow-400 mb-1">{t.leaderboard.finalBlow}</div>
            <div className="flex justify-center mb-1">
              {renderAvatar(previousData.finalBlowPhoto, previousData.finalBlowBy, 36)}
            </div>
            <div className="text-xs font-bold text-white truncate">{previousData.finalBlowBy}</div>
          </div>
          {/* Top Damage */}
          <div className="bg-l2-gold/10 rounded-lg p-2 text-center">
            <div className="text-[10px] text-l2-gold mb-1">{t.leaderboard.topDamage}</div>
            <div className="flex justify-center mb-1">
              {renderAvatar(previousData.topDamagePhoto, previousData.topDamageBy, 36)}
            </div>
            <div className="text-xs font-bold text-white truncate">{previousData.topDamageBy}</div>
          </div>
        </div>

        {/* Leaderboard */}
        {previousData.leaderboard && previousData.leaderboard.length > 0 && renderLeaderboard(previousData.leaderboard)}
      </div>
    );
  };

  const renderLegend = () => {
    if (legendBoard.length === 0) {
      return (
        <div className="p-8 text-center text-gray-400">
          <Trophy size={32} className="mx-auto mb-2 opacity-50" />
          <p>{t.leaderboard.noDamage}</p>
        </div>
      );
    }

    return (
      <div className="space-y-1">
        {legendBoard.map((entry: any, index) => (
          <div
            key={entry.visitorId}
            className={`flex items-center gap-2 p-2 rounded ${getRankBg(index + 1)}`}
          >
            <div className="w-6 flex justify-center">
              {getRankIcon(index + 1)}
            </div>
            {renderAvatar(entry.photoUrl, entry.visitorName, 28)}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-white text-sm truncate">{entry.visitorName}</p>
              <div className="text-[10px] text-gray-500">
                {entry.bossesKilled || 0} {lang === 'ru' ? 'убито боссов' : 'bosses killed'}
              </div>
            </div>
            <div className="text-right">
              <p className="font-bold text-l2-gold text-sm">
                {formatNumber(entry.damage)}
              </p>
              {entry.tonBalance > 0 && (
                <p className="text-[10px] text-blue-400">{entry.tonBalance} TON</p>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-auto bg-l2-dark">
      {/* Header */}
      <div className="bg-l2-panel p-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Trophy className="text-l2-gold" size={24} />
          <div>
            <h2 className="text-base font-bold text-white">{t.leaderboard.title}</h2>
            <p className="text-[10px] text-gray-400">{t.leaderboard.subtitle}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-2 bg-black/30">
        <button
          onClick={() => handleTabChange('current')}
          className={`flex-1 py-2 px-2 rounded text-xs font-bold transition-all ${
            activeTab === 'current'
              ? 'bg-l2-gold text-black'
              : 'bg-l2-panel text-gray-400 hover:text-white'
          }`}
        >
          <Swords size={14} className="inline mr-1" />
          {t.leaderboard.currentBoss}
        </button>
        <button
          onClick={() => handleTabChange('previous')}
          className={`flex-1 py-2 px-2 rounded text-xs font-bold transition-all ${
            activeTab === 'previous'
              ? 'bg-l2-gold text-black'
              : 'bg-l2-panel text-gray-400 hover:text-white'
          }`}
        >
          <Package size={14} className="inline mr-1" />
          {t.leaderboard.previousBoss}
        </button>
        <button
          onClick={() => handleTabChange('legend')}
          className={`flex-1 py-2 px-2 rounded text-xs font-bold transition-all ${
            activeTab === 'legend'
              ? 'bg-l2-gold text-black'
              : 'bg-l2-panel text-gray-400 hover:text-white'
          }`}
        >
          <Trophy size={14} className="inline mr-1" />
          {t.leaderboard.allTime}
        </button>
      </div>

      {/* Content */}
      <div className="p-2">
        {loading && activeTab === 'current' ? (
          <div className="p-8 text-center text-gray-400">{t.leaderboard.loading}</div>
        ) : (
          <>
            {activeTab === 'current' && renderCurrentBoss()}
            {activeTab === 'previous' && renderPreviousBoss()}
            {activeTab === 'legend' && renderLegend()}
          </>
        )}
      </div>
    </div>
  );
}
