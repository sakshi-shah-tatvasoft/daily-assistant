const express  = require('express');
const router   = express.Router();
const supabase = require('../db');

const TIMEZONE      = 'Asia/Kolkata';
const MAX_TASKS     = 50;
const MAX_NAME_LEN  = 100;
const UUID_RE       = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE       = /^\d{4}-\d{2}-\d{2}$/;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Today's date in IST as YYYY-MM-DD. The server decides "today", not the client. */
function todayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

/** Add n days to a YYYY-MM-DD string (pure calendar math, no timezone drift). */
function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing dateStr. */
function mondayOf(dateStr) {
  const jsDay = new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 0=Sun
  return addDays(dateStr, jsDay === 0 ? -6 : 1 - jsDay);
}

const isUuid = v => typeof v === 'string' && UUID_RE.test(v);

/** Pulls and validates the device id from query or body. Sends 400 and returns null if invalid. */
function deviceIdFrom(req, res) {
  const id = req.query.device_id ?? req.body?.deviceId;
  if (!isUuid(id)) {
    res.status(400).json({ error: 'Missing or invalid device id' });
    return null;
  }
  return id;
}

async function activeTasks(deviceId) {
  return supabase
    .from('daily_tasks')
    .select('id, task_name, sort_order')
    .eq('device_id', deviceId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
}

const toTask = t => ({ id: t.id, name: t.task_name, sortOrder: t.sort_order });

// ── GET /api/tasks?device_id= ────────────────────────────────────────────────
// Active tasks + whether today is already submitted (and its summary if so).
router.get('/', async (req, res) => {
  const deviceId = deviceIdFrom(req, res);
  if (!deviceId) return;
  const date = todayIST();

  const [{ data: tasks, error: tErr }, { data: logs, error: lErr }] = await Promise.all([
    activeTasks(deviceId),
    supabase
      .from('task_logs')
      .select('task_id, completed, submitted_at, daily_tasks(task_name, sort_order)')
      .eq('device_id', deviceId)
      .eq('date', date),
  ]);

  if (tErr || lErr) {
    console.error('Tasks fetch error:', tErr || lErr);
    return res.status(500).json({ error: 'Failed to load tasks' });
  }

  const submittedLogs = (logs || []).filter(l => l.submitted_at);
  const submitted     = submittedLogs.length > 0;

  res.json({
    date,
    tasks: tasks.map(toTask),
    submitted,
    submittedAt: submitted ? submittedLogs[0].submitted_at : null,
    summary: submitted
      ? submittedLogs
          .map(l => ({
            taskId:    l.task_id,
            name:      l.daily_tasks?.task_name ?? 'Deleted task',
            sortOrder: l.daily_tasks?.sort_order ?? 0,
            completed: l.completed,
          }))
          .sort((a, b) => a.sortOrder - b.sortOrder)
      : null,
  });
});

// ── POST /api/tasks ──────────────────────────────────────────────────────────
// Body: { deviceId, name }
router.post('/', async (req, res) => {
  const deviceId = deviceIdFrom(req, res);
  if (!deviceId) return;

  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  if (!name || name.length > MAX_NAME_LEN) {
    return res.status(400).json({ error: `Task name must be 1–${MAX_NAME_LEN} characters` });
  }

  const { data: existing, error: eErr } = await activeTasks(deviceId);
  if (eErr) return res.status(500).json({ error: 'Failed to create task' });
  if (existing.length >= MAX_TASKS) {
    return res.status(400).json({ error: `You can have at most ${MAX_TASKS} tasks` });
  }

  const nextOrder = existing.reduce((m, t) => Math.max(m, t.sort_order), -1) + 1;
  const { data, error } = await supabase
    .from('daily_tasks')
    .insert({ device_id: deviceId, task_name: name, sort_order: nextOrder })
    .select('id, task_name, sort_order')
    .single();

  if (error) {
    console.error('Task create error:', error);
    return res.status(500).json({ error: 'Failed to create task' });
  }
  res.json({ ok: true, task: toTask(data) });
});

// ── POST /api/tasks/delete ───────────────────────────────────────────────────
// Body: { deviceId, taskId } — soft delete so past logs keep their task name.
router.post('/delete', async (req, res) => {
  const deviceId = deviceIdFrom(req, res);
  if (!deviceId) return;
  const { taskId } = req.body;
  if (!isUuid(taskId)) return res.status(400).json({ error: 'Invalid task id' });

  const { error } = await supabase
    .from('daily_tasks')
    .update({ is_active: false })
    .eq('id', taskId)
    .eq('device_id', deviceId);   // ownership check

  if (error) return res.status(500).json({ error: 'Failed to delete task' });
  res.json({ ok: true });
});

// ── POST /api/tasks/reorder ──────────────────────────────────────────────────
// Body: { deviceId, order: [taskId, ...] } — full ordered list of active task ids.
router.post('/reorder', async (req, res) => {
  const deviceId = deviceIdFrom(req, res);
  if (!deviceId) return;
  const { order } = req.body;
  if (!Array.isArray(order) || order.length > MAX_TASKS || !order.every(isUuid)) {
    return res.status(400).json({ error: 'Invalid order' });
  }

  const results = await Promise.all(order.map((id, i) =>
    supabase
      .from('daily_tasks')
      .update({ sort_order: i })
      .eq('id', id)
      .eq('device_id', deviceId)
  ));

  if (results.some(r => r.error)) return res.status(500).json({ error: 'Failed to reorder tasks' });
  res.json({ ok: true });
});

// ── POST /api/tasks/submit ───────────────────────────────────────────────────
// Body: { deviceId, completedTaskIds: [taskId, ...] }
// Logs every active task for today (IST): completed if its id is in the list.
router.post('/submit', async (req, res) => {
  const deviceId = deviceIdFrom(req, res);
  if (!deviceId) return;
  const { completedTaskIds } = req.body;
  if (!Array.isArray(completedTaskIds) || !completedTaskIds.every(isUuid)) {
    return res.status(400).json({ error: 'Invalid completedTaskIds' });
  }

  const date = todayIST();

  const { data: already, error: aErr } = await supabase
    .from('task_logs')
    .select('id')
    .eq('device_id', deviceId)
    .eq('date', date)
    .not('submitted_at', 'is', null)
    .limit(1);
  if (aErr) return res.status(500).json({ error: 'Failed to submit day' });
  if (already.length) return res.status(409).json({ error: 'Today is already submitted' });

  const { data: tasks, error: tErr } = await activeTasks(deviceId);
  if (tErr) return res.status(500).json({ error: 'Failed to submit day' });
  if (!tasks.length) return res.status(400).json({ error: 'No tasks to submit' });

  const done        = new Set(completedTaskIds);
  const submittedAt = new Date().toISOString();
  const rows = tasks.map(t => ({
    device_id:    deviceId,
    task_id:      t.id,
    date,
    completed:    done.has(t.id),
    submitted_at: submittedAt,
  }));

  const { error } = await supabase
    .from('task_logs')
    .upsert(rows, { onConflict: 'device_id,task_id,date' });

  if (error) {
    console.error('Submit error:', error);
    return res.status(500).json({ error: 'Failed to submit day' });
  }

  const completed = rows.filter(r => r.completed).length;
  res.json({ ok: true, date, completed, total: rows.length });
});

// ── GET /api/tasks/week?device_id=&start=YYYY-MM-DD ──────────────────────────
// 7 days of submitted logs starting from `start` (default: Monday of this IST week).
router.get('/week', async (req, res) => {
  const deviceId = deviceIdFrom(req, res);
  if (!deviceId) return;

  const today = todayIST();
  const start = DATE_RE.test(req.query.start ?? '') ? mondayOf(req.query.start) : mondayOf(today);
  const end   = addDays(start, 6);
  const days  = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  const [{ data: tasks, error: tErr }, { data: logs, error: lErr }] = await Promise.all([
    activeTasks(deviceId),
    supabase
      .from('task_logs')
      .select('task_id, date, completed, daily_tasks(task_name, sort_order, is_active)')
      .eq('device_id', deviceId)
      .gte('date', start)
      .lte('date', end)
      .not('submitted_at', 'is', null),
  ]);

  if (tErr || lErr) {
    console.error('Week fetch error:', tErr || lErr);
    return res.status(500).json({ error: 'Failed to load week' });
  }

  // Rows = active tasks, plus deleted tasks that still have logs this week.
  const rowMap = new Map(tasks.map(t => [t.id, { ...toTask(t), deleted: false }]));
  for (const l of logs) {
    if (!rowMap.has(l.task_id)) {
      rowMap.set(l.task_id, {
        id:        l.task_id,
        name:      l.daily_tasks?.task_name ?? 'Deleted task',
        sortOrder: l.daily_tasks?.sort_order ?? 999,
        deleted:   true,
      });
    }
  }

  const submittedDays = [...new Set(logs.map(l => l.date))];
  res.json({
    start,
    end,
    today,
    days,
    submittedDays,
    tasks: [...rowMap.values()].sort((a, b) => a.sortOrder - b.sortOrder),
    logs:  logs.map(l => ({ taskId: l.task_id, date: l.date, completed: l.completed })),
  });
});

module.exports = router;
