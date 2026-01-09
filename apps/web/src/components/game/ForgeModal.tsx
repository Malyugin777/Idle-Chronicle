'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Hammer, Package, Check, AlertTriangle, RefreshCw, Trash2, Zap, Plus } from 'lucide-react';
import { getSocket } from '@/lib/socket';
import { detectLanguage, Language } from '@/lib/i18n';
import {
  InventoryItem,
  Rarity,
  PlayerResources,
  previewSalvage,
  getRestoreCost,
  getBrokenTimeRemaining,
  formatBrokenTimer,
  RARITY_COLORS,
  RARITY_BG_COLORS,
  RARITY_NAMES,
  ChestType,
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

type ForgeTab = 'salvage' | 'broken' | 'merge' | 'craft';

// Merge preview response from server
interface MergePreview {
  chance: number;
  valid: boolean;
  resultChest: ChestType | null;
}

// Merge result response from server
interface MergeResult {
  success: boolean;
  chestType?: ChestType;
  chance: number;
  roll: number;
  itemsConsumed: number;
  reason?: string;
}

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
  const [showSalvageConfirm, setShowSalvageConfirm] = useState(false);

  // Merge state
  const [mergeSlots, setMergeSlots] = useState<(InventoryItem | null)[]>([null, null, null, null, null]);
  const [mergeTargetRarity, setMergeTargetRarity] = useState<'COMMON' | 'UNCOMMON' | 'RARE'>('COMMON');
  const [mergePreview, setMergePreview] = useState<MergePreview>({ chance: 0, valid: false, resultChest: null });
  const [mergeResult, setMergeResult] = useState<MergeResult | null>(null);

  // Ether craft state
  const [etherState, setEtherState] = useState({ ether: 0, etherDust: 0, gold: 0 });
  const [craftBuying, setCraftBuying] = useState(false);

  // Timer update for broken items
  const [, setTimerTick] = useState(0);

  // ─────────────────────────────────────────────────────────
  // DATA LOADING
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;

    const socket = getSocket();
    socket.emit('forge:get');
    socket.emit('player:get'); // For ether data

    const handleForgeData = (data: ForgeState) => {
      setForgeState(data);
      setLoading(false);
    };

    const handleForgeError = (error: { message: string }) => {
      console.error('[Forge] Error:', error.message);
      setLoading(false);
    };

    // Merge handlers
    const handleMergePreview = (data: MergePreview) => {
      setMergePreview(data);
    };

    const handleMergeResult = (data: MergeResult) => {
      setMergeResult(data);
      setLoading(false);
      // Clear slots on result
      setMergeSlots([null, null, null, null, null]);
      setMergePreview({ chance: 0, valid: false, resultChest: null });
      // Refresh forge data
      socket.emit('forge:get');
    };

    const handleMergeError = (error: { message: string }) => {
      console.error('[Merge] Error:', error.message);
      setLoading(false);
    };

    // Ether craft handlers
    const handlePlayerData = (data: any) => {
      setEtherState({
        ether: data.ether ?? 0,
        etherDust: data.etherDust ?? 0,
        gold: Number(data.gold) ?? 0,
      });
    };

    const handleEtherCraftSuccess = (data: { ether: number; etherDust: number; gold: number }) => {
      setEtherState({
        ether: data.ether,
        etherDust: data.etherDust,
        gold: data.gold,
      });
      setCraftBuying(false);
    };

    const handleEtherCraftError = () => {
      setCraftBuying(false);
    };

    socket.on('forge:data', handleForgeData);
    socket.on('forge:error', handleForgeError);
    socket.on('merge:preview', handleMergePreview);
    socket.on('merge:result', handleMergeResult);
    socket.on('merge:error', handleMergeError);
    socket.on('player:data', handlePlayerData);
    socket.on('ether:craft:success', handleEtherCraftSuccess);
    socket.on('ether:craft:error', handleEtherCraftError);

    return () => {
      socket.off('forge:data', handleForgeData);
      socket.off('forge:error', handleForgeError);
      socket.off('merge:preview', handleMergePreview);
      socket.off('merge:result', handleMergeResult);
      socket.off('merge:error', handleMergeError);
      socket.off('player:data', handlePlayerData);
      socket.off('ether:craft:success', handleEtherCraftSuccess);
      socket.off('ether:craft:error', handleEtherCraftError);
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
    setShowSalvageConfirm(true);
  }, [selectedItems, loading]);

  const confirmSalvage = useCallback(() => {
    if (selectedItems.size === 0 || loading) return;
    setLoading(true);
    setShowSalvageConfirm(false);
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
  // ETHER CRAFT HANDLERS
  // ─────────────────────────────────────────────────────────

  const handleCraftEther = useCallback(() => {
    if (craftBuying) return;
    // Craft max possible (5 dust + 5 gold = 1 ether)
    const maxByDust = Math.floor(etherState.etherDust / 5);
    const maxByGold = Math.floor(etherState.gold / 5);
    const amount = Math.min(maxByDust, maxByGold);
    if (amount <= 0) return;
    setCraftBuying(true);
    getSocket().emit('ether:craft', { amount });
  }, [craftBuying, etherState.etherDust, etherState.gold]);

  // ─────────────────────────────────────────────────────────
  // MERGE HANDLERS
  // ─────────────────────────────────────────────────────────

  // Live preview when slots or target change
  useEffect(() => {
    const itemIds = mergeSlots.filter(Boolean).map(item => item!.id);
    if (itemIds.length === 0) {
      setMergePreview({ chance: 0, valid: false, resultChest: null });
      return;
    }
    const socket = getSocket();
    socket.emit('merge:preview', { itemIds, targetRarity: mergeTargetRarity });
  }, [mergeSlots, mergeTargetRarity]);

  const addItemToMergeSlot = useCallback((item: InventoryItem) => {
    // Check if item is already in slots
    if (mergeSlots.some(slot => slot?.id === item.id)) return;
    // Find first empty slot
    const emptyIndex = mergeSlots.findIndex(slot => slot === null);
    if (emptyIndex === -1) return; // All slots full
    const newSlots = [...mergeSlots];
    newSlots[emptyIndex] = item;
    setMergeSlots(newSlots);
  }, [mergeSlots]);

  const removeItemFromMergeSlot = useCallback((index: number) => {
    const newSlots = [...mergeSlots];
    newSlots[index] = null;
    setMergeSlots(newSlots);
  }, [mergeSlots]);

  const clearMergeSlots = useCallback(() => {
    setMergeSlots([null, null, null, null, null]);
    setMergePreview({ chance: 0, valid: false, resultChest: null });
  }, []);

  const handleMerge = useCallback(() => {
    if (loading) return;
    const itemIds = mergeSlots.filter(Boolean).map(item => item!.id);
    if (itemIds.length === 0) return;
    setLoading(true);
    const socket = getSocket();
    socket.emit('merge:attempt', { itemIds, targetRarity: mergeTargetRarity });
  }, [mergeSlots, mergeTargetRarity, loading]);

  const closeMergeResult = useCallback(() => {
    setMergeResult(null);
  }, []);

  // Get items eligible for merge (not in slots, not equipped, not broken)
  const mergeEligibleItems = forgeState.inventory.filter(item => {
    // Not already in a slot
    if (mergeSlots.some(slot => slot?.id === item.id)) return false;
    // Not broken (inventory should already filter these, but just in case)
    if (item.isBroken) return false;
    return true;
  });

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────

  if (!isOpen) return null;

  const canCraft = Math.floor(etherState.etherDust / 5) > 0 && Math.floor(etherState.gold / 5) > 0;

  const tabs: { id: ForgeTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'salvage', label: lang === 'ru' ? 'Разбор' : 'Salvage', icon: <Hammer size={16} /> },
    {
      id: 'broken',
      label: lang === 'ru' ? 'Сломано' : 'Broken',
      icon: <AlertTriangle size={16} />,
      badge: forgeState.brokenItems.length || undefined,
    },
    { id: 'merge', label: lang === 'ru' ? 'Слияние' : 'Merge', icon: <Zap size={16} /> },
    { id: 'craft', label: lang === 'ru' ? 'Крафт' : 'Craft', icon: <Plus size={16} /> },
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

          {activeTab === 'merge' && (
            <MergeTab
              inventory={mergeEligibleItems}
              slots={mergeSlots}
              targetRarity={mergeTargetRarity}
              setTargetRarity={setMergeTargetRarity}
              preview={mergePreview}
              addItem={addItemToMergeSlot}
              removeItem={removeItemFromMergeSlot}
              clearSlots={clearMergeSlots}
              onMerge={handleMerge}
              loading={loading}
              lang={lang}
            />
          )}

          {activeTab === 'craft' && (
            <div className="space-y-4">
              {/* Ether Craft Section */}
              <div className="bg-black/30 rounded-lg p-4">
                <h3 className="text-sm text-gray-400 mb-2">
                  {lang === 'ru' ? 'Крафт Эфира' : 'Ether Craft'}
                </h3>
                <p className="text-xs text-gray-500 mb-4">
                  {lang === 'ru'
                    ? 'Эфир удваивает урон за каждый удар в бою'
                    : 'Ether doubles damage per hit in combat'}
                </p>

                {/* Current resources */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                    <span className="text-2xl">✨</span>
                    <p className="text-cyan-400 font-bold">{etherState.ether}</p>
                    <p className="text-[10px] text-gray-500">{lang === 'ru' ? 'Эфир' : 'Ether'}</p>
                  </div>
                  <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                    <span className="text-2xl">🌫️</span>
                    <p className="text-purple-400 font-bold">{etherState.etherDust}</p>
                    <p className="text-[10px] text-gray-500">{lang === 'ru' ? 'Пыль' : 'Dust'}</p>
                  </div>
                  <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                    <span className="text-2xl">🪙</span>
                    <p className="text-amber-400 font-bold">{etherState.gold.toLocaleString()}</p>
                    <p className="text-[10px] text-gray-500">{lang === 'ru' ? 'Золото' : 'Gold'}</p>
                  </div>
                </div>

                {/* Craft formula */}
                <div className="bg-cyan-900/20 border border-cyan-500/30 rounded-lg p-3 mb-4">
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <span className="text-purple-400">5 🌫️</span>
                    <span className="text-gray-500">+</span>
                    <span className="text-amber-400">5 🪙</span>
                    <span className="text-gray-500">=</span>
                    <span className="text-cyan-400">1 ✨</span>
                  </div>
                  <p className="text-center text-[10px] text-gray-500 mt-1">
                    {lang === 'ru' ? 'Формула крафта' : 'Craft formula'}
                  </p>
                </div>

                {/* Max craftable preview */}
                {canCraft && (
                  <div className="bg-black/30 rounded-lg p-3 mb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 text-xs">
                        {lang === 'ru' ? 'Можно скрафтить:' : 'Can craft:'}
                      </span>
                      <span className="text-cyan-400 font-bold">
                        {Math.min(Math.floor(etherState.etherDust / 5), Math.floor(etherState.gold / 5))} ✨
                      </span>
                    </div>
                  </div>
                )}

                {/* Craft button */}
                <button
                  onClick={handleCraftEther}
                  disabled={!canCraft || craftBuying}
                  className={`w-full py-3 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 ${
                    canCraft && !craftBuying
                      ? 'bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white'
                      : 'bg-gray-700 text-gray-500'
                  }`}
                >
                  <Plus size={18} />
                  {craftBuying
                    ? '...'
                    : lang === 'ru'
                      ? 'Скрафтить максимум'
                      : 'Craft Maximum'}
                </button>
              </div>

              {/* Info */}
              <div className="text-xs text-gray-500 text-center">
                {lang === 'ru'
                  ? '💡 Эфирная пыль добывается при убийстве боссов'
                  : '💡 Ether Dust is obtained from boss kills'}
              </div>
            </div>
          )}
        </div>

        {/* Merge Result Modal */}
        {mergeResult && (
          <MergeResultModal
            result={mergeResult}
            onClose={closeMergeResult}
            lang={lang}
          />
        )}

        {/* Salvage Confirm Modal */}
        {showSalvageConfirm && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-4 z-10">
            <div className="bg-gradient-to-b from-gray-800 to-gray-900 rounded-xl p-5 max-w-sm w-full border border-red-500/50">
              <div className="text-center mb-4">
                <div className="text-4xl mb-2">⚠️</div>
                <h3 className="text-lg font-bold text-red-400">
                  {lang === 'ru' ? 'Подтвердите разбор' : 'Confirm Salvage'}
                </h3>
              </div>
              <div className="bg-black/30 rounded-lg p-4 mb-4">
                <p className="text-gray-400 text-sm mb-3">
                  {lang === 'ru'
                    ? `Вы разберёте ${selectedItems.size} предмет(ов)`
                    : `You will salvage ${selectedItems.size} item(s)`}
                </p>
                <div className="flex items-center justify-center gap-2 text-lg">
                  <span className="text-gray-400">{lang === 'ru' ? 'Получите:' : 'You get:'}</span>
                  <span className="text-cyan-400 font-bold">✨ +{salvagePreview.dustAmount}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowSalvageConfirm(false)}
                  className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300 font-bold"
                >
                  {lang === 'ru' ? 'Отмена' : 'Cancel'}
                </button>
                <button
                  onClick={confirmSalvage}
                  disabled={loading}
                  className="flex-1 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-white font-bold"
                >
                  {loading ? '...' : lang === 'ru' ? 'Разобрать' : 'Salvage'}
                </button>
              </div>
            </div>
          </div>
        )}
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
    <div className="space-y-4">
      {/* Urgent warning */}
      <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-3 animate-pulse">
        <p className="text-red-400 text-sm font-bold text-center">
          ⚠️ {lang === 'ru' ? 'ВОССТАНОВИТЕ ИЛИ ПОТЕРЯЕТЕ!' : 'RESTORE OR LOSE!'}
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
                ⏳ {formatBrokenTimer(timeRemaining)}
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

// ═══════════════════════════════════════════════════════════
// MERGE TAB (Слияние - probability-based fusion)
// ═══════════════════════════════════════════════════════════

interface MergeTabProps {
  inventory: InventoryItem[];
  slots: (InventoryItem | null)[];
  targetRarity: 'COMMON' | 'UNCOMMON' | 'RARE';
  setTargetRarity: (r: 'COMMON' | 'UNCOMMON' | 'RARE') => void;
  preview: MergePreview;
  addItem: (item: InventoryItem) => void;
  removeItem: (index: number) => void;
  clearSlots: () => void;
  onMerge: () => void;
  loading: boolean;
  lang: Language;
}

function MergeTab({
  inventory,
  slots,
  targetRarity,
  setTargetRarity,
  preview,
  addItem,
  removeItem,
  clearSlots,
  onMerge,
  loading,
  lang,
}: MergeTabProps) {
  const targetRarities: { key: 'COMMON' | 'UNCOMMON' | 'RARE'; label: { ru: string; en: string }; color: string }[] = [
    { key: 'COMMON', label: { ru: 'Common', en: 'Common' }, color: 'text-gray-400' },
    { key: 'UNCOMMON', label: { ru: 'Uncommon', en: 'Uncommon' }, color: 'text-green-400' },
    { key: 'RARE', label: { ru: 'Rare', en: 'Rare' }, color: 'text-blue-400' },
  ];

  const chestNames: Record<string, { ru: string; en: string; icon: string }> = {
    bronze: { ru: 'Bronze', en: 'Bronze', icon: '🥉' },
    silver: { ru: 'Silver', en: 'Silver', icon: '🥈' },
    gold: { ru: 'Gold', en: 'Gold', icon: '🥇' },
  };

  const filledSlots = slots.filter(Boolean).length;
  const resultChest = preview.resultChest ? chestNames[preview.resultChest] : null;

  return (
    <div className="space-y-4">
      {/* Description */}
      <p className="text-xs text-gray-400">
        {lang === 'ru'
          ? 'Сожгите предметы для шанса получить сундук. Чем выше редкость - тем больше шанс.'
          : 'Burn items for a chance to get a chest. Higher rarity = higher chance.'}
      </p>

      {/* Target Rarity Selector */}
      <div className="flex gap-2">
        {targetRarities.map(({ key, label, color }) => (
          <button
            key={key}
            onClick={() => setTargetRarity(key)}
            className={`flex-1 py-2 px-2 rounded-lg border-2 text-sm font-bold transition-colors ${
              targetRarity === key
                ? 'border-amber-400 bg-amber-500/20'
                : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
            } ${color}`}
          >
            {lang === 'ru' ? label.ru : label.en}
          </button>
        ))}
      </div>

      {/* Merge Slots (5 slots) */}
      <div className="flex gap-2 justify-center">
        {slots.map((item, index) => (
          <button
            key={index}
            onClick={() => item && removeItem(index)}
            className={`w-12 h-12 rounded-lg border-2 flex items-center justify-center text-xl transition-all ${
              item
                ? `${RARITY_BG_COLORS[item.rarity]} border-transparent hover:border-red-500`
                : 'border-dashed border-gray-600 bg-gray-800/30'
            }`}
          >
            {item ? (
              <>
                <span>{item.icon}</span>
                {item.enchantLevel > 0 && (
                  <span className="absolute -top-1 -right-1 text-[10px] bg-amber-500 text-black px-1 rounded font-bold">
                    +{item.enchantLevel}
                  </span>
                )}
              </>
            ) : (
              <Plus size={16} className="text-gray-600" />
            )}
          </button>
        ))}
      </div>

      {/* Preview */}
      <div className="bg-black/30 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-gray-400 text-sm">
            {filledSlots}/5 {lang === 'ru' ? 'предметов' : 'items'}
          </span>
          {resultChest && (
            <span className="text-amber-400 text-sm">
              {resultChest.icon} {lang === 'ru' ? resultChest.ru : resultChest.en} Chest
            </span>
          )}
        </div>

        {/* Chance bar */}
        <div className="relative h-4 bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`absolute left-0 top-0 h-full transition-all duration-300 ${
              preview.chance >= 75
                ? 'bg-green-500'
                : preview.chance >= 50
                  ? 'bg-yellow-500'
                  : preview.chance >= 25
                    ? 'bg-orange-500'
                    : 'bg-red-500'
            }`}
            style={{ width: `${preview.chance}%` }}
          />
          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">
            {preview.chance}%
          </span>
        </div>
      </div>

      {/* Item picker */}
      {inventory.length > 0 && filledSlots < 5 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">
              {lang === 'ru' ? 'Выберите предметы:' : 'Select items:'}
            </span>
            {filledSlots > 0 && (
              <button
                onClick={clearSlots}
                className="text-xs text-red-400 hover:text-red-300"
              >
                {lang === 'ru' ? 'Очистить' : 'Clear'}
              </button>
            )}
          </div>
          <div className="grid grid-cols-6 gap-1 max-h-32 overflow-y-auto">
            {inventory.map(item => (
              <button
                key={item.id}
                onClick={() => addItem(item)}
                className={`w-10 h-10 rounded border flex items-center justify-center text-lg ${RARITY_BG_COLORS[item.rarity]} hover:brightness-125`}
              >
                <span>{item.icon}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {inventory.length === 0 && (
        <div className="text-center text-gray-500 py-4">
          <Package size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">{lang === 'ru' ? 'Нет предметов для merge' : 'No items available'}</p>
        </div>
      )}

      {/* Merge button */}
      <button
        onClick={onMerge}
        disabled={filledSlots === 0 || loading}
        className={`w-full py-3 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 ${
          filledSlots > 0 && !loading
            ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white'
            : 'bg-gray-700 text-gray-500'
        }`}
      >
        <Zap size={18} />
        {loading
          ? '...'
          : lang === 'ru'
            ? `Merge (${preview.chance}%)`
            : `Merge (${preview.chance}%)`}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MERGE RESULT MODAL
// ═══════════════════════════════════════════════════════════

interface MergeResultModalProps {
  result: MergeResult;
  onClose: () => void;
  lang: Language;
}

function MergeResultModal({ result, onClose, lang }: MergeResultModalProps) {
  const chestNames: Record<string, { ru: string; en: string; icon: string }> = {
    WOODEN: { ru: 'Деревянный', en: 'Wooden', icon: '📦' },
    BRONZE: { ru: 'Бронзовый', en: 'Bronze', icon: '🥉' },
    SILVER: { ru: 'Серебряный', en: 'Silver', icon: '🥈' },
    GOLD: { ru: 'Золотой', en: 'Gold', icon: '🥇' },
  };

  const chest = result.chestType ? chestNames[result.chestType.toUpperCase()] : null;

  return (
    <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-4 z-10">
      <div className={`rounded-xl p-6 max-w-sm w-full border-2 ${
        result.success
          ? 'bg-gradient-to-b from-green-900/90 to-gray-900 border-green-500'
          : 'bg-gradient-to-b from-red-900/90 to-gray-900 border-red-500'
      }`}>
        {/* Result icon */}
        <div className="text-center mb-4">
          {result.success ? (
            <>
              <div className="text-6xl mb-2">{chest?.icon || '🎁'}</div>
              <h3 className="text-xl font-bold text-green-400">
                {lang === 'ru' ? 'Успех!' : 'Success!'}
              </h3>
            </>
          ) : (
            <>
              <div className="text-6xl mb-2">💥</div>
              <h3 className="text-xl font-bold text-red-400">
                {lang === 'ru' ? 'Провал!' : 'Failed!'}
              </h3>
            </>
          )}
        </div>

        {/* Details */}
        <div className="bg-black/30 rounded-lg p-3 mb-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">{lang === 'ru' ? 'Шанс:' : 'Chance:'}</span>
            <span className="text-white">{result.chance}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">{lang === 'ru' ? 'Бросок:' : 'Roll:'}</span>
            <span className={result.roll <= result.chance ? 'text-green-400' : 'text-red-400'}>
              {result.roll.toFixed(1)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">{lang === 'ru' ? 'Сожжено:' : 'Consumed:'}</span>
            <span className="text-white">{result.itemsConsumed} {lang === 'ru' ? 'предм.' : 'items'}</span>
          </div>
          {result.success && chest && (
            <div className="flex justify-between">
              <span className="text-gray-400">{lang === 'ru' ? 'Получен:' : 'Received:'}</span>
              <span className="text-amber-400">
                {chest.icon} {lang === 'ru' ? chest.ru : chest.en}
              </span>
            </div>
          )}
          {result.reason === 'no_slot' && (
            <div className="text-orange-400 text-xs mt-2">
              {lang === 'ru' ? '⚠️ Нет места для сундука!' : '⚠️ No chest slot available!'}
            </div>
          )}
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="w-full py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-bold"
        >
          {lang === 'ru' ? 'Закрыть' : 'Close'}
        </button>
      </div>
    </div>
  );
}
