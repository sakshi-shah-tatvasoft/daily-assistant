import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { getTodayIST } from '../utils/dateHelpers';
import { CATEGORIES } from '../utils/constants';
import type { Category } from '../types';

const RANGE_OPTIONS = [
  { key: 7,  label: '7 Days'  },
  { key: 14, label: '14 Days' },
  { key: 30, label: '30 Days' },
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
      const skipped   = tasks.filter(t => t.status === 'skipped').length;
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

  const streak = useMemo(() => {
    let s = 0;
    for (let i = dates.length - 1; i >= 0; i--) {
      if (dailyData[i].pct >= 70) s++;
      else break;
    }
    return s;
  }, [dailyData, dates]);

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
    return dt.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  };

  return (
    <div className={embedded ? '' : 'page pt-6'}>
      {!embedded && <h1 className="page-title mb-5">Reports</h1>}

      {/* Range selector */}
      <div className="flex gap-2 mb-5">
        {RANGE_OPTIONS.map(o => (
          <button
            key={o.key}
            onClick={() => setRange(o.key)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
              range === o.key
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 dark:bg-[#21302D] text-gray-500 dark:text-gray-400'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="card p-4">
          <p className="section-label mb-1">Avg Completion</p>
          <p className="text-3xl font-bold text-brand-600 dark:text-brand-400">{avgPct}%</p>
          <p className="text-xs text-gray-400 mt-0.5">last {range} days</p>
        </div>
        <div className="card p-4">
          <p className="section-label mb-1">Current Streak</p>
          <p className="text-3xl font-bold text-amber-500">🔥 {streak}</p>
          <p className="text-xs text-gray-400 mt-0.5">days ≥ 70%</p>
        </div>
      </div>

      {/* Bar chart */}
      <div className="card p-4 mb-5">
        <p className="section-label mb-4">Daily Completion</p>
        <div className="flex items-end gap-1.5 h-28">
          {dailyData.map(d => (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
              <div
                className={`w-full rounded-t-md transition-all duration-500 ${
                  d.date === today ? 'bg-brand-600' : 'bg-brand-200 dark:bg-brand-800'
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
        <p className="section-label mb-4">By Category</p>
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
                <div className="h-2 bg-gray-100 dark:bg-[#21302D] rounded-full overflow-hidden">
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
        <p className="section-label mb-3">Daily Breakdown</p>
        <div className="space-y-2">
          {[...dailyData].reverse().map(d => (
            <div
              key={d.date}
              className="flex items-center justify-between py-1.5 border-b border-gray-50 dark:border-[#21302D] last:border-0"
            >
              <div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{fmtDate(d.date)}</span>
                {d.date === today && (
                  <span className="ml-2 text-[10px] bg-brand-100 dark:bg-brand-900/30 text-brand-600 px-1.5 py-0.5 rounded-full">Today</span>
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
