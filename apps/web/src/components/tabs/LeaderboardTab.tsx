'use client';

import { useEffect, useState } from 'react';
import { getSocket } from '@/lib/socket';
import { Trophy, Medal, Crown, Swords } from 'lucide-react';
import { detectLanguage, useTranslation, Language } from '@/lib/i18n';

interface LeaderboardEntry {
visitorId: string;
  visitorName: string;
  damage: number;
}

export default function LeaderboardTab() {
  const [sessionBoard, setSessionBoard] = useState<LeaderboardEntry[]>([]);
  const [allTimeBoard, setAllTimeBoard] = useState<LeaderboardEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'session' | 'alltime'>('session');
  const [loading, setLoading] = useState(true);
  const [lang] = useState<Language>(() => detectLanguage());
  const t = useTranslation(lang);

  useEffect(() => {
    const socket = getSocket();

    // Request leaderboard on mount
    socket.emit('leaderboard:get');

    socket.on('leaderboard:data', (data: LeaderboardEntry[]) => {
      setSessionBoard(data);
      setLoading(false);
    });

    socket.on('leaderboard:alltime', (data: LeaderboardEntry[]) => {
      setAllTimeBoard(data);
    });

    // Update on boss kill
    socket.on('boss:killed', (data: { leaderboard: LeaderboardEntry[] }) => {
      setSessionBoard(data.leaderboard);
    });

    return () => {
      socket.off('leaderboard:data');
      socket.off('leaderboard:alltime');
      socket.off('boss:killed');
    };
  }, []);

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className="text-yellow-400" size={20} />;
      case 2:
        return <Medal className="text-gray-300" size={20} />;
      case 3:
        return <Medal className="text-amber-600" size={20} />;
      default:
        return <span className="text-gray-500 w-5 text-center">{rank}</span>;
    }
  };

  const getRankBg = (rank: number) => {
    switch (rank) {
      case 1:
        return 'bg-yellow-500/10 border border-yellow-500/30';
      case 2:
        return 'bg-gray-400/10 border border-gray-400/30';
      case 3:
        return 'bg-amber-600/10 border border-amber-600/30';
      default:
        return 'bg-black/30';
    }
  };

  const board = activeTab === 'session' ? sessionBoard : allTimeBoard;

  return (
    <div className="flex-1 overflow-auto bg-l2-dark p-4">
      {/* Header */}
      <div className="bg-l2-panel rounded-lg p-4 mb-4">
        <div className="flex items-center gap-3">
          <Trophy className="text-l2-gold" size={28} />
          <div>
            <h2 className="text-lg font-bold text-white">{t.leaderboard.title}</h2>
            <p className="text-xs text-gray-400">{t.leaderboard.subtitle}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab('session')}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'session'
              ? 'bg-l2-gold text-black'
              : 'bg-l2-panel text-gray-400 hover:text-white'
          }`}
        >
          <Swords size={16} className="inline mr-2" />
          {t.leaderboard.currentBoss}
        </button>
        <button
          onClick={() => {
            setActiveTab('alltime');
            getSocket().emit('leaderboard:alltime:get');
          }}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'alltime'
              ? 'bg-l2-gold text-black'
              : 'bg-l2-panel text-gray-400 hover:text-white'
          }`}
        >
          <Trophy size={16} className="inline mr-2" />
          {t.leaderboard.allTime}
        </button>
      </div>

      {/* Leaderboard List */}
      <div className="bg-l2-panel rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">{t.leaderboard.loading}</div>
        ) : board.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <Swords size={32} className="mx-auto mb-2 opacity-50" />
            <p>{t.leaderboard.noDamage}</p>
            <p className="text-xs mt-1">{t.leaderboard.beFirst}</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {board.map((entry, index) => (
              <div
                key={entry.visitorId}
                className={`flex items-center gap-3 p-4 ${getRankBg(index + 1)}`}
              >
                <div className="w-8 flex justify-center">
                  {getRankIcon(index + 1)}
                </div>
                <div className="flex-1">
                  <p className="font-bold text-white">{entry.visitorName}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-l2-gold">
                    {entry.damage.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500">{t.leaderboard.damage}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
