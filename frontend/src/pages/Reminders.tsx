import { useMemo, useState } from 'react';
import { stockStatus, courseStatus, isAsNeeded } from '../utils/schedule';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, Power, PowerOff } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { SkeletonList } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import { confirmDialog } from '../components/ui/ConfirmDialog';
import { NOTIFICATION_SLOTS, CATEGORIES } from '../utils/constants';
import type { Category, Reminder, TaskInstance } from '../types';
import toast from 'react-hot-toast';
import { t, locale } from '../lib/i18n';

const FILTERS: { key: 'all' | Category; label: string }[] = [
  { key: 'all',      label: t('All')      },
  { key: 'medicine', label: t('Medicine') },
  { key: 'habit',    label: t('Habit')    },
  { key: 'routine',  label: t('Routine')  },
  { key: 'task',     label: t('Task')     },
];

export default function Reminders() {
  const navigate = useNavigate();
  const { reminders, setReminders, allLogs, fresh } = useApp();

  const [filter, setFilter] = useState<'all' | Category>('all');

  const filtered = filter === 'all' ? reminders : reminders.filter(r => r.category === filter);

  const toggleActive = (id: string) => {
    setReminders(prev => prev.map(r => r.id === id ? { ...r, isActive: !r.isActive } : r));
  };

  const deleteReminder = async (r: Reminder) => {
    const ok = await confirmDialog({ title: t('Delete "{title}"?', { title: r.title }), message: t('You will stop getting reminders for it. Your past history stays in Progress.'), confirmText: t('Delete reminder'), tone: 'danger' });
    if (!ok) return;
    setReminders(prev => prev.filter(x => x.id !== r.id));
    toast.success(t('Reminder deleted'));
  };

  const repeatLabel = (r: Reminder) => {
    if (r.repeat === 'daily')    return t('Daily');
    if (r.repeat === 'once')     return t('Once');
    if (r.repeat === 'weekdays') return t('Weekdays');
    if (r.repeat === 'weekly')   return t('Weekly');
    if (r.repeat === 'monthly')  return t('Monthly');
    return t('Custom');
  };

  return (
    <div className="page pt-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="page-title">{t('Reminders')}</h1>
        <button
          onClick={() => navigate('/reminders/add')}
          className="btn-primary py-2 px-4"
        >
          <Plus size={16} />
          {t('Add')}
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-5 scrollbar-none">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
              filter === f.key
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 dark:bg-[#2C2C2E] text-gray-500 dark:text-gray-400'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {reminders.length === 0 && !fresh ? (
        <SkeletonList rows={4} circle={false} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={reminders.length ? t('Nothing in this category') : t('No reminders yet')}
          text={reminders.length ? t('Try another filter, or add a new reminder.') : t('Add your medicines and daily habits — we will remind you at the right time.')}
          action={<button className="btn-primary" onClick={() => navigate('/reminders/add')}>{t('Add a reminder')}</button>}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map(r => {
            const cat = CATEGORIES[r.category];
            return (
              <div key={r.id} className={`card p-4 ${!r.isActive ? 'opacity-50' : ''}`}>
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-lg"
                    style={{ backgroundColor: cat.bg, color: cat.color }}
                  >
                    {r.category === 'medicine' ? '💊' : r.category === 'habit' ? '✨' : r.category === 'routine' ? '🔄' : '✅'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{r.title}</p>
                    {r.description && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{r.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="badge" style={{ backgroundColor: cat.bg, color: cat.color }}>
                        {cat.label}
                      </span>
                      {r.slots.length > 0 && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {r.slots.map(s => NOTIFICATION_SLOTS[s].label).join(' & ')}
                        </span>
                      )}
                      <span className="text-xs text-gray-400 dark:text-gray-500">{isAsNeeded(r) ? '🆘 ' + t('Only when needed') : repeatLabel(r)}</span>
                      {r.medicine?.dosage && (
                        <span className="text-xs text-gray-400">{r.medicine.dosage}</span>
                      )}
                    </div>
                    <ReminderExtras r={r} logs={allLogs} />
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-50 dark:border-[#2C2C2E]">
                  <button onClick={() => navigate(`/reminders/edit/${r.id}`)} className="btn h-8 px-3 text-xs rounded-xl text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-white/[0.06]">
                    <Edit2 size={13} /> {t('Edit')}
                  </button>
                  <button
                    onClick={() => toggleActive(r.id)}
                    className={`btn h-8 px-3 text-xs rounded-xl ${r.isActive
                      ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
                      : 'bg-gray-100 dark:bg-[#2C2C2E] text-gray-400'}`}
                  >
                    {r.isActive ? <Power size={13} /> : <PowerOff size={13} />}
                    {r.isActive ? t('Active') : t('Paused')}
                  </button>
                  <button onClick={() => deleteReminder(r)} className="ml-auto btn h-8 w-8 rounded-xl bg-gray-100 dark:bg-[#2C2C2E] text-gray-500 dark:text-gray-400 hover:bg-red-50 hover:text-red-500" aria-label={t('Delete {title}', { title: r.title })}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Course progress and stock chips under a reminder. */
function ReminderExtras({ r, logs }: { r: Reminder; logs: TaskInstance[] }) {
  const course = courseStatus(r);
  const stock = stockStatus(r, logs);
  if (!course && !stock) return null;
  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
  return (
    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
      {course && (
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
          course.state === 'finished' ? 'bg-gray-100 text-gray-500 dark:bg-[#2C2C2E] dark:text-gray-400'
          : 'bg-brand-50 text-brand-700 dark:bg-white/[0.06] dark:text-brand-300'}`}>
          {course.state === 'upcoming' ? t('Starts {date}', { date: fmt(course.startDate) })
            : course.state === 'finished' ? t('✓ Course finished')
            : course.total ? t('Day {n} of {total}', { n: course.day, total: course.total }) : t('Day {n}', { n: course.day })}
        </span>
      )}
      {stock && (
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
          stock.out ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'
          : stock.low ? 'bg-saffron-500/15 text-saffron-600'
          : 'bg-gray-100 text-gray-600 dark:bg-[#2C2C2E] dark:text-gray-300'}`}>
          🧴 {stock.out ? t('Out of stock') : `${stock.remaining} ${t(stock.unit)}${stock.daysLeft !== null ? ' · ' + t('~{n}d', { n: stock.daysLeft }) : ''}`}
        </span>
      )}
    </div>
  );
}
