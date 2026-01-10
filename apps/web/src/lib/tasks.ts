// ═══════════════════════════════════════════════════════════
// TASKS CONFIG - Конфигурация ежедневных задач
// ═══════════════════════════════════════════════════════════

export type RewardType =
  | 'ether'       // Эфир (x2 урон)
  | 'woodChest'   // Wooden chest
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
// ═══════════════════════════════════════════════════════════
export const DAILY_TASKS: TaskDefinition[] = [
  {
    id: 'dailyLogin',
    nameRu: 'Логин',
    nameEn: 'Daily Login',
    descRu: 'Зайди в игру',
    descEn: 'Log into the game',
    icon: '🎮',
    condition: { type: 'login', target: 1 },
    rewards: [{ type: 'crystals', amount: 5 }],
  },
  {
    id: 'clicker',
    nameRu: 'Кликер',
    nameEn: 'Clicker',
    descRu: 'Сделай 50 тапов',
    descEn: 'Make 50 taps',
    icon: '👆',
    condition: { type: 'taps', target: 50 },
    rewards: [{ type: 'ether', amount: 50 }],
  },
  {
    id: 'meatgrinder',
    nameRu: 'Мясорубка',
    nameEn: 'Meatgrinder',
    descRu: 'Нанеси 10,000 урона',
    descEn: 'Deal 10,000 damage',
    icon: '⚔️',
    condition: { type: 'damage', target: 10000 },
    rewards: [{ type: 'woodChest', amount: 1 }],
  },
  {
    id: 'dailyDamage',
    nameRu: 'Дневной урон',
    nameEn: 'Daily Damage',
    descRu: 'Нанеси 100,000 урона за день',
    descEn: 'Deal 100,000 damage today',
    icon: '💥',
    condition: { type: 'damage', target: 100000 },
    rewards: [{ type: 'ether', amount: 100 }],
  },
  {
    id: 'chestHunter',
    nameRu: 'Охотник за сундуками',
    nameEn: 'Chest Hunter',
    descRu: 'Открой 3 сундука',
    descEn: 'Open 3 chests',
    icon: '📦',
    condition: { type: 'chestsOpened', target: 3 },
    rewards: [
      { type: 'scrollHaste', amount: 1 },
      { type: 'scrollAcumen', amount: 1 },
      { type: 'scrollLuck', amount: 1 },
    ],
  },
  {
    id: 'caster',
    nameRu: 'Кастер',
    nameEn: 'Caster',
    descRu: 'Используй умения 30 раз',
    descEn: 'Use skills 30 times',
    icon: '✨',
    condition: { type: 'skillCasts', target: 30 },
    rewards: [{ type: 'ether', amount: 200 }],
  },
  {
    id: 'chestBoost',
    nameRu: 'Ускоритель сундуков',
    nameEn: 'Chest Accelerator',
    descRu: 'Открой 1 сундук',
    descEn: 'Open 1 chest',
    icon: '⚡',
    condition: { type: 'chestsOpened', target: 1 },
    rewards: [{ type: 'chestBooster', amount: 1, duration: 30 * 60 * 1000 }],
  },
];

// Получить задачу по ID
export function getTaskById(id: string): TaskDefinition | undefined {
  return DAILY_TASKS.find(t => t.id === id);
}
