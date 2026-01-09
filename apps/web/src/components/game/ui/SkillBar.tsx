'use client';

import type { Skill, PlayerState, BossState } from '../types';

interface SkillBarProps {
  skills: Skill[];
  playerState: PlayerState;
  bossState: BossState;
  autoAttack: boolean;
  autoUseEther: boolean;
  pressedSkill: string | null;
  lang: 'ru' | 'en';
  onToggleAutoAttack: () => void;
  onToggleAutoEther: () => void;
  onUseSkill: (skill: Skill) => void;
}

const SKILL_UNLOCK_LEVELS: Record<string, number> = {
  fireball: 1,
  iceball: 2,
  lightning: 3,
};

export default function SkillBar({
  skills,
  playerState,
  bossState,
  autoAttack,
  autoUseEther,
  pressedSkill,
  lang,
  onToggleAutoAttack,
  onToggleAutoEther,
  onUseSkill,
}: SkillBarProps) {
  const dataLoaded = bossState.maxHp > 1;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-10 pb-2 pt-4 px-3 bg-gradient-to-t from-black/95 via-black/70 to-transparent">
      {/* Action Bar Container */}
      <div className="flex justify-center items-center gap-1.5 bg-gradient-to-b from-gray-800/40 to-gray-900/60 rounded-xl p-2 border border-gray-700/30 shadow-lg">
        {/* AUTO Button (Smart Auto-Hunt) - Premium with pulse when ON */}
        <button
          onClick={onToggleAutoAttack}
          className={`
            relative w-14 h-14 rounded-lg
            ${autoAttack
              ? 'bg-gradient-to-b from-green-600 to-green-800 border-2 border-green-400 shadow-[0_0_20px_rgba(34,197,94,0.6)] animate-auto-pulse'
              : 'bg-gradient-to-b from-gray-700/50 to-gray-900/80 border-2 border-gray-600/50'}
            flex flex-col items-center justify-center gap-0
            transition-all active:scale-95
          `}
        >
          <span className="text-base drop-shadow-md">{autoAttack ? '⚡' : '▶️'}</span>
          <span className={`text-[8px] font-bold uppercase tracking-wider ${autoAttack ? 'text-green-200' : 'text-gray-400'}`}>
            {autoAttack ? (lang === 'ru' ? 'АВТО' : 'ON') : 'AUTO'}
          </span>
          {autoAttack && (
            <>
              <div className="absolute inset-0 rounded-lg bg-gradient-to-t from-transparent to-white/20 pointer-events-none" />
              <div className="absolute -inset-0.5 rounded-lg border border-green-400/50 animate-ping opacity-30" />
            </>
          )}
        </button>

        {/* Separator */}
        <div className="w-px h-10 bg-gradient-to-b from-transparent via-gray-600/50 to-transparent" />

        {skills.map(skill => {
          const now = Date.now();
          const remaining = Math.max(0, skill.cooldown - (now - skill.lastUsed));
          const onCooldown = remaining > 0;

          const requiredLevel = SKILL_UNLOCK_LEVELS[skill.id] || 1;
          const isUnlocked = playerState.level >= requiredLevel;

          const skillLevelMap: Record<string, number> = {
            fireball: playerState.skillFireball,
            iceball: playerState.skillIceball,
            lightning: playerState.skillLightning,
          };
          const skillLevel = skillLevelMap[skill.id] || 0;

          const canUse = dataLoaded && isUnlocked && !onCooldown && playerState.mana >= skill.manaCost && bossState.hp > 0;

          const skillGradient = skill.id === 'fireball'
            ? 'from-orange-700/70 to-red-900/90'
            : skill.id === 'iceball'
              ? 'from-cyan-700/70 to-blue-900/90'
              : 'from-yellow-600/70 to-amber-900/90';
          const skillGlow = skill.id === 'fireball'
            ? 'shadow-[0_0_12px_rgba(249,115,22,0.4)]'
            : skill.id === 'iceball'
              ? 'shadow-[0_0_12px_rgba(34,211,238,0.4)]'
              : 'shadow-[0_0_12px_rgba(250,204,21,0.4)]';

          return (
            <button
              key={skill.id}
              onClick={() => onUseSkill(skill)}
              disabled={!canUse}
              className={`
                relative w-12 h-12 rounded-lg ${skill.color}
                ${!isUnlocked
                  ? 'bg-gradient-to-b from-gray-900/80 to-black/90 opacity-40'
                  : canUse
                    ? `bg-gradient-to-b ${skillGradient} ${skillGlow}`
                    : 'bg-gradient-to-b from-gray-800/50 to-gray-900/80 opacity-50'}
                flex flex-col items-center justify-center gap-0
                transition-all
                ${pressedSkill === skill.id ? 'skill-btn-press scale-95' : ''}
              `}
            >
              <span className="text-base drop-shadow-lg">{skill.icon}</span>
              {/* MP Cost */}
              {isUnlocked && (
                <span className={`text-[8px] font-bold ${
                  playerState.mana >= skill.manaCost ? 'text-blue-300' : 'text-red-400'
                }`}>
                  MP:{skill.manaCost}
                </span>
              )}
              {/* Locked overlay */}
              {!isUnlocked && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg">
                  <span className="text-[10px] font-bold text-gray-400">Lv.{requiredLevel}</span>
                </div>
              )}
              {/* Skill level badge */}
              {isUnlocked && skillLevel > 0 && (
                <div className="absolute -top-1 -right-1 bg-gradient-to-b from-blue-600 to-blue-800 px-1 py-0.5 rounded text-[8px] font-bold text-white border border-blue-400/50">
                  {skillLevel}
                </div>
              )}
              {/* Shine effect */}
              {canUse && !onCooldown && (
                <div className="absolute inset-0 rounded-lg bg-gradient-to-t from-transparent to-white/15 pointer-events-none" />
              )}
              {onCooldown && isUnlocked && (
                <>
                  <div
                    className="absolute inset-0 bg-black/75 rounded-lg"
                    style={{ height: `${(remaining / skill.cooldown) * 100}%`, top: 'auto', bottom: 0 }}
                  />
                  <span className="absolute text-sm font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                    {Math.ceil(remaining / 1000)}
                  </span>
                </>
              )}
            </button>
          );
        })}

        {/* Separator */}
        <div className="w-px h-10 bg-gradient-to-b from-transparent via-gray-600/50 to-transparent" />

        {/* Ether Slot */}
        <button
          onClick={onToggleAutoEther}
          className={`
            relative w-12 h-12 rounded-lg
            ${autoUseEther && playerState.ether > 0
              ? 'bg-gradient-to-b from-cyan-600/70 to-cyan-900/90 border-2 border-cyan-400/60 shadow-[0_0_14px_rgba(34,211,238,0.4)]'
              : playerState.ether > 0
                ? 'bg-gradient-to-b from-purple-700/50 to-purple-900/80 border-2 border-purple-500/40'
                : 'bg-gradient-to-b from-gray-800/50 to-gray-900/80 border-2 border-gray-600/50 opacity-50'}
            flex flex-col items-center justify-center
            transition-all active:scale-95
          `}
        >
          <span className="text-xl drop-shadow-lg">✨</span>
          {/* Ether count badge */}
          <div className="absolute -top-1.5 -right-1.5 bg-gradient-to-b from-purple-600 to-purple-800 px-1.5 py-0.5 rounded-md border border-purple-400/50 shadow-md">
            <span className="text-[9px] font-bold text-white">
              {playerState.ether > 999 ? '999+' : playerState.ether}
            </span>
          </div>
          {/* Shine effect when active */}
          {autoUseEther && playerState.ether > 0 && (
            <>
              <div className="absolute inset-0 rounded-lg bg-gradient-to-t from-transparent to-white/15 pointer-events-none" />
              <span className="absolute bottom-1 text-[7px] text-cyan-300 font-bold uppercase tracking-wider">Auto</span>
            </>
          )}
          {playerState.ether === 0 && (
            <div className="absolute inset-0 bg-black/70 rounded-lg flex items-center justify-center">
              <span className="text-xs text-red-400 font-bold">0</span>
            </div>
          )}
        </button>
      </div>
    </div>
  );
}
