'use strict';

/**
 * Idle Chronicle - Main Game Entry
 * Clicker game for Telegram Mini App
 */

// Add scene to config
phaserConfig.scene = [ClickerScene];

// Create game instance
const game = new Phaser.Game(phaserConfig);

// Load saved game
loadGame();

// Save on page close
window.addEventListener('beforeunload', () => {
    saveGame();
});

// Handle visibility change (save when minimized)
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        saveGame();
    }
});

console.log('[Game] Idle Chronicle started');
