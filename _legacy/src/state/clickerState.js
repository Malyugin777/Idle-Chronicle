'use strict';

/**
 * Clicker State - Central state management
 * Compatible with Pocket Chronicles heroState.js
 */

const SAVE_VERSION = 1;

// Main clicker state
window.clickerState = {
    // Resources (syncs with Pocket Chronicles wallet)
    gold: 0,
    crystals: 0,

    // Clicker stats
    clickPower: 1,
    clickCount: 0,
    totalGoldEarned: 0,

    // Passive income
    goldPerSecond: 0,

    // Upgrades purchased
    upgrades: {
        clickPower: 0,    // +1 gold per click
        autoClicker: 0,   // +1 gold per second
        multiplier: 0     // x2 gold multiplier
    },

    // Timestamps
    lastSaveTime: Date.now(),
    lastTickTime: Date.now(),

    // Session stats
    sessionStartTime: Date.now(),
    sessionClicks: 0
};

// Upgrade costs (exponential scaling)
const UPGRADE_CONFIG = {
    clickPower: {
        baseCost: 10,
        costMultiplier: 1.5,
        effect: 1  // +1 per level
    },
    autoClicker: {
        baseCost: 50,
        costMultiplier: 1.8,
        effect: 1  // +1 GPS per level
    },
    multiplier: {
        baseCost: 500,
        costMultiplier: 3.0,
        effect: 1  // +1x multiplier per level
    }
};

/**
 * Calculate upgrade cost
 */
function getUpgradeCost(upgradeType) {
    const config = UPGRADE_CONFIG[upgradeType];
    const level = window.clickerState.upgrades[upgradeType];
    return Math.floor(config.baseCost * Math.pow(config.costMultiplier, level));
}

/**
 * Calculate current click power
 */
function getClickPower() {
    const state = window.clickerState;
    let power = 1 + (state.upgrades.clickPower * UPGRADE_CONFIG.clickPower.effect);
    const multiplier = 1 + state.upgrades.multiplier;
    return Math.floor(power * multiplier);
}

/**
 * Calculate gold per second
 */
function getGoldPerSecond() {
    const state = window.clickerState;
    let gps = state.upgrades.autoClicker * UPGRADE_CONFIG.autoClicker.effect;
    const multiplier = 1 + state.upgrades.multiplier;
    return Math.floor(gps * multiplier);
}

/**
 * Perform a click
 */
function doClick() {
    const power = getClickPower();
    window.clickerState.gold += power;
    window.clickerState.totalGoldEarned += power;
    window.clickerState.clickCount++;
    window.clickerState.sessionClicks++;
    return power;
}

/**
 * Buy an upgrade
 */
function buyUpgrade(upgradeType) {
    const cost = getUpgradeCost(upgradeType);
    if (window.clickerState.gold >= cost) {
        window.clickerState.gold -= cost;
        window.clickerState.upgrades[upgradeType]++;

        // Recalculate GPS
        window.clickerState.goldPerSecond = getGoldPerSecond();
        window.clickerState.clickPower = getClickPower();

        console.log(`[Clicker] Bought ${upgradeType}, level: ${window.clickerState.upgrades[upgradeType]}`);
        return true;
    }
    return false;
}

/**
 * Process passive income tick
 */
function processTick(deltaMs) {
    const gps = getGoldPerSecond();
    if (gps > 0) {
        const goldEarned = (gps * deltaMs) / 1000;
        window.clickerState.gold += goldEarned;
        window.clickerState.totalGoldEarned += goldEarned;
    }
    window.clickerState.lastTickTime = Date.now();
}

console.log('[ClickerState] Initialized, SAVE_VERSION:', SAVE_VERSION);
