import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { CATEGORIES, NOTIFICATION_SLOTS, SLOT_ORDER, DAYS_SHORT } from '../utils/constants';
import type { Category, RepeatType, MealRelation, NotificationSlot, Reminder, StockUnit, StockInfo } from '../types';
import toast from 'react-hot-toast';
import { getTodayIST, formatTime } from '../utils/dateHelpers';
import { stockStatus, courseEndFromDays, parseDosage } from '../utils/schedule';

/** Quick-add templates. Medicine templates set up the PATTERN only — never a medicine name or dose
 *  (the app must not recommend medicines or doses). Habit templates fill everything in. */
interface Template {
  label: string; emoji: string; category: Category; title?: string;
  slots: NotificationSlot[]; mode?: 'daily' | 'days'; weekly?: boolean; courseDays?: number;
}
const MEDICINE_TEMPLATES: Template[] = [
  { label: 'Once daily',   emoji: '☀️', category: 'medicine', slots: ['morning'] },
  { label: 'Twice daily',  emoji: '🌗', category: 'medicine', slots: ['morning', 'after_dinner'] },
  { label: 'Weekly',       emoji: '📅', category: 'medicine', slots: ['morning'], weekly: true },
  { label: '5-day course', emoji: '⏳', category: 'medicine', slots: ['morning', 'after_dinner'], courseDays: 5 },
];
const HABIT_TEMPLATES: Template[] = [
  { label: 'Drink water',   emoji: '💧', category: 'habit',   title: 'Drink water',   slots: ['morning', 'afternoon'] },
  { label: 'Morning walk',  emoji: '🚶', category: 'habit',   title: 'Morning walk',  slots: ['morning'] },
  { label: 'Sleep on time', emoji: '😴', category: 'habit',   title: 'Sleep on time', slots: ['overall'] },
  { label: 'Read',          emoji: '📖', category: 'habit',   title: 'Read 10 pages', slots: ['after_dinner'] },
  { label: 'Meditate',      emoji: '🧘', category: 'habit',   title: 'Meditate',      slots: ['morning'] },
  { label: 'Stretch',       emoji: '🤸', category: 'routine', title: 'Stretch',       slots: ['afternoon'] },
];

const STOCK_UNITS: StockUnit[] = ['tablets', 'capsules', 'ml', 'doses', 'sachets', 'drops'];
const LOW_DAYS = [3, 5, 7];

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
  const { reminders, setReminders, refreshToday, settings, dailyLogs } = useApp();

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

  // Course length (medicines): ongoing, for N days, or until a date
  const today = getTodayIST();
  const [courseMode,  setCourseMode] = useState<'ongoing' | 'days' | 'until'>(existing?.medicine?.endDate ? 'until' : 'ongoing');
  const [courseStart, setCourseStart] = useState(existing?.medicine?.startDate ?? today);
  const [courseDays,  setCourseDays] = useState('5');
  const [courseEnd,   setCourseEnd]  = useState(existing?.medicine?.endDate ?? courseEndFromDays(today, 7));

  // Stock tracking (medicines). Remaining is derived from completed doses since the last refill.
  const oldStock = existing?.medicine?.stock;
  const allLogs = useMemo(() => Object.values(dailyLogs).flatMap(d => d.taskInstances), [dailyLogs]);
  const currentRemaining = existing ? stockStatus(existing, allLogs)?.remaining : undefined;
  const parsed = parseDosage(existing?.medicine?.dosage);
  const [stockOn,     setStockOn]    = useState(!!oldStock);
  const [stockQty,    setStockQty]   = useState(currentRemaining !== undefined ? String(currentRemaining) : '');
  const [stockUnit,   setStockUnit]  = useState<StockUnit>(oldStock?.unit ?? parsed.unit ?? 'tablets');
  const [perDose,     setPerDose]    = useState(oldStock ? String(oldStock.perDose) : parsed.amount ? String(parsed.amount) : '1');
  const [lowDays,     setLowDays]    = useState(oldStock?.lowDays ?? 5);
  const titleRef = useRef<HTMLInputElement>(null);
  const [appliedTemplate, setAppliedTemplate] = useState<string | null>(null);

  const applyTemplate = (t: Template) => {
    setCategory(t.category);
    setSlots(t.slots);
    setCustom(false);
    if (t.weekly) { setMode('days'); setWeekDays([(new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7]); }
    else setMode('daily');
    if (t.courseDays) { setCourseMode('days'); setCourseDays(String(t.courseDays)); setCourseStart(today); }
    else setCourseMode('ongoing');
    if (t.title) setTitle(t.title);
    else { setTitle(''); setTimeout(() => titleRef.current?.focus(), 50); }
    setErrors({});
    setAppliedTemplate(t.label);
  };

  // When the dosage text changes, pre-fill "each dose uses" if the user hasn't set stock yet.
  const onDosageChange = (v: string) => {
    setDosage(v);
    if (!oldStock && !stockOn) {
      const p = parseDosage(v);
      if (p.amount) setPerDose(String(p.amount));
      if (p.unit) setStockUnit(p.unit);
    }
  };


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

  /** Keep the old refill point unless the amount on hand was changed (then it's a new count, from now). */
  const buildStock = (): StockInfo => {
    const qty = Math.round(Number(stockQty) * 10) / 10;
    const base = { unit: stockUnit, perDose: Number(perDose), lowDays };
    if (oldStock && currentRemaining !== undefined && qty === currentRemaining) {
      return { ...base, quantity: oldStock.quantity, refilledAt: oldStock.refilledAt };
    }
    return { ...base, quantity: qty, refilledAt: new Date().toISOString() };
  };

  const handleSave = () => {
    if (saving) return;
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = 'Please enter what to remind you about';
    if (!useCustomTime && slots.length === 0) errs.slots = 'Pick at least one time';
    if (mode === 'days' && weekDays.length === 0) errs.repeat = 'Pick at least one day of the week';
    if (mode === 'monthly' && monthDates.length === 0) errs.repeat = 'Pick at least one date of the month';
    if (mode === 'once' && onceDate < getTodayIST()) errs.repeat = 'Pick today or a future date';
    if (category === 'medicine' && courseMode === 'days') {
      const n = Number(courseDays);
      if (!Number.isInteger(n) || n < 1 || n > 365) errs.course = 'Enter a number of days between 1 and 365';
    }
    if (category === 'medicine' && courseMode === 'until' && courseEnd < courseStart) errs.course = 'End date must be on or after the start date';
    if (category === 'medicine' && stockOn) {
      const q = Number(stockQty), d = Number(perDose);
      if (stockQty.trim() === '' || !Number.isFinite(q) || q < 0 || q > 100000) errs.stock = 'Enter how much you have (0 or more)';
      else if (!Number.isFinite(d) || d <= 0 || d > 1000) errs.stock = 'Enter how much each dose uses (more than 0)';
    }
    setErrors(errs);
    const first = ['title', 'slots', 'repeat', 'course', 'stock'].find(k => errs[k]);
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
          ...(courseMode !== 'ongoing' && {
            startDate: courseStart,
            endDate:   courseMode === 'days' ? courseEndFromDays(courseStart, Number(courseDays)) : courseEnd,
          }),
          ...(stockOn && { stock: buildStock() }),
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

      {/* Quick add (new reminders only) */}
      {!isEdit && (
        <div className="mb-5">
          <p className="section-label mb-2">Quick start</p>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
            {MEDICINE_TEMPLATES.map(t => (
              <button key={t.label} type="button" onClick={() => applyTemplate(t)}
                className={`flex-shrink-0 px-3 py-2 rounded-full text-[13px] font-medium border transition-all ${
                  appliedTemplate === t.label ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-white/[0.06] dark:text-brand-300'
                  : 'border-gray-200 dark:border-[#3A3A3C] text-gray-700 dark:text-gray-300 bg-white dark:bg-[#1C1C1E]'}`}>
                {t.emoji} {t.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 mt-2 -mx-4 px-4 scrollbar-none">
            {HABIT_TEMPLATES.map(t => (
              <button key={t.label} type="button" onClick={() => applyTemplate(t)}
                className={`flex-shrink-0 px-3 py-2 rounded-full text-[13px] font-medium border transition-all ${
                  appliedTemplate === t.label ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-white/[0.06] dark:text-brand-300'
                  : 'border-gray-200 dark:border-[#3A3A3C] text-gray-700 dark:text-gray-300 bg-white dark:bg-[#1C1C1E]'}`}>
                {t.emoji} {t.label}
              </button>
            ))}
          </div>
          {appliedTemplate && MEDICINE_TEMPLATES.some(t => t.label === appliedTemplate) && (
            <p className="text-[11px] text-gray-400 mt-1.5">Timing is set — now add the medicine name and dose as prescribed.</p>
          )}
        </div>
      )}

      {/* Title */}
      <div className="form-group" id="field-title">
        <label className="label" htmlFor="title">What to remind *</label>
        <input id="title" ref={titleRef} className={`input ${errors.title ? 'border-red-400 dark:border-red-500' : ''}`} placeholder="e.g. Iron Syrup"
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
            <input className="input" placeholder="As prescribed, e.g. 10 ml or 1 tablet" value={dosage} onChange={e => onDosageChange(e.target.value)} />
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

      {/* Course length (medicines) */}
      {category === 'medicine' && (
        <div className="form-group" id="field-course">
          <div className="flex items-baseline justify-between mb-1.5">
            <label className="label mb-0">How long?</label>
            {courseMode !== 'ongoing' && !errors.course && (
              <span className="text-xs font-medium text-brand-600 dark:text-brand-400">
                Ends {new Date((courseMode === 'days' ? courseEndFromDays(courseStart, Number(courseDays) || 1) : courseEnd) + 'T00:00:00')
                  .toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
              </span>
            )}
            {errors.course && <span className="text-xs font-medium text-red-500">{errors.course}</span>}
          </div>
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-gray-100 dark:bg-[#2C2C2E] mb-3">
            {([['ongoing', 'Ongoing'], ['days', 'For N days'], ['until', 'Until a date']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => { setCourseMode(k); setErrors(e => ({ ...e, course: '' })); }}
                className={`py-2 rounded-lg text-[13px] font-medium transition-all ${
                  courseMode === k ? 'bg-white dark:bg-[#1C1C1E] text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
                {l}
              </button>
            ))}
          </div>
          {courseMode !== 'ongoing' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-gray-400 mb-1 block">Starts</label>
                <input type="date" className="input" value={courseStart} onChange={e => setCourseStart(e.target.value || today)} />
              </div>
              {courseMode === 'days' ? (
                <div>
                  <label className="text-[11px] text-gray-400 mb-1 block">Number of days</label>
                  <input className="input" inputMode="numeric" value={courseDays} maxLength={3}
                    onChange={e => { setCourseDays(e.target.value.replace(/\D/g, '')); setErrors(er => ({ ...er, course: '' })); }} />
                </div>
              ) : (
                <div>
                  <label className="text-[11px] text-gray-400 mb-1 block">Last day</label>
                  <input type="date" className="input" value={courseEnd} min={courseStart}
                    onChange={e => { setCourseEnd(e.target.value || courseStart); setErrors(er => ({ ...er, course: '' })); }} />
                </div>
              )}
            </div>
          )}
          {courseMode !== 'ongoing' && <p className="text-[11px] text-gray-400 mt-2">Reminders stop automatically after the last day.</p>}
        </div>
      )}

      {/* Stock (medicines) */}
      {category === 'medicine' && (
        <div className="form-group" id="field-stock">
          <button type="button" onClick={() => setStockOn(v => !v)}
            className="w-full flex items-center justify-between p-3 rounded-xl border border-gray-200 dark:border-[#3A3A3C] bg-white dark:bg-[#1C1C1E]">
            <span className="text-left">
              <span className="block text-sm font-medium text-gray-800 dark:text-gray-100">Track stock & refill alerts</span>
              <span className="block text-xs text-gray-400">We'll warn you before it runs out</span>
            </span>
            <span className={`w-11 h-6 rounded-full p-0.5 transition-colors ${stockOn ? 'bg-brand-600' : 'bg-gray-300 dark:bg-[#3A3A3C]'}`}>
              <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${stockOn ? 'translate-x-5' : ''}`} />
            </span>
          </button>
          {stockOn && (
            <div className="card p-3 mt-2 space-y-3">
              {errors.stock && <p className="text-xs text-red-500">{errors.stock}</p>}
              <div>
                <label className="text-[11px] text-gray-400 mb-1 block">{oldStock ? 'You have now (change it after a refill)' : 'You have'}</label>
                <div className="flex gap-2">
                  <input className="input flex-1" inputMode="decimal" placeholder="e.g. 30" value={stockQty} maxLength={7}
                    onChange={e => { setStockQty(e.target.value.replace(/[^\d.]/g, '')); setErrors(er => ({ ...er, stock: '' })); }} />
                  <select className="input w-32" value={stockUnit} onChange={e => setStockUnit(e.target.value as StockUnit)}>
                    {STOCK_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[11px] text-gray-400 mb-1 block">Each dose uses ({stockUnit})</label>
                <input className="input" inputMode="decimal" value={perDose} maxLength={6}
                  onChange={e => { setPerDose(e.target.value.replace(/[^\d.]/g, '')); setErrors(er => ({ ...er, stock: '' })); }} />
              </div>
              <div>
                <label className="text-[11px] text-gray-400 mb-1 block">Warn me when about this many days are left</label>
                <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-gray-100 dark:bg-[#2C2C2E]">
                  {LOW_DAYS.map(d => (
                    <button key={d} type="button" onClick={() => setLowDays(d)}
                      className={`py-2 rounded-lg text-[13px] font-medium ${lowDays === d ? 'bg-white dark:bg-[#1C1C1E] text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
                      {d} days
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-gray-400">Stock goes down only when you tick a dose as taken — undo puts it back.</p>
            </div>
          )}
        </div>
      )}

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
