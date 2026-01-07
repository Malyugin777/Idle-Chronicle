// ═══════════════════════════════════════════════════════════
// TASK MANAGER - Клиентский сервис управления задачами
// Хранит прогресс в localStorage, эмитит события
// ═══════════════════════════════════════════════════════════

import {
  SESSION_TASKS,
  DAILY_TASKS,
  ALL_TASKS,
  TaskDefinition,
  TaskReward,
  TRIAL_THRESHOLD,
} from './tasks';

const STORAGE_KEY = 'ic_task_state_v1';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface TaskProgress {
  progress: number;
  completed: boolean;
  claimed: boolean;
}

interface TaskCounters {
  taps: number;
  damageTotal: number;
  skillCasts: number;
  chestsOpened: number;
  sessionTrialDamage: number; // DPS-чек (сбрасывается при reload)
}

interface Buffs {
  chestOpenSpeed?: {
    activeUntilTs: number;
    multiplier: number;
  };
}

export interface TaskState {
  lastDailyReset: string; // YYYY-MM-DD
  counters: TaskCounters;
  tasks: Record<string, TaskProgress>;
  buffs: Buffs;
}

type TaskEventListener = (state: TaskState) => void;

// ═══════════════════════════════════════════════════════════
// DEFAULT STATE
// ═══════════════════════════════════════════════════════════

function getDefaultState(): TaskState {
  const tasks: Record<string, TaskProgress> = {};
  for (const task of ALL_TASKS) {
    tasks[task.id] = { progress: 0, completed: false, claimed: false };
  }

  return {
    lastDailyReset: getTodayDate(),
    counters: {
      taps: 0,
      damageTotal: 0,
      skillCasts: 0,
      chestsOpened: 0,
      sessionTrialDamage: 0,
    },
    tasks,
    buffs: {},
  };
}

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

// ═══════════════════════════════════════════════════════════
// TASK MANAGER CLASS
// ═══════════════════════════════════════════════════════════

class TaskManager {
  private state: TaskState;
  private listeners: Set<TaskEventListener> = new Set();

  constructor() {
    this.state = this.load();
    this.checkDailyReset();
    // Trial damage сбрасывается при reload страницы
    this.state.counters.sessionTrialDamage = 0;
    this.save();
  }

  // ─────────────────────────────────────────────────────────
  // PERSISTENCE
  // ─────────────────────────────────────────────────────────

  private load(): TaskState {
    if (typeof window === 'undefined') return getDefaultState();

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as TaskState;
        // Ensure all tasks exist
        for (const task of ALL_TASKS) {
          if (!parsed.tasks[task.id]) {
            parsed.tasks[task.id] = { progress: 0, completed: false, claimed: false };
          }
        }
        return parsed;
      }
    } catch (e) {
      console.error('[TaskManager] Load error:', e);
    }
    return getDefaultState();
  }

  private save(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.error('[TaskManager] Save error:', e);
    }
  }

  // ─────────────────────────────────────────────────────────
  // DAILY RESET
  // ─────────────────────────────────────────────────────────

  private checkDailyReset(): void {
    const today = getTodayDate();
    if (this.state.lastDailyReset !== today) {
      console.log('[TaskManager] Daily reset triggered');
      this.state.lastDailyReset = today;

      // Reset daily tasks
      for (const task of DAILY_TASKS) {
        this.state.tasks[task.id] = { progress: 0, completed: false, claimed: false };
      }

      // Reset session tasks too (for MVP simplicity)
      for (const task of SESSION_TASKS) {
        this.state.tasks[task.id] = { progress: 0, completed: false, claimed: false };
      }

      // Reset counters
      this.state.counters = {
        taps: 0,
        damageTotal: 0,
        skillCasts: 0,
        chestsOpened: 0,
        sessionTrialDamage: 0,
      };

      // Mark daily login as completed
      this.incrementCounter('login', 1);

      this.save();
      this.notifyListeners();
    }
  }

  // ─────────────────────────────────────────────────────────
  // EVENT TRACKING
  // ─────────────────────────────────────────────────────────

  recordTap(count: number = 1): void {
    this.incrementCounter('taps', count);
  }

  recordDamage(amount: number): void {
    this.state.counters.damageTotal += amount;
    this.state.counters.sessionTrialDamage += amount;
    this.checkTaskCompletion();
    this.save();
    this.notifyListeners();
  }

  recordSkillCast(): void {
    this.incrementCounter('skillCasts', 1);
  }

  recordChestOpened(): void {
    this.incrementCounter('chestsOpened', 1);
  }

  recordLogin(): void {
    this.incrementCounter('login', 1);
  }

  private incrementCounter(type: string, amount: number): void {
    switch (type) {
      case 'taps':
        this.state.counters.taps += amount;
        break;
      case 'skillCasts':
        this.state.counters.skillCasts += amount;
        break;
      case 'chestsOpened':
        this.state.counters.chestsOpened += amount;
        break;
      case 'login':
        // Special: just check completion
        break;
    }
    this.checkTaskCompletion();
    this.save();
    this.notifyListeners();
  }

  // ─────────────────────────────────────────────────────────
  // TASK COMPLETION CHECK
  // ─────────────────────────────────────────────────────────

  private checkTaskCompletion(): void {
    for (const task of ALL_TASKS) {
      const taskState = this.state.tasks[task.id];
      if (taskState.completed) continue;

      let progress = 0;
      const target = task.condition.target;

      switch (task.condition.type) {
        case 'taps':
          progress = this.state.counters.taps;
          break;
        case 'damage':
          progress = this.state.counters.damageTotal;
          break;
        case 'trial':
          progress = this.state.counters.sessionTrialDamage;
          break;
        case 'skillCasts':
          progress = this.state.counters.skillCasts;
          break;
        case 'chestsOpened':
          progress = this.state.counters.chestsOpened;
          break;
        case 'login':
          progress = 1; // Always 1 after login
          break;
      }

      taskState.progress = Math.min(progress, target);

      if (progress >= target && !taskState.completed) {
        taskState.completed = true;
        console.log(`[TaskManager] Task completed: ${task.id}`);
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // CLAIM REWARDS
  // ─────────────────────────────────────────────────────────

  canClaim(taskId: string): { canClaim: boolean; reason?: string } {
    const taskState = this.state.tasks[taskId];
    if (!taskState) return { canClaim: false, reason: 'Task not found' };
    if (!taskState.completed) return { canClaim: false, reason: 'Not completed' };
    if (taskState.claimed) return { canClaim: false, reason: 'Already claimed' };

    // TODO: Check chest slots if reward includes chest
    return { canClaim: true };
  }

  claimReward(taskId: string): TaskReward[] | null {
    const check = this.canClaim(taskId);
    if (!check.canClaim) {
      console.log(`[TaskManager] Cannot claim ${taskId}: ${check.reason}`);
      return null;
    }

    const task = ALL_TASKS.find(t => t.id === taskId);
    if (!task) return null;

    // Mark as claimed BEFORE applying rewards (idempotency)
    this.state.tasks[taskId].claimed = true;
    this.save();

    // Apply buffs locally (chestBooster)
    for (const reward of task.rewards) {
      if (reward.type === 'chestBooster' && reward.duration) {
        this.state.buffs.chestOpenSpeed = {
          activeUntilTs: Date.now() + reward.duration,
          multiplier: 1.5,
        };
        this.save();
      }
    }

    this.notifyListeners();
    return task.rewards;
  }

  // ─────────────────────────────────────────────────────────
  // GETTERS
  // ─────────────────────────────────────────────────────────

  getState(): TaskState {
    return this.state;
  }

  getTaskProgress(taskId: string): TaskProgress | undefined {
    return this.state.tasks[taskId];
  }

  getSessionTasks(): Array<TaskDefinition & TaskProgress> {
    return SESSION_TASKS.map(t => ({
      ...t,
      ...this.state.tasks[t.id],
    }));
  }

  getDailyTasks(): Array<TaskDefinition & TaskProgress> {
    return DAILY_TASKS.map(t => ({
      ...t,
      ...this.state.tasks[t.id],
    }));
  }

  getChestBoosterMultiplier(): number {
    const booster = this.state.buffs.chestOpenSpeed;
    if (booster && booster.activeUntilTs > Date.now()) {
      return booster.multiplier;
    }
    return 1;
  }

  getChestBoosterTimeLeft(): number {
    const booster = this.state.buffs.chestOpenSpeed;
    if (booster && booster.activeUntilTs > Date.now()) {
      return booster.activeUntilTs - Date.now();
    }
    return 0;
  }

  // ─────────────────────────────────────────────────────────
  // LISTENERS
  // ─────────────────────────────────────────────────────────

  subscribe(listener: TaskEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}

// ═══════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════

let taskManagerInstance: TaskManager | null = null;

export function getTaskManager(): TaskManager {
  if (!taskManagerInstance) {
    taskManagerInstance = new TaskManager();
  }
  return taskManagerInstance;
}

export { SESSION_TASKS, DAILY_TASKS, ALL_TASKS };
export type { TaskDefinition, TaskReward };
