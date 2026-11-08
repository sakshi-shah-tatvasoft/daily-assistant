import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, ListChecks, Settings2, CalendarDays, Loader2, RefreshCw, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { tasksApi, TaskError, type TodayTasksResponse } from '../lib/tasks';
import { formatDate } from '../utils/dateHelpers';

/** In-progress ticks live on the device until Submit Day. Keyed by IST date so they reset each morning. */
const CHECKS_KEY = 'da_task_checks_v1';

function loadChecks(date: string): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(CHECKS_KEY) ?? 'null');
    if (raw?.date === date && Array.isArray(raw.ids)) return new Set(raw.ids);
  } catch { /* ignore corrupt value */ }
  return new Set();
}

function saveChecks(date: string, ids: Set<string>) {
  localStorage.setItem(CHECKS_KEY, JSON.stringify({ date, ids: [...ids] }));
}

export default function Tasks() {
  const [data, setData]         = useState<TodayTasksResponse | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [checked, setChecked]   = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await tasksApi.getToday();
      setData(res);
      // Drop ticks for tasks that no longer exist.
      const valid = new Set(res.tasks.map(t => t.id));
      setChecked(new Set([...loadChecks(res.date)].filter(id => valid.has(id))));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load tasks');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Re-check when the app comes back to the foreground (handles day rollover on a PWA left open).
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const toggle = (id: string) => {
    if (!data) return;
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      saveChecks(data.date, next);
      return next;
    });
  };

  const submitDay = async () => {
    if (!data) return;
    const done  = data.tasks.filter(t => checked.has(t.id)).length;
    const total = data.tasks.length;
    if (!window.confirm(`Submit today with ${done}/${total} tasks done?\nYou won't be able to change it afterwards.`)) return;

    setSubmitting(true);
    try {
      const res = await tasksApi.submitDay([...checked]);
      localStorage.removeItem(CHECKS_KEY);
      setChecked(new Set());
      toast.success(`Day submitted — ${res.completed}/${res.total} done`);
      await load();
    } catch (e) {
      if (e instanceof TaskError && e.code === 'ALREADY_SUBMITTED') { await load(); return; }
      toast.error(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  const header = (
    <div className="flex items-start justify-between mb-5">
      <div>
        <h1 className="page-title">Daily Tasks</h1>
        {data && <p className="text-xs text-gray-400 mt-0.5">{formatDate(data.date)}</p>}
      </div>
      <div className="flex gap-2">
        <Link to="/tasks/week" className="btn-icon" aria-label="Weekly progress"><CalendarDays size={18} /></Link>
        <Link to="/tasks/manage" className="btn-icon" aria-label="Manage tasks"><Settings2 size={18} /></Link>
      </div>
    </div>
  );

  if (error) {
    return (
      <div className="page pt-6">
        {header}
        <div className="card p-6 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{error}</p>
          <button onClick={load} className="btn-secondary"><RefreshCw size={16} /> Try again</button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page pt-6">
        {header}
        <div className="flex justify-center py-16 text-gray-400"><Loader2 className="animate-spin" /></div>
      </div>
    );
  }

  // ── Already submitted: summary ────────────────────────────────────────────
  if (data.submitted && data.summary) {
    const done  = data.summary.filter(s => s.completed).length;
    const total = data.summary.length;
    const pct   = total ? Math.round((done / total) * 100) : 0;
    return (
      <div className="page pt-6">
        {header}
        <div className="card p-5 mb-4 text-center">
          <p className="section-label mb-2">Today submitted</p>
          <p className="text-4xl font-bold text-indigo-600 dark:text-indigo-400">{done}/{total}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">tasks done today</p>
          <div className="progress-track mt-4"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
          {data.submittedAt && (
            <p className="text-[11px] text-gray-400 mt-3">
              Submitted at {new Date(data.submittedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' })}
            </p>
          )}
        </div>
        <div className="card divide-y divide-gray-50 dark:divide-[#2a2840] mb-4">
          {data.summary.map(s => (
            <div key={s.taskId} className="flex items-center gap-3 px-4 py-3">
              {s.completed
                ? <CheckCircle2 size={20} className="text-emerald-500 shrink-0" />
                : <XCircle size={20} className="text-red-400 shrink-0" />}
              <span className={`text-sm ${s.completed ? 'text-gray-700 dark:text-gray-200' : 'text-gray-400'}`}>{s.name}</span>
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-gray-400">A fresh checklist appears tomorrow morning.</p>
      </div>
    );
  }

  // ── No tasks yet ──────────────────────────────────────────────────────────
  if (data.tasks.length === 0) {
    return (
      <div className="page pt-6">
        {header}
        <div className="card p-8 text-center">
          <ListChecks size={36} className="mx-auto text-indigo-400 mb-3" />
          <p className="font-semibold text-gray-800 dark:text-gray-100 mb-1">No daily tasks yet</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Add the things you want to do every day.</p>
          <Link to="/tasks/manage" className="btn-primary">Add tasks</Link>
        </div>
      </div>
    );
  }

  // ── Checklist ─────────────────────────────────────────────────────────────
  const done  = data.tasks.filter(t => checked.has(t.id)).length;
  const total = data.tasks.length;
  return (
    <div className="page pt-6">
      {header}
      <div className="card p-4 mb-4">
        <div className="flex justify-between items-baseline mb-2">
          <p className="section-label">Progress</p>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{done}/{total}</p>
        </div>
        <div className="progress-track"><div className="progress-fill" style={{ width: `${(done / total) * 100}%` }} /></div>
      </div>

      <div className="card divide-y divide-gray-50 dark:divide-[#2a2840] mb-5">
        {data.tasks.map(t => {
          const isDone = checked.has(t.id);
          return (
            <button
              key={t.id}
              onClick={() => toggle(t.id)}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-gray-50 dark:active:bg-[#2a2840] transition-colors"
              role="checkbox"
              aria-checked={isDone}
            >
              {isDone
                ? <CheckCircle2 size={22} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
                : <Circle size={22} className="text-gray-300 dark:text-gray-600 shrink-0" />}
              <span className={`text-sm ${isDone ? 'line-through text-gray-400' : 'text-gray-800 dark:text-gray-100'}`}>{t.name}</span>
            </button>
          );
        })}
      </div>

      <button onClick={submitDay} disabled={submitting} className="btn-primary w-full disabled:opacity-60">
        {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
        Submit Day
      </button>
    </div>
  );
}
