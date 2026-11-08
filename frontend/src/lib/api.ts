const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function handle(res: Response, path: string) {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(body?.error ?? `API ${path} failed: ${res.status}`, res.status);
  }
  return res.json();
}

async function post(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  return handle(res, path);
}

async function get(path: string, params: Record<string, string>) {
  const res = await fetch(`${BASE}${path}?${new URLSearchParams(params)}`);
  return handle(res, path);
}

// ── Daily task checklist types ───────────────────────────────────────────────
export interface DailyTask { id: string; name: string; sortOrder: number; }

export interface TodayTasksResponse {
  date:        string;
  tasks:       DailyTask[];
  submitted:   boolean;
  submittedAt: string | null;
  summary:     { taskId: string; name: string; completed: boolean }[] | null;
}

export interface WeekTasksResponse {
  start:         string;
  end:           string;
  today:         string;
  days:          string[];
  submittedDays: string[];
  tasks:         (DailyTask & { deleted: boolean })[];
  logs:          { taskId: string; date: string; completed: boolean }[];
}

export const api = {
  subscribe(payload: {
    deviceId:     string;
    subscription: PushSubscriptionJSON;
    slotTimes:    Record<string, string>;
    slotItems:    Record<string, string[]>;
    timezone:     string;
  }) {
    return post('/api/push/subscribe', payload);
  },

  updateSchedule(payload: {
    deviceId:  string;
    slotTimes: Record<string, string>;
    slotItems: Record<string, string[]>;
  }) {
    return post('/api/push/update-schedule', payload);
  },

  unsubscribe(deviceId: string) {
    return post('/api/push/unsubscribe', { deviceId });
  },

  testNotification(deviceId: string) {
    return post('/api/push/test', { deviceId });
  },

  // ── Daily task checklist ───────────────────────────────────────────────────
  getTodayTasks(deviceId: string): Promise<TodayTasksResponse> {
    return get('/api/tasks', { device_id: deviceId });
  },

  getWeekTasks(deviceId: string, start?: string): Promise<WeekTasksResponse> {
    return get('/api/tasks/week', start ? { device_id: deviceId, start } : { device_id: deviceId });
  },

  createTask(deviceId: string, name: string): Promise<{ ok: true; task: DailyTask }> {
    return post('/api/tasks', { deviceId, name });
  },

  deleteTask(deviceId: string, taskId: string) {
    return post('/api/tasks/delete', { deviceId, taskId });
  },

  reorderTasks(deviceId: string, order: string[]) {
    return post('/api/tasks/reorder', { deviceId, order });
  },

  submitDay(deviceId: string, completedTaskIds: string[]): Promise<{ ok: true; date: string; completed: number; total: number }> {
    return post('/api/tasks/submit', { deviceId, completedTaskIds });
  },
};
