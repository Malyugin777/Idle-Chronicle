'use client';

import { useEffect, useState } from 'react';
import { getSocket } from '@/lib/socket';
import { Flame, Zap, Clover, Coins, Sparkles } from 'lucide-react';
import { detectLanguage, useTranslation, Language } from '@/lib/i18n';

interface ShopState {
  gold: number;
  ether: number;
  etherDust: number;
  potionHaste: number;
  potionAcumen: number;
  potionLuck: number;
}

export default function ShopTab() {
  const [lang] = useState<Language>(() => detectLanguage());
  const t = useTranslation(lang);

  const BUFFS = [
    { id: 'haste', name: t.shop.haste, icon: <Zap size={20} />, effect: t.shop.hasteEffect, duration: '30s', cost: 500, color: 'yellow' },
    { id: 'acumen', name: t.shop.acumen, icon: <Flame size={20} />, effect: t.shop.acumenEffect, duration: '30s', cost: 500, color: 'red' },
    { id: 'luck', name: t.shop.luck, icon: <Clover size={20} />, effect: t.shop.luckEffect, duration: '60s', cost: 1000, color: 'green' },
  ];

  const [shopState, setShopState] = useState<ShopState>({
    gold: 0,
    ether: 0,
    etherDust: 0,
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
        ether: data.ether || 0,
        etherDust: data.etherDust || 0,
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

    socket.on('ether:craft:success', (data: { ether: number; etherDust: number; gold: number }) => {
      setShopState(prev => ({
        ...prev,
        ether: data.ether,
        etherDust: data.etherDust,
        gold: data.gold,
      }));
      setBuying(null);
    });

    return () => {
      socket.off('player:data');
      socket.off('auth:success');
      socket.off('shop:success');
      socket.off('shop:error');
      socket.off('ether:craft:success');
    };
  }, []);

  const handleBuyEther = (quantity: number = 100) => {
    if (buying) return;
    setBuying('ether');
    getSocket().emit('shop:buy', { type: 'ether', quantity });
  };

  const handleBuyBuff = (buffId: string) => {
    if (buying) return;
    setBuying(`buff-${buffId}`);
    getSocket().emit('shop:buy', { type: 'buff', buffId });
  };

  const handleCraftEther = () => {
    if (buying) return;
    // Craft max possible (5 dust + 5 gold = 1 ether)
    const maxByDust = Math.floor(shopState.etherDust / 5);
    const maxByGold = Math.floor(shopState.gold / 5);
    const amount = Math.min(maxByDust, maxByGold);
    if (amount <= 0) return;
    setBuying('craft');
    getSocket().emit('ether:craft', { amount });
  };

  const etherCost = 10; // 10 gold per 100 ether
  const canAffordEther = shopState.gold >= etherCost;

  // Craft: 5 dust + 5 gold = 1 ether
  const craftableDust = Math.floor(shopState.etherDust / 5);
  const craftableGold = Math.floor(shopState.gold / 5);
  const canCraft = craftableDust > 0 && craftableGold > 0;

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

      {/* Ether Section */}
      <div className="bg-l2-panel rounded-lg p-4 mb-4">
        <h3 className="text-sm text-gray-400 mb-3">{lang === 'ru' ? 'Эфир' : 'Ether'}</h3>
        <p className="text-xs text-gray-500 mb-3">
          {lang === 'ru' ? 'Увеличивает урон x2 за каждый удар' : 'Doubles damage per hit'}
        </p>

        {/* Ether display and buy */}
        <div className="flex items-center gap-3 p-3 bg-black/30 rounded-lg mb-2">
          <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
            <Sparkles className="text-cyan-400" size={20} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-white">{lang === 'ru' ? 'Эфир' : 'Ether'}</span>
              <span className="text-xs text-cyan-400">x2 {lang === 'ru' ? 'урон' : 'damage'}</span>
            </div>
            <p className="text-xs text-gray-500">{t.shop.owned}: {shopState.ether}</p>
          </div>

          <button
            onClick={() => handleBuyEther(100)}
            disabled={!canAffordEther || buying === 'ether'}
            className={`px-3 py-2 rounded-lg text-xs font-bold ${
              canAffordEther
                ? 'bg-l2-gold text-black hover:bg-l2-gold/80'
                : 'bg-gray-700 text-gray-500'
            }`}
          >
            {buying === 'ether' ? '...' : `${etherCost} x100`}
          </button>
        </div>

        {/* Ether Dust and Craft */}
        <div className="flex items-center gap-3 p-3 bg-black/30 rounded-lg border border-cyan-500/20">
          <div className="w-10 h-10 rounded-lg bg-gray-700/50 flex items-center justify-center">
            <span className="text-xl">🌫️</span>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-white">{lang === 'ru' ? 'Эфирная пыль' : 'Ether Dust'}</span>
            </div>
            <p className="text-xs text-gray-500">
              {t.shop.owned}: {shopState.etherDust} • 5🌫️ + 5🪙 = 1✨
            </p>
          </div>

          <button
            onClick={handleCraftEther}
            disabled={!canCraft || buying === 'craft'}
            className={`px-3 py-2 rounded-lg text-xs font-bold ${
              canCraft
                ? 'bg-cyan-600 text-white hover:bg-cyan-500'
                : 'bg-gray-700 text-gray-500'
            }`}
          >
            {buying === 'craft' ? '...' : (lang === 'ru' ? 'Крафт' : 'Craft')}
          </button>
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
