'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Hammer, Flame, Package, Check, AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import { getSocket } from '@/lib/socket';
import { detectLanguage, Language } from '@/lib/i18n';
import {
  InventoryItem,
  Rarity,
  PlayerResources,
  previewSalvage,
  getFusionRequirements,
  getItemsForFusion,
  canFuse,
  getMaxFusions,
  getRestoreCost,
  getBrokenTimeRemaining,
  formatBrokenTimer,
  RARITY_COLORS,
  RARITY_BG_COLORS,
  RARITY_NAMES,
} from '@/lib/craftingSystem';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface ForgeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ForgeState {
  inventory: InventoryItem[];
  brokenItems: InventoryItem[];
  resources: PlayerResources;
}

type ForgeTab = 'salvage' | 'broken' | 'fusion';

// ═══════════════════════════════════════════════════════════
// FORGE MODAL v1.2
// ═══════════════════════════════════════════════════════════

export default function ForgeModal({ isOpen, onClose }: ForgeModalProps) {
  const [lang] = useState<Language>(() => detectLanguage());
  const [activeTab, setActiveTab] = useState<ForgeTab>('salvage');
  const [forgeState, setForgeState] = useState<ForgeState>({
    inventory: [],
    brokenItems: [],
    resources: { enchantDust: 0, enchantCharges: 0, protectionCharges: 0, premiumCrystals: 0, gold: 0 },
  });
  const [loading, setLoading] = useState(false);

  // Salvage state
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  // Fusion state
  const [selectedFusionRarity, setSelectedFusionRarity] = useState<Rarity>('common');

  // Timer update for broken items
  const [, setTimerTick] = useState(0);

  // ─────────────────────────────────────────────────────────
  // DATA LOADING
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;

    const socket = getSocket();
    socket.emit('forge:get');

    const handleForgeData = (data: ForgeState) => {
      setForgeState(data);
      setLoading(false);
    };

    const handleForgeError = (error: { message: string }) => {
      console.error('[Forge] Error:', error.message);
      setLoading(false);
    };

    socket.on('forge:data', handleForgeData);
    socket.on('forge:error', handleForgeError);

    return () => {
      socket.off('forge:data', handleForgeData);
      socket.off('forge:error', handleForgeError);
    };
  }, [isOpen]);

  // Timer update every second for broken items
  useEffect(() => {
    if (!isOpen || forgeState.brokenItems.length === 0) return;
    const interval = setInterval(() => setTimerTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [isOpen, forgeState.brokenItems.length]);

  // ─────────────────────────────────────────────────────────
  // SALVAGE HANDLERS
  // ─────────────────────────────────────────────────────────

  const toggleItemSelection = useCallback((itemId: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  }, []);

  const selectAllItems = useCallback(() => {
    setSelectedItems(new Set(forgeState.inventory.map(item => item.id)));
  }, [forgeState.inventory]);

  const deselectAllItems = useCallback(() => {
    setSelectedItems(new Set());
  }, []);

  const handleSalvage = useCallback(() => {
    if (selectedItems.size === 0 || loading) return;
    setLoading(true);
    const socket = getSocket();
    socket.emit('forge:salvage', { itemIds: Array.from(selectedItems) });
    setSelectedItems(new Set());
  }, [selectedItems, loading]);

  // Preview salvage output (v1.2: only dust)
  const selectedItemsList = forgeState.inventory.filter(item => selectedItems.has(item.id));
  const salvagePreview = previewSalvage(selectedItemsList);

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

  // ─────────────────────────────────────────────────────────
  // FUSION HANDLERS
  // ─────────────────────────────────────────────────────────

  const handleFusion = useCallback(() => {
    if (loading) return;
    if (!canFuse(forgeState.inventory, selectedFusionRarity)) return;
    setLoading(true);
    const socket = getSocket();
    socket.emit('forge:fusion', { rarity: selectedFusionRarity });
  }, [forgeState.inventory, selectedFusionRarity, loading]);

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────

  if (!isOpen) return null;

  const tabs: { id: ForgeTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'salvage', label: lang === 'ru' ? 'Разбор' : 'Salvage', icon: <Hammer size={16} /> },
    {
      id: 'broken',
      label: lang === 'ru' ? 'Сломано' : 'Broken',
      icon: <AlertTriangle size={16} />,
      badge: forgeState.brokenItems.length || undefined,
    },
    { id: 'fusion', label: lang === 'ru' ? 'Слияние' : 'Fusion', icon: <Flame size={16} /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="bg-gradient-to-b from-gray-800 to-gray-900 rounded-xl w-full max-w-md max-h-[85vh] flex flex-col border border-amber-500/30">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Hammer className="text-amber-400" size={24} />
            <h2 className="text-lg font-bold text-amber-400">
              {lang === 'ru' ? 'Кузница' : 'Forge'}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-700 rounded-lg">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {/* Resources Bar v1.2 */}
        <div className="px-4 py-2 bg-black/30 flex flex-wrap gap-3 text-xs">
          <span className="flex items-center gap-1">
            <span>✨</span>
            <span className="text-cyan-300">{forgeState.resources.enchantDust}</span>
          </span>
          <span className="flex items-center gap-1">
            <span>⚡</span>
            <span className="text-yellow-300">{forgeState.resources.enchantCharges}</span>
          </span>
          <span className="flex items-center gap-1">
            <span>🛡️</span>
            <span className="text-blue-300">{forgeState.resources.protectionCharges}</span>
          </span>
          <span className="flex items-center gap-1">
            <span>💎</span>
            <span className="text-purple-300">{forgeState.resources.premiumCrystals}</span>
          </span>
          <span className="flex items-center gap-1 ml-auto">
            <span>🪙</span>
            <span className="text-amber-300">{forgeState.resources.gold.toLocaleString()}</span>
          </span>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2 px-3 flex items-center justify-center gap-1 text-sm transition-colors relative ${
                activeTab === tab.id
                  ? 'bg-amber-500/20 text-amber-400 border-b-2 border-amber-400'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.badge && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'salvage' && (
            <SalvageTab
              inventory={forgeState.inventory}
              selectedItems={selectedItems}
              toggleItem={toggleItemSelection}
              selectAll={selectAllItems}
              deselectAll={deselectAllItems}
              preview={salvagePreview}
              onSalvage={handleSalvage}
              loading={loading}
              lang={lang}
            />
          )}

          {activeTab === 'broken' && (
            <BrokenTab
              brokenItems={forgeState.brokenItems}
              crystals={forgeState.resources.premiumCrystals}
              onRestore={handleRestore}
              onAbandon={handleAbandon}
              loading={loading}
              lang={lang}
            />
          )}

          {activeTab === 'fusion' && (
            <FusionTab
              inventory={forgeState.inventory}
              selectedRarity={selectedFusionRarity}
              setSelectedRarity={setSelectedFusionRarity}
              onFusion={handleFusion}
              loading={loading}
              lang={lang}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SALVAGE TAB v1.2
// ═══════════════════════════════════════════════════════════

interface SalvageTabProps {
  inventory: InventoryItem[];
  selectedItems: Set<string>;
  toggleItem: (id: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  preview: { dustAmount: number; itemCount: number };
  onSalvage: () => void;
  loading: boolean;
  lang: Language;
}

function SalvageTab({
  inventory,
  selectedItems,
  toggleItem,
  selectAll,
  deselectAll,
  preview,
  onSalvage,
  loading,
  lang,
}: SalvageTabProps) {
  if (inventory.length === 0) {
    return (
      <div className="text-center text-gray-500 py-8">
        <Package size={48} className="mx-auto mb-2 opacity-50" />
        <p>{lang === 'ru' ? 'Инвентарь пуст' : 'Inventory is empty'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Selection controls */}
      <div className="flex gap-2">
        <button
          onClick={selectAll}
          className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
        >
          {lang === 'ru' ? 'Выбрать все' : 'Select All'}
        </button>
        <button
          onClick={deselectAll}
          className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
        >
          {lang === 'ru' ? 'Снять выбор' : 'Deselect'}
        </button>
        <span className="ml-auto text-xs text-gray-400">
          {selectedItems.size}/{inventory.length}
        </span>
      </div>

      {/* Item grid */}
      <div className="grid grid-cols-5 gap-2 max-h-48 overflow-y-auto">
        {inventory.map(item => (
          <button
            key={item.id}
            onClick={() => toggleItem(item.id)}
            className={`relative w-12 h-12 rounded-lg border-2 flex items-center justify-center text-xl transition-all ${
              selectedItems.has(item.id)
                ? 'border-amber-400 bg-amber-500/20'
                : `${RARITY_BG_COLORS[item.rarity]} border-transparent`
            }`}
          >
            <span>{item.icon}</span>
            {item.enchantLevel > 0 && (
              <span className="absolute -top-1 -right-1 text-[10px] bg-amber-500 text-black px-1 rounded font-bold">
                +{item.enchantLevel}
              </span>
            )}
            {selectedItems.has(item.id) && (
              <div className="absolute inset-0 flex items-center justify-center bg-amber-400/30 rounded-lg">
                <Check size={20} className="text-amber-400" />
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Preview v1.2: only dust */}
      {selectedItems.size > 0 && (
        <div className="bg-black/30 rounded-lg p-3">
          <p className="text-xs text-gray-400 mb-2">
            {lang === 'ru' ? 'Получите:' : 'You will receive:'}
          </p>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-cyan-300">✨ {preview.dustAmount}</span>
            <span className="text-gray-500">{lang === 'ru' ? 'Пыль заточки' : 'Enchant Dust'}</span>
          </div>
        </div>
      )}

      {/* Salvage button */}
      <button
        onClick={onSalvage}
        disabled={selectedItems.size === 0 || loading}
        className={`w-full py-3 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 ${
          selectedItems.size > 0 && !loading
            ? 'bg-red-600 hover:bg-red-500 text-white'
            : 'bg-gray-700 text-gray-500'
        }`}
      >
        <AlertTriangle size={18} />
        {loading ? '...' : lang === 'ru' ? `Разобрать (${selectedItems.size})` : `Salvage (${selectedItems.size})`}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// BROKEN TAB v1.2 (NEW)
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
    <div className="space-y-3">
      <p className="text-xs text-gray-400">
        {lang === 'ru'
          ? 'Восстановите за 💎 или предмет будет удалён'
          : 'Restore for 💎 or item will be deleted'}
      </p>

      {brokenItems.map(item => {
        const timeRemaining = getBrokenTimeRemaining(item.brokenUntil || null);
        const restoreCost = getRestoreCost(item.rarity, item.enchantOnBreak || 0);
        const canAfford = crystals >= restoreCost;

        return (
          <div
            key={item.id}
            className="bg-red-900/20 border border-red-500/30 rounded-lg p-3"
          >
            <div className="flex items-center gap-3">
              {/* Icon with crack overlay */}
              <div className={`relative w-12 h-12 rounded-lg ${RARITY_BG_COLORS[item.rarity]} flex items-center justify-center text-xl opacity-60`}>
                <span>{item.icon}</span>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-red-500 text-2xl">💔</span>
                </div>
              </div>

              {/* Info */}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${RARITY_COLORS[item.rarity]}`}>
                    {item.name}
                  </span>
                  {(item.enchantOnBreak || 0) > 0 && (
                    <span className="text-amber-400 text-sm">+{item.enchantOnBreak}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
                  <span className="text-red-400">⏳ {formatBrokenTimer(timeRemaining)}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => onRestore(item.id)}
                  disabled={!canAfford || loading}
                  className={`px-3 py-1 rounded text-xs font-bold flex items-center gap-1 ${
                    canAfford && !loading
                      ? 'bg-purple-600 hover:bg-purple-500 text-white'
                      : 'bg-gray-700 text-gray-500'
                  }`}
                >
                  <RefreshCw size={12} />
                  💎{restoreCost}
                </button>
                <button
                  onClick={() => onAbandon(item.id)}
                  disabled={loading}
                  className="px-3 py-1 rounded text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 flex items-center gap-1"
                >
                  <Trash2 size={12} />
                  {lang === 'ru' ? 'Удалить' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// FUSION TAB
// ═══════════════════════════════════════════════════════════

interface FusionTabProps {
  inventory: InventoryItem[];
  selectedRarity: Rarity;
  setSelectedRarity: (r: Rarity) => void;
  onFusion: () => void;
  loading: boolean;
  lang: Language;
}

function FusionTab({
  inventory,
  selectedRarity,
  setSelectedRarity,
  onFusion,
  loading,
  lang,
}: FusionTabProps) {
  const rarities: Rarity[] = ['common', 'uncommon', 'rare'];

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">
        {lang === 'ru'
          ? 'Объедините предметы одной редкости в сундук следующего уровня'
          : 'Combine items of same rarity into a higher tier chest'}
      </p>

      {/* Rarity selector */}
      <div className="flex gap-2">
        {rarities.map(rarity => {
          const req = getFusionRequirements(rarity);
          const items = getItemsForFusion(inventory, rarity);
          const maxFusions = getMaxFusions(inventory, rarity);

          return (
            <button
              key={rarity}
              onClick={() => setSelectedRarity(rarity)}
              className={`flex-1 p-3 rounded-lg border-2 transition-colors ${
                selectedRarity === rarity
                  ? 'border-amber-400 bg-amber-500/20'
                  : `${RARITY_BG_COLORS[rarity]} border-transparent`
              }`}
            >
              <div className={`text-sm font-bold ${RARITY_COLORS[rarity]}`}>
                {lang === 'ru' ? RARITY_NAMES[rarity].ru : RARITY_NAMES[rarity].en}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {items.length}/{req?.count || 0}
              </div>
              {maxFusions > 0 && (
                <div className="text-xs text-amber-400 mt-1">
                  x{maxFusions}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Fusion info */}
      {(() => {
        const req = getFusionRequirements(selectedRarity);
        const items = getItemsForFusion(inventory, selectedRarity);

        if (!req) return null;

        const chestNames: Record<string, { ru: string; en: string }> = {
          bronze: { ru: 'Бронзовый сундук', en: 'Bronze Chest' },
          silver: { ru: 'Серебряный сундук', en: 'Silver Chest' },
          gold: { ru: 'Золотой сундук', en: 'Gold Chest' },
        };

        return (
          <div className="bg-black/30 rounded-lg p-4">
            <div className="text-center">
              <div className="text-gray-400 text-sm mb-2">
                {req.count}x {lang === 'ru' ? RARITY_NAMES[selectedRarity].ru : RARITY_NAMES[selectedRarity].en}
              </div>
              <div className="text-2xl mb-2">⬇️</div>
              <div className="text-amber-400 font-bold">
                {lang === 'ru' ? chestNames[req.resultChest].ru : chestNames[req.resultChest].en}
              </div>
            </div>

            {/* Items preview */}
            {items.length > 0 && (
              <div className="mt-4 grid grid-cols-5 gap-1">
                {items.slice(0, req.count).map((item) => (
                  <div
                    key={item.id}
                    className={`w-10 h-10 rounded border flex items-center justify-center text-lg ${RARITY_BG_COLORS[item.rarity]}`}
                  >
                    {item.icon}
                  </div>
                ))}
                {Array.from({ length: Math.max(0, req.count - items.length) }).map((_, i) => (
                  <div
                    key={`empty-${i}`}
                    className="w-10 h-10 rounded border bg-gray-800 border-gray-700 flex items-center justify-center text-gray-600"
                  >
                    ?
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Fusion button */}
      <button
        onClick={onFusion}
        disabled={!canFuse(inventory, selectedRarity) || loading}
        className={`w-full py-3 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 ${
          canFuse(inventory, selectedRarity) && !loading
            ? 'bg-purple-600 hover:bg-purple-500 text-white'
            : 'bg-gray-700 text-gray-500'
        }`}
      >
        <Flame size={18} />
        {loading ? '...' : lang === 'ru' ? 'Объединить' : 'Fuse'}
      </button>
    </div>
  );
}
