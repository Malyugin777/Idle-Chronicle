'use client';

import { useEffect, useState } from 'react';
import { getSocket } from '@/lib/socket';
import { X } from 'lucide-react';
import { detectLanguage, useTranslation, Language } from '@/lib/i18n';

interface PlayerStats {
  id: string;
  username: string | null;
  firstName: string | null;
  level: number;
  exp: number;
  expToNext: number;
  // Base stats
  power: number;
  vitality: number;
  agility: number;
  intellect: number;
  spirit: number;
  // Combat stats
  pAtk: number;
  pDef: number;
  mAtk: number;
  mDef: number;
  critChance: number;
  attackSpeed: number;
  // Currency
  adena: number;
}

interface Skill {
  id: string;
  icon: string;
  level: number;
}

type EquipmentSlot = 'helmet' | 'armor' | 'pants' | 'gloves' | 'boots' | 'weapon' | 'earring1' | 'earring2' | 'ring1' | 'ring2' | 'necklace' | 'belt';

export default function CharacterTab() {
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [showStatsPopup, setShowStatsPopup] = useState(false);
  const [showSkillsPopup, setShowSkillsPopup] = useState(false);
  const [lang] = useState<Language>(() => detectLanguage());
  const t = useTranslation(lang);

  // Equipment slots (empty for now)
  const equipmentSlots: { slot: EquipmentSlot; label: string }[] = [
    { slot: 'helmet', label: t.character.helmet },
    { slot: 'armor', label: t.character.armor },
    { slot: 'pants', label: t.character.pants },
    { slot: 'gloves', label: t.character.gloves },
    { slot: 'boots', label: t.character.boots },
    { slot: 'weapon', label: t.character.weapon },
    { slot: 'earring1', label: t.character.earring },
    { slot: 'earring2', label: t.character.earring },
    { slot: 'ring1', label: t.character.ring },
    { slot: 'ring2', label: t.character.ring },
    { slot: 'necklace', label: t.character.necklace },
    { slot: 'belt', label: t.character.belt },
  ];

  // Skills
  const skills: Skill[] = [
    { id: 'fireball', icon: '🔥', level: 1 },
    { id: 'iceball', icon: '❄️', level: 1 },
    { id: 'lightning', icon: '⚡', level: 1 },
  ];

  useEffect(() => {
    const socket = getSocket();
    socket.emit('player:get');

    socket.on('player:data', (data: PlayerStats) => {
      setStats({
        ...data,
        exp: data.exp || 0,
        expToNext: data.expToNext || 1000,
        power: data.power || 10,
        vitality: data.vitality || 10,
        agility: data.agility || 10,
        intellect: data.intellect || 10,
        spirit: data.spirit || 10,
        pDef: data.pDef || 40,
        mAtk: data.mAtk || 10,
        mDef: data.mDef || 30,
        attackSpeed: data.attackSpeed || 300,
      });
    });

    socket.on('auth:success', (data: PlayerStats) => {
      setStats({
        ...data,
        exp: data.exp || 0,
        expToNext: data.expToNext || 1000,
        power: data.power || 10,
        vitality: data.vitality || 10,
        agility: data.agility || 10,
        intellect: data.intellect || 10,
        spirit: data.spirit || 10,
        pDef: data.pDef || 40,
        mAtk: data.mAtk || 10,
        mDef: data.mDef || 30,
        attackSpeed: data.attackSpeed || 300,
      });
    });

    return () => {
      socket.off('player:data');
      socket.off('auth:success');
    };
  }, []);

  if (!stats) {
    return (
      <div className="flex-1 flex items-center justify-center bg-l2-dark">
        <div className="text-center">
          <p className="text-gray-400 mb-2">{t.character.notAuth}</p>
          <p className="text-xs text-gray-500">{t.character.playInTelegram}</p>
        </div>
      </div>
    );
  }

  const expPercent = Math.min(100, (stats.exp / stats.expToNext) * 100);

  return (
    <div className="flex-1 overflow-auto bg-l2-dark">
      {/* Compact Header */}
      <div className="bg-l2-panel p-2 border-b border-white/10">
        <div className="flex items-center gap-2">
          {/* Level badge */}
          <div className="w-8 h-8 rounded bg-l2-gold/20 flex items-center justify-center">
            <span className="text-sm font-bold text-l2-gold">{stats.level}</span>
          </div>

          {/* Name + XP bar */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-white truncate">
                {stats.firstName || stats.username || 'Hero'}
              </span>
              <span className="text-xs text-l2-gold ml-2">
                🪙 {stats.adena.toLocaleString()}
              </span>
            </div>
            {/* XP Bar */}
            <div className="mt-1 h-2 bg-black/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-600 to-purple-400 transition-all"
                style={{ width: `${expPercent}%` }}
              />
            </div>
            <div className="text-[10px] text-gray-500 text-right">
              {t.character.exp} {expPercent.toFixed(0)}%
            </div>
          </div>
        </div>
      </div>

      {/* Equipment Grid */}
      <div className="p-2">
        <div className="text-xs text-gray-400 mb-1">{t.character.equipment}</div>
        <div className="grid grid-cols-6 gap-1">
          {equipmentSlots.map((eq) => (
            <div
              key={eq.slot}
              className="aspect-square bg-black/40 rounded border border-white/10 flex items-center justify-center"
              title={eq.label}
            >
              <span className="text-[10px] text-gray-600">-</span>
            </div>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="px-2 flex gap-2">
        <button
          onClick={() => setShowStatsPopup(true)}
          className="flex-1 py-2 bg-l2-panel rounded text-xs font-bold text-white border border-white/10 hover:bg-white/10"
        >
          📊 {t.character.stats}
        </button>
        <button
          onClick={() => setShowSkillsPopup(true)}
          className="flex-1 py-2 bg-l2-panel rounded text-xs font-bold text-white border border-white/10 hover:bg-white/10"
        >
          ✨ {t.character.skills}
        </button>
      </div>

      {/* Inventory Grid */}
      <div className="p-2">
        <div className="text-xs text-gray-400 mb-1">{t.character.inventory}</div>
        <div className="grid grid-cols-6 gap-1">
          {Array.from({ length: 24 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square bg-black/30 rounded border border-white/5 flex items-center justify-center"
            >
              <span className="text-[10px] text-gray-700">-</span>
            </div>
          ))}
        </div>
      </div>

      {/* Stats Popup */}
      {showStatsPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-l2-panel rounded-lg w-full max-w-sm max-h-[80vh] overflow-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-white/10">
              <span className="font-bold text-white">{t.character.stats}</span>
              <button onClick={() => setShowStatsPopup(false)} className="text-gray-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            {/* Combat Stats */}
            <div className="p-3 border-b border-white/10">
              <div className="text-xs text-gray-400 mb-2">{t.character.combatStats}</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-black/30 rounded p-2">
                  <div className="text-[10px] text-gray-500">{t.character.pAtk}</div>
                  <div className="text-sm font-bold text-red-400">{stats.pAtk}</div>
                </div>
                <div className="bg-black/30 rounded p-2">
                  <div className="text-[10px] text-gray-500">{t.character.pDef}</div>
                  <div className="text-sm font-bold text-blue-400">{stats.pDef}</div>
                </div>
                <div className="bg-black/30 rounded p-2">
                  <div className="text-[10px] text-gray-500">{t.character.critChance}</div>
                  <div className="text-sm font-bold text-yellow-400">{(stats.critChance * 100).toFixed(0)}%</div>
                </div>
                <div className="bg-black/30 rounded p-2">
                  <div className="text-[10px] text-gray-500">{t.character.mAtk}</div>
                  <div className="text-sm font-bold text-purple-400">{stats.mAtk}</div>
                </div>
                <div className="bg-black/30 rounded p-2">
                  <div className="text-[10px] text-gray-500">{t.character.mDef}</div>
                  <div className="text-sm font-bold text-cyan-400">{stats.mDef}</div>
                </div>
                <div className="bg-black/30 rounded p-2">
                  <div className="text-[10px] text-gray-500">{t.character.atkSpd}</div>
                  <div className="text-sm font-bold text-green-400">{stats.attackSpeed}</div>
                </div>
              </div>
            </div>

            {/* Base Stats */}
            <div className="p-3">
              <div className="text-xs text-gray-400 mb-2">{t.character.baseStats}</div>
              <div className="grid grid-cols-5 gap-1 text-center">
                <div className="bg-black/30 rounded p-2">
                  <div className="text-[10px] text-gray-500">{t.character.power}</div>
                  <div className="text-sm font-bold text-white">{stats.power}</div>
                </div>
                <div className="bg-black/30 rounded p-2">
                  <div className="text-[10px] text-gray-500">{t.character.vitality}</div>
                  <div className="text-sm font-bold text-white">{stats.vitality}</div>
                </div>
                <div className="bg-black/30 rounded p-2">
                  <div className="text-[10px] text-gray-500">{t.character.agility}</div>
                  <div className="text-sm font-bold text-white">{stats.agility}</div>
                </div>
                <div className="bg-black/30 rounded p-2">
                  <div className="text-[10px] text-gray-500">{t.character.intellect}</div>
                  <div className="text-sm font-bold text-white">{stats.intellect}</div>
                </div>
                <div className="bg-black/30 rounded p-2">
                  <div className="text-[10px] text-gray-500">{t.character.spirit}</div>
                  <div className="text-sm font-bold text-white">{stats.spirit}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Skills Popup */}
      {showSkillsPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-l2-panel rounded-lg w-full max-w-sm">
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-white/10">
              <span className="font-bold text-white">{t.character.skills}</span>
              <button onClick={() => setShowSkillsPopup(false)} className="text-gray-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            {/* Skills List */}
            <div className="p-3 space-y-2">
              {skills.map((skill) => {
                const skillName = skill.id === 'fireball' ? t.character.skillFireball
                  : skill.id === 'iceball' ? t.character.skillIceball
                  : t.character.skillLightning;
                const skillDesc = skill.id === 'fireball' ? t.character.skillFireballDesc
                  : skill.id === 'iceball' ? t.character.skillIceballDesc
                  : t.character.skillLightningDesc;

                return (
                  <div key={skill.id} className="flex items-center gap-3 bg-black/30 rounded p-2">
                    <div className="flex-1">
                      <div className="text-sm font-bold text-white">{skillName}</div>
                      <div className="text-[10px] text-gray-500">{skillDesc}</div>
                      <div className="text-[10px] text-l2-gold">Lv.{skill.level}</div>
                    </div>
                    <div className="w-10 h-10 bg-black/50 rounded flex items-center justify-center text-2xl">
                      {skill.icon}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
