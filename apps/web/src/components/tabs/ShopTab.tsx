'use client';

import { useEffect, useState } from 'react';
import { getSocket } from '@/lib/socket';
import { Flame, Zap, Clover, Coins, Check } from 'lucide-react';
import { detectLanguage, useTranslation, Language } from '@/lib/i18n';

interface ShopState {
  gold: number;
  activeSoulshot: string | null;
  soulshotNG: number;
  soulshotD: number;
  soulshotC: number;
  potionHaste: number;
  potionAcumen: number;
  potionLuck: number;
}

export default function ShopTab() {
  const [lang] = useState<Language>(() => detectLanguage());
  const t = useTranslation(lang);

  const SOULSHOTS = [
    { id: 'NG', name: t.shop.ssNG, multiplier: 1.5, cost: 10, color: 'gray' },
    { id: 'D', name: t.shop.ssD, multiplier: 2.2, cost: 50, color: 'green' },
    { id: 'C', name: t.shop.ssC, multiplier: 3.5, cost: 250, color: 'blue' },
    { id: 'B', name: t.shop.ssB, multiplier: 5.0, cost: 1000, color: 'purple' },
    { id: 'A', name: t.shop.ssA, multiplier: 7.0, cost: 5000, color: 'orange' },
    { id: 'S', name: t.shop.ssS, multiplier: 10.0, cost: 20000, color: 'red' },
  ];

  const BUFFS = [
    { id: 'haste', name: t.shop.haste, icon: <Zap size={20} />, effect: t.shop.hasteEffect, duration: '30s', cost: 500, color: 'yellow' },
    { id: 'acumen', name: t.shop.acumen, icon: <Flame size={20} />, effect: t.shop.acumenEffect, duration: '30s', cost: 500, color: 'red' },
    { id: 'luck', name: t.shop.luck, icon: <Clover size={20} />, effect: t.shop.luckEffect, duration: '60s', cost: 1000, color: 'green' },
  ];

  const [shopState, setShopState] = useState<ShopState>({
    gold: 0,
    activeSoulshot: null,
    soulshotNG: 0,
    soulshotD: 0,
    soulshotC: 0,
    potionHaste: 0,
    potionAcumen: 0,
    potionLuck: 0,
  });
  const [buying, setBuying] = useState<string | null>(null);

  useEffect(() => {
    const socket = getSocket();

    // Request player data on mount
    socket.emit('player:get');

    const updateShopState = (data: any) => {
      if (!data) return;
      setShopState({
        gold: data.gold || 0,
        activeSoulshot: data.activeSoulshot || null,
        soulshotNG: data.soulshotNG || 0,
        soulshotD: data.soulshotD || 0,
        soulshotC: data.soulshotC || 0,
        potionHaste: data.potionHaste || 0,
        potionAcumen: data.potionAcumen || 0,
        potionLuck: data.potionLuck || 0,
      });
    };

    socket.on('player:data', updateShopState);
    socket.on('auth:success', updateShopState);

    socket.on('shop:success', (data: any) => {
      setShopState(prev => ({ ...prev, ...data }));
      setBuying(null);
    });

    socket.on('shop:error', () => {
      setBuying(null);
    });

    return () => {
      socket.off('player:data');
      socket.off('auth:success');
      socket.off('shop:success');
      socket.off('shop:error');
    };
  }, []);

  const handleBuySoulshot = (grade: string, quantity: number = 100) => {
    if (buying) return;
    setBuying(`ss-${grade}`);
    getSocket().emit('shop:buy', { type: 'soulshot', grade, quantity });
  };

  const handleToggleSoulshot = (grade: string) => {
    const newActive = shopState.activeSoulshot === grade ? null : grade;
    getSocket().emit('soulshot:toggle', { grade: newActive });
    setShopState(prev => ({ ...prev, activeSoulshot: newActive }));
  };

  const handleBuyBuff = (buffId: string) => {
    if (buying) return;
    setBuying(`buff-${buffId}`);
    getSocket().emit('shop:buy', { type: 'buff', buffId });
  };

  return (
    <div className="flex-1 overflow-auto bg-l2-dark p-4">
      {/* Adena Header */}
      <div className="bg-l2-panel rounded-lg p-4 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Coins className="text-l2-gold" size={24} />
          <span className="text-xl font-bold text-l2-gold">
            {shopState.gold.toLocaleString()}
          </span>
        </div>
        <span className="text-gray-400">{t.shop.gold}</span>
      </div>

      {/* Soulshots */}
      <div className="bg-l2-panel rounded-lg p-4 mb-4">
        <h3 className="text-sm text-gray-400 mb-3">{t.shop.soulshots}</h3>
        <p className="text-xs text-gray-500 mb-3">{t.shop.soulshotsDesc}</p>

        <div className="space-y-2">
          {SOULSHOTS.map((ss) => {
            const owned = shopState[`soulshot${ss.id}` as keyof ShopState] as number || 0;
            const isActive = shopState.activeSoulshot === ss.id;
            const canAfford = shopState.gold >= ss.cost;

            return (
              <div
                key={ss.id}
                className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                  isActive ? 'bg-l2-gold/20 border border-l2-gold' : 'bg-black/30'
                }`}
              >
                <div className={`w-10 h-10 rounded-lg bg-${ss.color}-500/20 flex items-center justify-center`}>
                  <Flame className={`text-${ss.color}-400`} size={20} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{ss.name}</span>
                    <span className="text-xs text-l2-gold">x{ss.multiplier}</span>
                  </div>
                  <p className="text-xs text-gray-500">{t.shop.owned}: {owned}</p>
                </div>

                {owned > 0 && (
                  <button
                    onClick={() => handleToggleSoulshot(ss.id)}
                    className={`p-2 rounded-lg ${
                      isActive ? 'bg-l2-gold text-black' : 'bg-gray-700 text-gray-300'
                    }`}
                  >
                    <Check size={16} />
                  </button>
                )}

                <button
                  onClick={() => handleBuySoulshot(ss.id)}
                  disabled={!canAfford || buying === `ss-${ss.id}`}
                  className={`px-3 py-2 rounded-lg text-xs font-bold ${
                    canAfford
                      ? 'bg-l2-gold text-black hover:bg-l2-gold/80'
                      : 'bg-gray-700 text-gray-500'
                  }`}
                >
                  {buying === `ss-${ss.id}` ? '...' : `${ss.cost} x100`}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Buffs */}
      <div className="bg-l2-panel rounded-lg p-4">
        <h3 className="text-sm text-gray-400 mb-3">{t.shop.buffs}</h3>
        <p className="text-xs text-gray-500 mb-3">{t.shop.buffsDesc}</p>

        <div className="space-y-2">
          {BUFFS.map((buff) => {
            const owned = shopState[`potion${buff.id.charAt(0).toUpperCase() + buff.id.slice(1)}` as keyof ShopState] as number || 0;
            const canAfford = shopState.gold >= buff.cost;

            return (
              <div
                key={buff.id}
                className="flex items-center gap-3 p-3 bg-black/30 rounded-lg"
              >
                <div className={`w-10 h-10 rounded-lg bg-${buff.color}-500/20 flex items-center justify-center text-${buff.color}-400`}>
                  {buff.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{buff.name}</span>
                    <span className="text-xs text-gray-400">{buff.duration}</span>
                  </div>
                  <p className="text-xs text-gray-500">{buff.effect} • {t.shop.owned}: {owned}</p>
                </div>

                {owned > 0 && (
                  <button
                    onClick={() => getSocket().emit('buff:use', { buffId: buff.id })}
                    className="px-3 py-2 rounded-lg text-xs font-bold bg-green-600 text-white hover:bg-green-500"
                  >
                    {t.shop.use}
                  </button>
                )}

                <button
                  onClick={() => handleBuyBuff(buff.id)}
                  disabled={!canAfford || buying === `buff-${buff.id}`}
                  className={`px-3 py-2 rounded-lg text-xs font-bold ${
                    canAfford
                      ? 'bg-l2-gold text-black hover:bg-l2-gold/80'
                      : 'bg-gray-700 text-gray-500'
                  }`}
                >
                  {buying === `buff-${buff.id}` ? '...' : buff.cost}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
