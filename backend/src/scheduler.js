const webpush  = require('web-push');
const cron     = require('node-cron');
const supabase = require('./db');
const { localNow, dueReminders, dueCustom, buildSlotNotification, buildCustomNotification } = require('./scheduleLogic');
require('dotenv').config();

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
);

const short = id => id.slice(0, 8) + '…';

/** Send a payload to every registered device of a user. Removes dead subscriptions. */
async function sendToUser(userId, payload, devices) {
  if (!devices) {
    const { data, error } = await supabase
      .from('push_devices').select('id, endpoint, p256dh, auth').eq('user_id', userId);
    if (error) throw error;
    devices = data;
  }

  let sent = 0;
  const failures = [];
  await Promise.all(devices.map(async d => {
    try {
      await webpush.sendNotification(
        { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 60 },   // drop if the phone is offline for over an hour
      );
      sent++;
      await supabase.from('push_devices').update({ last_success_at: new Date().toISOString() }).eq('id', d.id);
    } catch (err) {
      failures.push({ status: err.statusCode || null, message: (err.body || err.message || '').toString().slice(0, 200) });
      if (err.statusCode === 404 || err.statusCode === 410) {
        await supabase.from('push_devices').delete().eq('id', d.id);
        console.log(`[push] Removed expired device for ${short(userId)}`);
      } else {
        console.error(`[push] Failed for ${short(userId)}:`, err.statusCode || '', err.message);
      }
    }
  }));
  sendToUser.lastFailures = failures;   // read by the test endpoint for a helpful message
  return sent;
}

/** Runs every minute: find users whose slot time is now, send what's still due. */
async function checkAndSend() {
  // 1. All devices → which users can receive push at all
  const { data: devices, error: dErr } = await supabase
    .from('push_devices').select('id, user_id, endpoint, p256dh, auth');
  if (dErr) return console.error('[scheduler] devices:', dErr.message);
  if (!devices.length) return;

  const devicesByUser = new Map();
  for (const d of devices) {
    if (!devicesByUser.has(d.user_id)) devicesByUser.set(d.user_id, []);
    devicesByUser.get(d.user_id).push(d);
  }

  // 2. Their profiles → whose slot time matches *their* local time right now
  const { data: profiles, error: pErr } = await supabase
    .from('profiles').select('id, timezone, slot_times, push_enabled')
    .in('id', [...devicesByUser.keys()]).eq('push_enabled', true);
  if (pErr) return console.error('[scheduler] profiles:', pErr.message);

  const dayByUser = new Map(profiles.map(p => [p.id, localNow(p.timezone || 'Asia/Kolkata')]));
  const due = []; // slot jobs: { userId, slot, day }
  for (const p of profiles) {
    const day = dayByUser.get(p.id);
    for (const [slot, time] of Object.entries(p.slot_times || {})) {
      if (time === day.time) due.push({ userId: p.id, slot, day });
    }
  }

  // 3. Reminders: all reminders of users whose slot is now + any custom-time reminder due now
  const COLS = 'user_id, id, title, slots, custom_time, repeat, repeat_days, once_date, is_active, medicine';
  const slotUserIds = [...new Set(due.map(d => d.userId))];
  const nowTimes = [...new Set([...dayByUser.values()].map(d => d.time))];
  const [slotRes, customRes] = await Promise.all([
    slotUserIds.length
      ? supabase.from('reminders').select(COLS).in('user_id', slotUserIds).eq('is_active', true)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('reminders').select(COLS).in('user_id', [...dayByUser.keys()]).eq('is_active', true).in('custom_time', nowTimes),
  ]);
  if (slotRes.error || customRes.error) return console.error('[scheduler] reminders:', (slotRes.error || customRes.error).message);
  const reminders = slotRes.data;
  const customDue = customRes.data.filter(r => dayByUser.get(r.user_id)?.time === r.custom_time);
  if (!due.length && !customDue.length) return;

  const userIds = [...new Set([...slotUserIds, ...customDue.map(r => r.user_id)])];
  const dates   = [...new Set(userIds.map(u => dayByUser.get(u).date))];
  const { data: logs, error: lErr } = await supabase
    .from('dose_logs').select('user_id, id, status').in('user_id', userIds).in('date', dates);
  if (lErr) return console.error('[scheduler] logs:', lErr.message);

  // Claim a (user, date, key) once in the DB so restarts / extra servers never double-send.
  const claim = async (userId, date, slot) => {
    const { data, error } = await supabase.from('notification_log')
      .upsert({ user_id: userId, date, slot }, { onConflict: 'user_id,date,slot', ignoreDuplicates: true }).select();
    if (error) { console.error('[scheduler] dedupe:', error.message); return false; }
    return !!data?.length;
  };

  // 3b. Custom-time reminders: one notification each
  for (const userId of new Set(customDue.map(r => r.user_id))) {
    const day = dayByUser.get(userId);
    const items = dueCustom(customDue.filter(r => r.user_id === userId),
      new Map(logs.filter(l => l.user_id === userId).map(l => [l.id, l])), day);
    for (const r of items) {
      if (!(await claim(userId, day.date, `custom:${r.id}`))) continue;
      const sent = await sendToUser(userId, buildCustomNotification(r, day.time), devicesByUser.get(userId));
      console.log(`[scheduler] custom ${day.time} → ${short(userId)} (${sent} devices)`);
    }
  }

  for (const { userId, slot, day } of due) {
    const due = dueReminders(
      reminders.filter(r => r.user_id === userId),
      new Map(logs.filter(l => l.user_id === userId).map(l => [l.id, l])),
      slot, day,
    );
    if (!due.length) continue; // nothing left to do in this slot

    if (!(await claim(userId, day.date, slot))) continue; // already sent

    const sent = await sendToUser(userId, buildSlotNotification(slot, day.time, due), devicesByUser.get(userId));
    console.log(`[scheduler] ${slot} → ${short(userId)} (${due.length} items, ${sent} devices)`);
  }
}

/** Keep the dedupe table small: drop entries older than 7 days, daily. */
async function cleanup() {
  const cutoff = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  await supabase.from('notification_log').delete().lt('date', cutoff);
}

let running = false;
function startScheduler() {
  cron.schedule('* * * * *', async () => {
    if (running) return; // never overlap runs
    running = true;
    try { await checkAndSend(); } catch (e) { console.error('[scheduler]', e.message); }
    finally { running = false; }
  });
  cron.schedule('17 3 * * *', () => cleanup().catch(e => console.error('[cleanup]', e.message)));
  console.log('[scheduler] Started — checking every minute (per-user timezone)');
}

module.exports = { startScheduler, sendToUser, checkAndSend };
