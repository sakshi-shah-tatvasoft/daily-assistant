import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Check, SkipForward } from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  getGreeting, getTodayIST, formatTime,
  getCurrentTimeIST, getDashboardStats,
} from '../utils/dateHelpers';
import { NOTIFICATION_SLOTS, SLOT_ORDER, CATEGORIES } from '../utils/constants';
import type { NotificationSlot, TaskInstance } from '../types';
import toast from 'react-hot-toast';

function SlotCard({
  slot,
  tasks,
  slotTime,
  isPast,
  onComplete,
  onSkip,
}: {
  slot: NotificationSlot;
  tasks: TaskInstance[];
  slotTime: string;
  isPast: boolean;
  onComplete: (id: string, title: string) => void;
  onSkip: (id: string, title: string) => void;
}) {
  if (!tasks.length) return null;

  const def = NOTIFICATION_SLOTS[slot];
  const doneCount = tasks.filter(t => t.status === 'completed').length;
  const allDone   = doneCount === tasks.length;

  return (
    <div className={`mb-5 transition-opacity ${!isPast && !allDone ? 'opacity-60' : ''}`}>
      {/* Slot header */}
      <div className="flex items-center gap-2.5 mb-2.5">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${
          allDone
            ? 'bg-emerald-50 dark:bg-emerald-900/20'
            : isPast
            ? 'bg-indigo-50 dark:bg-indigo-900/20'
            : 'bg-gray-100 dark:bg-[#2a2840]'
        }`}>
          {allDone ? '✅' : def.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">{def.label}</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">{formatTime(slotTime)}</span>
          </div>
          <span className="text-xs text-gray-400">{def.description}</span>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          allDone
            ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
            : 'bg-gray-100 text-gray-500 dark:bg-[#2a2840] dark:text-gray-400'
        }`}>
          {doneCount}/{tasks.length}
        </span>
      </div>

      {/* Items */}
      <div className="card divide-y divide-gray-50 dark:divide-[#2a2840] overflow-hidden">
        {tasks.map(t => {
          const cat    = CATEGORIES[t.category];
          const done   = t.status === 'completed';
          const skipped = t.status === 'skipped';
          const inactive = done || skipped;

          return (
            <div key={t.id} className={`flex items-center gap-3 px-4 py-3 ${inactive ? 'opacity-50' : ''}`}>
              {/* Done circle */}
              <button
                onClick={() => !inactive && onComplete(t.id, t.title)}
                disabled={inactive}
                className={`w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all duration-150 active:scale-90 ${
                  done
                    ? 'bg-emerald-500 border-emerald-500'
                    : 'border-gray-300 dark:border-gray-600 hover:border-indigo-400'
                }`}
              >
                {done && <Check size={11} className="text-white" strokeWidth={3} />}
              </button>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${done ? 'line-through text-gray-400' : 'text-gray-800 dark:text-white'}`}>
                  {t.title}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: cat.bg, color: cat.color }}>
                    {cat.label}
                  </span>
                  {skipped && (
                    <span className="text-[11px] bg-gray-100 dark:bg-gray-800/50 text-gray-400 px-1.5 py-0.5 rounded-full">Skipped</span>
                  )}
                </div>
              </div>

              {/* Skip */}
              {!inactive && (
                <button
                  onClick={() => onSkip(t.id, t.title)}
                  className="btn-icon flex-shrink-0 w-7 h-7"
                  aria-label="Skip"
                >
                  <SkipForward size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { todayTasks, settings, completeTask, skipTask } = useApp();

  const today = getTodayIST();
  const nowTime = getCurrentTimeIST();

  const stats = useMemo(() => getDashboardStats(todayTasks), [todayTasks]);

  const tasksBySlot = useMemo(() => {
    const map = {} as Record<NotificationSlot, TaskInstance[]>;
    for (const s of SLOT_ORDER) map[s] = [];
    for (const t of todayTasks) {
      if (t.slot) map[t.slot].push(t);
    }
    return map;
  }, [todayTasks]);

  const nextSlot = useMemo(() => {
    for (const s of SLOT_ORDER) {
      const time = settings.notificationSlotTimes[s];
      if (time > nowTime && tasksBySlot[s].some(t => t.status === 'pending')) {
        return { slot: s, time };
      }
    }
    return null;
  }, [settings, nowTime, tasksBySlot]);

  const handleComplete = (id: string, title: string) => {
    completeTask(id);
    toast.success(`Marked done: ${title}`, { icon: '✅' });
  };

  const handleSkip = (id: string, title: string) => {
    skipTask(id);
    toast(`Skipped: ${title}`, { icon: '⏭️' });
  };

  const formatted = new Date(today + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div className="page pt-6">
      {/* Greeting */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">{formatted}</p>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{getGreeting()} 👋</h1>
        </div>
        <button
          onClick={() => navigate('/reminders/add')}
          className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200 dark:shadow-indigo-900/40 active:scale-95 transition-transform"
          aria-label="Add reminder"
        >
          <Plus size={20} className="text-white" />
        </button>
      </div>

      {/* Progress summary */}
      <div className="card p-4 mb-4">
        <div className="flex items-end justify-between mb-2.5">
          <div>
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-0.5">Today's Progress</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white leading-none">{stats.percentage}%</p>
          </div>
          <p className="text-sm text-gray-400 pb-1">
            <span className="font-semibold text-indigo-600 dark:text-indigo-400">{stats.completed}</span>
            <span className="text-gray-300 dark:text-gray-600 mx-1">/</span>
            <span>{stats.total} done</span>
          </p>
        </div>

        <div className="h-2 bg-gray-100 dark:bg-[#2a2840] rounded-full overflow-hidden mb-4">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-700"
            style={{ width: `${stats.percentage}%` }}
          />
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: 'Done',    n: stats.completed, cls: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
            { label: 'Pending', n: stats.pending,   cls: 'text-amber-600 dark:text-amber-400',     bg: 'bg-amber-50 dark:bg-amber-900/20'     },
            { label: 'Skipped', n: stats.skipped,   cls: 'text-gray-500 dark:text-gray-400',       bg: 'bg-gray-50 dark:bg-gray-800/40'       },
          ].map(({ label, n, cls, bg }) => (
            <div key={label} className={`${bg} rounded-xl p-2`}>
              <p className={`text-lg font-bold leading-tight ${cls}`}>{n}</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Next notification chip */}
      {nextSlot && (
        <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl px-4 py-3 flex items-center gap-3 mb-5">
          <span className="text-2xl">{NOTIFICATION_SLOTS[nextSlot.slot].emoji}</span>
          <div>
            <p className="text-xs font-semibold text-indigo-500 dark:text-indigo-400">
              Next: {NOTIFICATION_SLOTS[nextSlot.slot].label} at {formatTime(nextSlot.time)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {tasksBySlot[nextSlot.slot].filter(t => t.status === 'pending').length} reminder(s) pending
            </p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {todayTasks.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-5xl mb-3">🔔</p>
          <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">No reminders set up</p>
          <p className="text-sm text-gray-400 mt-1 mb-5">Add your first medicine or habit reminder</p>
          <button className="btn-primary" onClick={() => navigate('/reminders/add')}>+ Add Reminder</button>
        </div>
      ) : (
        SLOT_ORDER.map(slot => (
          <SlotCard
            key={slot}
            slot={slot}
            tasks={tasksBySlot[slot]}
            slotTime={settings.notificationSlotTimes[slot]}
            isPast={nowTime >= settings.notificationSlotTimes[slot]}
            onComplete={handleComplete}
            onSkip={handleSkip}
          />
        ))
      )}
    </div>
  );
}
