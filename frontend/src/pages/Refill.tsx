import { useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { useApp } from '../context/AppContext';
import { stockStatus, dosesPerDay } from '../utils/schedule';
import EmptyState from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { t } from '../lib/i18n';

/**
 * "I bought more" screen (/refill/:id), opened from the refill notification, the Today banner or the edit form.
 * New amount = what's left now + what was added. The refill point moves to now, so only doses ticked
 * from here on count against the new total — everything else works exactly as before.
 */
export default function Refill() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { reminders, setReminders, allLogs, fresh } = useApp();
  const r = reminders.find(x => x.id === id);
  const logs = allLogs;
  const st = r ? stockStatus(r, logs) : null;
  const [added, setAdded] = useState('');
  const [error, setError] = useState('');

  if (!r && !fresh) {   // opened from a notification before data arrived
    return (
      <div className="page pt-4" role="status" aria-label="Loading">
        <Skeleton className="w-10 h-10 rounded-xl mb-6" />
        <Skeleton className="h-36 w-full rounded-2xl mb-5" />
        <Skeleton className="h-12 w-full rounded-2xl" />
      </div>
    );
  }

  if (!r || !r.medicine?.stock || !st) {
    return (
      <div className="page pt-4">
        <button onClick={() => navigate('/')} className="btn-icon mb-4"><ArrowLeft size={20} /></button>
        <EmptyState title={t('Nothing to refill')} text={t("This medicine isn't tracking stock any more.")} />
      </div>
    );
  }

  const stock = r.medicine.stock;
  const unit = stock.unit;
  const n = Number(added);
  const valid = added.trim() !== '' && Number.isFinite(n) && n > 0 && n <= 100000;
  const total = Math.round(((valid ? n : 0) + st.remaining) * 10) / 10;
  const perDay = dosesPerDay(r) * stock.perDose;
  const quick = unit === 'ml' ? [100, 200, 300] : [10, 15, 30];

  const save = () => {
    if (!valid) { setError(t('Enter how many {unit} you added', { unit: t(unit) })); return; }
    const now = new Date().toISOString();
    setReminders(prev => prev.map(x => x.id !== r.id ? x : {
      ...x, medicine: { ...x.medicine!, stock: { ...stock, quantity: total, refilledAt: now } },
    }));
    toast.success(t('Refilled — you now have {n} {unit}', { n: total, unit: t(unit) }), { id: 'refill' });
    navigate('/', { replace: true });
  };

  return (
    <div className="page pt-4 pb-0">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="btn-icon"><ArrowLeft size={20} /></button>
        <h1 className="page-title">{t('Refill')}</h1>
      </div>

      <div className="card p-5 text-center mb-5">
        <p className="text-3xl mb-1" aria-hidden="true">🧴</p>
        <p className="text-lg font-semibold text-gray-900 dark:text-white">{r.title}</p>
        <p className={`text-sm mt-1 ${st.out ? 'text-red-600 dark:text-red-400' : st.low ? 'text-saffron-600' : 'text-gray-500'}`}>
          {t('{n} {unit} left', { n: st.remaining, unit: t(unit) })}{st.daysLeft !== null && !st.out ? ' · ' + t(st.daysLeft === 1 ? 'about 1 day' : 'about {n} days', { n: st.daysLeft }) : ''}
        </p>
      </div>

      <div className="form-group">
        <label className="label" htmlFor="added">{t('How many did you add?')}</label>
        <div className="flex gap-2">
          <input id="added" className={`input flex-1 ${error ? 'border-red-400 dark:border-red-500' : ''}`} inputMode="decimal"
            placeholder={t('e.g. 15')} value={added} maxLength={7} autoFocus
            onChange={e => { setAdded(e.target.value.replace(/[^\d.]/g, '')); setError(''); }} />
          <span className="input w-28 flex items-center justify-center text-gray-500">{t(unit)}</span>
        </div>
        <div className="flex gap-2 mt-2.5">
          {quick.map(q => (
            <button key={q} type="button" onClick={() => { setAdded(String(q)); setError(''); }}
              className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium border ${Number(added) === q
                ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-white/[0.06] dark:text-brand-300'
                : 'border-gray-200 dark:border-[#3A3A3C] text-gray-600 dark:text-gray-300'}`}>
              +{q}
            </button>
          ))}
        </div>
        {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
      </div>

      <div className="rounded-2xl bg-brand-50 dark:bg-white/[0.06] px-4 py-3 mb-4 flex items-center justify-between">
        <span className="text-sm text-gray-600 dark:text-gray-300">{t('{a} left + {b} added', { a: st.remaining, b: valid ? n : 0 })}</span>
        <span className="text-base font-bold text-brand-700 dark:text-brand-300">= {total} {t(unit)}</span>
      </div>
      {valid && perDay > 0 && (
        <p className="text-xs text-gray-400 -mt-2 mb-4 text-center">{t('Enough for about {n} days', { n: Math.floor(total / perDay) })}</p>
      )}

      <p className="text-xs text-gray-400 text-center mb-4">
        {t('Counted wrong?')} <Link to={`/reminders/edit/${r.id}`} className="text-brand-600 dark:text-brand-400 font-medium">{t('Set the exact amount')}</Link>
      </p>

      <div className="sticky bottom-0 -mx-4 px-4 pt-3 mt-2 bg-cream/95 dark:bg-[#0E0E10]/95 backdrop-blur"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
        <button onClick={save} className="btn-primary w-full">{t('Save refill')}</button>
      </div>
    </div>
  );
}
