'use client';

import { useState } from 'react';
import { Swords, User, ShoppingBag, Trophy, Package } from 'lucide-react';
import { detectLanguage, useTranslation, Language } from '@/lib/i18n';

export type TabType = 'game' | 'character' | 'shop' | 'treasury' | 'leaderboard';

interface BottomNavProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export default function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const [lang] = useState<Language>(() => detectLanguage());
  const t = useTranslation(lang);

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'game', label: t.nav.battle, icon: <Swords size={20} /> },
    { id: 'character', label: t.nav.hero, icon: <User size={20} /> },
    { id: 'shop', label: t.nav.shop, icon: <ShoppingBag size={20} /> },
    { id: 'treasury', label: t.nav.loot, icon: <Package size={20} /> },
    { id: 'leaderboard', label: t.nav.top, icon: <Trophy size={20} /> },
  ];

  return (
    <nav className="flex bg-l2-panel border-t border-white/10">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex-1 flex flex-col items-center py-3 transition-colors ${
            activeTab === tab.id
              ? 'text-l2-gold'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          {tab.icon}
          <span className="text-xs mt-1">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
