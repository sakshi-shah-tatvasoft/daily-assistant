import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { weeklySummary } from '../utils/insights';
import { getTodayIST, isExcused } from '../utils/dateHelpers';
import { CATEGORIES } from '../utils/constants';
import type { Category } from '../types';
import { t, locale } from '../lib/i18n';

const RANGE_OPTIONS = [
  { key: 7,  label: t('7 Days')  },
  { key: 14, label: t('14 Days') },
  { key: 30, label: t('30 Days') },
];

/** Last n calendar days ending today (IST), as YYYY-MM-DD. */
function getDatesBefore(n: number): string[] {
  const today = getTodayIST();
  const dates: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

export default function Reports({ embedded = false }: { embedded?: boolean }) {
  const { dailyLogs: logs } = useApp();
  const [range, setRange] = useState(7);
  const today = getTodayIST();

  const dates = useMemo(() => getDatesBefore(range), [range]);

  const dailyData = useMemo(() =>
    dates.map(date => {
      const log = logs[date];
      if (!log) return { date, pct: 0, completed: 0, total: 0 };
      const tasks     = log.taskInstances;
      const total     = tasks.length;
      const completed = tasks.filter(t => t.status === 'completed').length;
      const skipped   = tasks.filter(isExcused).length;
      const effective = total - skipped;
      const pct       = effective > 0 ? Math.round((completed / effective) * 100) : 0;
      return { date, pct, completed, total };
    }),
  [dates, logs]);

  const avgPct = useMemo(() => {
    const days = dailyData.filter(d => d.total > 0);
    if (!days.length) return 0;
    return Math.round(days.reduce((s, d) => s + d.pct, 0) / days.length);
  }, [dailyData]);

  // Days with nothing scheduled (free days, holiday mode) and an unfinished today don't break the streak.
  const streak = useMemo(() => {
    let s = 0;
    for (let i = dates.length - 1; i >= 0; i--) {
      const d = dailyData[i];
      if (d.total === 0 || (d.date === today && d.pct < 70)) continue;
      if (d.pct >= 70) s++;
      else break;
    }
    return s;
  }, [dailyData, dates, today]);

  const week = useMemo(() => weeklySummary(Object.values(logs).flatMap(l => l.taskInstances), today), [logs, today]);

  const categoryStats = useMemo(() => {
    const map: Record<string, { completed: number; total: number }> = {};
    for (const date of dates) {
      const log = logs[date];
      if (!log) continue;
      for (const task of log.taskInstances) {
        if (!map[task.category]) map[task.category] = { completed: 0, total: 0 };
        map[task.category].total++;
        if (task.status === 'completed') map[task.category].completed++;
      }
    }
    return map;
  }, [dates, logs]);

  const maxPct = Math.max(...dailyData.map(d => d.pct), 1);

  const fmtDate = (d: string) => {
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString(locale(), { month: 'short', day: 'numeric' });
  };

  return (
    <div className={embedded ? '' : 'page pt-6'}>
      {!embedded && <h1 className="page-title mb-5">{t('Reports')}</h1>}

      {/* Range selector */}
      <div className="flex gap-2 mb-5">
        {RANGE_OPTIONS.map(o => (
          <button
            key={o.key}
            onClick={() => setRange(o.key)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
              range === o.key
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 dark:bg-[#2C2C2E] text-gray-500 dark:text-gray-400'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* This week (same as the Sunday summary notification) */}
      {week && (
        <div className="card p-4 mb-4">
          <div className="flex items-baseline justify-between">
            <p className="section-label">{t('This week')}</p>
            <p className="text-lg font-bold text-brand-600 dark:text-brand-400">{week.pct}%</p>
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-200 mt-1">{t('{n} of {total} done in the last 7 days.', { n: week.done, total: week.total })}</p>
          {week.pattern
            ? <p className="text-xs text-saffron-600 mt-1">💡 {t('Most often missed: {pattern}.', { pattern: week.pattern })}</p>
            : week.pct === 100 && <p className="text-xs text-brand-600 dark:text-brand-400 mt-1">{t('Nothing missed — wonderful! 🎉')}</p>}
        </div>
      )}

      <Link to="/report" className="card p-4 mb-5 flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-white/[0.06] flex items-center justify-center flex-shrink-0">
          <FileText size={18} className="text-brand-600 dark:text-brand-400" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-gray-900 dark:text-white">{t('Report for your doctor')}</span>
          <span className="block text-xs text-gray-400">{t('What you took and missed — print or save as PDF')}</span>
        </span>
        <span className="text-gray-300">›</span>
      </Link>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="card p-4">
          <p className="section-label mb-1">{t('Avg Completion')}</p>
          <p className="text-3xl font-bold text-brand-600 dark:text-brand-400">{avgPct}%</p>
          <p className="text-xs text-gray-400 mt-0.5">{t('last {n} days', { n: range })}</p>
        </div>
        <div className="card p-4">
          <p className="section-label mb-1">{t('Current Streak')}</p>
          <p className="text-3xl font-bold text-amber-500">🔥 {streak}</p>
          <p className="text-xs text-gray-400 mt-0.5">{t('days ≥ 70%')}</p>
        </div>
      </div>

      {/* Bar chart */}
      <div className="card p-4 mb-5">
        <p className="section-label mb-4">{t('Daily Completion')}</p>
        <div className="flex items-end gap-1.5 h-28">
          {dailyData.map(d => (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
              <div
                className={`w-full rounded-t-md transition-all duration-500 ${
                  d.date === today ? 'bg-brand-600' : 'bg-brand-200 dark:bg-[#2C2C2E]'
                }`}
                style={{ height: `${(d.pct / maxPct) * 96}px`, minHeight: d.total > 0 ? '4px' : '0' }}
                title={`${d.pct}%`}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-1.5 mt-1.5">
          {dailyData.map((d, i) => (
            <div key={d.date} className="flex-1 text-center">
              {(range <= 7 || i === 0 || i === dailyData.length - 1 || i % 3 === 0) && (
                <span className="text-[9px] text-gray-400">{fmtDate(d.date)}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Category breakdown */}
      <div className="card p-4 mb-5">
        <p className="section-label mb-4">{t('By Category')}</p>
        <div className="space-y-3">
          {(Object.entries(CATEGORIES) as [Category, typeof CATEGORIES[Category]][]).map(([k, c]) => {
            const stat = categoryStats[k];
            if (!stat) return null;
            const pct = Math.round((stat.completed / Math.max(stat.total, 1)) * 100);
            return (
              <div key={k}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-gray-700 dark:text-gray-300">{c.label}</span>
                  <span className="text-gray-400">{stat.completed}/{stat.total} ({pct}%)</span>
                </div>
                <div className="h-2 bg-gray-100 dark:bg-[#2C2C2E] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, backgroundColor: c.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Daily list */}
      <div className="card p-4">
        <p className="section-label mb-3">{t('Daily Breakdown')}</p>
        <div className="space-y-2">
          {[...dailyData].reverse().map(d => (
            <div
              key={d.date}
              className="flex items-center justify-between py-1.5 border-b border-gray-50 dark:border-[#2C2C2E] last:border-0"
            >
              <div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{fmtDate(d.date)}</span>
                {d.date === today && (
                  <span className="ml-2 text-[10px] bg-brand-100 dark:bg-white/[0.08] text-brand-600 px-1.5 py-0.5 rounded-full">{t('Today')}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{d.completed}/{d.total}</span>
                <span
                  className={`text-sm font-semibold w-10 text-right ${
                    d.pct >= 70 ? 'text-emerald-500' : d.pct >= 40 ? 'text-amber-500' : 'text-red-400'
                  }`}
                >
                  {d.total > 0 ? `${d.pct}%` : '—'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
