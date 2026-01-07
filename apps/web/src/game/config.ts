import * as Phaser from 'phaser';
import { BattleScene } from './scenes/BattleScene';

// Get device pixel ratio for sharp rendering on Retina/high-DPI displays
const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  // transparent: true, // DISABLED FOR DEBUG
  backgroundColor: '#323250', // DEBUG: visible background
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: '100%',
    height: '100%',
    autoCenter: Phaser.Scale.CENTER_BOTH,
    zoom: 1 / dpr,  // Handle high-DPI displays
  },
  scene: [BattleScene],
  // FPS limit to reduce GPU load
  fps: {
    target: 30,        // 30 FPS достаточно для idle кликера
    forceSetTimeOut: true,  // Более стабильное ограничение
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  render: {
    pixelArt: false,
    antialias: true,
    powerPreference: 'low-power',  // Экономия GPU
  },
  audio: {
    disableWebAudio: true,
  },
};
