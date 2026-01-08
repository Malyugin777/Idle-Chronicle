'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Sparkles, Shield, AlertTriangle, Zap } from 'lucide-react';
import { getSocket } from '@/lib/socket';
import { detectLanguage, Language } from '@/lib/i18n';
import {
  InventoryItem,
  getEnchantableItems,
  getEnchantChance,
  getEnchantCost,
  getEnchantMultiplier,
  isSafeEnchant,
  applyEnchantToStats,
  MAX_ENCHANT_LEVEL,
  RARITY_COLORS,
  RARITY_BG_COLORS,
  RARITY_NAMES,
} from '@/lib/craftingSystem';

// ═══════════════════════════════════════════════════════════
// TYPES v1.2
// ═══════════════════════════════════════════════════════════

interface EnchantModalProps {
  isOpen: boolean;
  onClose: () => void;
  inventory: InventoryItem[];
  enchantCharges: number;      // v1.2: charges instead of scrolls
  protectionCharges: number;   // v1.2: charges instead of scrolls
  gold: number;
  enchantDust: number;
}

type EnchantStep = 'select' | 'enchant' | 'result';

interface EnchantResultData {
  success: boolean;
  itemBroken: boolean;        // v1.2: broken instead of destroyed
  newEnchantLevel: number;
  itemName: string;
  itemIcon: string;
  brokenUntil?: string | null;
}

// ═══════════════════════════════════════════════════════════
// ENCHANT MODAL v1.2
// ═══════════════════════════════════════════════════════════

export default function EnchantModal({
  isOpen,
  onClose,
  inventory,
  enchantCharges,
  protectionCharges,
  gold,
  enchantDust,
}: EnchantModalProps) {
  const [lang] = useState<Language>(() => detectLanguage());
  const [step, setStep] = useState<EnchantStep>('select');
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [useProtection, setUseProtection] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EnchantResultData | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('select');
      setSelectedItem(null);
      setUseProtection(false);
      setResult(null);
    }
  }, [isOpen]);

  // Socket listeners
  useEffect(() => {
    if (!isOpen) return;

    const socket = getSocket();

    const handleEnchantResult = (data: EnchantResultData) => {
      setResult(data);
      setStep('result');
      setLoading(false);
    };

    const handleEnchantError = (error: { message: string }) => {
      console.error('[Enchant] Error:', error.message);
      setLoading(false);
    };

    socket.on('enchant:result', handleEnchantResult);
    socket.on('enchant:error', handleEnchantError);

    return () => {
      socket.off('enchant:result', handleEnchantResult);
      socket.off('enchant:error', handleEnchantError);
    };
  }, [isOpen]);

  // v1.2: Get all enchantable items (any slot)
  const validItems = getEnchantableItems(inventory);

  // ─────────────────────────────────────────────────────────
  // HANDLERS
  // ─────────────────────────────────────────────────────────

  const handleSelectItem = useCallback((item: InventoryItem) => {
    setSelectedItem(item);
    setStep('enchant');
    setUseProtection(false);
  }, []);

  const handleEnchant = useCallback(() => {
    if (!selectedItem || loading) return;

    const cost = getEnchantCost(selectedItem.enchantLevel);
    if (gold < cost.gold || enchantDust < cost.dust) return;
    if (enchantCharges < 1) return;

    setLoading(true);
    const socket = getSocket();
    // v1.2: no scrollType needed, just itemId and useProtection
    socket.emit('enchant:try', {
      itemId: selectedItem.id,
      useProtection,
    });
  }, [selectedItem, useProtection, gold, enchantDust, enchantCharges, loading]);

  const handleBack = useCallback(() => {
    if (step === 'enchant') {
      setStep('select');
      setSelectedItem(null);
    } else if (step === 'result') {
      setStep('select');
      setSelectedItem(null);
      setResult(null);
    }
  }, [step]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="bg-gradient-to-b from-gray-800 to-gray-900 rounded-xl w-full max-w-md max-h-[80vh] flex flex-col border border-cyan-500/30">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Sparkles className="text-cyan-400" size={24} />
            <h2 className="text-lg font-bold text-cyan-400">
              {lang === 'ru' ? 'Заточка' : 'Enchant'}
            </h2>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-gray-700 rounded-lg">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {/* Resources bar v1.2 */}
        <div className="px-4 py-2 bg-black/30 flex gap-4 text-xs">
          <span className="flex items-center gap-1">
            <span>⚡</span>
            <span className={enchantCharges > 0 ? 'text-yellow-300' : 'text-red-400'}>
              {enchantCharges}
            </span>
          </span>
          <span className="flex items-center gap-1">
            <span>🛡️</span>
            <span className="text-blue-300">{protectionCharges}</span>
          </span>
          <span className="flex items-center gap-1">
            <span>✨</span>
            <span className="text-cyan-300">{enchantDust}</span>
          </span>
          <span className="flex items-center gap-1 ml-auto">
            <span>🪙</span>
            <span className="text-amber-300">{gold.toLocaleString()}</span>
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {step === 'select' && (
            <ItemSelectStep
              items={validItems}
              onSelect={handleSelectItem}
              lang={lang}
            />
          )}

          {step === 'enchant' && selectedItem && (
            <EnchantStep
              item={selectedItem}
              useProtection={useProtection}
              setUseProtection={setUseProtection}
              enchantCharges={enchantCharges}
              protectionCharges={protectionCharges}
              gold={gold}
              enchantDust={enchantDust}
              onEnchant={handleEnchant}
              onBack={handleBack}
              loading={loading}
              lang={lang}
            />
          )}

          {step === 'result' && result && (
            <ResultStep
              result={result}
              onContinue={handleBack}
              onClose={handleClose}
              lang={lang}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// STEP 1: ITEM SELECT v1.2
// ═══════════════════════════════════════════════════════════

interface ItemSelectStepProps {
  items: InventoryItem[];
  onSelect: (item: InventoryItem) => void;
  lang: Language;
}

function ItemSelectStep({ items, onSelect, lang }: ItemSelectStepProps) {
  if (items.length === 0) {
    return (
      <div className="text-center text-gray-500 py-8">
        <Sparkles size={48} className="mx-auto mb-2 opacity-50" />
        <p>{lang === 'ru' ? 'Нет предметов для заточки' : 'No items to enchant'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-400">
        {lang === 'ru' ? 'Выберите предмет для заточки:' : 'Select an item to enchant:'}
      </p>

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {items.map(item => (
          <button
            key={item.id}
            onClick={() => onSelect(item)}
            className={`w-full p-3 rounded-lg border ${RARITY_BG_COLORS[item.rarity]} hover:bg-white/5 transition-colors flex items-center gap-3`}
          >
            <div className="w-12 h-12 rounded-lg bg-black/30 flex items-center justify-center text-2xl relative">
              <span>{item.icon}</span>
              {item.enchantLevel > 0 && (
                <span className="absolute -top-1 -right-1 text-xs bg-cyan-500 text-black px-1 rounded font-bold">
                  +{item.enchantLevel}
                </span>
              )}
            </div>
            <div className="flex-1 text-left">
              <div className={`font-medium ${RARITY_COLORS[item.rarity]}`}>
                {item.enchantLevel > 0 ? `+${item.enchantLevel} ` : ''}{item.name}
              </div>
              <div className="text-xs text-gray-500">
                {lang === 'ru' ? RARITY_NAMES[item.rarity].ru : RARITY_NAMES[item.rarity].en}
              </div>
            </div>
            <div className="text-gray-400">
              <Sparkles size={20} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// STEP 2: ENCHANT SCREEN v1.2
// ═══════════════════════════════════════════════════════════

interface EnchantStepProps {
  item: InventoryItem;
  useProtection: boolean;
  setUseProtection: (v: boolean) => void;
  enchantCharges: number;
  protectionCharges: number;
  gold: number;
  enchantDust: number;
  onEnchant: () => void;
  onBack: () => void;
  loading: boolean;
  lang: Language;
}

function EnchantStep({
  item,
  useProtection,
  setUseProtection,
  enchantCharges,
  protectionCharges,
  gold,
  enchantDust,
  onEnchant,
  onBack,
  loading,
  lang,
}: EnchantStepProps) {
  const chance = getEnchantChance(item.enchantLevel);
  const cost = getEnchantCost(item.enchantLevel);
  const isSafe = isSafeEnchant(item.enchantLevel);
  const currentMult = getEnchantMultiplier(item.enchantLevel);
  const nextMult = getEnchantMultiplier(item.enchantLevel + 1);
  const canAfford = gold >= cost.gold && enchantDust >= cost.dust && enchantCharges >= 1;
  const atMaxLevel = item.enchantLevel >= MAX_ENCHANT_LEVEL;

  // Current and next stats
  const currentStats = applyEnchantToStats(item.baseStats, item.enchantLevel);
  const nextStats = applyEnchantToStats(item.baseStats, item.enchantLevel + 1);

  return (
    <div className="space-y-4">
      {/* Back button */}
      <button
        onClick={onBack}
        className="text-sm text-gray-400 hover:text-gray-300 flex items-center gap-1"
      >
        ← {lang === 'ru' ? 'Назад' : 'Back'}
      </button>

      {/* Item display */}
      <div className={`p-4 rounded-lg ${RARITY_BG_COLORS[item.rarity]} text-center`}>
        <div className="text-4xl mb-2">{item.icon}</div>
        <div className={`font-bold text-lg ${RARITY_COLORS[item.rarity]}`}>
          {item.enchantLevel > 0 ? `+${item.enchantLevel} ` : ''}{item.name}
        </div>
        <div className="text-sm text-gray-400 mt-1">
          {lang === 'ru' ? 'Текущий бонус:' : 'Current bonus:'} +{((currentMult - 1) * 100).toFixed(0)}%
        </div>
      </div>

      {/* Enchant info */}
      {atMaxLevel ? (
        <div className="bg-amber-500/20 border border-amber-500/30 rounded-lg p-3 text-center">
          <p className="text-amber-400">
            {lang === 'ru' ? 'Максимальный уровень!' : 'Maximum level!'}
          </p>
        </div>
      ) : (
        <>
          {/* Target level */}
          <div className="bg-black/30 rounded-lg p-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">
                +{item.enchantLevel} → +{item.enchantLevel + 1}
              </span>
              <span className="text-cyan-400 font-bold">
                +{((nextMult - 1) * 100).toFixed(0)}%
              </span>
            </div>

            {/* Stats preview */}
            <div className="mt-2 text-xs space-y-1">
              {currentStats.pAtkFlat && (
                <div className="flex justify-between">
                  <span className="text-gray-500">P.Atk</span>
                  <span>
                    <span className="text-gray-400">{currentStats.pAtkFlat}</span>
                    <span className="text-green-400"> → {nextStats.pAtkFlat}</span>
                  </span>
                </div>
              )}
              {currentStats.pDefFlat && (
                <div className="flex justify-between">
                  <span className="text-gray-500">P.Def</span>
                  <span>
                    <span className="text-gray-400">{currentStats.pDefFlat}</span>
                    <span className="text-green-400"> → {nextStats.pDefFlat}</span>
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Success chance */}
          <div className={`rounded-lg p-3 ${isSafe ? 'bg-green-500/20 border border-green-500/30' : 'bg-red-500/20 border border-red-500/30'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isSafe ? (
                  <Shield className="text-green-400" size={20} />
                ) : (
                  <AlertTriangle className="text-red-400" size={20} />
                )}
                <span className={isSafe ? 'text-green-400' : 'text-red-400'}>
                  {lang === 'ru' ? 'Шанс:' : 'Chance:'}
                </span>
              </div>
              <span className={`font-bold text-lg ${isSafe ? 'text-green-400' : 'text-white'}`}>
                {(chance * 100).toFixed(0)}%
              </span>
            </div>
            {isSafe && (
              <p className="text-xs text-green-400/70 mt-1">
                {lang === 'ru' ? 'Безопасная заточка' : 'Safe enchant'}
              </p>
            )}
            {!isSafe && !useProtection && (
              <p className="text-xs text-red-400/70 mt-1">
                {lang === 'ru' ? '⚠️ При провале предмет сломается!' : '⚠️ Item will break on failure!'}
              </p>
            )}
          </div>

          {/* Protection toggle (only for risky enchant) */}
          {!isSafe && (
            <div className="bg-purple-500/20 border border-purple-500/30 rounded-lg p-3">
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2">
                  <Shield className="text-purple-400" size={20} />
                  <div>
                    <div className="text-purple-400 font-medium">
                      {lang === 'ru' ? 'Защита' : 'Protection'} 🛡️
                    </div>
                    <div className="text-xs text-gray-400">
                      {lang === 'ru' ? `Есть: ${protectionCharges}` : `Owned: ${protectionCharges}`}
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={useProtection}
                  onChange={(e) => setUseProtection(e.target.checked)}
                  disabled={protectionCharges === 0}
                  className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-purple-500 focus:ring-purple-500"
                />
              </label>
              {useProtection && (
                <p className="text-xs text-purple-400/70 mt-2">
                  {lang === 'ru' ? 'При провале: -1 уровень, не ломается' : 'On fail: -1 level, no break'}
                </p>
              )}
            </div>
          )}

          {/* Cost v1.2 */}
          <div className="bg-black/30 rounded-lg p-3">
            <div className="text-xs text-gray-400 mb-2">
              {lang === 'ru' ? 'Стоимость:' : 'Cost:'}
            </div>
            <div className="flex gap-4">
              <span className={enchantCharges >= 1 ? 'text-yellow-300' : 'text-red-400'}>
                ⚡ 1
              </span>
              <span className={gold >= cost.gold ? 'text-amber-300' : 'text-red-400'}>
                🪙 {cost.gold}
              </span>
              <span className={enchantDust >= cost.dust ? 'text-cyan-300' : 'text-red-400'}>
                ✨ {cost.dust}
              </span>
            </div>
          </div>

          {/* Enchant button */}
          <button
            onClick={onEnchant}
            disabled={!canAfford || loading}
            className={`w-full py-3 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 ${
              canAfford && !loading
                ? 'bg-cyan-600 hover:bg-cyan-500 text-white'
                : 'bg-gray-700 text-gray-500'
            }`}
          >
            <Zap size={20} />
            {loading ? '...' : lang === 'ru' ? 'Заточить!' : 'Enchant!'}
          </button>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// STEP 3: RESULT v1.2
// ═══════════════════════════════════════════════════════════

interface ResultStepProps {
  result: EnchantResultData;
  onContinue: () => void;
  onClose: () => void;
  lang: Language;
}

function ResultStep({ result, onContinue, onClose, lang }: ResultStepProps) {
  return (
    <div className="text-center space-y-4">
      {result.success ? (
        <>
          <div className="text-6xl animate-bounce">✨</div>
          <div className="text-2xl font-bold text-green-400">
            {lang === 'ru' ? 'Успех!' : 'Success!'}
          </div>
          <div className="text-lg">
            <span className="text-3xl">{result.itemIcon}</span>
            <div className="text-cyan-400 font-bold mt-2">
              +{result.newEnchantLevel} {result.itemName}
            </div>
          </div>
        </>
      ) : result.itemBroken ? (
        // v1.2: Item BROKEN (not destroyed)
        <>
          <div className="text-6xl animate-pulse">💔</div>
          <div className="text-2xl font-bold text-red-400">
            {lang === 'ru' ? 'Сломано!' : 'Broken!'}
          </div>
          <div className="text-lg">
            <span className="text-3xl opacity-50">{result.itemIcon}</span>
            <div className="text-red-400 mt-2">
              {result.itemName}
            </div>
            <div className="text-xs text-gray-400 mt-2 bg-red-900/30 p-2 rounded">
              {lang === 'ru'
                ? '⏳ Восстановите за 💎 в Кузнице или предмет удалится через 8 часов'
                : '⏳ Restore for 💎 in Forge or item will be deleted in 8 hours'}
            </div>
          </div>
        </>
      ) : (
        // Protected fail
        <>
          <div className="text-6xl">😓</div>
          <div className="text-2xl font-bold text-yellow-400">
            {lang === 'ru' ? 'Защита сработала!' : 'Protected!'}
          </div>
          <div className="text-lg">
            <span className="text-3xl">{result.itemIcon}</span>
            <div className="text-yellow-400 mt-2">
              +{result.newEnchantLevel} {result.itemName}
              <div className="text-xs text-gray-400">
                {lang === 'ru' ? '(уровень понижен)' : '(level decreased)'}
              </div>
            </div>
          </div>
        </>
      )}

      <div className="flex gap-3 mt-6">
        {!result.itemBroken && (
          <button
            onClick={onContinue}
            className="flex-1 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-bold"
          >
            {lang === 'ru' ? 'Ещё раз' : 'Try Again'}
          </button>
        )}
        <button
          onClick={onClose}
          className={`${result.itemBroken ? 'w-full' : 'flex-1'} py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold`}
        >
          {lang === 'ru' ? 'Закрыть' : 'Close'}
        </button>
      </div>
    </div>
  );
}
