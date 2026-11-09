import { useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Plus, Check, SkipForward, Clock, UserRound } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getGreeting, getTodayIST, formatTime, getCurrentTimeIST, isExcused, isMissed } from '../utils/dateHelpers';
import { NOTIFICATION_SLOTS, SLOT_ORDER, CATEGORIES } from '../utils/constants';
import { doseMeta, actionWord } from '../utils/dose';
import ProgressRing from '../components/ui/ProgressRing';
import { stockStatus, isAsNeeded, isPausedOn } from '../utils/schedule';
import WaterCard from '../components/WaterCard';
import EmptyState from '../components/ui/EmptyState';
import { celebrate } from '../components/ui/Celebration';
import type { NotificationSlot, Reminder, TaskInstance } from '../types';
import toast from 'react-hot-toast';

type Group = { key: string; label: string; emoji: string; time: string; tasks: TaskInstance[] };

const SLOT_SHORT: Record<NotificationSlot, string> = { morning: 'Morning', afternoon: 'Afternoon', after_dinner: 'Dinner', overall: 'Night' };

// Medicines first, then habits, routines, tasks — stable within each.
const CATEGORY_ORDER = { medicine: 0, habit: 1, routine: 2, task: 3 } as const;
const byCategory = (a: TaskInstance, b: TaskInstance) => CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category];

function TaskRow({ t, reminder, onToggle, onSkip }: {
  t: TaskInstance; reminder?: Reminder;
  onToggle: (t: TaskInstance) => void; onSkip: (t: TaskInstance) => void;
}) {
  const done = t.status === 'completed';
  const skipped = t.status === 'skipped';
  const meta = doseMeta(reminder);
  const cat = CATEGORIES[t.category];
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <button
        onClick={() => onToggle(t)}
        aria-label={done || skipped ? `Undo ${t.title}` : `Mark ${t.title} ${actionWord(reminder)}`}
        className={`w-7 h-7 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all duration-150 active:scale-90 ${
          done ? 'bg-brand-600 border-brand-600 dark:bg-brand-500 dark:border-brand-500'
               : skipped ? 'border-dashed border-gray-300 dark:border-gray-600'
               : 'border-gray-300 dark:border-gray-600 hover:border-brand-400'}`}
      >
        {done && <Check size={14} className="text-white" strokeWidth={3} />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-[15px] font-medium leading-snug ${done || skipped ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>
          {t.title}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-1.5 truncate">
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
          {isMissed(t) ? 'Missed' : skipped ? 'Skipped' : meta || cat.label}
        </p>
      </div>
      {!done && !skipped && (
        <button onClick={() => onSkip(t)} className="btn-icon w-8 h-8 flex-shrink-0" aria-label={`Skip ${t.title}`}>
          <SkipForward size={14} />
        </button>
      )}
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { todayTasks, reminders, settings, completeTask, skipTask, undoTask, profile, allLogs, sosLogs, logSos, removeSos, updateProfile } = useApp();
  const nowTime = getCurrentTimeIST();
  const today = getTodayIST();

  const reminderById = useMemo(() => new Map(reminders.map(r => [r.id, r])), [reminders]);

  // Refill warnings (derived from completed doses since the last refill)
  const stockAlerts = useMemo(() => {
    const logs = allLogs;
    return reminders
      .map(r => ({ r, s: stockStatus(r, logs) }))
      .filter((x): x is { r: Reminder; s: NonNullable<ReturnType<typeof stockStatus>> } => !!x.s && (x.s.low || x.s.out))
      .sort((a, b) => Number(b.s.out) - Number(a.s.out) || (a.s.daysLeft ?? 0) - (b.s.daysLeft ?? 0));
  }, [reminders, allLogs]);

  // Slot groups + any custom-time reminders
  const groups: Group[] = useMemo(() => {
    const out: Group[] = SLOT_ORDER.map((s: NotificationSlot) => ({
      key: s, label: NOTIFICATION_SLOTS[s].label, emoji: NOTIFICATION_SLOTS[s].emoji,
      time: settings.notificationSlotTimes[s], tasks: todayTasks.filter(t => t.slot === s).sort(byCategory),
    }));
    const custom = todayTasks.filter(t => !t.slot).sort(byCategory);
    if (custom.length) out.push({ key: 'custom', label: 'Other times', emoji: '⏰', time: '', tasks: custom });
    return out.filter(g => g.tasks.length);
  }, [todayTasks, settings.notificationSlotTimes]);

  const active = todayTasks.filter(t => !isExcused(t));
  const doneCount = active.filter(t => t.status === 'completed').length;
  const pending = todayTasks.filter(t => t.status === 'pending')
    .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime) || byCategory(a, b));
  const next = pending[0];
  const nextReminder = next ? reminderById.get(next.reminderId) : undefined;
  const nextGroupPending = next ? pending.filter(t => t.slot === next.slot && t.scheduledTime === next.scheduledTime).length : 0;
  const allDone = todayTasks.length > 0 && pending.length === 0;

  /** Short message with an Undo button — makes it obvious that a tap can be reversed. */
  const undoToast = (msg: string, id: string) => toast(tst => (
    <span className="flex items-center gap-3">
      <span>{msg}</span>
      <button onClick={() => { undoTask(id); toast.dismiss(tst.id); }}
        className="text-sm font-semibold text-brand-600 dark:text-brand-400 px-2 py-1 -my-1 rounded-lg active:bg-brand-50">
        Undo
      </button>
    </span>
  ), { id: 'today-action', duration: 4000, icon: '✓' });

  // After an action, celebrate finishing a slot or the whole day.
  const afterComplete = (t: TaskInstance) => {
    const remaining = todayTasks.filter(x => x.id !== t.id && x.status === 'pending');
    if (remaining.length === 0) { toast.dismiss('today-action'); celebrate('Day complete! 🎉'); return; }
    if (t.slot && !remaining.some(x => x.slot === t.slot)) {
      toast.success(`${NOTIFICATION_SLOTS[t.slot].label} done ✨`, { id: 'today-action' });
      return;
    }
    undoToast(`${t.title} ${actionWord(reminderById.get(t.reminderId))}`, t.id);
  };

  const onToggle = (t: TaskInstance) => {
    if (t.status === 'pending') { completeTask(t.id); afterComplete(t); }
    else { undoTask(t.id); toast(`Undone: ${t.title}`, { id: 'today-action', icon: '↩️', duration: 1500 }); }
  };
  const onSkip = (t: TaskInstance) => {
    skipTask(t.id);
    undoToast(`Skipped: ${t.title}`, t.id);
  };

  const dateLabel = new Date(today + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  const firstName = profile.display_name?.split(' ')[0];
  const nextLabel = next
    ? next.scheduledTime <= nowTime ? `Due since ${formatTime(next.scheduledTime)}` : `Next up · ${formatTime(next.scheduledTime)}`
    : '';
  const nextName = next ? (next.slot ? NOTIFICATION_SLOTS[next.slot].label : 'Reminder') : '';

  const paused = isPausedOn(profile, today);
  const pausedLabel = profile.paused_until
    ? new Date(profile.paused_until + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
  const sosMeds = reminders.filter(r => r.isActive && isAsNeeded(r));
  const tookOne = (r: Reminder) => {
    const id = logSos(r);
    toast(tst => (
      <span className="flex items-center gap-3">
        <span className="text-sm">Logged: {r.title}</span>
        <button onClick={() => { removeSos(id); toast.dismiss(tst.id); }}
          className="text-sm font-semibold text-brand-600 dark:text-brand-400">Undo</button>
      </span>
    ), { id: 'today-action', duration: 4000 });
  };

  /** Water, as-needed medicines and refill warnings — shown whether or not anything is scheduled today. */
  const extras = (
    <>
    {/* Water glasses */}
    {profile.water?.on && <WaterCard water={profile.water} />}

    {/* Refill warnings */}
    {stockAlerts.length > 0 && (
      <div className="mb-5 space-y-2">
        {stockAlerts.slice(0, 3).map(({ r, s }) => (
          <Link key={r.id} to={`/refill/${r.id}`}
            className={`flex items-center gap-3 rounded-2xl px-4 py-3 border ${s.out
              ? 'bg-red-50 border-red-200 dark:bg-red-500/10 dark:border-red-500/30'
              : 'bg-saffron-500/10 border-saffron-400/40'}`}>
            <span className="text-xl" aria-hidden="true">🧴</span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-gray-900 dark:text-white truncate">{r.title}</span>
              <span className={`block text-xs ${s.out ? 'text-red-600 dark:text-red-400' : 'text-saffron-600'}`}>
                {s.out ? 'Out of stock — time to refill' : s.daysLeft === null ? `Only ${s.remaining} ${s.unit} left` : `About ${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'} left · ${s.remaining} ${s.unit}`}
              </span>
            </span>
            <span className="text-xs font-semibold text-brand-600 dark:text-brand-400">Refill</span>
          </Link>
        ))}
      </div>
    )}

      {/* As needed (SOS) medicines */}
      {sosMeds.length > 0 && (
        <section className="mb-5">
          <div className="flex items-center gap-2 mb-2 px-1">
            <span className="text-base">🆘</span>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Only when needed</h2>
          </div>
          <div className="card divide-y divide-gray-100 dark:divide-[#2C2C2E] overflow-hidden">
            {sosMeds.map(r => {
              const todays = sosLogs.filter(t => t.reminderId === r.id && t.date === today).sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
              const last = todays[todays.length - 1];
              return (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-medium text-gray-900 dark:text-white truncate">{r.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {todays.length ? `Taken ${todays.length}× today · last ${formatTime(last.scheduledTime)}` : (doseMeta(r) || 'Not taken today')}
                    </p>
                  </div>
                  <button onClick={() => tookOne(r)}
                    className="px-3.5 py-1.5 rounded-xl bg-brand-600 text-white text-sm font-semibold active:scale-95 transition-transform flex-shrink-0">
                    Took one
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );

  return (
    <div className="page pt-0">
      {/* Header band */}
      <div className={`-mx-4 px-5 pt-6 rounded-b-[28px] bg-gradient-to-br from-brand-600 to-brand-700 dark:from-[#1C1C1E] dark:to-[#1C1C1E] ${todayTasks.length ? 'pb-14' : 'pb-6'}`}>
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs text-white/70 mb-0.5">{dateLabel}</p>
            <h1 className="text-[22px] font-bold text-white leading-tight">
              {getGreeting()}{firstName ? `, ${firstName}` : ''}
            </h1>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={() => navigate('/reminders/add')} aria-label="Add reminder"
              className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm active:scale-95 transition-transform">
              <Plus size={20} className="text-brand-700" />
            </button>
            <Link to="/settings" aria-label="Settings and profile"
              className="w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center font-semibold active:scale-95 transition-transform">
              {firstName ? firstName[0].toUpperCase() : <UserRound size={18} />}
            </Link>
          </div>
        </div>
      </div>

      {/* Holiday mode */}
      {paused && (
        <div className="mt-4 mb-1 rounded-2xl px-4 py-3 border bg-saffron-500/10 border-saffron-400/40 flex items-center gap-3">
          <span className="text-xl" aria-hidden="true">🌴</span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-gray-900 dark:text-white">Holiday mode</span>
            <span className="block text-xs text-saffron-600">Reminders paused until {pausedLabel}</span>
          </span>
          <button onClick={() => { updateProfile({ paused_until: null }); toast.success('Reminders are back on', { id: 'holiday' }); }}
            className="text-xs font-semibold text-brand-600 dark:text-brand-400">Resume now</button>
        </div>
      )}

      {todayTasks.length === 0 ? (
        <>
          <EmptyState
            title={paused ? 'Enjoy your break 🌴' : reminders.length ? 'Nothing scheduled today' : 'Add your first reminder'}
            text={paused ? 'Nothing is due while holiday mode is on — no missed doses will be counted.'
              : reminders.length
              ? 'Enjoy a free day — your reminders will be back when they are due.'
              : 'Add a medicine or a daily habit, and we will gently nudge you at the right time.'}
            action={paused ? undefined : <button className="btn-primary" onClick={() => navigate('/reminders/add')}><Plus size={16} /> Add reminder</button>}
          />
          {extras}
        </>
      ) : (
        <>
          {/* Today at a glance */}
          <div className="card p-4 mb-5 -mt-10 relative shadow-md">
            <div className="flex items-center gap-4">
              <ProgressRing done={doneCount} total={active.length} />
              <div className="flex-1 min-w-0">
                {allDone ? (
                  <>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Today</p>
                    <p className="text-base font-semibold text-gray-900 dark:text-white">All done for today 🎉</p>
                    <Link to="/progress" className="text-xs font-semibold text-brand-600 dark:text-brand-400">See your progress →</Link>
                  </>
                ) : (
                  <>
                    <p className={`text-xs flex items-center gap-1 ${next && next.scheduledTime <= nowTime ? 'text-saffron-600' : 'text-gray-500 dark:text-gray-400'}`}>
                      <Clock size={12} /> {nextLabel}
                    </p>
                    <p className="text-base font-semibold text-gray-900 dark:text-white truncate">{nextName}</p>
                    <span className="inline-block mt-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-saffron-500/15 text-saffron-600">
                      {nextGroupPending} {nextGroupPending === 1 ? 'item' : 'items'} left
                    </span>
                  </>
                )}
              </div>
            </div>
            {/* Your day in 4 slots */}
            <div className="flex justify-between mt-4 px-1">
              {SLOT_ORDER.map(s => {
                const items = todayTasks.filter(t => t.slot === s);
                const state = !items.length ? 'none'
                  : items.every(t => t.status !== 'pending') ? 'done'
                  : next?.slot === s ? 'current' : 'later';
                return (
                  <div key={s} className="flex flex-col items-center gap-1 w-16" title={`${NOTIFICATION_SLOTS[s].label}: ${state}`}>
                    <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${
                      state === 'done' ? 'bg-brand-600 dark:bg-brand-500'
                      : state === 'current' ? 'bg-saffron-500 ring-4 ring-saffron-500/20'
                      : state === 'later' ? 'border-2 border-brand-300 dark:border-[#48484A]'
                      : 'bg-gray-200 dark:bg-[#2C2C2E]'}`}>
                      {state === 'done' && <Check size={9} className="text-white" strokeWidth={4} />}
                    </span>
                    <span className={`text-[10px] ${state === 'current' ? 'text-saffron-600 font-semibold' : 'text-gray-400'}`}>
                      {SLOT_SHORT[s]}
                    </span>
                  </div>
                );
              })}
            </div>
            {next && (
              <button onClick={() => onToggle(next)} className="btn-primary w-full mt-4">
                <Check size={16} strokeWidth={3} /> Mark {next.title} as {actionWord(nextReminder)}
              </button>
            )}
          </div>

          {extras}

          {/* Slot groups */}
          {groups.map(g => {
            const gActive = g.tasks.filter(t => !isExcused(t));
            const gDone = gActive.filter(t => t.status === 'completed').length;
            const complete = g.tasks.every(t => t.status !== 'pending');
            const isCurrent = !!next && g.tasks.some(t => t.id === next.id);
            const isDue = isCurrent && next!.scheduledTime <= nowTime;
            return (
              <section key={g.key} className="mb-4">
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="text-base">{complete ? '✅' : g.emoji}</span>
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{g.label}</h2>
                  {g.time && <span className="text-xs text-gray-400">{formatTime(g.time)}</span>}
                  {isCurrent && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-saffron-500/15 text-saffron-600">
                      {isDue ? 'Due now' : 'Up next'}
                    </span>
                  )}
                  <span className={`ml-auto text-xs font-semibold ${complete ? 'text-brand-600 dark:text-brand-400' : 'text-gray-400'}`}>
                    {gDone}/{gActive.length}
                  </span>
                  {g.key !== 'custom' && !complete && g.time <= nowTime && (
                    <Link to={`/checkin/${g.key}`} className="text-xs font-semibold px-3 py-1 rounded-full bg-brand-600 text-white active:scale-95 transition-transform">
                      Check in
                    </Link>
                  )}
                </div>
                <div className={`card divide-y divide-gray-100 dark:divide-[#2C2C2E] overflow-hidden ${
                  isCurrent ? 'border-saffron-400/70 dark:border-saffron-500/50 ring-2 ring-saffron-400/20' : ''}`}>
                  {g.tasks.map(t => (
                    <TaskRow key={t.id} t={t} reminder={reminderById.get(t.reminderId)} onToggle={onToggle} onSkip={onSkip} />
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
