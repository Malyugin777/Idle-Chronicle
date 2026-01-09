'use client';

import { useEffect, useState } from 'react';
import { getSocket } from '@/lib/socket';
import { Flame, Zap, Clover, Coins, Sparkles, Key } from 'lucide-react';
import { detectLanguage, useTranslation, Language } from '@/lib/i18n';

interface ShopState {
  gold: number;
  ether: number;
  potionHaste: number;
  potionAcumen: number;
  potionLuck: number;
  // Keys
  keyWooden: number;
  keyBronze: number;
  keySilver: number;
  keyGold: number;
  // Enchant
  enchantCharges: number;
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
    potionHaste: 0,
    potionAcumen: 0,
    potionLuck: 0,
    keyWooden: 0,
    keyBronze: 0,
    keySilver: 0,
    keyGold: 0,
    enchantCharges: 0,
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
        potionHaste: data.potionHaste || 0,
        potionAcumen: data.potionAcumen || 0,
        potionLuck: data.potionLuck || 0,
        keyWooden: data.keyWooden || 0,
        keyBronze: data.keyBronze || 0,
        keySilver: data.keySilver || 0,
        keyGold: data.keyGold || 0,
        enchantCharges: data.enchantCharges || 0,
      });
    };

    const handleShopSuccess = (data: any) => {
      setShopState(prev => ({ ...prev, ...data }));
      setBuying(null);
    };

    const handleShopError = () => {
      setBuying(null);
    };

    // Sync ether when used in combat (from PhaserGame taps)
    const handleTapResult = (data: { ether?: number }) => {
      if (data.ether !== undefined) {
        setShopState(prev => ({ ...prev, ether: data.ether! }));
      }
    };

    // Sync consumables when task rewards are claimed
    const handlePlayerState = (data: { ether?: number; potionHaste?: number; potionAcumen?: number; potionLuck?: number }) => {
      setShopState(prev => ({
        ...prev,
        ether: data.ether ?? prev.ether,
        potionHaste: data.potionHaste ?? prev.potionHaste,
        potionAcumen: data.potionAcumen ?? prev.potionAcumen,
        potionLuck: data.potionLuck ?? prev.potionLuck,
      }));
    };

    socket.on('player:data', updateShopState);
    socket.on('auth:success', updateShopState);
    socket.on('shop:success', handleShopSuccess);
    socket.on('shop:error', handleShopError);
    socket.on('tap:result', handleTapResult);
    socket.on('player:state', handlePlayerState);

    return () => {
      // IMPORTANT: Pass handler reference to only remove THIS component's listeners
      socket.off('player:data', updateShopState);
      socket.off('auth:success', updateShopState);
      socket.off('shop:success', handleShopSuccess);
      socket.off('shop:error', handleShopError);
      socket.off('tap:result', handleTapResult);
      socket.off('player:state', handlePlayerState);
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

  const etherCost = 200; // 200 gold per 100 ether
  const canAffordEther = shopState.gold >= etherCost;

  // Keys pricing (based on chest open time: 5min, 30min, 4h, 8h)
  const KEYS = [
    { id: 'wooden', name: lang === 'ru' ? 'Деревянный' : 'Wooden', icon: '🔑', cost: 500, color: 'amber' },
    { id: 'bronze', name: lang === 'ru' ? 'Бронзовый' : 'Bronze', icon: '🗝️', cost: 1000, color: 'orange' },
    { id: 'silver', name: lang === 'ru' ? 'Серебряный' : 'Silver', icon: '🔐', cost: 2000, color: 'gray' },
    { id: 'gold', name: lang === 'ru' ? 'Золотой' : 'Gold', icon: '🏆', cost: 4000, color: 'yellow' },
  ];

  const ENCHANT_COST = 3000;

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

      {/* Keys Section */}
      <div className="bg-l2-panel rounded-lg p-4 mb-4">
        <h3 className="text-sm text-gray-400 mb-3">
          <Key size={14} className="inline mr-1" />
          {lang === 'ru' ? 'Ключи' : 'Keys'}
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          {lang === 'ru' ? 'Мгновенно открывают сундуки' : 'Instantly open chests'}
        </p>

        <div className="grid grid-cols-2 gap-2">
          {KEYS.map((key) => {
            const ownedKey = `key${key.id.charAt(0).toUpperCase() + key.id.slice(1)}` as keyof ShopState;
            const owned = shopState[ownedKey] as number || 0;
            const canAfford = shopState.gold >= key.cost;

            return (
              <div
                key={key.id}
                className="flex flex-col items-center gap-2 p-3 bg-black/30 rounded-lg"
              >
                <span className="text-2xl">{key.icon}</span>
                <span className="text-xs font-bold text-white">{key.name}</span>
                <span className="text-[10px] text-gray-500">{lang === 'ru' ? 'Есть:' : 'Have:'} {owned}</span>
                <button
                  onClick={() => handleBuyKey(key.id, key.cost)}
                  disabled={!canAfford || buying === `key-${key.id}`}
                  className={`w-full px-2 py-1.5 rounded text-xs font-bold ${
                    canAfford
                      ? 'bg-l2-gold text-black hover:bg-l2-gold/80'
                      : 'bg-gray-700 text-gray-500'
                  }`}
                >
                  {buying === `key-${key.id}` ? '...' : `🪙 ${key.cost}`}
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
            <p className="text-xs text-gray-500">{lang === 'ru' ? 'Есть:' : 'Have:'} {shopState.enchantCharges}</p>
          </div>

          <button
            onClick={handleBuyEnchantCharge}
            disabled={shopState.gold < ENCHANT_COST || buying === 'enchant'}
            className={`px-3 py-2 rounded-lg text-xs font-bold ${
              shopState.gold >= ENCHANT_COST
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
