import { supabase } from './supabase';
import { getTodayIST } from '../utils/dateHelpers';
import { isDemo, demoGet, demoSet } from './demo';

// Demo mode: the same answers from a local store (nothing is sent anywhere).
interface DemoTasks { tasks: (DailyTask & { isActive: boolean })[]; logs: { taskId: string; date: string; completed: boolean; submittedAt: string }[] }
const dGet = () => demoGet<DemoTasks>('tasks', { tasks: [], logs: [] });
const dSet = (v: DemoTasks) => demoSet('tasks', v);

// Daily task checklist — data layer (Supabase direct, RLS-protected).

export interface DailyTask { id: string; name: string; sortOrder: number; }

export interface TodayTasksResponse {
  date:        string;
  tasks:       DailyTask[];
  submitted:   boolean;
  submittedAt: string | null;
  summary:     { taskId: string; name: string; completed: boolean }[] | null;
}

export interface WeekTasksResponse {
  start: string; end: string; today: string; days: string[]; submittedDays: string[];
  tasks: (DailyTask & { deleted: boolean })[];
  logs:  { taskId: string; date: string; completed: boolean }[];
}

export class TaskError extends Error {
  constructor(message: string, public code?: 'ALREADY_SUBMITTED' | 'NO_TASKS') { super(message); }
}

const MAX_TASKS = 50;

function shift(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function mondayOf(date: string) {
  const js = new Date(`${date}T00:00:00Z`).getUTCDay();
  return shift(date, js === 0 ? -6 : 1 - js);
}

async function activeTasks(): Promise<DailyTask[]> {
  const { data, error } = await supabase
    .from('daily_tasks').select('id, task_name, sort_order')
    .eq('is_active', true).order('sort_order').order('created_at');
  if (error) throw error;
  return data.map(t => ({ id: t.id, name: t.task_name, sortOrder: t.sort_order }));
}

type Joined = { task_name: string; sort_order: number; is_active?: boolean } | null;
// supabase-js types embedded rows as arrays for some relations; normalise.
const one = (j: Joined | Joined[]): Joined => (Array.isArray(j) ? j[0] ?? null : j);

export const tasksApi = {
  async getToday(): Promise<TodayTasksResponse> {
    const date = getTodayIST();
    if (isDemo()) {
      const d = dGet(); const logs = d.logs.filter(l => l.date === date);
      const tasks = d.tasks.filter(t => t.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
      return { date, tasks, submitted: logs.length > 0, submittedAt: logs[0]?.submittedAt ?? null,
        summary: logs.length ? logs.map(l => { const t = d.tasks.find(x => x.id === l.taskId); return { taskId: l.taskId, name: t?.name ?? 'Deleted task', completed: l.completed }; }) : null };
    }
    const [tasks, logsRes] = await Promise.all([
      activeTasks(),
      supabase.from('task_logs')
        .select('task_id, completed, submitted_at, daily_tasks(task_name, sort_order)')
        .eq('date', date),
    ]);
    if (logsRes.error) throw logsRes.error;
    const logs = logsRes.data ?? [];
    const submitted = logs.length > 0;
    return {
      date, tasks, submitted,
      submittedAt: submitted ? logs[0].submitted_at : null,
      summary: submitted
        ? logs.map(l => {
            const t = one(l.daily_tasks as Joined | Joined[]);
            return { taskId: l.task_id, name: t?.task_name ?? 'Deleted task', sortOrder: t?.sort_order ?? 0, completed: l.completed };
          }).sort((a, b) => a.sortOrder - b.sortOrder)
        : null,
    };
  },

  async getWeek(start?: string): Promise<WeekTasksResponse> {
    const today = getTodayIST();
    const from  = mondayOf(start ?? today);
    const to    = shift(from, 6);
    const days  = Array.from({ length: 7 }, (_, i) => shift(from, i));
    if (isDemo()) {
      const d = dGet(); const logs = d.logs.filter(l => l.date >= from && l.date <= to);
      return { start: from, end: to, today, days, submittedDays: [...new Set(logs.map(l => l.date))],
        tasks: d.tasks.filter(t => t.isActive || logs.some(l => l.taskId === t.id)).map(t => ({ id: t.id, name: t.name, sortOrder: t.sortOrder, deleted: !t.isActive })).sort((a, b) => a.sortOrder - b.sortOrder),
        logs: logs.map(l => ({ taskId: l.taskId, date: l.date, completed: l.completed })) };
    }
    const [tasks, logsRes] = await Promise.all([
      activeTasks(),
      supabase.from('task_logs')
        .select('task_id, date, completed, daily_tasks(task_name, sort_order, is_active)')
        .gte('date', from).lte('date', to),
    ]);
    if (logsRes.error) throw logsRes.error;
    const logs = logsRes.data ?? [];

    const rows = new Map(tasks.map(t => [t.id, { ...t, deleted: false }]));
    for (const l of logs) {
      if (!rows.has(l.task_id)) {
        const t = one(l.daily_tasks as Joined | Joined[]);
        rows.set(l.task_id, { id: l.task_id, name: t?.task_name ?? 'Deleted task', sortOrder: t?.sort_order ?? 999, deleted: true });
      }
    }
    return {
      start: from, end: to, today, days,
      submittedDays: [...new Set(logs.map(l => l.date))],
      tasks: [...rows.values()].sort((a, b) => a.sortOrder - b.sortOrder),
      logs:  logs.map(l => ({ taskId: l.task_id, date: l.date, completed: l.completed })),
    };
  },

  async create(name: string): Promise<DailyTask> {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 100) throw new TaskError('Task name must be 1–100 characters');
    if (isDemo()) {
      const d = dGet(); const t = { id: `demo-${Date.now().toString(36)}`, name: trimmed, sortOrder: d.tasks.length, isActive: true };
      dSet({ ...d, tasks: [...d.tasks, t] }); return { id: t.id, name: t.name, sortOrder: t.sortOrder };
    }
    const existing = await activeTasks();
    if (existing.length >= MAX_TASKS) throw new TaskError(`You can have at most ${MAX_TASKS} tasks`);
    const sortOrder = existing.reduce((m, t) => Math.max(m, t.sortOrder), -1) + 1;
    const { data, error } = await supabase.from('daily_tasks')
      .insert({ task_name: trimmed, sort_order: sortOrder })
      .select('id, task_name, sort_order').single();
    if (error) throw error;
    return { id: data.id, name: data.task_name, sortOrder: data.sort_order };
  },

  /** Soft delete — past days keep the task's name. */
  async remove(taskId: string) {
    if (isDemo()) { const d = dGet(); dSet({ ...d, tasks: d.tasks.map(t => t.id === taskId ? { ...t, isActive: false } : t) }); return; }
    const { error } = await supabase.from('daily_tasks').update({ is_active: false }).eq('id', taskId);
    if (error) throw error;
  },

  async reorder(order: string[]) {
    if (isDemo()) { const d = dGet(); dSet({ ...d, tasks: d.tasks.map(t => order.includes(t.id) ? { ...t, sortOrder: order.indexOf(t.id) } : t) }); return; }
    const results = await Promise.all(order.map((id, i) =>
      supabase.from('daily_tasks').update({ sort_order: i }).eq('id', id)));
    const failed = results.find(r => r.error);
    if (failed?.error) throw failed.error;
  },

  /** Server decides "today" (user's timezone) and refuses a second submit. */
  async submitDay(completedTaskIds: string[]): Promise<{ date: string; completed: number; total: number }> {
    if (isDemo()) {
      const d = dGet(), date = getTodayIST();
      if (d.logs.some(l => l.date === date)) throw new TaskError('Today is already submitted', 'ALREADY_SUBMITTED');
      const active = d.tasks.filter(t => t.isActive);
      if (!active.length) throw new TaskError('No tasks to submit', 'NO_TASKS');
      const at = new Date().toISOString();
      dSet({ ...d, logs: [...d.logs, ...active.map(t => ({ taskId: t.id, date, completed: completedTaskIds.includes(t.id), submittedAt: at }))] });
      return { date, completed: active.filter(t => completedTaskIds.includes(t.id)).length, total: active.length };
    }
    const { data, error } = await supabase.rpc('submit_day', { p_completed: completedTaskIds });
    if (error) {
      if (error.message.includes('ALREADY_SUBMITTED')) throw new TaskError('Today is already submitted', 'ALREADY_SUBMITTED');
      if (error.message.includes('NO_TASKS')) throw new TaskError('No tasks to submit', 'NO_TASKS');
      throw error;
    }
    return data;
  },
};
