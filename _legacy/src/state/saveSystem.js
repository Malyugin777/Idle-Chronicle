'use strict';

/**
 * Save System - localStorage persistence
 * Compatible with Pocket Chronicles saveSystem.js
 */

const SAVE_KEY = 'idleChroniclesSave';

/**
 * Save game to localStorage
 */
function saveGame() {
    try {
        const saveData = {
            version: SAVE_VERSION,
            timestamp: Date.now(),
            state: {
                gold: window.clickerState.gold,
                crystals: window.clickerState.crystals,
                clickCount: window.clickerState.clickCount,
                totalGoldEarned: window.clickerState.totalGoldEarned,
                upgrades: { ...window.clickerState.upgrades },
                lastSaveTime: Date.now()
            }
        };

        localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
        window.clickerState.lastSaveTime = Date.now();
        console.log('[Save] Game saved, gold:', Math.floor(window.clickerState.gold));
        return true;
    } catch (e) {
        console.error('[Save] Failed to save:', e);
        return false;
    }
}

/**
 * Load game from localStorage
 */
function loadGame() {
    try {
        const saved = localStorage.getItem(SAVE_KEY);
        if (!saved) {
            console.log('[Save] No save found, starting fresh');
            return false;
        }

        const saveData = JSON.parse(saved);

        // Version check
        if (saveData.version !== SAVE_VERSION) {
            console.log('[Save] Version mismatch, migrating...');
            // Future migration logic here
        }

        // Restore state
        const state = saveData.state;
        window.clickerState.gold = state.gold || 0;
        window.clickerState.crystals = state.crystals || 0;
        window.clickerState.clickCount = state.clickCount || 0;
        window.clickerState.totalGoldEarned = state.totalGoldEarned || 0;
        window.clickerState.upgrades = state.upgrades || { clickPower: 0, autoClicker: 0, multiplier: 0 };
        window.clickerState.lastSaveTime = state.lastSaveTime || Date.now();

        // Recalculate derived values
        window.clickerState.clickPower = getClickPower();
        window.clickerState.goldPerSecond = getGoldPerSecond();

        // Calculate offline progress
        const offlineMs = Date.now() - state.lastSaveTime;
        if (offlineMs > 1000) {
            processOfflineProgress(offlineMs);
        }

        console.log('[Save] Game loaded, gold:', Math.floor(window.clickerState.gold));
        return true;
    } catch (e) {
        console.error('[Save] Failed to load:', e);
        return false;
    }
}

/**
 * Process offline earnings
 */
function processOfflineProgress(offlineMs) {
    const maxOfflineMs = 8 * 60 * 60 * 1000; // Max 8 hours
    const cappedMs = Math.min(offlineMs, maxOfflineMs);

    const gps = getGoldPerSecond();
    if (gps > 0) {
        const offlineGold = Math.floor((gps * cappedMs) / 1000);
        window.clickerState.gold += offlineGold;
        window.clickerState.totalGoldEarned += offlineGold;

        const hours = Math.floor(cappedMs / 3600000);
        const minutes = Math.floor((cappedMs % 3600000) / 60000);
        console.log(`[Save] Offline progress: +${offlineGold} gold (${hours}h ${minutes}m)`);
    }
}

/**
 * Reset save (for testing)
 */
function resetSave() {
    localStorage.removeItem(SAVE_KEY);
    location.reload();
}

console.log('[SaveSystem] Initialized, key:', SAVE_KEY);
