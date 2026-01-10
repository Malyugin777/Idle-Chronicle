'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Check, Lock, AlertCircle } from 'lucide-react';
import { getSocket } from '@/lib/socket';
import { detectLanguage, Language } from '@/lib/i18n';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface TaskReward {
  type: string;
  amount: number;
}

interface TaskData {
  id: string;
  nameRu: string;
  nameEn: string;
  descRu: string;
  descEn: string;
  icon: string;
  condition: { type: string; target: number };
  rewards: TaskReward[];
  section: 'base' | 'grind' | 'invite' | 'weekly';
  progress: number;
  completed: boolean;
  claimed: boolean;
}

interface TaskCardProps {
  task: TaskData;
  lang: Language;
  onClaim: (taskId: string) => void;
  claiming: string | null;
  freeSlots: number;
}

// ═══════════════════════════════════════════════════════════
// REWARD PREVIEW
// ═══════════════════════════════════════════════════════════

function RewardPreview({ rewards, lang }: { rewards: TaskReward[]; lang: Language }) {
  const getRewardText = (reward: TaskReward): string => {
    const labels: Record<string, { ru: string; en: string }> = {
      gold: { ru: 'Золото', en: 'Gold' },
      crystals: { ru: 'Кристаллы', en: 'Crystals' },
      tickets: { ru: 'Билеты', en: 'Tickets' },
      enchantCharges: { ru: 'Заряды заточки', en: 'Enchant Charges' },
      protectionCharges: { ru: 'Защита', en: 'Protection' },
      woodenChest: { ru: 'Дерев.', en: 'Wooden' },
      bronzeChest: { ru: 'Бронз.', en: 'Bronze' },
      silverChest: { ru: 'Серебр.', en: 'Silver' },
      goldChest: { ru: 'Золот.', en: 'Gold' },
    };
    const label = labels[reward.type]?.[lang] || reward.type;
    if (reward.type === 'gold' && reward.amount >= 1000) {
      return `${(reward.amount / 1000).toFixed(0)}K`;
    }
    return reward.amount > 1 ? `${label} x${reward.amount}` : label;
  };

  const getRewardIcon = (type: string): string => {
    const icons: Record<string, string> = {
      gold: '🪙',
      crystals: '💎',
      tickets: '🎟️',
      enchantCharges: '⚡',
      protectionCharges: '🛡️',
      woodenChest: '🪵',
      bronzeChest: '🟫',
      silverChest: '🪙',
      goldChest: '🟨',
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

function TaskCard({ task, lang, onClaim, claiming, freeSlots }: TaskCardProps) {
  const name = lang === 'ru' ? task.nameRu : task.nameEn;
  const desc = lang === 'ru' ? task.descRu : task.descEn;
  const percent = Math.min(100, (task.progress / task.condition.target) * 100);

  // Count chest rewards
  const chestCount = task.rewards.reduce((sum, r) => {
    if (r.type.includes('Chest')) return sum + r.amount;
    return sum;
  }, 0);
  const needsSlots = chestCount > freeSlots;

  // Format progress for large numbers
  const formatProgress = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toLocaleString();
  };

  return (
    <div
      className={`bg-black/30 rounded-lg p-3 border ${
        task.claimed
          ? 'border-green-500/30 opacity-60'
          : task.completed
          ? needsSlots
            ? 'border-orange-500/50'
            : 'border-l2-gold/50'
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
            {formatProgress(task.progress)} / {formatProgress(task.condition.target)}
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
          needsSlots ? (
            <div className="flex items-center gap-1 px-2 py-1 bg-orange-500/20 text-orange-400 rounded text-[10px]">
              <AlertCircle size={12} />
              <span>{lang === 'ru' ? `${chestCount} слотов` : `${chestCount} slots`}</span>
            </div>
          ) : (
            <button
              onClick={() => onClaim(task.id)}
              disabled={claiming === task.id}
              className="px-3 py-1.5 bg-l2-gold text-black rounded text-xs font-bold hover:bg-l2-gold/80 disabled:opacity-50"
            >
              {claiming === task.id ? '...' : lang === 'ru' ? 'Забрать' : 'Claim'}
            </button>
          )
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
// SECTION HEADER
// ═══════════════════════════════════════════════════════════

function SectionHeader({ title, count }: { title: string; count: string }) {
  return (
    <div className="flex items-center gap-2 py-2">
      <div className="h-px flex-1 bg-white/10" />
      <span className="text-[10px] text-gray-500 uppercase tracking-wider">
        {title} ({count})
      </span>
      <div className="h-px flex-1 bg-white/10" />
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
  const [tab, setTab] = useState<'daily' | 'weekly'>('daily');
  const [dailyTasks, setDailyTasks] = useState<TaskData[]>([]);
  const [weeklyTasks, setWeeklyTasks] = useState<TaskData[]>([]);
  const [freeSlots, setFreeSlots] = useState(5);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch tasks from server
  useEffect(() => {
    if (!isOpen) return;

    const socket = getSocket();

    const handleTasksData = (data: {
      daily: TaskData[];
      weekly: TaskData[];
      freeSlots: number;
    }) => {
      setDailyTasks(data.daily || []);
      setWeeklyTasks(data.weekly || []);
      setFreeSlots(data.freeSlots ?? 5);
    };

    const handleTasksClaimed = (data: { taskId: string }) => {
      setClaiming(null);
      // Refresh tasks
      socket.emit('tasks:get');
    };

    const handleTasksError = (data: { message: string }) => {
      setClaiming(null);
      setError(data.message);
      setTimeout(() => setError(null), 3000);
    };

    socket.on('tasks:data', handleTasksData);
    socket.on('tasks:claimed', handleTasksClaimed);
    socket.on('tasks:error', handleTasksError);

    // Initial fetch
    socket.emit('tasks:get');

    return () => {
      socket.off('tasks:data', handleTasksData);
      socket.off('tasks:claimed', handleTasksClaimed);
      socket.off('tasks:error', handleTasksError);
    };
  }, [isOpen]);

  // Handle claim
  const handleClaim = useCallback((taskId: string) => {
    setClaiming(taskId);
    setError(null);
    const socket = getSocket();
    socket.emit('tasks:claim', { taskId });
  }, []);

  if (!isOpen) return null;

  // Split daily tasks by section
  const baseTasks = dailyTasks.filter(t => t.section === 'base');
  const grindTasks = dailyTasks.filter(t => t.section === 'grind');
  const inviteTasks = dailyTasks.filter(t => t.section === 'invite');

  const dailyClaimedCount = dailyTasks.filter(t => t.claimed).length;
  const weeklyClaimedCount = weeklyTasks.filter(t => t.claimed).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="bg-l2-panel rounded-lg w-full max-w-md max-h-[85vh] flex flex-col border border-white/20"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎯</span>
            <span className="font-bold text-l2-gold">
              {lang === 'ru' ? 'Задачи' : 'Tasks'}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10">
          <button
            onClick={() => setTab('daily')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              tab === 'daily'
                ? 'text-l2-gold border-b-2 border-l2-gold'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {lang === 'ru' ? 'Ежедневные' : 'Daily'}
            <span className="ml-1 text-xs opacity-70">
              ({dailyClaimedCount}/{dailyTasks.length})
            </span>
          </button>
          <button
            onClick={() => setTab('weekly')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              tab === 'weekly'
                ? 'text-purple-400 border-b-2 border-purple-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {lang === 'ru' ? 'Недельные' : 'Weekly'}
            <span className="ml-1 text-xs opacity-70">
              ({weeklyClaimedCount}/{weeklyTasks.length})
            </span>
          </button>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mx-3 mt-3 p-2 bg-red-500/20 border border-red-500/30 rounded text-red-400 text-xs text-center">
            {error}
          </div>
        )}

        {/* Task List */}
        <div className="flex-1 overflow-auto p-3 space-y-2">
          {tab === 'daily' ? (
            <>
              {/* Base Tasks */}
              <SectionHeader
                title={lang === 'ru' ? 'База дня' : 'Daily Base'}
                count={`${baseTasks.filter(t => t.claimed).length}/${baseTasks.length}`}
              />
              {baseTasks
                .sort((a, b) => (a.claimed === b.claimed ? 0 : a.claimed ? 1 : -1))
                .map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    lang={lang}
                    onClaim={handleClaim}
                    claiming={claiming}
                    freeSlots={freeSlots}
                  />
                ))}

              {/* Grind Tasks */}
              {grindTasks.length > 0 && (
                <>
                  <SectionHeader
                    title={lang === 'ru' ? 'Гринд (сегодня)' : 'Grind (Today)'}
                    count={`${grindTasks.filter(t => t.claimed).length}/${grindTasks.length}`}
                  />
                  {grindTasks
                    .sort((a, b) => (a.claimed === b.claimed ? 0 : a.claimed ? 1 : -1))
                    .map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        lang={lang}
                        onClaim={handleClaim}
                        claiming={claiming}
                        freeSlots={freeSlots}
                      />
                    ))}
                </>
              )}

              {/* Invite Task */}
              {inviteTasks.length > 0 && (
                <>
                  <SectionHeader
                    title={lang === 'ru' ? 'Приглашение' : 'Invite'}
                    count={`${inviteTasks.filter(t => t.claimed).length}/${inviteTasks.length}`}
                  />
                  {inviteTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      lang={lang}
                      onClaim={handleClaim}
                      claiming={claiming}
                      freeSlots={freeSlots}
                    />
                  ))}
                </>
              )}
            </>
          ) : (
            <>
              {/* Weekly Tasks */}
              {weeklyTasks
                .sort((a, b) => (a.claimed === b.claimed ? 0 : a.claimed ? 1 : -1))
                .map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    lang={lang}
                    onClaim={handleClaim}
                    claiming={claiming}
                    freeSlots={freeSlots}
                  />
                ))}

              {weeklyTasks.length === 0 && (
                <div className="text-center text-gray-500 py-8">
                  {lang === 'ru' ? 'Загрузка...' : 'Loading...'}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-white/10 text-center text-[10px] text-gray-500">
          {lang === 'ru'
            ? `Слоты сундуков: ${freeSlots} свободно`
            : `Chest slots: ${freeSlots} free`}
        </div>
      </div>
    </div>
  );
}
