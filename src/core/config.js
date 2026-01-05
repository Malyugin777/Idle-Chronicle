'use strict';

/**
 * Idle Chronicle - Phaser Configuration
 * Compatible with Pocket Chronicles (L2 Phaser RPG)
 */

const BASE_W = 780;
const BASE_H = 1688;

// Colors (Dark Fantasy style)
const COLORS = {
    bgDark: 0x0e141b,
    bgPanel: 0x2a313b,
    gold: '#D6B36A',
    goldHex: 0xD6B36A,
    white: '#ffffff',
    textShadow: '#000000',
    accent: '#4a9eff',
    success: '#4aff4a',
    danger: '#ff4a4a'
};

// Fonts
const FONTS = {
    pixel: '"Press Start 2P", monospace',
    readable: 'Verdana, sans-serif'
};

// Phaser config
const phaserConfig = {
    type: Phaser.AUTO,
    width: BASE_W,
    height: BASE_H,
    parent: 'game-container',
    backgroundColor: COLORS.bgDark,
    scale: {
        mode: Phaser.Scale.ENVELOP,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: [],
    fps: {
        target: 60,
        forceSetTimeOut: true
    },
    render: {
        antialias: true,
        pixelArt: false
    }
};

// Telegram WebApp expand
if (window.Telegram?.WebApp) {
    window.Telegram.WebApp.expand();
    window.Telegram.WebApp.ready();
}

console.log('[Config] Idle Chronicle loaded, BASE:', BASE_W, 'x', BASE_H);
