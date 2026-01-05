'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import BottomNav, { TabType } from '@/components/ui/BottomNav';

// Dynamic imports for tabs (no SSR)
const GameCanvas = dynamic(() => import('@/components/game/GameCanvas'), {
  ssr: false,
  loading: () => <TabLoading />,
});

const CharacterTab = dynamic(() => import('@/components/tabs/CharacterTab'), {
  ssr: false,
  loading: () => <TabLoading />,
});

const ShopTab = dynamic(() => import('@/components/tabs/ShopTab'), {
  ssr: false,
  loading: () => <TabLoading />,
});

const LeaderboardTab = dynamic(() => import('@/components/tabs/LeaderboardTab'), {
  ssr: false,
  loading: () => <TabLoading />,
});

function TabLoading() {
  return (
    <div className="flex-1 flex items-center justify-center bg-l2-dark">
      <div className="text-l2-gold font-pixel text-sm animate-pulse">
        Loading...
      </div>
    </div>
  );
}

export default function Home() {
  const [isClient, setIsClient] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('game');

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

  const renderTab = () => {
    switch (activeTab) {
      case 'game':
        return <GameCanvas />;
      case 'character':
        return <CharacterTab />;
      case 'shop':
        return <ShopTab />;
      case 'leaderboard':
        return <LeaderboardTab />;
      default:
        return <GameCanvas />;
    }
  };

  return (
    <main className="h-screen w-screen overflow-hidden bg-l2-dark flex flex-col">
      {renderTab()}
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
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
