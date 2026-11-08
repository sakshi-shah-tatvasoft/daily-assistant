import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { CATEGORIES, NOTIFICATION_SLOTS, SLOT_ORDER, REPEAT_OPTIONS, DAYS_SHORT } from '../utils/constants';
import type { Category, RepeatType, MealRelation, NotificationSlot, Reminder } from '../types';
import toast from 'react-hot-toast';
import { getTodayIST } from '../utils/dateHelpers';

const MEAL_OPTIONS: { value: MealRelation; label: string }[] = [
  { value: 'after',       label: 'After meal'  },
  { value: 'before',      label: 'Before meal' },
  { value: 'with',        label: 'With meal'   },
  { value: 'independent', label: 'No relation' },
];

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
  const [repeat,      setRepeat]     = useState<RepeatType>(existing?.repeat ?? 'daily');
  const [repeatDays,  setRepeatDays] = useState<number[]>(existing?.repeatDays ?? []);
  const [monthDates,  setMonthDates] = useState<number[]>(
    existing?.repeat === 'monthly' ? (existing.repeatDays ?? []) : []
  );
  const [dosage,      setDosage]     = useState(existing?.medicine?.dosage ?? '');
  const [mealRel,     setMealRel]    = useState<MealRelation>(existing?.medicine?.mealRelation ?? 'after');
  const [notes,       setNotes]      = useState(existing?.notes ?? '');

  useEffect(() => {
    if (repeat !== 'custom' && repeat !== 'weekly') setRepeatDays([]);
    if (repeat !== 'monthly') setMonthDates([]);
  }, [repeat]);

  const toggleSlot = (s: NotificationSlot) => {
    setSlots(prev =>
      prev.includes(s)
        ? prev.length > 1 ? prev.filter(x => x !== s) : prev // must keep at least 1
        : [...prev, s]
    );
  };

  const toggleDay = (d: number) => {
    setRepeatDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  };

  const toggleDate = (d: number) => {
    setMonthDates(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  };

  const handleSave = () => {
    if (!title.trim()) { toast.error('Please enter a title'); return; }
    if (!useCustomTime && slots.length === 0) { toast.error('Select at least one notification slot'); return; }
    if (repeat === 'weekly' && repeatDays.length === 0) { toast.error('Pick at least one day'); return; }
    if (repeat === 'monthly' && monthDates.length === 0) { toast.error('Pick at least one date'); return; }

    const reminder: Reminder = {
      id:        existing?.id ?? uid(),
      title:     title.trim(),
      description: description.trim() || undefined,
      category,
      slots:     useCustomTime ? [] : slots,
      customTime: useCustomTime ? customTime : undefined,
      repeat,
      repeatDays: repeat === 'weekly' || repeat === 'custom'
        ? repeatDays
        : repeat === 'monthly'
        ? monthDates
        : undefined,
      date:      repeat === 'once' ? (existing?.date ?? getTodayIST()) : undefined,
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
      <div className="form-group">
        <label className="label">What to remind *</label>
        <input className="input" placeholder="e.g. Iron Syrup" value={title} onChange={e => setTitle(e.target.value)} maxLength={80} />
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
                category === k ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : 'border-gray-200 dark:border-[#21302D]'
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
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400'
                      : 'border-gray-200 dark:border-[#21302D] text-gray-500 dark:text-gray-400'
                  }`}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Notification Slots */}
      <div className="form-group">
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
                  selected ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : 'border-gray-200 dark:border-[#21302D]'
                }`}>
                <span className="text-xl">{def.emoji}</span>
                <div className="text-left min-w-0">
                  <p className={`text-sm font-semibold ${selected ? 'text-brand-600 dark:text-brand-400' : 'text-gray-700 dark:text-gray-300'}`}>
                    {def.label}
                  </p>
                  <p className="text-[11px] text-gray-400">{settings.notificationSlotTimes[s]}</p>
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
              ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400'
              : 'border-dashed border-gray-300 dark:border-[#21302D] text-gray-400'
          }`}
        >
          {useCustomTime ? '✓ Using custom time' : '+ Use a specific time instead'}
        </button>
        {useCustomTime && (
          <input type="time" className="input mt-2" value={customTime} onChange={e => setCustomTime(e.target.value)} />
        )}
      </div>

      {/* Repeat */}
      <div className="form-group">
        <label className="label">Repeat</label>
        <div className="space-y-2">
          {REPEAT_OPTIONS.map(o => (
            <button
              key={o.value}
              onClick={() => setRepeat(o.value as RepeatType)}
              className={`w-full p-3 rounded-xl border text-left text-sm font-medium transition-all ${
                repeat === o.value
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400'
                  : 'border-gray-200 dark:border-[#21302D] text-gray-600 dark:text-gray-300'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Weekly day picker */}
      {(repeat === 'weekly' || repeat === 'custom') && (
        <div className="form-group">
          <label className="label">Which day(s) of the week?</label>
          <div className="flex gap-2 flex-wrap">
            {DAYS_SHORT.map((d, i) => (
              <button key={d} onClick={() => toggleDay(i)}
                className={`w-11 h-11 rounded-full text-xs font-semibold transition-all ${
                  repeatDays.includes(i)
                    ? 'bg-brand-600 text-white shadow-md shadow-brand-200 dark:shadow-brand-900/40'
                    : 'bg-gray-100 dark:bg-[#21302D] text-gray-500 dark:text-gray-400'
                }`}>
                {d}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {repeatDays.length === 0 ? 'No days selected' : `Every ${repeatDays.map(i => DAYS_SHORT[i]).join(', ')}`}
          </p>
        </div>
      )}

      {/* Monthly date picker */}
      {repeat === 'monthly' && (
        <div className="form-group">
          <label className="label">Which date(s) of the month?</label>
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
              <button key={d} onClick={() => toggleDate(d)}
                className={`aspect-square rounded-lg text-xs font-semibold transition-all ${
                  monthDates.includes(d)
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-100 dark:bg-[#21302D] text-gray-500 dark:text-gray-400'
                }`}>
                {d}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {monthDates.length === 0 ? 'No dates selected' : `On the ${monthDates.sort((a,b)=>a-b).join(', ')} of each month`}
          </p>
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

      <button onClick={handleSave} className="btn-primary w-full mt-2">
        {isEdit ? 'Save Changes' : 'Add Reminder'}
      </button>
    </div>
  );
}
