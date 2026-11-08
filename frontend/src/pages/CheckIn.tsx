import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Check, AlarmClock } from 'lucide-react';
import toast from 'react-hot-toast';
import { useApp } from '../context/AppContext';
import { NOTIFICATION_SLOTS, CATEGORIES } from '../utils/constants';
import { formatTime, getTodayIST, isMissed } from '../utils/dateHelpers';
import { doseMeta } from '../utils/dose';
import EmptyState from '../components/ui/EmptyState';
import { celebrate } from '../components/ui/Celebration';
import type { NotificationSlot } from '../types';
import { snooze, getSnooze, cancelSnooze } from '../lib/snooze';

const CATEGORY_ORDER = { medicine: 0, habit: 1, routine: 2, task: 3 } as const;

/**
 * Per-reminder check-in, opened by tapping a notification (/checkin/after_dinner, /checkin/custom-<id>).
 * Tick what you've done → Submit. Anything left unticked is saved as "missed".
 */
export default function CheckIn() {
  const { key = '' } = useParams<{ key: string }>();
  const navigate = useNavigate();
  const { todayTasks, reminders, settings, submitCheckIn, profile } = useApp();
  const [snoozedUntil, setSnoozedUntil] = useState<Date | null>(null);
  const [snoozing, setSnoozing] = useState(false);
  useEffect(() => { getSnooze(key).then(setSnoozedUntil); }, [key]);

  const isCustom = key.startsWith('custom-');
  const slot = (isCustom ? null : key) as NotificationSlot | null;
  const slotDef = slot ? NOTIFICATION_SLOTS[slot] : undefined;

  const items = useMemo(() => todayTasks.filter(t =>
    isCustom ? (!t.slot && t.reminderId === key.slice(7)) : t.slot === slot)
    .sort((a, b) => CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category]), [todayTasks, key, isCustom, slot]);
  const reminderById = useMemo(() => new Map(reminders.map(r => [r.id, r])), [reminders]);

  const [checked, setChecked] = useState<Set<string> | null>(null);
  // Initialise once items are available (they may load a moment after opening from a notification).
  const ticks = checked ?? new Set(items.filter(t => t.status === 'completed').map(t => t.id));
  const toggle = (id: string) => {
    const next = new Set(ticks);
    if (next.has(id)) next.delete(id); else next.add(id);
    setChecked(next);
  };

  const label = slotDef ? slotDef.label : 'Reminder';
  const emoji = slotDef ? slotDef.emoji : '⏰';
  const time = slot ? settings.notificationSlotTimes[slot] : items[0]?.scheduledTime;
  const alreadyDone = items.length > 0 && items.every(t => t.status !== 'pending');
  const dateLabel = new Date(getTodayIST() + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  const doSnooze = async (minutes: number) => {
    setSnoozing(true);
    try {
      const due = await snooze(key, minutes);
      setSnoozedUntil(due);
      toast.success(`Okay — we'll remind you at ${due.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`, { id: 'checkin' });
      navigate('/', { replace: true });
    } catch {
      toast.error("Couldn't snooze — check your connection", { id: 'checkin' });
    } finally { setSnoozing(false); }
  };

  const submit = () => {
    const done = items.filter(t => ticks.has(t.id)).map(t => t.id);
    const missed = items.filter(t => !ticks.has(t.id)).map(t => t.id);
    submitCheckIn(done, missed);
    if (snoozedUntil) { cancelSnooze(key); setSnoozedUntil(null); }   // checked in → no snoozed reminder
    if (!missed.length) celebrate(`${label} done! ✨`);
    else toast.success(`${label} saved · ${missed.length} missed`, { id: 'checkin' });
    navigate('/', { replace: true });
  };

  if (!items.length) {
    return (
      <div className="page pt-6">
        <button onClick={() => navigate('/')} className="btn-icon mb-2" aria-label="Back"><ArrowLeft size={18} /></button>
        <EmptyState title="Nothing to check in" text={`There's nothing scheduled for ${label.toLowerCase()} today.`}
          action={<Link to="/" className="btn-primary">Go to Today</Link>} />
      </div>
    );
  }

  return (
    <div className="page pt-0 pb-0">
      {/* Header band */}
      <div className="-mx-4 px-5 pt-6 pb-12 rounded-b-[28px] bg-gradient-to-br from-brand-600 to-brand-700 dark:from-[#1C1C1E] dark:to-[#1C1C1E]">
        <button onClick={() => navigate('/')} className="w-9 h-9 rounded-full bg-white/15 text-white flex items-center justify-center mb-4" aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        <p className="text-xs text-white/70">{dateLabel}{time ? ` · ${formatTime(time)}` : ''}</p>
        <h1 className="text-[22px] font-bold text-white">{emoji} {label} check-in</h1>
      </div>

      <div className="card -mt-8 relative shadow-md overflow-hidden mb-3">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <p className="text-sm text-gray-500 dark:text-gray-400">Tick what you've done</p>
          <button onClick={() => setChecked(new Set(items.map(t => t.id)))}
            className="text-xs font-semibold text-brand-600 dark:text-brand-400">Tick all</button>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-[#2C2C2E]">
          {items.map(t => {
            const on = ticks.has(t.id);
            const r = reminderById.get(t.reminderId);
            const cat = CATEGORIES[t.category];
            return (
              <button key={t.id} onClick={() => toggle(t.id)} role="checkbox" aria-checked={on}
                className="w-full flex items-center gap-3 px-4 py-4 text-left active:bg-gray-50 dark:active:bg-white/[0.04] transition-colors">
                <span className={`w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                  on ? 'bg-brand-600 border-brand-600 scale-105' : 'border-gray-300 dark:border-gray-600'}`}>
                  {on && <Check size={16} className="text-white" strokeWidth={3} />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-semibold text-gray-900 dark:text-white">{t.title}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cat.color }} />
                    {doseMeta(r) || cat.label}
                    {!on && isMissed(t) && <span className="text-red-400">· missed earlier</span>}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {alreadyDone && (
        <p className="text-xs text-center text-gray-500 dark:text-gray-400 mb-3">
          Already checked in ✓ — you can change it and submit again.
        </p>
      )}

      {/* Snooze — only useful while something is still pending and notifications are on */}
      {!alreadyDone && profile.push_enabled && (
        <div className="card p-3 mb-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1.5">
            <AlarmClock size={14} />
            {snoozedUntil
              ? `Snoozed until ${snoozedUntil.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} — or remind me in:`
              : 'Not now? Remind me in:'}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[10, 30, 60].map(m => (
              <button key={m} type="button" disabled={snoozing} onClick={() => doSnooze(m)}
                className="py-2 rounded-xl text-[13px] font-medium bg-gray-100 dark:bg-[#2C2C2E] text-gray-700 dark:text-gray-200 active:scale-95 transition-transform disabled:opacity-50">
                {m === 60 ? '1 hour' : `${m} min`}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="sticky bottom-0 -mx-4 px-4 pt-3 bg-cream/95 dark:bg-[#0E0E10]/95 backdrop-blur"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
        <button onClick={submit} className="btn-primary w-full py-3.5 text-[15px]">
          <Check size={18} strokeWidth={3} /> Submit {label}
        </button>
        <p className="text-[11px] text-center text-gray-400 mt-2">
          {ticks.size === items.length ? 'All done — nice!' : `${items.length - ticks.size} unticked will be saved as missed`}
        </p>
      </div>
    </div>
  );
}
