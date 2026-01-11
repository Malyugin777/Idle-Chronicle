'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Check, Lock, AlertCircle, Calendar, Gift } from 'lucide-react';
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

interface APMilestone {
  required: number;
  reward: TaskReward;
  claimed: boolean;
}

interface CheckInReward {
  day: number;
  type: string;
  amount: number;
  icon: string;
}

// AP values per task (synced with server)
const AP_VALUES: Record<string, number> = {
  D1_login: 10,
  D2_bossDamage: 20,
  D3_taps: 15,
  D4_skills: 15,
  D5_chest: 20,
  G1_bossGrind: 30,
  G5_enchant: 20,
  G2_tapGrind: 20,
  G4_openChests: 30,
  G3_skillGrind: 20,
  G6_dismantle: 30,
  I1_invite: 30,
};

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
      silverChest: '🥈',
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
// AP PROGRESS BAR
// ═══════════════════════════════════════════════════════════

interface APBarProps {
  ap: number;
  milestones: Record<number, APMilestone>;
  onClaim: (threshold: number) => void;
  claiming: number | null;
  freeSlots: number;
  lang: Language;
}

function APProgressBar({ ap, milestones, onClaim, claiming, freeSlots, lang }: APBarProps) {
  const displayAp = Math.min(ap, 100);
  const percent = (displayAp / 100) * 100;

  const getMilestoneIcon = (threshold: number): string => {
    if (threshold === 30) return '🪙';
    if (threshold === 60) return '🎟️';
    return '🟫';
  };

  const getMilestoneStatus = (threshold: number) => {
    const m = milestones[threshold];
    if (!m) return 'locked';
    if (m.claimed) return 'claimed';
    if (ap >= threshold) return 'ready';
    return 'locked';
  };

  return (
    <div className="bg-gradient-to-r from-purple-900/40 to-blue-900/40 rounded-lg p-3 border border-purple-500/30 mb-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold text-purple-400">
          {lang === 'ru' ? 'Активность' : 'Activity'}
        </span>
        <span className="text-sm font-bold text-white">
          {displayAp}/100 AP
        </span>
      </div>

      {/* Progress Bar with Milestone Markers */}
      <div className="relative h-3 bg-black/50 rounded-full overflow-visible mb-3">
        <div
          className="absolute h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all"
          style={{ width: `${percent}%` }}
        />
        {/* Milestone markers */}
        {[30, 60, 100].map((threshold) => (
          <div
            key={threshold}
            className="absolute top-1/2 -translate-y-1/2 w-1 h-4 bg-white/30"
            style={{ left: `${threshold}%` }}
          />
        ))}
      </div>

      {/* Milestone Rewards */}
      <div className="flex justify-between">
        {[30, 60, 100].map((threshold) => {
          const status = getMilestoneStatus(threshold);
          const m = milestones[threshold];
          const needsSlots = threshold === 100 && freeSlots < 1;

          return (
            <button
              key={threshold}
              onClick={() => status === 'ready' && !needsSlots && onClaim(threshold)}
              disabled={status !== 'ready' || claiming === threshold || needsSlots}
              className={`flex flex-col items-center p-1.5 rounded transition-all ${
                status === 'claimed'
                  ? 'opacity-50'
                  : status === 'ready'
                  ? needsSlots
                    ? 'bg-orange-500/20 border border-orange-500/50'
                    : 'bg-l2-gold/20 border border-l2-gold/50 animate-pulse'
                  : 'bg-black/30 border border-white/10'
              }`}
            >
              <span className="text-xl">{getMilestoneIcon(threshold)}</span>
              <span className="text-[9px] text-gray-400">{threshold} AP</span>
              {status === 'claimed' ? (
                <Check size={12} className="text-green-400" />
              ) : status === 'ready' ? (
                needsSlots ? (
                  <AlertCircle size={12} className="text-orange-400" />
                ) : (
                  <Gift size={12} className="text-l2-gold" />
                )
              ) : (
                <Lock size={10} className="text-gray-500" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// CHECK-IN CALENDAR MODAL
// ═══════════════════════════════════════════════════════════

interface CheckInModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDay: number;
  canClaimToday: boolean;
  streakBroken: boolean;
  rewards: CheckInReward[];
  onClaim: () => void;
  claiming: boolean;
  freeSlots: number;
  lang: Language;
}

function CheckInModal({
  isOpen,
  onClose,
  currentDay,
  canClaimToday,
  streakBroken,
  rewards,
  onClaim,
  claiming,
  freeSlots,
  lang,
}: CheckInModalProps) {
  if (!isOpen) return null;

  // Get reward for today (or day 1 if streak broken)
  const effectiveDay = streakBroken ? 1 : currentDay;
  const todayReward = rewards.find(r => r.day === effectiveDay);
  const chestTypes = ['woodenChest', 'bronzeChest', 'silverChest', 'goldChest'];
  const needsSlots = todayReward && chestTypes.includes(todayReward.type) && freeSlots < todayReward.amount;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      <div
        className="bg-l2-panel rounded-lg w-full max-w-sm border border-white/20"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Calendar size={20} className="text-l2-gold" />
            <span className="font-bold text-l2-gold">
              {lang === 'ru' ? 'Календарь входа' : 'Check-In Calendar'}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* Streak Info */}
        <div className="p-3 border-b border-white/10 text-center">
          {streakBroken ? (
            <div className="text-orange-400 text-sm">
              {lang === 'ru' ? 'Серия сброшена! Начни заново' : 'Streak broken! Start over'}
            </div>
          ) : (
            <div className="text-green-400 text-sm">
              {lang === 'ru' ? `День ${currentDay} из 14` : `Day ${currentDay} of 14`}
            </div>
          )}
        </div>

        {/* Calendar Grid */}
        <div className="p-3 grid grid-cols-7 gap-1">
          {rewards.map((reward) => {
            const isPast = reward.day < currentDay && !streakBroken;
            const isCurrent = (streakBroken ? 1 : currentDay) === reward.day && canClaimToday;
            const isToday = (streakBroken ? 1 : currentDay) === reward.day && !canClaimToday;
            const isFuture = reward.day > (streakBroken ? 1 : currentDay);

            return (
              <div
                key={reward.day}
                className={`aspect-square flex flex-col items-center justify-center rounded text-[10px] ${
                  isPast
                    ? 'bg-green-500/20 border border-green-500/30'
                    : isCurrent
                    ? 'bg-l2-gold/20 border-2 border-l2-gold animate-pulse'
                    : isToday
                    ? 'bg-blue-500/20 border border-blue-500/30'
                    : 'bg-black/30 border border-white/10'
                }`}
              >
                <span className="text-lg">{reward.icon}</span>
                <span className="text-gray-400">D{reward.day}</span>
                {isPast && <Check size={10} className="text-green-400" />}
              </div>
            );
          })}
        </div>

        {/* Today's Reward */}
        {todayReward && (
          <div className="p-3 border-t border-white/10">
            <div className="text-center text-sm text-gray-400 mb-2">
              {lang === 'ru' ? 'Награда сегодня:' : "Today's reward:"}
            </div>
            <div className="flex items-center justify-center gap-2 mb-3">
              <span className="text-3xl">{todayReward.icon}</span>
              <span className="text-lg text-white">x{todayReward.amount}</span>
            </div>

            {canClaimToday ? (
              needsSlots ? (
                <div className="text-center text-orange-400 text-sm">
                  {lang === 'ru' ? 'Нужен свободный слот сундука' : 'Need free chest slot'}
                </div>
              ) : (
                <button
                  onClick={onClaim}
                  disabled={claiming}
                  className="w-full py-2 bg-l2-gold text-black rounded font-bold hover:bg-l2-gold/80 disabled:opacity-50"
                >
                  {claiming ? '...' : lang === 'ru' ? 'Забрать' : 'Claim'}
                </button>
              )
            ) : (
              <div className="text-center text-green-400 text-sm">
                {lang === 'ru' ? 'Уже получено сегодня!' : 'Already claimed today!'}
              </div>
            )}
          </div>
        )}
      </div>
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

  const chestCount = task.rewards.reduce((sum, r) => {
    if (r.type.includes('Chest')) return sum + r.amount;
    return sum;
  }, 0);
  const needsSlots = chestCount > freeSlots;

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

      <div className="flex items-center justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 text-[9px] text-gray-500 mb-1">
            <span>{lang === 'ru' ? 'Награда:' : 'Reward:'}</span>
            {AP_VALUES[task.id] && (
              <span className="text-purple-400 font-bold">+{AP_VALUES[task.id]} AP</span>
            )}
          </div>
          <RewardPreview rewards={task.rewards} lang={lang} />
        </div>

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

  // AP State
  const [ap, setAp] = useState(0);
  const [apMilestones, setApMilestones] = useState<Record<number, APMilestone>>({});
  const [apClaiming, setApClaiming] = useState<number | null>(null);

  // Check-In State
  const [checkInModalOpen, setCheckInModalOpen] = useState(false);
  const [checkInDay, setCheckInDay] = useState(1);
  const [canClaimCheckIn, setCanClaimCheckIn] = useState(false);
  const [streakBroken, setStreakBroken] = useState(false);
  const [checkInRewards, setCheckInRewards] = useState<CheckInReward[]>([]);
  const [checkInClaiming, setCheckInClaiming] = useState(false);

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

    const handleTasksClaimed = () => {
      setClaiming(null);
      socket.emit('tasks:get');
      socket.emit('ap:status');
    };

    const handleTasksError = (data: { message: string }) => {
      setClaiming(null);
      setError(data.message);
      setTimeout(() => setError(null), 3000);
    };

    // AP handlers
    const handleApData = (data: { ap: number; milestones: Record<number, APMilestone> }) => {
      setAp(data.ap);
      setApMilestones(data.milestones);
    };

    const handleApClaimed = () => {
      setApClaiming(null);
      socket.emit('ap:status');
      socket.emit('tasks:get'); // Refresh free slots
    };

    const handleApError = (data: { message: string }) => {
      setApClaiming(null);
      setError(data.message);
      setTimeout(() => setError(null), 3000);
    };

    // Check-In handlers
    const handleCheckInData = (data: {
      currentDay: number;
      canClaimToday: boolean;
      streakBroken: boolean;
      freeSlots: number;
      rewards: CheckInReward[];
    }) => {
      setCheckInDay(data.currentDay);
      setCanClaimCheckIn(data.canClaimToday);
      setStreakBroken(data.streakBroken);
      setCheckInRewards(data.rewards);
      setFreeSlots(data.freeSlots);
    };

    const handleCheckInClaimed = () => {
      setCheckInClaiming(false);
      socket.emit('checkin:status');
      socket.emit('tasks:get');
    };

    const handleCheckInError = (data: { message: string }) => {
      setCheckInClaiming(false);
      setError(data.message);
      setTimeout(() => setError(null), 3000);
    };

    socket.on('tasks:data', handleTasksData);
    socket.on('tasks:claimed', handleTasksClaimed);
    socket.on('tasks:error', handleTasksError);
    socket.on('ap:data', handleApData);
    socket.on('ap:claimed', handleApClaimed);
    socket.on('ap:error', handleApError);
    socket.on('checkin:data', handleCheckInData);
    socket.on('checkin:claimed', handleCheckInClaimed);
    socket.on('checkin:error', handleCheckInError);

    // Initial fetch
    socket.emit('tasks:get');
    socket.emit('ap:status');
    socket.emit('checkin:status');

    return () => {
      socket.off('tasks:data', handleTasksData);
      socket.off('tasks:claimed', handleTasksClaimed);
      socket.off('tasks:error', handleTasksError);
      socket.off('ap:data', handleApData);
      socket.off('ap:claimed', handleApClaimed);
      socket.off('ap:error', handleApError);
      socket.off('checkin:data', handleCheckInData);
      socket.off('checkin:claimed', handleCheckInClaimed);
      socket.off('checkin:error', handleCheckInError);
    };
  }, [isOpen]);

  const handleClaim = useCallback((taskId: string) => {
    setClaiming(taskId);
    setError(null);
    const socket = getSocket();
    socket.emit('tasks:claim', { taskId });
  }, []);

  const handleApClaim = useCallback((threshold: number) => {
    setApClaiming(threshold);
    setError(null);
    const socket = getSocket();
    socket.emit('ap:claim', { threshold });
  }, []);

  const handleCheckInClaim = useCallback(() => {
    setCheckInClaiming(true);
    setError(null);
    const socket = getSocket();
    socket.emit('checkin:claim');
  }, []);

  if (!isOpen) return null;

  const baseTasks = dailyTasks.filter(t => t.section === 'base');
  const grindTasks = dailyTasks.filter(t => t.section === 'grind');
  const inviteTasks = dailyTasks.filter(t => t.section === 'invite');

  const dailyClaimedCount = dailyTasks.filter(t => t.claimed).length;
  const weeklyClaimedCount = weeklyTasks.filter(t => t.claimed).length;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        onClick={onClose}
      >
        <div
          className="bg-l2-panel rounded-lg w-full max-w-md max-h-[90vh] flex flex-col border border-white/20"
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
            <div className="flex items-center gap-2">
              {/* Check-In Button */}
              <button
                onClick={() => setCheckInModalOpen(true)}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
                  canClaimCheckIn
                    ? 'bg-l2-gold/20 text-l2-gold border border-l2-gold/50 animate-pulse'
                    : 'bg-black/30 text-gray-400 border border-white/10'
                }`}
              >
                <Calendar size={14} />
                <span>D{checkInDay}</span>
                {canClaimCheckIn && <Gift size={12} />}
              </button>
              <button onClick={onClose} className="text-gray-400 hover:text-white">
                <X size={20} />
              </button>
            </div>
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
                {/* AP Progress Bar */}
                <APProgressBar
                  ap={ap}
                  milestones={apMilestones}
                  onClaim={handleApClaim}
                  claiming={apClaiming}
                  freeSlots={freeSlots}
                  lang={lang}
                />

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

      {/* Check-In Calendar Modal */}
      <CheckInModal
        isOpen={checkInModalOpen}
        onClose={() => setCheckInModalOpen(false)}
        currentDay={checkInDay}
        canClaimToday={canClaimCheckIn}
        streakBroken={streakBroken}
        rewards={checkInRewards}
        onClaim={handleCheckInClaim}
        claiming={checkInClaiming}
        freeSlots={freeSlots}
        lang={lang}
      />
    </>
  );
}
