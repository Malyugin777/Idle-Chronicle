'use client';

import { memo } from 'react';
import { Gem } from 'lucide-react';
import type { PlayerState, ActiveBuff } from '../types';
import { APP_VERSION, formatCompact } from '../constants';
import BuffIcon from './BuffIcon';

interface TopHUDProps {
  playerState: PlayerState;
  connected: boolean;
  playersOnline: number;
  bossIndex: number;
  totalBosses: number;
  staminaPercent: number;
  manaPercent: number;
  manaFlash: boolean;
  exhausted: boolean;
  activeBuffs: ActiveBuff[];
  lang: 'ru' | 'en';
  t: any;
  onShowDebug: () => void;
}

// React.memo prevents re-renders when props haven't changed (v1.8.19)
export default memo(function TopHUD({
  playerState,
  connected,
  playersOnline,
  bossIndex,
  totalBosses,
  staminaPercent,
  manaPercent,
  manaFlash,
  exhausted,
  activeBuffs,
  lang,
  t,
  onShowDebug,
}: TopHUDProps) {
  return (
    <div className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/90 via-black/70 to-transparent pb-6 pt-2 px-3">
      {/* Row 1: Avatar + Nickname + Level | Currency */}
      <div className="flex items-center justify-between mb-1">
        {/* Left: Avatar + Nickname with Level badge */}
        <div className="flex items-center gap-2">
          <div className="relative">
            {playerState.photoUrl ? (
              <img
                src={playerState.photoUrl}
                alt=""
                className="w-9 h-9 rounded-lg border-2 border-amber-500/70 shadow-lg shadow-amber-500/20"
              />
            ) : (
              <div className="w-9 h-9 rounded-lg border-2 border-amber-500/70 bg-gray-900/90 flex items-center justify-center shadow-lg shadow-amber-500/20">
                <span className="text-base">👤</span>
              </div>
            )}
            {/* Level badge */}
            <div className="absolute -bottom-1 -right-1 bg-gradient-to-r from-amber-600 to-amber-500 px-1 py-0.5 rounded text-[9px] font-bold text-white shadow-md border border-amber-400/50">
              {playerState.level}
            </div>
          </div>
          {/* Nickname */}
          <span className="text-sm font-bold text-white/90 max-w-[100px] truncate">
            {playerState.firstName || 'Player'}
          </span>
        </div>

        {/* Right: PS + Gold + Crystals */}
        <div className="flex items-center gap-1.5">
          {/* PS (Participation Score) */}
          <div className={`flex items-center gap-1 px-1.5 py-1 rounded-lg border ${
            playerState.ps >= playerState.psCap
              ? 'bg-gradient-to-r from-green-900/60 to-green-800/40 border-green-500/50'
              : playerState.ps > 0
                ? 'bg-gradient-to-r from-purple-900/60 to-purple-800/40 border-purple-500/40'
                : 'bg-gradient-to-r from-gray-800/60 to-gray-700/40 border-gray-600/40'
          }`}>
            <span className="text-[10px]">⭐</span>
            <span className={`text-[10px] font-bold ${
              playerState.ps >= playerState.psCap ? 'text-green-300' : playerState.ps > 0 ? 'text-purple-300' : 'text-gray-400'
            }`}>{playerState.ps}/{playerState.psCap}</span>
          </div>
          {/* Gold */}
          <div className="flex items-center gap-1 bg-gradient-to-r from-amber-900/60 to-amber-800/40 px-1.5 py-1 rounded-lg border border-amber-600/40">
            <span className="text-[10px]">🪙</span>
            <span className="text-[10px] font-bold text-amber-300">{formatCompact(playerState.gold)}</span>
          </div>
          {/* Crystals */}
          <div className="flex items-center gap-1 bg-gradient-to-r from-purple-900/60 to-purple-800/40 px-1.5 py-1 rounded-lg border border-purple-500/40">
            <Gem className="text-purple-400" size={10} />
            <span className="text-[10px] font-bold text-purple-300">{playerState.crystals}</span>
          </div>
        </div>
      </div>

      {/* Row 2: Online + Version */}
      <div className="flex items-center gap-2 px-1 mb-1 text-[9px]">
        <div className="flex items-center gap-1">
          <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-gray-500">
            {connected ? `${playersOnline} ${t.game.online}` : t.game.connecting}
          </span>
        </div>
        <span
          className="text-gray-600 cursor-pointer hover:text-gray-400"
          onClick={onShowDebug}
        >
          {APP_VERSION}
        </span>
      </div>

      {/* Row 3: Boss Progress */}
      <div className="flex items-center gap-1.5 px-1 mb-1.5 text-[10px]">
        <span className="text-amber-500/80">⚔️</span>
        <span className="text-gray-300 font-medium">
          {lang === 'ru' ? 'Босс' : 'Boss'} {bossIndex} / {totalBosses}
        </span>
      </div>

      {/* Row 4: Resource Bars (55%) + Buffs + Tasks Button */}
      <div className="flex items-center gap-2">
        {/* Bars Column (narrowed to ~55%) */}
        <div className="w-[55%] flex flex-col gap-1">
          {/* Stamina Bar (Yellow, top) */}
          <div className="h-4 bg-gray-900/80 rounded-md overflow-hidden relative border border-yellow-500/30 shadow-inner">
            <div
              className={`h-full transition-all duration-200 ${
                exhausted
                  ? 'bg-gradient-to-r from-red-600 to-red-400'
                  : staminaPercent < 25
                    ? 'bg-gradient-to-r from-orange-600 to-orange-400'
                    : 'bg-gradient-to-r from-yellow-500 to-yellow-400'
              }`}
              style={{ width: `${staminaPercent}%` }}
            />
            <span className="absolute inset-0 flex items-center px-2 text-[10px] text-white font-bold drop-shadow-lg">
              <span className="mr-1">⚡</span>
              <span className="text-yellow-200">{lang === 'ru' ? 'Стамина' : 'Stamina'}</span>
              <span className="ml-auto">{Math.floor(playerState.stamina)}/{playerState.maxStamina}</span>
            </span>
          </div>

          {/* Mana Bar (Blue, bottom) - with flash on insufficient */}
          <div className={`h-4 bg-gray-900/80 rounded-md overflow-hidden relative border shadow-inner transition-all ${
            manaFlash ? 'border-red-500 shadow-[0_0_12px_rgba(239,68,68,0.6)]' : 'border-blue-500/30'
          }`}>
            <div
              className={`h-full transition-all duration-200 ${
                manaFlash ? 'bg-gradient-to-r from-red-600 to-red-400' : 'bg-gradient-to-r from-blue-600 to-blue-400'
              }`}
              style={{ width: `${manaPercent}%` }}
            />
            <span className="absolute inset-0 flex items-center px-2 text-[10px] text-white font-bold drop-shadow-lg">
              <span className="mr-1">💧</span>
              <span className={manaFlash ? 'text-red-200' : 'text-blue-200'}>MP</span>
              <span className="ml-auto">{Math.floor(playerState.mana)}/{playerState.maxMana}</span>
            </span>
          </div>
        </div>

        {/* Active Buffs (right of bars) */}
        <div className="flex-1 flex flex-wrap gap-1.5 justify-end items-center">
          {activeBuffs.map(buff => (
            <BuffIcon key={buff.type} buff={buff} />
          ))}
        </div>
      </div>
    </div>
  );
});
