'use client';

import { useEffect, useState } from 'react';
import { getSocket } from '@/lib/socket';
import { usePlayerStore } from '@/stores/playerStore';
import { Flame, Zap, Clover, Coins, Sparkles, Key, Gem } from 'lucide-react';
import { detectLanguage, useTranslation, Language } from '@/lib/i18n';

export default function ShopTab() {
  const [lang] = useState<Language>(() => detectLanguage());
  const t = useTranslation(lang);

  // v1.8.20: Use Zustand store for resources (no more player:get needed)
  const resources = usePlayerStore(state => state.resources);
  const setResources = usePlayerStore(state => state.setResources);

  const BUFFS = [
    { id: 'haste', name: t.shop.haste, icon: <Zap size={20} />, effect: t.shop.hasteEffect, duration: '30s', cost: 500, color: 'yellow' },
    { id: 'acumen', name: t.shop.acumen, icon: <Flame size={20} />, effect: t.shop.acumenEffect, duration: '30s', cost: 500, color: 'red' },
    { id: 'luck', name: t.shop.luck, icon: <Clover size={20} />, effect: t.shop.luckEffect, duration: '60s', cost: 1000, color: 'green' },
  ];

  const [buying, setBuying] = useState<string | null>(null);

  useEffect(() => {
    const socket = getSocket();

    // v1.8.20: No more player:get - data comes from Zustand store populated by PhaserGame

    const handleShopSuccess = (data: any) => {
      // Update Zustand store with shop result
      if (data.gold !== undefined) setResources({ gold: data.gold });
      if (data.crystals !== undefined) setResources({ crystals: data.crystals });
      if (data.ether !== undefined) setResources({ ether: data.ether });
      if (data.potionHaste !== undefined) setResources({ potionHaste: data.potionHaste });
      if (data.potionAcumen !== undefined) setResources({ potionAcumen: data.potionAcumen });
      if (data.potionLuck !== undefined) setResources({ potionLuck: data.potionLuck });
      if (data.keyWooden !== undefined) setResources({ keyWooden: data.keyWooden });
      if (data.keyBronze !== undefined) setResources({ keyBronze: data.keyBronze });
      if (data.keySilver !== undefined) setResources({ keySilver: data.keySilver });
      if (data.keyGold !== undefined) setResources({ keyGold: data.keyGold });
      if (data.enchantCharges !== undefined) setResources({ enchantCharges: data.enchantCharges });
      if (data.lotteryTickets !== undefined) setResources({ lotteryTickets: data.lotteryTickets });
      setBuying(null);
    };

    const handleShopError = () => {
      setBuying(null);
    };

    socket.on('shop:success', handleShopSuccess);
    socket.on('shop:error', handleShopError);

    return () => {
      socket.off('shop:success', handleShopSuccess);
      socket.off('shop:error', handleShopError);
    };
  }, [setResources]);

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

  const handleBuyKey = (keyType: string, cost: number) => {
    if (buying) return;
    setBuying(`key-${keyType}`);
    getSocket().emit('shop:buy', { type: 'key', keyType });
  };

  const handleBuyEnchantCharge = () => {
    if (buying) return;
    setBuying('enchant');
    getSocket().emit('shop:buy', { type: 'enchant' });
  };

  const handleExchange = (quantity: number = 1) => {
    if (buying) return;
    setBuying('exchange');
    getSocket().emit('shop:buy', { type: 'exchange', quantity });
  };

  const handleBuyTickets = (quantity: number = 1) => {
    if (buying) return;
    setBuying('tickets');
    getSocket().emit('shop:buy', { type: 'tickets', quantity });
  };

  const etherCost = 200; // 200 gold per 100 ether
  const EXCHANGE_RATE = 1; // 1 gold = 1 crystal (debug 1:1)
  const TICKET_COST = 5; // crystals per ticket
  const canAffordEther = resources.gold >= etherCost;

  // Keys pricing - 999 crystals for ANY key
  const KEY_COST_CRYSTALS = 999;
  const KEYS = [
    { id: 'wooden', name: lang === 'ru' ? 'Деревянный' : 'Wooden', icon: '🗝️', color: 'amber' },
    { id: 'bronze', name: lang === 'ru' ? 'Бронзовый' : 'Bronze', icon: '🔑', color: 'orange' },
    { id: 'silver', name: lang === 'ru' ? 'Серебряный' : 'Silver', icon: '🔐', color: 'gray' },
    { id: 'gold', name: lang === 'ru' ? 'Золотой' : 'Gold', icon: '🔑', color: 'yellow' },
  ];

  const ENCHANT_COST = 3000;

  // Map potion IDs to store fields
  const getPotionCount = (buffId: string) => {
    switch (buffId) {
      case 'haste': return resources.potionHaste;
      case 'acumen': return resources.potionAcumen;
      case 'luck': return resources.potionLuck;
      default: return 0;
    }
  };

  // Map key IDs to store fields
  const getKeyCount = (keyId: string) => {
    switch (keyId) {
      case 'wooden': return resources.keyWooden;
      case 'bronze': return resources.keyBronze;
      case 'silver': return resources.keySilver;
      case 'gold': return resources.keyGold;
      default: return 0;
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-l2-dark p-4">
      {/* Adena Header */}
      <div className="bg-l2-panel rounded-lg p-4 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Coins className="text-l2-gold" size={24} />
          <span className="text-xl font-bold text-l2-gold">
            {resources.gold.toLocaleString()}
          </span>
        </div>
        <span className="text-gray-400">{t.shop.gold}</span>
      </div>

      {/* Exchange Section - Gold → Crystals */}
      <div className="bg-l2-panel rounded-lg p-4 mb-4">
        <h3 className="text-sm text-gray-400 mb-3">
          <Gem size={14} className="inline mr-1" />
          {lang === 'ru' ? 'Обмен валюты' : 'Currency Exchange'}
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          {lang === 'ru' ? 'Обменивайте золото на кристаллы' : 'Exchange gold for crystals'}
        </p>

        <div className="flex items-center gap-3 p-3 bg-black/30 rounded-lg mb-2">
          <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <span className="text-xl">💎</span>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-white">{lang === 'ru' ? 'Кристаллы' : 'Crystals'}</span>
              <span className="text-xs text-purple-400">1:1</span>
            </div>
            <p className="text-xs text-gray-500">{lang === 'ru' ? 'Есть:' : 'Have:'} {resources.crystals} 💎</p>
          </div>

          <button
            onClick={() => handleExchange(100)}
            disabled={resources.gold < 100 || buying === 'exchange'}
            className={`px-3 py-2 rounded-lg text-xs font-bold ${
              resources.gold >= 100
                ? 'bg-purple-600 text-white hover:bg-purple-500'
                : 'bg-gray-700 text-gray-500'
            }`}
          >
            {buying === 'exchange' ? '...' : '🪙100 → 💎100'}
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => handleExchange(500)}
            disabled={resources.gold < 500 || buying === 'exchange'}
            className={`flex-1 px-2 py-1.5 rounded text-xs font-bold ${
              resources.gold >= 500
                ? 'bg-purple-600/60 text-white hover:bg-purple-500'
                : 'bg-gray-700 text-gray-500'
            }`}
          >
            🪙500 → 💎500
          </button>
          <button
            onClick={() => handleExchange(1000)}
            disabled={resources.gold < 1000 || buying === 'exchange'}
            className={`flex-1 px-2 py-1.5 rounded text-xs font-bold ${
              resources.gold >= 1000
                ? 'bg-purple-600/60 text-white hover:bg-purple-500'
                : 'bg-gray-700 text-gray-500'
            }`}
          >
            🪙1K → 💎1K
          </button>
        </div>
      </div>

      {/* Lottery Tickets Section */}
      <div className="bg-l2-panel rounded-lg p-4 mb-4">
        <h3 className="text-sm text-gray-400 mb-3">
          🎟️ {lang === 'ru' ? 'Билеты лотереи' : 'Lottery Tickets'}
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          {lang === 'ru' ? 'Для Колеса Фортуны' : 'For Wheel of Fortune'}
        </p>

        <div className="flex items-center gap-3 p-3 bg-black/30 rounded-lg mb-2">
          <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <span className="text-xl">🎟️</span>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-white">{lang === 'ru' ? 'Билет' : 'Ticket'}</span>
              <span className="text-xs text-amber-400">= {TICKET_COST} 💎</span>
            </div>
            <p className="text-xs text-gray-500">{lang === 'ru' ? 'Есть:' : 'Have:'} {resources.lotteryTickets} 🎟️</p>
          </div>

          <button
            onClick={() => handleBuyTickets(1)}
            disabled={resources.crystals < TICKET_COST || buying === 'tickets'}
            className={`px-3 py-2 rounded-lg text-xs font-bold ${
              resources.crystals >= TICKET_COST
                ? 'bg-amber-600 text-white hover:bg-amber-500'
                : 'bg-gray-700 text-gray-500'
            }`}
          >
            {buying === 'tickets' ? '...' : `💎${TICKET_COST} → 🎟️1`}
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => handleBuyTickets(5)}
            disabled={resources.crystals < TICKET_COST * 5 || buying === 'tickets'}
            className={`flex-1 px-2 py-1.5 rounded text-xs font-bold ${
              resources.crystals >= TICKET_COST * 5
                ? 'bg-amber-600/60 text-white hover:bg-amber-500'
                : 'bg-gray-700 text-gray-500'
            }`}
          >
            💎{TICKET_COST * 5} → 🎟️5
          </button>
          <button
            onClick={() => handleBuyTickets(10)}
            disabled={resources.crystals < TICKET_COST * 10 || buying === 'tickets'}
            className={`flex-1 px-2 py-1.5 rounded text-xs font-bold ${
              resources.crystals >= TICKET_COST * 10
                ? 'bg-amber-600/60 text-white hover:bg-amber-500'
                : 'bg-gray-700 text-gray-500'
            }`}
          >
            💎{TICKET_COST * 10} → 🎟️10
          </button>
        </div>
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
            <p className="text-xs text-gray-500">{t.shop.owned}: {resources.ether}</p>
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

        {/* Craft hint */}
        <p className="text-[10px] text-gray-500 text-center mt-2">
          {lang === 'ru' ? '💡 Крафт эфира из пыли → Кузница' : '💡 Craft ether from dust → Forge'}
        </p>
      </div>

      {/* Buffs */}
      <div className="bg-l2-panel rounded-lg p-4 mb-4">
        <h3 className="text-sm text-gray-400 mb-3">{t.shop.buffs}</h3>
        <p className="text-xs text-gray-500 mb-3">{t.shop.buffsDesc}</p>

        <div className="space-y-2">
          {BUFFS.map((buff) => {
            const owned = getPotionCount(buff.id);
            const canAfford = resources.gold >= buff.cost;

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

      {/* Keys Section */}
      <div className="bg-l2-panel rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm text-gray-400">
            <Key size={14} className="inline mr-1" />
            {lang === 'ru' ? 'Ключи' : 'Keys'}
          </h3>
          <div className="flex items-center gap-1 text-sm">
            <span className="text-purple-400">💎</span>
            <span className="text-purple-400 font-bold">{resources.crystals.toLocaleString()}</span>
          </div>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          {lang === 'ru' ? 'Мгновенно открывают сундуки • 999💎 за любой' : 'Instantly open chests • 999💎 each'}
        </p>

        <div className="grid grid-cols-2 gap-2">
          {KEYS.map((key) => {
            const owned = getKeyCount(key.id);
            const canAfford = resources.crystals >= KEY_COST_CRYSTALS;

            return (
              <div
                key={key.id}
                className="flex flex-col items-center gap-2 p-3 bg-black/30 rounded-lg"
              >
                <span className="text-2xl">{key.icon}</span>
                <span className="text-xs font-bold text-white">{key.name}</span>
                <span className="text-[10px] text-gray-500">{lang === 'ru' ? 'Есть:' : 'Have:'} {owned}</span>
                <button
                  onClick={() => handleBuyKey(key.id, KEY_COST_CRYSTALS)}
                  disabled={!canAfford || buying === `key-${key.id}`}
                  className={`w-full px-2 py-1.5 rounded text-xs font-bold ${
                    canAfford
                      ? 'bg-purple-600 text-white hover:bg-purple-500'
                      : 'bg-gray-700 text-gray-500'
                  }`}
                >
                  {buying === `key-${key.id}` ? '...' : `💎 ${KEY_COST_CRYSTALS}`}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Enchant Charges Section */}
      <div className="bg-l2-panel rounded-lg p-4 mb-4">
        <h3 className="text-sm text-gray-400 mb-3">
          ⚡ {lang === 'ru' ? 'Заряды заточки' : 'Enchant Charges'}
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          {lang === 'ru' ? 'Для заточки предметов в Кузнице' : 'For enchanting items in Forge'}
        </p>

        <div className="flex items-center gap-3 p-3 bg-black/30 rounded-lg">
          <div className="w-10 h-10 rounded-lg bg-yellow-500/20 flex items-center justify-center">
            <span className="text-xl">⚡</span>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-white">{lang === 'ru' ? 'Заряд заточки' : 'Enchant Charge'}</span>
            </div>
            <p className="text-xs text-gray-500">{lang === 'ru' ? 'Есть:' : 'Have:'} {resources.enchantCharges}</p>
          </div>

          <button
            onClick={handleBuyEnchantCharge}
            disabled={resources.gold < ENCHANT_COST || buying === 'enchant'}
            className={`px-3 py-2 rounded-lg text-xs font-bold ${
              resources.gold >= ENCHANT_COST
                ? 'bg-l2-gold text-black hover:bg-l2-gold/80'
                : 'bg-gray-700 text-gray-500'
            }`}
          >
            {buying === 'enchant' ? '...' : `🪙 ${ENCHANT_COST}`}
          </button>
        </div>
      </div>

    </div>
  );
}
