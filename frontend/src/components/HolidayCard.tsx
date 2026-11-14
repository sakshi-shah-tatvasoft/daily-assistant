import { useState } from 'react';
import toast from 'react-hot-toast';
import { useApp } from '../context/AppContext';
import { getTodayIST } from '../utils/dateHelpers';
import { isPausedOn } from '../utils/schedule';
import Rich from './ui/Rich';
import { t, locale } from '../lib/i18n';

const addDays = (date: string, n: number) => {
  const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};
const pretty = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' });
const QUICK = [{ label: t('3 days'), days: 3 }, { label: t('1 week'), days: 7 }, { label: t('2 weeks'), days: 14 }];
const MAX_DAYS = 60;

/** Settings: holiday mode — pause every reminder (and water, refill and weekly pushes) up to a date. */
export default function HolidayCard() {
  const { profile, updateProfile } = useApp();
  const today = getTodayIST();
  const paused = isPausedOn(profile, today);
  const [until, setUntil] = useState(addDays(today, 6));
  const max = addDays(today, MAX_DAYS - 1);
  const valid = until >= today && until <= max;

  const pause = () => {
    if (!valid) return;
    updateProfile({ paused_until: until });
    toast.success(t('Reminders paused until {date} 🌴', { date: pretty(until) }), { id: 'holiday' });
  };
  const resume = () => { updateProfile({ paused_until: null }); toast.success(t('Reminders are back on'), { id: 'holiday' }); };

  return (
    <div className="card p-4 mb-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">🌴 {t('Holiday mode')}</p>
        <span className={`text-xs font-semibold ${paused ? 'text-saffron-600' : 'text-gray-400'}`}>{paused ? t('On') : t('Off')}</span>
      </div>
      {paused ? (
        <>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-3">
            <Rich text={t('All reminders are paused until **{date}**. Nothing is counted as missed.', { date: pretty(profile.paused_until!) })} />
          </p>
          <button onClick={resume} className="btn-secondary w-full">{t('Resume reminders now')}</button>
        </>
      ) : (
        <>
          <p className="text-xs text-gray-400 mt-0.5 mb-3 leading-relaxed">
            {t('Travelling or unwell? Pause every reminder for a while. Nothing is counted as missed, and it switches back on by itself.')}
          </p>
          <div className="flex gap-2 mb-3">
            {QUICK.map(q => {
              const d = addDays(today, q.days - 1);
              return (
                <button key={q.label} type="button" onClick={() => setUntil(d)}
                  className={`flex-1 py-2 rounded-xl text-[13px] font-medium border ${until === d
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-white/[0.06] dark:text-brand-300'
                    : 'border-gray-200 dark:border-[#3A3A3C] text-gray-600 dark:text-gray-300'}`}>
                  {q.label}
                </button>
              );
            })}
          </div>
          <label className="text-[11px] text-gray-400 mb-1 block" htmlFor="holiday-until">{t('Pause until (last day)')}</label>
          <input id="holiday-until" type="date" className="input mb-3" value={until} min={today} max={max}
            onChange={e => setUntil(e.target.value || today)} />
          {!valid && <p className="text-xs text-red-500 -mt-2 mb-3">{t('Pick a date from today up to {date}.', { date: pretty(max) })}</p>}
          <button onClick={pause} disabled={!valid} className="btn-primary w-full disabled:opacity-50">
            {t('Pause until {date}', { date: pretty(until) })}
          </button>
        </>
      )}
    </div>
  );
}
