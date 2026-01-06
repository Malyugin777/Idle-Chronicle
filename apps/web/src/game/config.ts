import Phaser from 'phaser';
import { BattleScene } from './scenes/BattleScene';

// Get device pixel ratio for sharp rendering on Retina/high-DPI displays
const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: '#0e141b',
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: '100%',
    height: '100%',
    autoCenter: Phaser.Scale.CENTER_BOTH,
    zoom: 1 / dpr,  // Handle high-DPI displays
  },
  scene: [BattleScene],
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
    resolution: dpr,  // Render at native resolution
  },
  audio: {
    disableWebAudio: true,
  },
};
