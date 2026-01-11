import * as Phaser from 'phaser';
import { BattleScene } from './scenes/BattleScene';

// Get device pixel ratio for sharp rendering on Retina/high-DPI displays
const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.CANVAS,  // CANVAS вместо AUTO - меньше GPU нагрузки
  parent: 'game-container',
  transparent: true, // Background handled by React
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
    min: 20,           // Минимум 20 FPS
    limit: 30,         // Жёсткий лимит 30 FPS
    forceSetTimeOut: true,  // Использовать setTimeout вместо RAF
    smoothStep: false,  // Отключить интерполяцию
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
    batchSize: 512,  // Уменьшить размер батча
  },
  audio: {
    disableWebAudio: true,
  },
};
