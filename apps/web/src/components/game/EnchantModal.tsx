'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Sparkles, AlertTriangle, RefreshCw, Trash2, Package, Check } from 'lucide-react';
import { getSocket } from '@/lib/socket';
import { detectLanguage, Language } from '@/lib/i18n';
import {
  InventoryItem,
  PlayerResources,
  getRestoreCost,
  getBrokenTimeRemaining,
  formatBrokenTimer,
  RARITY_COLORS,
  RARITY_BG_COLORS,
} from '@/lib/craftingSystem';
import {
  ENCHANT_CHANCES,
  ENCHANT_SAFE_LEVEL,
  ENCHANT_BONUS_PER_LEVEL,
  getEnchantChance,
  isInSafeZone,
  calculateEnchantBonus,
} from '@shared/data';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface EnchantModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface EnchantState {
  inventory: InventoryItem[];
  brokenItems: InventoryItem[];
  resources: PlayerResources;
}

type EnchantTab = 'enchant' | 'broken';

// Enchant result from server
interface EnchantResult {
  success: boolean;
  itemBroken: boolean;
  newEnchantLevel: number;
  itemName: string;
  itemIcon: string;
  brokenUntil?: string | null;
}

// ═══════════════════════════════════════════════════════════
// ENCHANT MODAL v2.0 - Risky/Emotional operations (Enchant + Broken)
// Uses shared enchant config from @shared/data/enchant.ts
// ═══════════════════════════════════════════════════════════

export default function EnchantModal({ isOpen, onClose }: EnchantModalProps) {
  const [lang] = useState<Language>(() => detectLanguage());
  const [activeTab, setActiveTab] = useState<EnchantTab>('enchant');
  const [enchantState, setEnchantState] = useState<EnchantState>({
    inventory: [],
    brokenItems: [],
    resources: { enchantDust: 0, enchantCharges: 0, protectionCharges: 0, premiumCrystals: 0, gold: 0 },
  });
  const [loading, setLoading] = useState(false);

  // Enchant state
  const [selectedEnchantItem, setSelectedEnchantItem] = useState<InventoryItem | null>(null);
  const [useSafe, setUseSafe] = useState(false); // Safe mode toggle
  const [enchantResult, setEnchantResult] = useState<EnchantResult | null>(null);
  const [enchanting, setEnchanting] = useState(false);

  // Timer update for broken items
  const [, setTimerTick] = useState(0);

  // ─────────────────────────────────────────────────────────
  // DATA LOADING
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;

    const socket = getSocket();
    socket.emit('forge:get');

    const handleForgeData = (data: EnchantState) => {
      setEnchantState(data);
      setLoading(false);
    };

    const handleForgeError = (error: { message: string }) => {
      console.error('[Enchant] Error:', error.message);
      setLoading(false);
    };

    // Enchant handlers
    const handleEnchantResult = (data: EnchantResult) => {
      setEnchantResult(data);
      setEnchanting(false);
      setSelectedEnchantItem(null);
      // Refresh forge data and equipment (so CharacterTab shows updated enchant)
      socket.emit('forge:get');
      socket.emit('equipment:get');
    };

    const handleEnchantError = () => {
      setEnchanting(false);
    };

    socket.on('forge:data', handleForgeData);
    socket.on('forge:error', handleForgeError);
    socket.on('enchant:result', handleEnchantResult);
    socket.on('enchant:error', handleEnchantError);

    return () => {
      socket.off('forge:data', handleForgeData);
      socket.off('forge:error', handleForgeError);
      socket.off('enchant:result', handleEnchantResult);
      socket.off('enchant:error', handleEnchantError);
    };
  }, [isOpen]);

  // Timer update every second for broken items
  useEffect(() => {
    if (!isOpen || enchantState.brokenItems.length === 0) return;
    const interval = setInterval(() => setTimerTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [isOpen, enchantState.brokenItems.length]);

  // ─────────────────────────────────────────────────────────
  // ENCHANT HANDLERS
  // ─────────────────────────────────────────────────────────

  const handleEnchant = useCallback(() => {
    if (!selectedEnchantItem || enchanting) return;
    setEnchanting(true);
    getSocket().emit('enchant:try', {
      itemId: selectedEnchantItem.id,
      useSafe,
    });
  }, [selectedEnchantItem, enchanting, useSafe]);

  const closeEnchantResult = useCallback(() => {
    setEnchantResult(null);
  }, []);

  // ─────────────────────────────────────────────────────────
  // BROKEN ITEM HANDLERS
  // ─────────────────────────────────────────────────────────

  const handleRestore = useCallback((itemId: string) => {
    if (loading) return;
    setLoading(true);
    const socket = getSocket();
    socket.emit('forge:restore', { itemId });
  }, [loading]);

  const handleAbandon = useCallback((itemId: string) => {
    if (loading) return;
    setLoading(true);
    const socket = getSocket();
    socket.emit('forge:abandon', { itemId });
  }, [loading]);

  // Get enchantable items (equipped items only, not broken)
  const enchantableItems = [
    ...Object.values(enchantState.inventory).filter(item => item && !item.isBroken),
  ];

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────

  if (!isOpen) return null;

  const tabs: { id: EnchantTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'enchant', label: lang === 'ru' ? 'Заточка' : 'Enchant', icon: <Sparkles size={16} /> },
    {
      id: 'broken',
      label: lang === 'ru' ? 'Сломано' : 'Broken',
      icon: <AlertTriangle size={16} />,
      badge: enchantState.brokenItems.length || undefined,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="bg-gradient-to-b from-gray-800 to-gray-900 rounded-xl w-full max-w-md max-h-[85vh] flex flex-col border border-purple-500/30">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Sparkles className="text-purple-400" size={24} />
            <h2 className="text-lg font-bold text-purple-400">
              {lang === 'ru' ? 'Заточка' : 'Enchant'}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-700 rounded-lg">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {/* Resources Bar - Simplified */}
        <div className="px-4 py-2 bg-black/30 flex flex-wrap gap-4 text-xs">
          <span className="flex items-center gap-1">
            <span>⚡</span>
            <span className="text-yellow-300 font-bold">{enchantState.resources.enchantCharges}</span>
            <span className="text-gray-500">{lang === 'ru' ? 'заряды' : 'charges'}</span>
          </span>
          <span className="flex items-center gap-1">
            <span>🛡️</span>
            <span className="text-blue-300 font-bold">{enchantState.resources.protectionCharges}</span>
            <span className="text-gray-500">{lang === 'ru' ? 'защита' : 'safe'}</span>
          </span>
          <span className="flex items-center gap-1 ml-auto">
            <span>💎</span>
            <span className="text-purple-300">{enchantState.resources.premiumCrystals}</span>
          </span>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 text-sm transition-colors relative ${
                activeTab === tab.id
                  ? 'bg-purple-500/20 text-purple-400 border-b-2 border-purple-400'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.badge && (
                <span className="absolute top-1 right-2 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'enchant' && (
            <div className="space-y-4">
              {/* Selected Item */}
              {selectedEnchantItem ? (
                <div className="bg-black/30 rounded-lg p-4">
                  <div className="flex items-center gap-4 mb-4">
                    <div className={`w-16 h-16 rounded-lg ${RARITY_BG_COLORS[selectedEnchantItem.rarity]} flex items-center justify-center text-3xl`}>
                      {selectedEnchantItem.icon}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`font-bold ${RARITY_COLORS[selectedEnchantItem.rarity]}`}>
                          {selectedEnchantItem.name}
                        </span>
                        {selectedEnchantItem.enchantLevel > 0 && (
                          <span className="text-amber-400 font-bold">+{selectedEnchantItem.enchantLevel}</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {lang === 'ru' ? 'Следующий уровень:' : 'Next level:'} +{(selectedEnchantItem.enchantLevel || 0) + 1}
                      </p>
                    </div>
                    <button
                      onClick={() => setSelectedEnchantItem(null)}
                      className="text-gray-400 hover:text-white"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  {/* Enchant info */}
                  {(() => {
                    const currentLevel = selectedEnchantItem.enchantLevel || 0;
                    const targetLevel = currentLevel + 1;
                    const inSafeZone = isInSafeZone(currentLevel);
                    const chance = Math.floor(getEnchantChance(targetLevel) * 100);
                    const hasCharges = enchantState.resources.enchantCharges > 0;
                    const hasProtection = enchantState.resources.protectionCharges > 0;

                    // Safe mode only matters outside safe zone
                    const effectiveSafe = !inSafeZone && useSafe;
                    const canEnchant = hasCharges && (!effectiveSafe || hasProtection);

                    // Calculate enchant bonus (based on item's base stats)
                    const basePAtk = selectedEnchantItem.baseStats?.pAtkFlat || 0;
                    const basePDef = selectedEnchantItem.baseStats?.pDefFlat || 0;
                    const hasPAtk = basePAtk > 0;
                    const hasPDef = basePDef > 0;

                    const currentBonusPAtk = calculateEnchantBonus(basePAtk, currentLevel);
                    const nextBonusPAtk = calculateEnchantBonus(basePAtk, targetLevel);
                    const currentBonusPDef = calculateEnchantBonus(basePDef, currentLevel);
                    const nextBonusPDef = calculateEnchantBonus(basePDef, targetLevel);

                    return (
                      <>
                        {/* Enchant bonus info */}
                        <div className="mb-3 p-2 bg-black/30 rounded-lg text-xs">
                          <div className="text-gray-400 mb-1">
                            {lang === 'ru' ? `Бонус заточки (+${Math.round(ENCHANT_BONUS_PER_LEVEL * 100)}% за ур.):` : `Enchant bonus (+${Math.round(ENCHANT_BONUS_PER_LEVEL * 100)}% per lvl):`}
                          </div>
                          {hasPAtk && (
                            <div className="flex justify-between">
                              <span className="text-gray-500">P.Atk:</span>
                              <span>
                                <span className="text-white">{basePAtk}</span>
                                {currentLevel > 0 && <span className="text-green-400"> +{currentBonusPAtk}</span>}
                                <span className="text-yellow-400 ml-2">→ +{nextBonusPAtk}</span>
                                <span className="text-green-400 text-[10px] ml-1">(+{nextBonusPAtk - currentBonusPAtk})</span>
                              </span>
                            </div>
                          )}
                          {hasPDef && (
                            <div className="flex justify-between">
                              <span className="text-gray-500">P.Def:</span>
                              <span>
                                <span className="text-white">{basePDef}</span>
                                {currentLevel > 0 && <span className="text-green-400"> +{currentBonusPDef}</span>}
                                <span className="text-yellow-400 ml-2">→ +{nextBonusPDef}</span>
                                <span className="text-green-400 text-[10px] ml-1">(+{nextBonusPDef - currentBonusPDef})</span>
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Chance bar */}
                        <div className="mb-3">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-gray-400">{lang === 'ru' ? 'Шанс успеха' : 'Success chance'}</span>
                            <span className={inSafeZone ? 'text-green-400' : chance >= 50 ? 'text-yellow-400' : 'text-red-400'}>
                              {chance}%
                            </span>
                          </div>
                          <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all ${inSafeZone ? 'bg-green-500' : chance >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                              style={{ width: `${chance}%` }}
                            />
                          </div>
                        </div>

                        {/* Mode toggle (only outside safe zone) */}
                        {!inSafeZone && (
                          <div className="mb-3">
                            <div className="flex rounded-lg overflow-hidden border border-gray-600">
                              <button
                                onClick={() => setUseSafe(false)}
                                className={`flex-1 py-2.5 px-3 text-xs font-bold transition-all ${
                                  !useSafe
                                    ? 'bg-red-600 text-white'
                                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                }`}
                              >
                                {lang === 'ru' ? 'Обычная' : 'Normal'}
                              </button>
                              <button
                                onClick={() => hasProtection && setUseSafe(true)}
                                disabled={!hasProtection}
                                className={`flex-1 py-2.5 px-3 text-xs font-bold transition-all ${
                                  useSafe
                                    ? 'bg-blue-600 text-white'
                                    : hasProtection
                                      ? 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                      : 'bg-gray-800 text-gray-600 cursor-not-allowed'
                                }`}
                              >
                                {lang === 'ru' ? 'Безопасная' : 'Safe'} 🛡️{enchantState.resources.protectionCharges}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Outcome text */}
                        <div className={`mb-3 p-2 rounded-lg text-center text-xs ${
                          inSafeZone
                            ? 'bg-green-900/30 border border-green-500/30'
                            : effectiveSafe
                              ? 'bg-blue-900/30 border border-blue-500/30'
                              : 'bg-red-900/30 border border-red-500/30'
                        }`}>
                          <span className={inSafeZone ? 'text-green-400' : effectiveSafe ? 'text-blue-400' : 'text-red-400'}>
                            {inSafeZone
                              ? (lang === 'ru' ? `✓ Безопасная зона (+0→+${ENCHANT_SAFE_LEVEL})` : `✓ Safe zone (+0→+${ENCHANT_SAFE_LEVEL})`)
                              : effectiveSafe
                                ? (lang === 'ru' ? '🛡️ При неудаче: предмет сохраняется' : '🛡️ On fail: item preserved')
                                : (lang === 'ru' ? '⚠️ При неудаче: предмет ЛОМАЕТСЯ' : '⚠️ On fail: item BREAKS')}
                          </span>
                        </div>

                        {/* Enchant button with cost */}
                        <button
                          onClick={handleEnchant}
                          disabled={!canEnchant || enchanting}
                          className={`w-full py-3 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 ${
                            canEnchant && !enchanting
                              ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white'
                              : 'bg-gray-700 text-gray-500'
                          }`}
                        >
                          <Sparkles size={18} />
                          {enchanting
                            ? '...'
                            : (lang === 'ru' ? 'Заточить' : 'Enchant')}
                          <span className="ml-1 text-sm opacity-80">
                            ⚡1{effectiveSafe && ' + 🛡️1'}
                          </span>
                        </button>
                      </>
                    );
                  })()}
                </div>
              ) : (
                <div className="text-center text-gray-500 py-4">
                  <Sparkles size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">{lang === 'ru' ? 'Выберите предмет для заточки' : 'Select an item to enchant'}</p>
                </div>
              )}

              {/* Item picker */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">
                    {lang === 'ru' ? 'Ваши предметы:' : 'Your items:'}
                  </span>
                  <span className="text-xs text-gray-500">
                    ⚡ {enchantState.resources.enchantCharges} | 🛡️ {enchantState.resources.protectionCharges}
                  </span>
                </div>
                {enchantableItems.length > 0 ? (
                  <div className="grid grid-cols-5 gap-2 max-h-40 overflow-y-auto">
                    {enchantableItems.map(item => (
                      <button
                        key={item.id}
                        onClick={() => setSelectedEnchantItem(item)}
                        className={`relative w-12 h-12 rounded-lg ${RARITY_BG_COLORS[item.rarity]} flex items-center justify-center text-xl transition-all ${
                          selectedEnchantItem?.id === item.id ? 'ring-2 ring-purple-400' : 'hover:brightness-125'
                        }`}
                      >
                        <span>{item.icon}</span>
                        {item.enchantLevel > 0 && (
                          <span className="absolute -top-1 -right-1 text-[10px] bg-amber-500 text-black px-1 rounded font-bold">
                            +{item.enchantLevel}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-gray-500">
                    <Package size={24} className="mx-auto mb-1 opacity-50" />
                    <p className="text-xs">{lang === 'ru' ? 'Нет предметов' : 'No items'}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'broken' && (
            <BrokenTab
              brokenItems={enchantState.brokenItems}
              crystals={enchantState.resources.premiumCrystals}
              onRestore={handleRestore}
              onAbandon={handleAbandon}
              loading={loading}
              lang={lang}
            />
          )}
        </div>

        {/* Enchant Result Modal */}
        {enchantResult && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-4 z-10">
            <div className={`rounded-xl p-6 max-w-sm w-full border-2 ${
              enchantResult.success
                ? 'bg-gradient-to-b from-green-900/90 to-gray-900 border-green-500'
                : enchantResult.itemBroken
                  ? 'bg-gradient-to-b from-red-900/90 to-gray-900 border-red-500'
                  : 'bg-gradient-to-b from-orange-900/90 to-gray-900 border-orange-500'
            }`}>
              {/* Result icon */}
              <div className="text-center mb-4">
                <div className="text-6xl mb-2">{enchantResult.itemIcon}</div>
                {enchantResult.success ? (
                  <h3 className="text-xl font-bold text-green-400">
                    +{enchantResult.newEnchantLevel} {lang === 'ru' ? 'Успех!' : 'Success!'}
                  </h3>
                ) : enchantResult.itemBroken ? (
                  <h3 className="text-xl font-bold text-red-400">
                    {lang === 'ru' ? 'Сломано!' : 'Broken!'}
                  </h3>
                ) : (
                  <h3 className="text-xl font-bold text-orange-400">
                    {lang === 'ru' ? 'Неудача' : 'Failed'}
                  </h3>
                )}
              </div>

              {/* Details */}
              <div className="bg-black/30 rounded-lg p-3 mb-4 text-center">
                <p className="text-gray-300">{enchantResult.itemName}</p>
                {enchantResult.itemBroken && (
                  <p className="text-red-400 text-sm mt-2">
                    {lang === 'ru'
                      ? 'Предмет можно восстановить во вкладке "Сломано"'
                      : 'Item can be restored in "Broken" tab'}
                  </p>
                )}
              </div>

              {/* Close button */}
              <button
                onClick={closeEnchantResult}
                className="w-full py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-bold"
              >
                {lang === 'ru' ? 'Закрыть' : 'Close'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// BROKEN TAB
// ═══════════════════════════════════════════════════════════

interface BrokenTabProps {
  brokenItems: InventoryItem[];
  crystals: number;
  onRestore: (itemId: string) => void;
  onAbandon: (itemId: string) => void;
  loading: boolean;
  lang: Language;
}

function BrokenTab({
  brokenItems,
  crystals,
  onRestore,
  onAbandon,
  loading,
  lang,
}: BrokenTabProps) {
  if (brokenItems.length === 0) {
    return (
      <div className="text-center text-gray-500 py-8">
        <Check size={48} className="mx-auto mb-2 opacity-50 text-green-500" />
        <p>{lang === 'ru' ? 'Нет сломанных предметов' : 'No broken items'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Urgent warning */}
      <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-3 animate-pulse">
        <p className="text-red-400 text-sm font-bold text-center">
          {lang === 'ru' ? 'ВОССТАНОВИТЕ ИЛИ ПОТЕРЯЕТЕ!' : 'RESTORE OR LOSE!'}
        </p>
      </div>

      {brokenItems.map(item => {
        const timeRemaining = getBrokenTimeRemaining(item.brokenUntil || null);
        const restoreCost = getRestoreCost(item.rarity, item.enchantOnBreak || 0);
        const canAfford = crystals >= restoreCost;
        const isUrgent = timeRemaining < 3600000; // Less than 1 hour

        return (
          <div
            key={item.id}
            className={`rounded-xl p-4 border-2 ${
              isUrgent
                ? 'bg-red-900/40 border-red-500 animate-pulse'
                : 'bg-red-900/20 border-red-500/30'
            }`}
          >
            {/* Large icon + name row */}
            <div className="flex items-center gap-4 mb-3">
              <div className={`relative w-16 h-16 rounded-xl ${RARITY_BG_COLORS[item.rarity]} flex items-center justify-center text-3xl opacity-70`}>
                <span>{item.icon}</span>
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl">
                  <span className="text-red-500 text-3xl">💔</span>
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className={`font-bold text-lg ${RARITY_COLORS[item.rarity]}`}>
                    {item.name}
                  </span>
                  {(item.enchantOnBreak || 0) > 0 && (
                    <span className="text-amber-400 font-bold">+{item.enchantOnBreak}</span>
                  )}
                </div>
                <p className="text-gray-500 text-xs mt-0.5">
                  {lang === 'ru' ? 'Сломан при заточке' : 'Broken during enchant'}
                </p>
              </div>
            </div>

            {/* BIG countdown timer */}
            <div className={`text-center py-3 rounded-lg mb-3 ${isUrgent ? 'bg-red-600/30' : 'bg-black/30'}`}>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">
                {lang === 'ru' ? 'Удаление через' : 'Deleted in'}
              </p>
              <p className={`text-2xl font-bold font-mono ${isUrgent ? 'text-red-400' : 'text-orange-400'}`}>
                {formatBrokenTimer(timeRemaining)}
              </p>
            </div>

            {/* Action buttons - Restore is PRIMARY */}
            <div className="flex gap-2">
              <button
                onClick={() => onRestore(item.id)}
                disabled={!canAfford || loading}
                className={`flex-1 py-3 rounded-lg font-bold flex items-center justify-center gap-2 text-sm transition-all ${
                  canAfford && !loading
                    ? 'bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white shadow-lg shadow-purple-900/30'
                    : 'bg-gray-700 text-gray-500'
                }`}
              >
                <RefreshCw size={16} />
                {lang === 'ru' ? 'Восстановить' : 'Restore'} 💎{restoreCost}
              </button>
              <button
                onClick={() => onAbandon(item.id)}
                disabled={loading}
                className="px-4 py-3 rounded-lg text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 flex items-center justify-center"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
