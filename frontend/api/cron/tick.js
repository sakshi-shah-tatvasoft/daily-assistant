// POST /api/cron/tick — called every minute by Supabase pg_cron (with Authorization: Bearer CRON_SECRET).
// Sends due reminders, follow-ups, snoozes and refill warnings. Safe to call twice in a minute:
// every send is claimed in notification_log first, so nobody is notified twice.
import { json, onlyPost, isCron } from '../_lib/http.js';
import { checkAndSend, cleanup } from '../_lib/scheduler.js';

export default async function handler(req, res) {
  if (!onlyPost(req, res)) return;
  if (!isCron(req)) return json(res, 401, { error: 'Unauthorized' });
  const started = Date.now();
  try {
    await checkAndSend();
    const utc = new Date().toISOString().slice(11, 16);
    if (utc === '21:47') await cleanup();          // ~03:17 IST, once a day
    return json(res, 200, { ok: true, ms: Date.now() - started });
  } catch (e) {
    console.error('[tick]', e.message);
    return json(res, 500, { error: 'Tick failed' });
  }
}
