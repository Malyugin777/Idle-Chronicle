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
  const [lang, setLang] = useState<Language>('en');
  const t = useTranslation(lang);

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

    socket.on('boss:state', (data: { playersOnline: number }) => {
      setPlayersOnline(data.playersOnline);
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

  return (
    <div className="flex flex-col h-full relative">
      {/* Phaser Game Container */}
      <div ref={containerRef} id="game-container" className="flex-1 w-full" />

      {/* Status bar */}
      <div className="absolute top-2 right-2 text-xs text-gray-400">
        {connected ? `${playersOnline} ${t.game.online}` : t.game.connecting}
      </div>

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
    </div>
  );
}
