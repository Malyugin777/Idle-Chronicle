'use client';

import type { LoadingState } from '../../types';
import { APP_VERSION } from '../../constants';

interface LoadingScreenProps {
  loadingState: LoadingState;
  lang: 'ru' | 'en';
}

export default function LoadingScreen({ loadingState, lang }: LoadingScreenProps) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-gradient-to-b from-[#2a313b] to-[#0e141b]">
      <div className="text-center">
        <div className="text-4xl mb-4">⚔️</div>
        <h1 className="text-2xl font-bold text-l2-gold mb-2">Idle Chronicle</h1>
        <p className="text-gray-400 text-sm mb-6">
          {lang === 'ru' ? 'Загрузка...' : 'Loading...'}
        </p>
        <div className="flex justify-center items-center gap-2">
          <div className="w-2 h-2 bg-l2-gold rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-l2-gold rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 bg-l2-gold rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
        <div className="mt-6 text-xs text-gray-500 space-y-1">
          <div className={loadingState.auth ? 'text-green-400' : 'text-gray-500'}>
            {loadingState.auth ? '✓' : '○'} {lang === 'ru' ? 'Авторизация' : 'Authentication'}
          </div>
          <div className={loadingState.boss ? 'text-green-400' : 'text-gray-500'}>
            {loadingState.boss ? '✓' : '○'} {lang === 'ru' ? 'Данные босса' : 'Boss data'}
          </div>
          <div className={loadingState.player ? 'text-green-400' : 'text-gray-500'}>
            {loadingState.player ? '✓' : '○'} {lang === 'ru' ? 'Данные игрока' : 'Player data'}
          </div>
        </div>
        <div className="mt-4 text-[10px] text-gray-600">{APP_VERSION}</div>
      </div>
    </div>
  );
}
