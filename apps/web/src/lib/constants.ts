// Game constants (inlined from @world-boss/shared)

export const VIEWPORT = {
  BASE_WIDTH: 780,
  BASE_HEIGHT: 1688,
  SCALE_MODE: 'ENVELOP',
} as const;

export const THEME = {
  COLORS: {
    BACKGROUND_TOP: 0x0e141b,
    BACKGROUND_BOTTOM: 0x2a313b,
    GOLD: '#D6B36A',
    GOLD_HEX: 0xD6B36A,
    HEALTH_RED: '#C41E3A',
    ENERGY_BLUE: '#3498DB',
    CRIT_RED: '#FF4444',
    TEXT_WHITE: '#FFFFFF',
  },
  FONTS: {
    PRIMARY: 'Press Start 2P',
    FALLBACK: 'monospace',
  },
} as const;
