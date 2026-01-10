'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Gift, Check, Lock } from 'lucide-react';
import { getTaskManager, TaskDefinition, TaskReward } from '@/lib/taskManager';
import { getSocket } from '@/lib/socket';
import { detectLanguage, Language } from '@/lib/i18n';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface TaskCardProps {
  task: TaskDefinition & { progress: number; completed: boolean; claimed: boolean };
  lang: Language;
  onClaim: (taskId: string) => void;
  claiming: boolean;
}

// ═══════════════════════════════════════════════════════════
// REWARD PREVIEW
// ═══════════════════════════════════════════════════════════

function RewardPreview({ rewards, lang }: { rewards: TaskReward[]; lang: Language }) {
  const getRewardText = (reward: TaskReward): string => {
    const labels: Record<string, { ru: string; en: string }> = {
      gold: { ru: 'Золото', en: 'Gold' },
      ether: { ru: 'Эфир', en: 'Ether' },
      woodChest: { ru: 'Дерев. сундук', en: 'Wood Chest' },
      bronzeChest: { ru: 'Бронз. сундук', en: 'Bronze Chest' },
      crystals: { ru: 'Кристаллы', en: 'Crystals' },
      scrollHaste: { ru: 'Haste', en: 'Haste' },
      scrollAcumen: { ru: 'Acumen', en: 'Acumen' },
      scrollLuck: { ru: 'Luck', en: 'Luck' },
      chestBooster: { ru: 'Ускоритель', en: 'Booster' },
    };
    const label = labels[reward.type]?.[lang] || reward.type;
    // Format gold amount with K suffix
    if (reward.type === 'gold' && reward.amount >= 1000) {
      return `${(reward.amount / 1000).toFixed(0)}K`;
    }
    return reward.amount > 1 ? `${label} x${reward.amount}` : label;
  };

  const getRewardIcon = (type: string): string => {
    const icons: Record<string, string> = {
      gold: '🪙',
      ether: '✨',
      woodChest: '🪵',
      bronzeChest: '🟫',
      crystals: '💎',
      scrollHaste: '⚡',
      scrollAcumen: '🔥',
      scrollLuck: '🍀',
      chestBooster: '⏩',
    };
    return icons[type] || '🎁';
  };

  return (
    <div className="flex flex-wrap gap-1">
      {rewards.map((reward, idx) => (
        <span
          key={idx}
          className="text-[10px] bg-black/40 px-1.5 py-0.5 rounded text-gray-300"
        >
          {getRewardIcon(reward.type)} {getRewardText(reward)}
        </span>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TASK CARD
// ═══════════════════════════════════════════════════════════

function TaskCard({ task, lang, onClaim, claiming }: TaskCardProps) {
  const name = lang === 'ru' ? task.nameRu : task.nameEn;
  const desc = lang === 'ru' ? task.descRu : task.descEn;
  const percent = Math.min(100, (task.progress / task.condition.target) * 100);

  return (
    <div
      className={`bg-black/30 rounded-lg p-3 border ${
        task.claimed
          ? 'border-green-500/30 opacity-60'
          : task.completed
          ? 'border-l2-gold/50'
          : 'border-white/10'
      }`}
    >
      {/* Header */}
      <div className="flex items-start gap-2 mb-2">
        <span className="text-xl">{task.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm text-white truncate">{name}</div>
          <div className="text-[10px] text-gray-500">{desc}</div>
        </div>
        {task.claimed && (
          <div className="text-green-400">
            <Check size={16} />
          </div>
        )}
      </div>

      {/* Progress */}
      <div className="mb-2">
        <div className="flex justify-between text-[10px] mb-1">
          <span className="text-gray-400">
            {lang === 'ru' ? 'Прогресс' : 'Progress'}
          </span>
          <span className={task.completed ? 'text-green-400' : 'text-gray-400'}>
            {task.progress.toLocaleString()} / {task.condition.target.toLocaleString()}
          </span>
        </div>
        <div className="h-1.5 bg-black/50 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${
              task.completed ? 'bg-green-500' : 'bg-l2-gold'
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Rewards */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1">
          <div className="text-[9px] text-gray-500 mb-1">
            {lang === 'ru' ? 'Награда:' : 'Reward:'}
          </div>
          <RewardPreview rewards={task.rewards} lang={lang} />
        </div>

        {/* Claim Button */}
        {task.claimed ? (
          <div className="px-3 py-1.5 bg-green-500/20 text-green-400 rounded text-xs font-bold">
            ✓
          </div>
        ) : task.completed ? (
          <button
            onClick={() => onClaim(task.id)}
            disabled={claiming}
            className="px-3 py-1.5 bg-l2-gold text-black rounded text-xs font-bold hover:bg-l2-gold/80 disabled:opacity-50"
          >
            {claiming ? '...' : lang === 'ru' ? 'Забрать' : 'Claim'}
          </button>
        ) : (
          <div className="px-3 py-1.5 bg-gray-700/50 text-gray-500 rounded text-xs">
            <Lock size={12} />
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN MODAL
// ═══════════════════════════════════════════════════════════

interface TasksModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TasksModal({ isOpen, onClose }: TasksModalProps) {
  const [lang] = useState<Language>(() => detectLanguage());
  const [tasks, setTasks] = useState<Array<TaskDefinition & { progress: number; completed: boolean; claimed: boolean }>>([]);
  const [claiming, setClaiming] = useState(false);

  // Subscribe to TaskManager updates
  useEffect(() => {
    const tm = getTaskManager();

    const updateTasks = () => {
      setTasks(tm.getDailyTasks());
    };

    updateTasks();
    const unsubscribe = tm.subscribe(updateTasks);

    return unsubscribe;
  }, []);

  // Handle claim
  const handleClaim = useCallback(async (taskId: string) => {
    setClaiming(true);
    const tm = getTaskManager();
    const rewards = tm.claimReward(taskId);

    if (rewards) {
      // Send rewards to server for processing
      const socket = getSocket();
      socket.emit('tasks:claim', { taskId, rewards });
    }

    setClaiming(false);
  }, []);

  if (!isOpen) return null;

  const claimedCount = tasks.filter(t => t.claimed).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="bg-l2-panel rounded-lg w-full max-w-md max-h-[80vh] flex flex-col border border-white/20"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎯</span>
            <span className="font-bold text-l2-gold">
              {lang === 'ru' ? 'Ежедневные задачи' : 'Daily Tasks'}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* Task List - unclaimed first, claimed at bottom */}
        <div className="flex-1 overflow-auto p-3 space-y-2">
          {[...tasks]
            .sort((a, b) => {
              // Unclaimed first, claimed last
              if (a.claimed && !b.claimed) return 1;
              if (!a.claimed && b.claimed) return -1;
              return 0;
            })
            .map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                lang={lang}
                onClaim={handleClaim}
                claiming={claiming}
              />
            ))}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-white/10 text-center text-[10px] text-gray-500">
          {lang === 'ru'
            ? `Выполнено: ${claimedCount}/${tasks.length}`
            : `Completed: ${claimedCount}/${tasks.length}`}
        </div>
      </div>
    </div>
  );
}
