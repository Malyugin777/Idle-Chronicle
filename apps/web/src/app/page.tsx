'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

// Dynamic import Phaser (no SSR)
const GameCanvas = dynamic(() => import('@/components/game/GameCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen bg-l2-dark">
      <div className="text-l2-gold font-pixel text-sm animate-pulse">
        Loading...
      </div>
    </div>
  ),
});

export default function Home() {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);

    // Telegram WebApp expand
    if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
      window.Telegram.WebApp.expand();
      window.Telegram.WebApp.ready();
    }
  }, []);

  if (!isClient) {
    return (
      <div className="flex items-center justify-center h-screen bg-l2-dark">
        <div className="text-l2-gold font-pixel text-sm">
          Initializing...
        </div>
      </div>
    );
  }

  return (
    <main className="h-screen w-screen overflow-hidden bg-l2-dark">
      <GameCanvas />
    </main>
  );
}

// Telegram WebApp types
declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        expand: () => void;
        ready: () => void;
        close: () => void;
        MainButton: {
          show: () => void;
          hide: () => void;
          setText: (text: string) => void;
          onClick: (callback: () => void) => void;
        };
        initData: string;
        initDataUnsafe: {
          user?: {
            id: number;
            first_name: string;
            last_name?: string;
            username?: string;
            photo_url?: string;
          };
        };
      };
    };
  }
}
