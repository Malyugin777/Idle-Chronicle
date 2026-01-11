'use client';

// ═══════════════════════════════════════════════════════════
// DEBUG OVERLAY - Dev-only diagnostics panel
// Toggle: Ctrl+Shift+D
// ═══════════════════════════════════════════════════════════

import { useEffect, useState, useCallback } from 'react';
import { useDebugStore, IS_DEBUG_ENABLED } from '@/stores/debugStore';
import { usePlayerStore } from '@/stores/playerStore';
import { forceResync, getListenerCounts } from '@/lib/socket';
import { APP_VERSION } from '../constants';

// Only render in development
if (!IS_DEBUG_ENABLED) {
  // eslint-disable-next-line react/display-name
  module.exports = { default: () => null };
}

export default function DebugOverlay() {
  const [isOpen, setIsOpen] = useState(false);
  const [listenerCounts, setListenerCounts] = useState<Record<string, number>>({});

  // Debug store
  const { isConnected, socketId, userId, events } = useDebugStore();

  // Player store
  const resources = usePlayerStore((state) => state.resources);
  const lastSync = usePlayerStore((state) => state.lastSync);
  const isLoaded = usePlayerStore((state) => state.isLoaded);

  // Toggle with Ctrl+Shift+D
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Update listener counts periodically when open
  useEffect(() => {
    if (!isOpen) return;
    const update = () => setListenerCounts(getListenerCounts());
    update();
    const interval = setInterval(update, 2000);
    return () => clearInterval(interval);
  }, [isOpen]);

  const handleResync = useCallback(() => {
    forceResync();
  }, []);

  const handleClear = useCallback(() => {
    useDebugStore.getState().clearEvents();
  }, []);

  if (!IS_DEBUG_ENABLED) return null;
  if (!isOpen) {
    // Small indicator in corner
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-2 right-2 z-[9999] bg-black/80 text-[10px] text-gray-400 px-2 py-1 rounded font-mono hover:bg-black"
        title="Debug Panel (Ctrl+Shift+D)"
      >
        🐛 {APP_VERSION}
      </button>
    );
  }

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
  };

  const timeSinceSync = lastSync ? Math.floor((Date.now() - lastSync) / 1000) : null;

  // Count listeners with issues (>1 = potential leak)
  const problematicListeners = Object.entries(listenerCounts).filter(([, count]) => count > 2);

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none">
      <div className="absolute top-2 right-2 w-[360px] max-h-[90vh] overflow-auto bg-black/95 border border-gray-700 rounded-lg shadow-xl pointer-events-auto font-mono text-[11px]">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 bg-gray-900">
          <span className="font-bold text-white">🐛 Debug Panel</span>
          <div className="flex items-center gap-2">
            <span className="text-gray-400">{APP_VERSION}</span>
            <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-white">✕</button>
          </div>
        </div>

        {/* Connection Status */}
        <div className="px-3 py-2 border-b border-gray-800">
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className={isConnected ? 'text-green-400' : 'text-red-400'}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div className="text-gray-500 text-[10px] space-y-0.5">
            <div>Socket: {socketId || 'none'}</div>
            <div>User: {userId || 'none'}</div>
            <div>Store: {isLoaded ? '✓ loaded' : '⏳ pending'} | Sync: {timeSinceSync !== null ? `${timeSinceSync}s ago` : 'never'}</div>
          </div>
        </div>

        {/* Resources Snapshot */}
        <div className="px-3 py-2 border-b border-gray-800">
          <div className="text-gray-400 mb-1">Resources (Zustand)</div>
          <div className="grid grid-cols-3 gap-x-2 gap-y-0.5 text-[10px]">
            <div className="text-amber-400">🪙 {resources.gold.toLocaleString()}</div>
            <div className="text-purple-400">💎 {resources.crystals}</div>
            <div className="text-yellow-400">🎟️ {resources.lotteryTickets}</div>
            <div className="text-cyan-400">✨ {resources.ether}</div>
            <div className="text-purple-300">🌫️ {resources.etherDust}</div>
            <div className="text-blue-400">⚡ {resources.enchantCharges}</div>
            <div className="text-yellow-500">🛡️ {resources.protectionCharges}</div>
            <div className="text-green-400">🧪H {resources.potionHaste}</div>
            <div className="text-red-400">🧪A {resources.potionAcumen}</div>
            <div className="text-green-500">🧪L {resources.potionLuck}</div>
            <div className="text-amber-600">🗝️W {resources.keyWooden}</div>
            <div className="text-orange-400">🔑B {resources.keyBronze}</div>
            <div className="text-gray-300">🔐S {resources.keySilver}</div>
            <div className="text-yellow-400">🔑G {resources.keyGold}</div>
            <div className="text-white">Lv {resources.level}</div>
            <div className="text-cyan-300">SP {resources.sp}</div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-3 py-2 border-b border-gray-800 flex gap-2">
          <button
            onClick={handleResync}
            className="flex-1 px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[10px] font-bold"
          >
            🔄 Force Resync
          </button>
          <button
            onClick={handleClear}
            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-[10px]"
          >
            Clear Log
          </button>
        </div>

        {/* Listener Counts (warnings only) */}
        {problematicListeners.length > 0 && (
          <div className="px-3 py-2 border-b border-gray-800 bg-red-900/30">
            <div className="text-red-400 text-[10px] font-bold mb-1">⚠️ Listener Leaks Detected</div>
            <div className="text-[10px] text-red-300 space-y-0.5">
              {problematicListeners.map(([event, count]) => (
                <div key={event}>{event}: {count} listeners</div>
              ))}
            </div>
          </div>
        )}

        {/* Event Log */}
        <div className="px-3 py-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-gray-400">Event Log</span>
            <span className="text-gray-600 text-[10px]">{events.length} events</span>
          </div>
          <div className="space-y-0.5 max-h-[200px] overflow-auto">
            {events.length === 0 ? (
              <div className="text-gray-600 text-[10px]">No events yet...</div>
            ) : (
              events.map((evt) => (
                <div
                  key={evt.id}
                  className={`text-[10px] ${evt.direction === 'in' ? 'text-green-400' : 'text-blue-400'}`}
                >
                  <span className="text-gray-600">{formatTime(evt.timestamp)}</span>
                  {' '}
                  <span className="text-gray-500">{evt.direction === 'in' ? '←' : '→'}</span>
                  {' '}
                  <span className="font-bold">{evt.event}</span>
                  {evt.payload && (
                    <span className="text-gray-500 ml-1">{evt.payload}</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer hint */}
        <div className="px-3 py-1 border-t border-gray-800 text-[9px] text-gray-600">
          Press Ctrl+Shift+D to toggle
        </div>
      </div>
    </div>
  );
}
