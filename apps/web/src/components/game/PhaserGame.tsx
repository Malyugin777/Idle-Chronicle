'use client';

import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { gameConfig } from '@/game/config';
import { getSocket } from '@/lib/socket';
import { detectLanguage, useTranslation, Language } from '@/lib/i18n';

// ═══════════════════════════════════════════════════════════
// PHASER GAME REACT WRAPPER
// L2-style Battle Scene with Socket.io integration
// ═══════════════════════════════════════════════════════════

interface BossState {
  name: string;
  nameRu?: string;
  icon: string;
  hp: number;
  maxHp: number;
  bossIndex: number;
  totalBosses: number;
  defense?: number;
  ragePhase?: number;
}

interface VictoryData {
  bossName: string;
  bossIcon: string;
  finalBlowBy: string;
  topDamageBy: string;
  topDamage: number;
  rewards: Array<{
    visitorName: string;
    damage: number;
    damagePercent: number;
    adenaReward: number;
    expReward: number;
    isFinalBlow: boolean;
    isTopDamage: boolean;
  }>;
  respawnAt: number;
}

export default function PhaserGame() {
  const gameRef = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // UI State (handled in React, not Phaser)
  const [connected, setConnected] = useState(false);
  const [playersOnline, setPlayersOnline] = useState(0);
  const [sessionDamage, setSessionDamage] = useState(0);
  const [victoryData, setVictoryData] = useState<VictoryData | null>(null);
  const [respawnCountdown, setRespawnCountdown] = useState(0);
  const [offlineEarnings, setOfflineEarnings] = useState<{ adena: number; hours: number } | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showDropTable, setShowDropTable] = useState(false);
  const [lang, setLang] = useState<Language>('en');
  const t = useTranslation(lang);

  // Boss state for header
  const [bossState, setBossState] = useState<BossState>({
    name: 'Loading...',
    nameRu: '',
    icon: '👹',
    hp: 1000000,
    maxHp: 1000000,
    bossIndex: 1,
    totalBosses: 100,
  });

  // Helper for compact number format
  const formatCompact = (num: number) => {
    if (num >= 1000000) return Math.floor(num / 1000000) + 'M';
    if (num >= 1000) return Math.floor(num / 1000) + 'K';
    return num.toString();
  };

  useEffect(() => {
    // Detect language
    const detectedLang = detectLanguage();
    setLang(detectedLang);

    // Get socket
    const socket = getSocket();

    // Initialize Phaser game
    if (containerRef.current && !gameRef.current) {
      const config = {
        ...gameConfig,
        parent: containerRef.current,
        callbacks: {
          postBoot: (game: Phaser.Game) => {
            // Pass socket to BattleScene
            const scene = game.scene.getScene('BattleScene');
            if (scene) {
              scene.scene.restart({ socket });
            }
          },
        },
      };

      gameRef.current = new Phaser.Game(config);
    }

    // Socket event handlers for React UI (overlays, modals)
    const doAuth = () => {
      if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
        const webApp = window.Telegram.WebApp;
        const user = webApp.initDataUnsafe?.user;
        if (user) {
          const langCode = (user as { language_code?: string }).language_code;
          socket.emit('auth', {
            telegramId: user.id,
            username: user.username,
            firstName: user.first_name,
            photoUrl: user.photo_url,
            languageCode: langCode,
            initData: webApp.initData,
          });
        }
      }
    };

    socket.on('connect', () => {
      setConnected(true);
      doAuth();
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('boss:state', (data: {
      playersOnline: number;
      name: string;
      nameRu?: string;
      icon?: string;
      hp: number;
      maxHp: number;
      bossIndex?: number;
      totalBosses?: number;
      defense?: number;
      ragePhase?: number;
    }) => {
      setPlayersOnline(data.playersOnline);
      setBossState({
        name: data.name || 'Boss',
        nameRu: data.nameRu,
        icon: data.icon || '👹',
        hp: data.hp,
        maxHp: data.maxHp,
        bossIndex: data.bossIndex || 1,
        totalBosses: data.totalBosses || 100,
        defense: data.defense,
        ragePhase: data.ragePhase,
      });
    });

    socket.on('tap:result', (data: { sessionDamage: number }) => {
      setSessionDamage(data.sessionDamage);
    });

    socket.on('auth:success', (data: { isFirstLogin?: boolean }) => {
      if (data.isFirstLogin) setShowWelcome(true);
    });

    socket.on('offline:earnings', (data: { adena: number; hours: number }) => {
      setOfflineEarnings(data);
    });

    socket.on('boss:killed', (data: any) => {
      setVictoryData({
        bossName: data.bossName,
        bossIcon: data.bossIcon || '👹',
        finalBlowBy: data.finalBlowBy,
        topDamageBy: data.topDamageBy,
        topDamage: data.topDamage,
        rewards: data.rewards || [],
        respawnAt: data.respawnAt,
      });
      // Start countdown
      const updateCountdown = () => {
        const remaining = Math.max(0, data.respawnAt - Date.now());
        setRespawnCountdown(remaining);
        if (remaining > 0) setTimeout(updateCountdown, 1000);
      };
      updateCountdown();
    });

    socket.on('boss:respawn', () => {
      setSessionDamage(0);
      setVictoryData(null);
      setRespawnCountdown(0);
    });

    if (socket.connected) {
      setConnected(true);
      socket.emit('player:get');
    }

    return () => {
      // Cleanup
      socket.off('connect');
      socket.off('disconnect');
      socket.off('boss:state');
      socket.off('tap:result');
      socket.off('auth:success');
      socket.off('offline:earnings');
      socket.off('boss:killed');
      socket.off('boss:respawn');

      // Destroy Phaser game
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  const handleWelcomeClose = () => {
    setShowWelcome(false);
    getSocket().emit('firstLogin:complete');
  };

  const hpPercent = (bossState.hp / bossState.maxHp) * 100;
  const bossDisplayName = lang === 'ru' && bossState.nameRu ? bossState.nameRu : bossState.name;

  return (
    <div className="flex flex-col h-full relative">
      {/* Header with HP - React overlay */}
      <div className="absolute top-0 left-0 right-0 z-10 p-3 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex justify-between items-center mb-1">
          <div className="flex items-center gap-2">
            <span className="text-lg">{bossState.icon}</span>
            <div>
              <span className="font-bold text-sm text-l2-gold">
                {bossDisplayName}
              </span>
              <span className="text-xs text-gray-500 ml-2">
                ({bossState.bossIndex}/{bossState.totalBosses})
              </span>
            </div>
          </div>
          <span className="text-xs text-gray-400">
            {connected ? `${playersOnline} ${t.game.online}` : t.game.connecting}
          </span>
        </div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-white">
            {bossState.hp.toLocaleString()} / {bossState.maxHp.toLocaleString()}
          </span>
          {bossState.defense && bossState.defense > 0 && (
            <span className="text-xs text-blue-400">🛡️ {bossState.defense}</span>
          )}
        </div>
        <div className="h-3 bg-black/50 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-100 ${
              hpPercent < 25 ? 'bg-red-600' :
              hpPercent < 50 ? 'bg-orange-500' :
              hpPercent < 75 ? 'bg-yellow-500' : 'bg-green-500'
            }`}
            style={{ width: `${hpPercent}%` }}
          />
        </div>
        <button
          onClick={() => setShowDropTable(true)}
          className="mt-2 px-3 py-1 bg-purple-500/30 text-purple-300 text-xs rounded-lg border border-purple-500/40"
        >
          🎁 {lang === 'ru' ? 'Дроп' : 'Drop'}
        </button>
      </div>

      {/* Phaser Game Container */}
      <div ref={containerRef} id="game-container" className="flex-1 w-full" />

      {/* Session damage */}
      <div className="absolute bottom-4 left-4 text-xs">
        <span className="text-gray-400">{t.game.sessionDamage}</span>
        <div className="text-l2-gold font-bold">{sessionDamage.toLocaleString()}</div>
      </div>

      {/* Victory Screen */}
      {victoryData && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-l2-panel/95 rounded-lg p-4 m-2 max-w-sm w-full pointer-events-auto">
            <div className="text-center mb-3">
              <div className="text-3xl mb-1">{victoryData.bossIcon}</div>
              <div className="text-l2-gold text-lg font-bold">{t.boss.victory}</div>
              <div className="text-gray-300 text-sm">{victoryData.bossName} {t.boss.defeated}</div>
            </div>

            <div className="bg-black/40 rounded-lg p-3 mb-3 text-center">
              <div className="text-xs text-gray-400 mb-1">{t.boss.nextBossIn}</div>
              <div className="text-2xl font-bold text-white font-mono">
                {Math.floor(respawnCountdown / 60000)}:{String(Math.floor((respawnCountdown % 60000) / 1000)).padStart(2, '0')}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-2 text-center">
                <div className="text-xs text-red-400">{t.boss.finalBlow}</div>
                <div className="text-sm font-bold text-white truncate">{victoryData.finalBlowBy}</div>
              </div>
              <div className="bg-purple-900/30 border border-purple-500/50 rounded-lg p-2 text-center">
                <div className="text-xs text-purple-400">{t.boss.topDamage}</div>
                <div className="text-sm font-bold text-white truncate">{victoryData.topDamageBy}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Welcome Popup */}
      {showWelcome && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="bg-gradient-to-b from-l2-panel to-black rounded-xl p-5 m-3 max-w-sm w-full border border-l2-gold/30">
            <div className="text-center mb-4">
              <div className="text-4xl mb-2">&#9876;</div>
              <h1 className="text-xl font-bold text-l2-gold mb-1">{t.welcome.title}</h1>
              <p className="text-gray-300 text-sm">{t.welcome.subtitle}</p>
            </div>
            <button
              onClick={handleWelcomeClose}
              className="w-full py-3 bg-gradient-to-r from-l2-gold to-yellow-600 text-black font-bold rounded-lg"
            >
              {t.welcome.startButton}
            </button>
          </div>
        </div>
      )}

      {/* Offline Earnings */}
      {offlineEarnings && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-l2-panel rounded-lg p-6 m-4 max-w-sm text-center">
            <div className="text-l2-gold text-lg font-bold mb-2">{t.offline.welcomeBack}</div>
            <div className="bg-black/30 rounded-lg p-4 mb-4">
              <div className="text-2xl font-bold text-l2-gold">
                +{offlineEarnings.adena.toLocaleString()} {t.character.gold}
              </div>
            </div>
            <button
              onClick={() => setOfflineEarnings(null)}
              className="w-full py-3 bg-l2-gold text-black font-bold rounded-lg"
            >
              {t.offline.collect}
            </button>
          </div>
        </div>
      )}

      {/* Drop Table Popup */}
      {showDropTable && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setShowDropTable(false)}
        >
          <div
            className="bg-l2-panel rounded-xl p-4 max-w-sm w-full border border-purple-500/30"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-4">
              <div className="text-2xl mb-1">🎁</div>
              <div className="text-lg font-bold text-purple-400">
                {lang === 'ru' ? 'Награды за босса' : 'Boss Rewards'}
              </div>
              <div className="text-xs text-gray-500">
                {bossDisplayName} ({bossState.bossIndex}/{bossState.totalBosses})
              </div>
            </div>

            <div className="space-y-2">
              {/* Adena */}
              <div className="flex items-center justify-between bg-black/30 rounded-lg p-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🪙</span>
                  <span className="text-sm text-gray-300">Adena</span>
                </div>
                <div className="text-right">
                  <div className="text-l2-gold font-bold text-sm">
                    {formatCompact(1000000 * Math.pow(2, bossState.bossIndex - 1))}
                  </div>
                  <div className="text-[10px] text-gray-500">100%</div>
                </div>
              </div>

              {/* EXP */}
              <div className="flex items-center justify-between bg-black/30 rounded-lg p-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">⭐</span>
                  <span className="text-sm text-gray-300">EXP</span>
                </div>
                <div className="text-right">
                  <div className="text-green-400 font-bold text-sm">
                    {formatCompact(1000000 * Math.pow(2, bossState.bossIndex - 1))}
                  </div>
                  <div className="text-[10px] text-gray-500">100%</div>
                </div>
              </div>

              {/* TON */}
              <div className="flex items-center justify-between bg-black/30 rounded-lg p-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">💎</span>
                  <span className="text-sm text-gray-300">TON</span>
                </div>
                <div className="text-right">
                  <div className="text-blue-400 font-bold text-sm">
                    {10 * Math.pow(2, bossState.bossIndex - 1)}
                  </div>
                  <div className="text-[10px] text-gray-500">50% FB + 50% TD</div>
                </div>
              </div>

              {/* Chests */}
              <div className="flex items-center justify-between bg-black/30 rounded-lg p-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📦</span>
                  <span className="text-sm text-gray-300">{lang === 'ru' ? 'Сундуки' : 'Chests'}</span>
                </div>
                <div className="text-right">
                  <div className="text-purple-400 font-bold text-sm">
                    {10 * Math.pow(2, bossState.bossIndex - 1)}
                  </div>
                  <div className="text-[10px] text-gray-500">50% FB + 50% TD</div>
                </div>
              </div>
            </div>

            {/* Chest Rarity */}
            <div className="mt-3 p-2 bg-black/20 rounded-lg">
              <div className="text-xs text-gray-400 mb-2 text-center">
                {lang === 'ru' ? 'Шанс редкости сундука' : 'Chest Rarity Chances'}
              </div>
              <div className="grid grid-cols-5 gap-1 text-center text-[9px]">
                <div><div className="text-gray-300">📦</div><div className="text-gray-400">50%</div></div>
                <div><div className="text-green-400">🎁</div><div className="text-gray-400">30%</div></div>
                <div><div className="text-blue-400">💎</div><div className="text-gray-400">15%</div></div>
                <div><div className="text-purple-400">👑</div><div className="text-gray-400">4%</div></div>
                <div><div className="text-orange-400">🏆</div><div className="text-gray-400">1%</div></div>
              </div>
            </div>

            {/* Info */}
            <div className="mt-3 text-center text-[10px] text-gray-500">
              {lang === 'ru'
                ? 'FB = Добивание, TD = Топ урон'
                : 'FB = Final Blow, TD = Top Damage'}
            </div>

            <button
              onClick={() => setShowDropTable(false)}
              className="mt-4 w-full py-2 bg-purple-500/20 text-purple-300 rounded-lg font-bold text-sm"
            >
              {lang === 'ru' ? 'Закрыть' : 'Close'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
