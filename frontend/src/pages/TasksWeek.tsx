import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Check, X, Loader2, RefreshCw } from 'lucide-react';
import { tasksApi, type WeekTasksResponse } from '../lib/tasks';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const fmtShort = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export default function TasksWeek() {
  const [start, setStart] = useState<string | undefined>(undefined); // undefined = this week
  const [data, setData]   = useState<WeekTasksResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      setData(await tasksApi.getWeek(start));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load week');
    }
  }, [start]);

  useEffect(() => { load(); }, [load]);

  const isCurrentWeek = data ? data.today >= data.start && data.today <= data.end : true;

  // Lookup: "taskId|date" -> completed
  const cell = new Map(data?.logs.map(l => [`${l.taskId}|${l.date}`, l.completed]) ?? []);
  const submitted = new Set(data?.submittedDays ?? []);

  const dayTotals = data?.days.map(d => {
    const logs = data.logs.filter(l => l.date === d);
    return { done: logs.filter(l => l.completed).length, total: logs.length };
  }) ?? [];

  return (
    <div className="page pt-6">
      <div className="flex items-center gap-3 mb-5">
        <Link to="/tasks" className="btn-icon" aria-label="Back"><ArrowLeft size={18} /></Link>
        <h1 className="page-title">Weekly Progress</h1>
      </div>

      <div className="flex items-center justify-between mb-4">
        <button
          className="btn-icon"
          aria-label="Previous week"
          disabled={!data}
          onClick={() => data && setStart(shiftDate(data.start, -7))}
        ><ChevronLeft size={18} /></button>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
          {data ? `${fmtShort(data.start)} – ${fmtShort(data.end)}` : '…'}
          {data && isCurrentWeek && <span className="ml-2 text-[10px] bg-brand-100 dark:bg-brand-900/30 text-brand-600 px-1.5 py-0.5 rounded-full">This week</span>}
        </p>
        <button
          className="btn-icon disabled:opacity-30"
          aria-label="Next week"
          disabled={!data || isCurrentWeek}
          onClick={() => data && setStart(shiftDate(data.start, 7))}
        ><ChevronRight size={18} /></button>
      </div>

      {error && (
        <div className="card p-6 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{error}</p>
          <button onClick={load} className="btn-secondary"><RefreshCw size={16} /> Try again</button>
        </div>
      )}

      {!error && !data && (
        <div className="flex justify-center py-16 text-gray-400"><Loader2 className="animate-spin" /></div>
      )}

      {data && data.tasks.length === 0 && (
        <div className="card p-6 text-center text-sm text-gray-500 dark:text-gray-400">
          No tasks yet. <Link to="/tasks/manage" className="text-brand-600 dark:text-brand-400 font-medium">Add some</Link>
        </div>
      )}

      {data && data.tasks.length > 0 && (
        <>
          <div className="card p-3 overflow-x-auto">
            <table className="w-full border-separate" style={{ borderSpacing: '0 4px' }}>
              <thead>
                <tr>
                  <th className="text-left section-label font-semibold pb-1 pr-2">Task</th>
                  {data.days.map((d, i) => (
                    <th key={d} className={`text-center text-[10px] font-semibold pb-1 w-8 ${d === data.today ? 'text-brand-600 dark:text-brand-400' : 'text-gray-400'}`}>
                      {DAY_LABELS[i]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.tasks.map(t => (
                  <tr key={t.id}>
                    <td className={`text-xs pr-2 py-1 max-w-[120px] truncate ${t.deleted ? 'text-gray-400 italic' : 'text-gray-700 dark:text-gray-200'}`} title={t.name}>
                      {t.name}
                    </td>
                    {data.days.map(d => {
                      const v = cell.get(`${t.id}|${d}`);
                      return (
                        <td key={d} className="text-center">
                          {v === true  && <span className="inline-flex w-6 h-6 rounded-md bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 items-center justify-center"><Check size={14} strokeWidth={3} /></span>}
                          {v === false && <span className="inline-flex w-6 h-6 rounded-md bg-red-100 dark:bg-red-900/30 text-red-500 items-center justify-center"><X size={14} strokeWidth={3} /></span>}
                          {v === undefined && (
                            <span
                              className={`inline-block w-6 h-6 rounded-md ${d > data.today ? 'bg-gray-50 dark:bg-[#1A2624]' : 'bg-gray-100 dark:bg-[#21302D]'}`}
                              title={submitted.has(d) ? 'Task not on list that day' : 'Not submitted'}
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <td className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 pt-2 pr-2">Done</td>
                  {dayTotals.map((t, i) => (
                    <td key={data.days[i]} className="text-center text-[10px] font-semibold text-gray-500 dark:text-gray-400 pt-2">
                      {t.total ? `${t.done}/${t.total}` : '—'}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="flex justify-center gap-4 mt-4 text-[11px] text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-400" /> Done</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-400" /> Missed</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-gray-300 dark:bg-gray-600" /> Not submitted</span>
          </div>
        </>
      )}
    </div>
  );
}
