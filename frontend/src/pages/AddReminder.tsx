import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { CATEGORIES, NOTIFICATION_SLOTS, SLOT_ORDER, DAYS_SHORT } from '../utils/constants';
import type { Category, RepeatType, MealRelation, NotificationSlot, Reminder } from '../types';
import toast from 'react-hot-toast';
import { getTodayIST, formatTime } from '../utils/dateHelpers';

const MEAL_OPTIONS: { value: MealRelation; label: string }[] = [
  { value: 'after',       label: 'After meal'  },
  { value: 'before',      label: 'Before meal' },
  { value: 'with',        label: 'With meal'   },
  { value: 'independent', label: 'No relation' },
];

type RepeatMode = 'daily' | 'days' | 'monthly' | 'once';
const REPEAT_MODES: { key: RepeatMode; label: string }[] = [
  { key: 'daily', label: 'Every day' }, { key: 'days', label: 'Some days' },
  { key: 'monthly', label: 'Monthly' }, { key: 'once', label: 'Once' },
];

function modeFromRepeat(r?: RepeatType): RepeatMode {
  if (r === 'weekdays' || r === 'weekly' || r === 'custom') return 'days';
  if (r === 'monthly' || r === 'once') return r;
  return 'daily';
}

/** Turn the picker state into the stored repeat format (unchanged data model). */
function toRepeat(mode: RepeatMode, weekDays: number[], monthDates: number[]): { repeat: RepeatType; repeatDays?: number[] } {
  if (mode === 'days') {
    if (weekDays.length === 7) return { repeat: 'daily' };
    if (weekDays.join() === '0,1,2,3,4') return { repeat: 'weekdays' };
    return { repeat: 'weekly', repeatDays: weekDays };
  }
  if (mode === 'monthly') return { repeat: 'monthly', repeatDays: monthDates };
  return { repeat: mode };
}

const ordinal = (n: number) => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
const joinList = (xs: string[]) => xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} & ${xs[xs.length - 1]}`;

/** Plain-language summary shown next to "Repeat". */
function repeatSummary(mode: RepeatMode, weekDays: number[], monthDates: number[], onceDate: string): string {
  if (mode === 'daily') return 'Every day';
  if (mode === 'days') {
    if (!weekDays.length) return 'Pick the days below';
    if (weekDays.length === 7) return 'Every day';
    if (weekDays.join() === '0,1,2,3,4') return 'Every weekday (Mon–Fri)';
    if (weekDays.join() === '5,6') return 'Every weekend';
    return `Every ${joinList(weekDays.map(i => DAYS_SHORT[i]))}`;
  }
  if (mode === 'monthly') {
    if (!monthDates.length) return 'Pick the dates below';
    return `On the ${joinList(monthDates.map(ordinal))} of every month`;
  }
  return `Once, on ${new Date(onceDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}`;
}

function uid() {
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function AddReminder() {
  const navigate = useNavigate();
  const { id }   = useParams<{ id: string }>();
  const { reminders, setReminders, refreshToday, settings } = useApp();

  const existing = id ? reminders.find(r => r.id === id) : undefined;
  const isEdit   = !!existing;

  const [title,       setTitle]      = useState(existing?.title ?? '');
  const [description, setDesc]       = useState(existing?.description ?? '');
  const [category,    setCategory]   = useState<Category>(existing?.category ?? 'medicine');
  const [slots,       setSlots]      = useState<NotificationSlot[]>(existing?.slots ?? ['morning']);
  const [useCustomTime, setCustom]   = useState(!!(existing?.customTime));
  const [customTime,  setCustomTime] = useState(existing?.customTime ?? '09:00');
  // Repeat: each mode keeps its own selection, so switching back and forth never loses choices.
  const [mode,        setMode]       = useState<RepeatMode>(modeFromRepeat(existing?.repeat));
  const [weekDays,    setWeekDays]   = useState<number[]>(
    existing?.repeat === 'weekdays' ? [0, 1, 2, 3, 4]
    : existing?.repeat === 'weekly' || existing?.repeat === 'custom' ? (existing.repeatDays ?? []) : []
  );
  const [monthDates,  setMonthDates] = useState<number[]>(
    existing?.repeat === 'monthly' ? (existing.repeatDays ?? []) : []
  );
  const [onceDate,    setOnceDate]   = useState(existing?.date ?? getTodayIST());
  const [errors,      setErrors]     = useState<Record<string, string>>({});
  const [saving,      setSaving]     = useState(false);
  const [dosage,      setDosage]     = useState(existing?.medicine?.dosage ?? '');
  const [mealRel,     setMealRel]    = useState<MealRelation>(existing?.medicine?.mealRelation ?? 'after');
  const [notes,       setNotes]      = useState(existing?.notes ?? '');


  const toggleSlot = (s: NotificationSlot) => {
    setSlots(prev =>
      prev.includes(s)
        ? prev.length > 1 ? prev.filter(x => x !== s) : prev // must keep at least 1
        : [...prev, s]
    );
  };

  const toggleDay = (d: number) => {
    setWeekDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a, b) => a - b));
    setErrors(e => ({ ...e, repeat: '' }));
  };

  const toggleDate = (d: number) => {
    setMonthDates(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a, b) => a - b));
    setErrors(e => ({ ...e, repeat: '' }));
  };

  const handleSave = () => {
    if (saving) return;
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = 'Please enter what to remind you about';
    if (!useCustomTime && slots.length === 0) errs.slots = 'Pick at least one time';
    if (mode === 'days' && weekDays.length === 0) errs.repeat = 'Pick at least one day of the week';
    if (mode === 'monthly' && monthDates.length === 0) errs.repeat = 'Pick at least one date of the month';
    if (mode === 'once' && onceDate < getTodayIST()) errs.repeat = 'Pick today or a future date';
    setErrors(errs);
    const first = ['title', 'slots', 'repeat'].find(k => errs[k]);
    if (first) {
      document.getElementById(`field-${first}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setSaving(true);
    const { repeat, repeatDays } = toRepeat(mode, weekDays, monthDates);

    const reminder: Reminder = {
      id:        existing?.id ?? uid(),
      title:     title.trim(),
      description: description.trim() || undefined,
      category,
      slots:     useCustomTime ? [] : slots,
      customTime: useCustomTime ? customTime : undefined,
      repeat,
      repeatDays,
      date:      repeat === 'once' ? onceDate : undefined,
      isActive:  existing?.isActive ?? true,
      notes:     notes.trim() || undefined,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      ...(category === 'medicine' && {
        medicine: {
          dosage:       dosage.trim() || undefined,
          mealRelation: mealRel,
        },
      }),
    };

    setReminders(prev =>
      isEdit ? prev.map(r => r.id === id ? reminder : r) : [...prev, reminder]
    );
    refreshToday();
    toast.success(isEdit ? 'Reminder updated!' : 'Reminder added!');
    navigate('/reminders');
  };

  return (
    <div className="page pt-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="btn-icon"><ArrowLeft size={20} /></button>
        <h1 className="page-title">{isEdit ? 'Edit Reminder' : 'Add Reminder'}</h1>
      </div>

      {/* Title */}
      <div className="form-group" id="field-title">
        <label className="label" htmlFor="title">What to remind *</label>
        <input id="title" className={`input ${errors.title ? 'border-red-400 dark:border-red-500' : ''}`} placeholder="e.g. Iron Syrup"
          value={title} onChange={e => { setTitle(e.target.value); setErrors(er => ({ ...er, title: '' })); }} maxLength={80} />
        {errors.title && <p className="text-xs text-red-500 mt-1.5">{errors.title}</p>}
      </div>

      {/* Category */}
      <div className="form-group">
        <label className="label">Type</label>
        <div className="grid grid-cols-2 gap-2">
          {(Object.entries(CATEGORIES) as [Category, typeof CATEGORIES[Category]][]).map(([k, c]) => (
            <button
              key={k}
              onClick={() => setCategory(k)}
              className={`p-3 rounded-xl border-2 text-left transition-all ${
                category === k ? 'border-brand-500 bg-brand-50 dark:bg-white/[0.06]' : 'border-gray-200 dark:border-[#2C2C2E]'
              }`}
            >
              <span className="text-lg block mb-0.5">
                {k === 'medicine' ? '💊' : k === 'habit' ? '✨' : k === 'routine' ? '🔄' : '✅'}
              </span>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{c.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Medicine extras */}
      {category === 'medicine' && (
        <>
          <div className="form-group">
            <label className="label">Dosage</label>
            <input className="input" placeholder="e.g. 10ml, 60,000 IU, 1 tablet" value={dosage} onChange={e => setDosage(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="label">When to take</label>
            <div className="grid grid-cols-2 gap-2">
              {MEAL_OPTIONS.map(o => (
                <button key={o.value} onClick={() => setMealRel(o.value)}
                  className={`p-2.5 rounded-xl border text-sm font-medium transition-all ${
                    mealRel === o.value
                      ? 'border-brand-500 bg-brand-50 dark:bg-white/[0.06] text-brand-600 dark:text-brand-400'
                      : 'border-gray-200 dark:border-[#2C2C2E] text-gray-500 dark:text-gray-400'
                  }`}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Notification Slots */}
      <div className="form-group" id="field-slots">
        <label className="label">Notify me at</label>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-2.5">
          Select one or more daily notification times. Pick two for twice-daily.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {SLOT_ORDER.map(s => {
            const def      = NOTIFICATION_SLOTS[s];
            const selected = !useCustomTime && slots.includes(s);
            return (
              <button key={s} onClick={() => { setCustom(false); toggleSlot(s); }}
                className={`p-3 rounded-xl border-2 flex items-center gap-2.5 transition-all ${
                  selected ? 'border-brand-500 bg-brand-50 dark:bg-white/[0.06]' : 'border-gray-200 dark:border-[#2C2C2E]'
                }`}>
                <span className="text-xl">{def.emoji}</span>
                <div className="text-left min-w-0">
                  <p className={`text-sm font-semibold ${selected ? 'text-brand-600 dark:text-brand-400' : 'text-gray-700 dark:text-gray-300'}`}>
                    {def.label}
                  </p>
                  <p className="text-[11px] text-gray-400">{formatTime(settings.notificationSlotTimes[s])}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Custom time toggle */}
        <button
          onClick={() => setCustom(c => !c)}
          className={`mt-2.5 w-full p-2.5 rounded-xl border text-sm transition-all ${
            useCustomTime
              ? 'border-brand-500 bg-brand-50 dark:bg-white/[0.06] text-brand-600 dark:text-brand-400'
              : 'border-dashed border-gray-300 dark:border-[#2C2C2E] text-gray-400'
          }`}
        >
          {useCustomTime ? '✓ Using custom time' : '+ Use a specific time instead'}
        </button>
        {useCustomTime && (
          <input type="time" className="input mt-2" value={customTime} onChange={e => setCustomTime(e.target.value)} />
        )}
      </div>

      {/* Repeat */}
      <div className="form-group" id="field-repeat">
        <div className="flex items-baseline justify-between mb-1.5">
          <label className="label mb-0">Repeat</label>
          <span className={`text-xs font-medium ${errors.repeat ? 'text-red-500' : 'text-brand-600 dark:text-brand-400'}`}>
            {errors.repeat || repeatSummary(mode, weekDays, monthDates, onceDate)}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-gray-100 dark:bg-[#2C2C2E] mb-3">
          {REPEAT_MODES.map(m => (
            <button key={m.key} type="button" onClick={() => { setMode(m.key); setErrors(e => ({ ...e, repeat: '' })); }}
              className={`py-2 rounded-lg text-[13px] font-medium transition-all ${
                mode === m.key ? 'bg-white dark:bg-[#1C1C1E] text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
              {m.label}
            </button>
          ))}
        </div>

        {mode === 'days' && (
          <div className="card p-3">
            <div className="flex justify-between">
              {DAYS_SHORT.map((d, i) => (
                <button key={d} type="button" onClick={() => toggleDay(i)} aria-pressed={weekDays.includes(i)}
                  className={`w-11 h-11 rounded-full text-xs font-semibold transition-all ${
                    weekDays.includes(i) ? 'bg-brand-600 text-white' : 'bg-gray-100 dark:bg-[#2C2C2E] text-gray-500 dark:text-gray-400'}`}>
                  {d}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              {[{ label: 'Weekdays', days: [0, 1, 2, 3, 4] }, { label: 'Weekends', days: [5, 6] }].map(p => (
                <button key={p.label} type="button" onClick={() => { setWeekDays(p.days); setErrors(e => ({ ...e, repeat: '' })); }}
                  className="px-3 py-1.5 rounded-full text-xs font-medium border border-gray-200 dark:border-[#3A3A3C] text-gray-600 dark:text-gray-300">
                  {p.label}
                </button>
              ))}
              {weekDays.length > 0 && (
                <button type="button" onClick={() => setWeekDays([])} className="px-3 py-1.5 rounded-full text-xs text-gray-400 ml-auto">
                  Clear
                </button>
              )}
            </div>
          </div>
        )}

        {mode === 'monthly' && (
          <div className="card p-3">
            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                <button key={d} type="button" onClick={() => toggleDate(d)} aria-pressed={monthDates.includes(d)}
                  className={`aspect-square rounded-lg text-xs font-semibold transition-all ${
                    monthDates.includes(d) ? 'bg-brand-600 text-white' : 'bg-gray-100 dark:bg-[#2C2C2E] text-gray-500 dark:text-gray-400'}`}>
                  {d}
                </button>
              ))}
            </div>
            {monthDates.some(d => d > 28) && (
              <p className="text-[11px] text-gray-400 mt-2">In shorter months, dates that don't exist (like 31) are skipped.</p>
            )}
          </div>
        )}

        {mode === 'once' && (
          <input type="date" className="input" value={onceDate} min={getTodayIST()}
            onChange={e => { setOnceDate(e.target.value); setErrors(er => ({ ...er, repeat: '' })); }} />
        )}
      </div>

      {/* Description */}
      <div className="form-group">
        <label className="label">Description (optional)</label>
        <input className="input" placeholder="Short note..." value={description} onChange={e => setDesc(e.target.value)} />
      </div>

      {/* Notes */}
      <div className="form-group">
        <label className="label">Notes (optional)</label>
        <textarea className="input resize-none" rows={2} placeholder="Any additional instructions..." value={notes} onChange={e => setNotes(e.target.value)} />
      </div>

      <div className="sticky bottom-0 -mx-4 px-4 pt-3 mt-2 bg-cream/95 dark:bg-[#0E0E10]/95 backdrop-blur"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
        <button onClick={handleSave} disabled={saving} className="btn-primary w-full disabled:opacity-60">
          {isEdit ? 'Save changes' : 'Add reminder'}
        </button>
      </div>
    </div>
  );
}
