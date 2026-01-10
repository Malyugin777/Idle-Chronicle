// ═══════════════════════════════════════════════════════════
// TASKS CONFIG - Конфигурация ежедневных задач
// Gold economy: ~30,000 gold/day через задачи
// ═══════════════════════════════════════════════════════════

export type RewardType =
  | 'gold'        // Adena/Coins - основной источник голды
  | 'ether'       // Эфир (x2 урон)
  | 'woodChest'   // Wooden chest
  | 'bronzeChest' // Bronze chest (medium tasks)
  | 'crystals'    // Premium currency (ancientCoin)
  | 'scrollHaste' // Haste scroll
  | 'scrollAcumen'// Acumen scroll
  | 'scrollLuck'  // Luck scroll
  | 'chestBooster'; // Chest open speed booster

export interface TaskReward {
  type: RewardType;
  amount: number;
  duration?: number; // For timed buffs (ms)
}

export interface TaskDefinition {
  id: string;
  nameRu: string;
  nameEn: string;
  descRu: string;
  descEn: string;
  icon: string;
  condition: {
    type: 'taps' | 'damage' | 'chestsOpened' | 'skillCasts' | 'login';
    target: number;
  };
  rewards: TaskReward[];
}

// ═══════════════════════════════════════════════════════════
// DAILY TASKS (сбрасываются в полночь)
// Баланс: ~30,000 gold/day для обычного игрока
// Задачи НЕ требуют убийства босса
// ═══════════════════════════════════════════════════════════
export const DAILY_TASKS: TaskDefinition[] = [
  // A) Daily Login: +5 crystals + 5,000 gold + 1 Wooden chest
  {
    id: 'dailyLogin',
    nameRu: 'Логин',
    nameEn: 'Daily Login',
    descRu: 'Зайди в игру',
    descEn: 'Log into the game',
    icon: '🎮',
    condition: { type: 'login', target: 1 },
    rewards: [
      { type: 'crystals', amount: 5 },
      { type: 'gold', amount: 5000 },
      { type: 'woodChest', amount: 1 },
    ],
  },
  // B) Clicker (50 taps): +6,000 gold + 1 Wooden chest
  {
    id: 'clicker',
    nameRu: 'Кликер',
    nameEn: 'Clicker',
    descRu: 'Сделай 50 тапов',
    descEn: 'Make 50 taps',
    icon: '👆',
    condition: { type: 'taps', target: 50 },
    rewards: [
      { type: 'gold', amount: 6000 },
      { type: 'woodChest', amount: 1 },
    ],
  },
  // C) Caster (30 skill casts): +6,000 gold
  {
    id: 'caster',
    nameRu: 'Кастер',
    nameEn: 'Caster',
    descRu: 'Используй умения 30 раз',
    descEn: 'Use skills 30 times',
    icon: '✨',
    condition: { type: 'skillCasts', target: 30 },
    rewards: [{ type: 'gold', amount: 6000 }],
  },
  // D) Daily Damage (100,000): +8,000 gold
  {
    id: 'dailyDamage',
    nameRu: 'Дневной урон',
    nameEn: 'Daily Damage',
    descRu: 'Нанеси 100,000 урона за день',
    descEn: 'Deal 100,000 damage today',
    icon: '💥',
    condition: { type: 'damage', target: 100000 },
    rewards: [{ type: 'gold', amount: 8000 }],
  },
  // E) Chest Hunter (3 chests): +3,000 gold + scrolls + 1 Bronze chest
  {
    id: 'chestHunter',
    nameRu: 'Охотник за сундуками',
    nameEn: 'Chest Hunter',
    descRu: 'Открой 3 сундука',
    descEn: 'Open 3 chests',
    icon: '📦',
    condition: { type: 'chestsOpened', target: 3 },
    rewards: [
      { type: 'gold', amount: 3000 },
      { type: 'scrollHaste', amount: 1 },
      { type: 'scrollAcumen', amount: 1 },
      { type: 'scrollLuck', amount: 1 },
      { type: 'bronzeChest', amount: 1 },
    ],
  },
  // F) Chest Opener (1 chest): +2,000 gold + booster
  {
    id: 'chestBoost',
    nameRu: 'Ускоритель сундуков',
    nameEn: 'Chest Accelerator',
    descRu: 'Открой 1 сундук',
    descEn: 'Open 1 chest',
    icon: '⚡',
    condition: { type: 'chestsOpened', target: 1 },
    rewards: [
      { type: 'gold', amount: 2000 },
      { type: 'chestBooster', amount: 1, duration: 30 * 60 * 1000 },
    ],
  },
];

// Итого: 5k + 6k + 6k + 8k + 3k + 2k = 30,000 gold/сутки

// Получить задачу по ID
export function getTaskById(id: string): TaskDefinition | undefined {
  return DAILY_TASKS.find(t => t.id === id);
}
