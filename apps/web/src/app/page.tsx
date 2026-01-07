'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import BottomNav, { TabType } from '@/components/ui/BottomNav';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { detectLanguage, useTranslation, Language } from '@/lib/i18n';

// Dynamic imports for tabs (no SSR)
// L2: Switched to PhaserGame for better battle scene rendering
const PhaserGame = dynamic(() => import('@/components/game/PhaserGame'), {
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

const TreasuryTab = dynamic(() => import('@/components/tabs/TreasuryTab'), {
  ssr: false,
  loading: () => <TabLoading />,
});

function TabLoading() {
  const [lang] = useState<Language>(() => detectLanguage());
  const t = useTranslation(lang);
  return (
    <div className="flex-1 flex items-center justify-center bg-l2-dark">
      <div className="text-l2-gold font-pixel text-sm animate-pulse">
        {t.game.loading}
      </div>
    </div>
  );
}

export default function Home() {
  const [isClient, setIsClient] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('game');
  const [lang] = useState<Language>(() => detectLanguage());
  const t = useTranslation(lang);

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
          {t.game.initializing}
        </div>
      </div>
    );
  }

  const renderTab = () => {
    switch (activeTab) {
      case 'game':
        return <PhaserGame />;
      case 'character':
        return <CharacterTab />;
      case 'shop':
        return <ShopTab />;
      case 'treasury':
        return <TreasuryTab />;
      case 'leaderboard':
        return <LeaderboardTab />;
      default:
        return <PhaserGame />;
    }
  };

  return (
    <main className="h-screen w-screen overflow-hidden bg-l2-dark flex flex-col">
      <ErrorBoundary>
        {renderTab()}
      </ErrorBoundary>
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
