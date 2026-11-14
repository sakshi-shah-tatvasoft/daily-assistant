import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { useApp } from '../context/AppContext';
import { WATER_EVERY, DEFAULT_WATER, waterTimes } from '../lib/water';
import { formatTime } from '../utils/dateHelpers';
import type { WaterSettings } from '../types';
import { t } from '../lib/i18n';

const EVERY_LABEL: Record<number, string> = { 30: t('30 min'), 60: t('1 hr'), 120: t('2 hrs'), 180: t('3 hrs') };

/** Water reminders: its own small screen so the normal add form stays simple. */
export default function WaterSetup() {
  const navigate = useNavigate();
  const { profile, updateProfile } = useApp();
  const current = profile.water;
  const isOn = !!current?.on;
  const [w, setW] = useState<WaterSettings>({ ...DEFAULT_WATER, ...(current ?? {}), on: true });
  const set = (patch: Partial<WaterSettings>) => setW(prev => ({ ...prev, ...patch }));

  const count = waterTimes(w).length;
  const valid = w.to > w.from && count > 0;

  const save = () => {
    if (!valid) return;
    updateProfile({ water: w });
    toast.success(isOn ? t('Water reminders updated') : t('Water reminders on 💧'), { id: 'water' });
    navigate('/', { replace: true });
  };
  const turnOff = () => {
    updateProfile({ water: { ...w, on: false } });
    toast.success(t('Water reminders off'), { id: 'water' });
    navigate(-1);
  };

  return (
    <div className="page pt-4 pb-0">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="btn-icon"><ArrowLeft size={20} /></button>
        <h1 className="page-title">{t('Drink water')}</h1>
      </div>

      <div className="card p-5 text-center mb-6">
        <p className="text-4xl mb-1" aria-hidden="true">💧</p>
        <p className="text-lg font-semibold text-gray-900 dark:text-white">{t('Water reminders')}</p>
        <p className="text-sm text-gray-400">{t('Gentle nudges through the day')}</p>
      </div>

      <div className="form-group">
        <label className="label">{t('Remind me every')}</label>
        <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-gray-100 dark:bg-[#2C2C2E]">
          {WATER_EVERY.map(m => (
            <button key={m} type="button" onClick={() => set({ every: m })} aria-pressed={w.every === m}
              className={`py-2 rounded-lg text-[13px] font-medium ${w.every === m
                ? 'bg-white dark:bg-[#1C1C1E] text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
              {EVERY_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="form-group grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="w-from">{t('From')}</label>
          <input id="w-from" type="time" className="input text-center" value={w.from}
            onChange={e => e.target.value && set({ from: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="w-to">{t('To')}</label>
          <input id="w-to" type="time" className="input text-center" value={w.to}
            onChange={e => e.target.value && set({ to: e.target.value })} />
        </div>
      </div>

      <div className="form-group">
        <label className="label">{t('Daily goal')}</label>
        <div className="card flex items-center justify-between">
          <button type="button" aria-label={t('Fewer glasses')} onClick={() => set({ goal: Math.max(1, w.goal - 1) })}
            className="px-5 py-3 text-2xl text-brand-600 dark:text-brand-400 disabled:opacity-30" disabled={w.goal <= 1}>–</button>
          <span className="text-base font-semibold text-gray-900 dark:text-white">{t(w.goal === 1 ? '{n} glass' : '{n} glasses', { n: w.goal })}</span>
          <button type="button" aria-label={t('More glasses')} onClick={() => set({ goal: Math.min(20, w.goal + 1) })}
            className="px-5 py-3 text-2xl text-brand-600 dark:text-brand-400 disabled:opacity-30" disabled={w.goal >= 20}>+</button>
        </div>
      </div>

      {valid ? (
        <div className="rounded-2xl bg-brand-50 dark:bg-white/[0.06] px-4 py-3 text-[13px] text-brand-700 dark:text-brand-300 mb-2">
          🔔 {t(count === 1 ? 'About 1 reminder a day, {from} – {to}.' : 'About {n} reminders a day, {from} – {to}.', { n: count, from: formatTime(w.from), to: formatTime(w.to) })}<br />
          {t('They stop once you reach your goal.')}
        </div>
      ) : (
        <p className="rounded-2xl bg-red-50 dark:bg-red-500/10 px-4 py-3 text-[13px] text-red-600 dark:text-red-400 mb-2">
          {t('“To” must be at least {time} after “From”.', { time: EVERY_LABEL[w.every] })}
        </p>
      )}
      <p className="text-xs text-gray-400 text-center mb-4">{t("Water doesn't count in your medicine score.")}</p>

      <div className="sticky bottom-0 -mx-4 px-4 pt-3 mt-2 bg-cream/95 dark:bg-[#0E0E10]/95 backdrop-blur space-y-2"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
        <button onClick={save} disabled={!valid} className="btn-primary w-full disabled:opacity-50">
          {isOn ? t('Save changes') : t('Start water reminders')}
        </button>
        {isOn && (
          <button onClick={turnOff} className="w-full py-2.5 text-sm font-medium text-red-500">{t('Turn off water reminders')}</button>
        )}
      </div>
    </div>
  );
}
