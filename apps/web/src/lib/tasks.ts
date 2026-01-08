// ═══════════════════════════════════════════════════════════
// TASKS CONFIG - Конфигурация задач (Session + Daily)
// ═══════════════════════════════════════════════════════════

export type TaskType = 'session' | 'daily';
export type RewardType =
  | 'ngPack'      // NG Charge pack (amount)
  | 'dCharge'     // D-grade charges
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
  type: TaskType;
  nameRu: string;
  nameEn: string;
  descRu: string;
  descEn: string;
  icon: string;
  // Условие выполнения
  condition: {
    type: 'taps' | 'damage' | 'trial' | 'chestsOpened' | 'skillCasts' | 'login';
    target: number;
  };
  rewards: TaskReward[];
}

// ═══════════════════════════════════════════════════════════
// TRIAL THRESHOLD (DPS-чек)
// ═══════════════════════════════════════════════════════════
export const TRIAL_THRESHOLD = 10000; // 10k урона за сессию

// ═══════════════════════════════════════════════════════════
// SESSION TASKS (убраны - все задачи теперь daily)
// ═══════════════════════════════════════════════════════════
export const SESSION_TASKS: TaskDefinition[] = [];

// ═══════════════════════════════════════════════════════════
// DAILY TASKS (сбрасываются в полночь)
// ═══════════════════════════════════════════════════════════
export const DAILY_TASKS: TaskDefinition[] = [
  {
    id: 'dailyLogin',
    type: 'daily',
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
    type: 'daily',
    nameRu: 'Кликер',
    nameEn: 'Clicker',
    descRu: 'Сделай 50 тапов',
    descEn: 'Make 50 taps',
    icon: '👆',
    condition: { type: 'taps', target: 50 },
    rewards: [{ type: 'ngPack', amount: 100 }],
  },
  {
    id: 'meatgrinder',
    type: 'daily',
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
    type: 'daily',
    nameRu: 'Дневной урон',
    nameEn: 'Daily Damage',
    descRu: 'Нанеси 100,000 урона за день',
    descEn: 'Deal 100,000 damage today',
    icon: '💥',
    condition: { type: 'damage', target: 100000 },
    rewards: [{ type: 'dCharge', amount: 100 }],
  },
  {
    id: 'chestHunter',
    type: 'daily',
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
    type: 'daily',
    nameRu: 'Кастер',
    nameEn: 'Caster',
    descRu: 'Используй умения 30 раз',
    descEn: 'Use skills 30 times',
    icon: '✨',
    condition: { type: 'skillCasts', target: 30 },
    rewards: [{ type: 'ngPack', amount: 400 }],
  },
  {
    id: 'chestBoost',
    type: 'daily',
    nameRu: 'Ускоритель сундуков',
    nameEn: 'Chest Accelerator',
    descRu: 'Открой 1 сундук',
    descEn: 'Open 1 chest',
    icon: '⚡',
    condition: { type: 'chestsOpened', target: 1 },
    rewards: [{ type: 'chestBooster', amount: 1, duration: 30 * 60 * 1000 }], // 30 min
  },
];

// Все задачи
export const ALL_TASKS = [...SESSION_TASKS, ...DAILY_TASKS];

// Получить задачу по ID
export function getTaskById(id: string): TaskDefinition | undefined {
  return ALL_TASKS.find(t => t.id === id);
}
