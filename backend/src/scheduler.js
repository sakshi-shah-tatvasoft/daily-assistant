const webpush  = require('web-push');
const cron     = require('node-cron');
const supabase = require('./db');
const {
  localNow, dueReminders, dueCustom, minusMinutes, pendingDueCount,
  buildSlotNotification, buildSlotFollowUp, buildCustomNotification, buildCustomFollowUp,
} = require('./scheduleLogic');
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

/**
 * Runs every minute. For each user with notifications on, in *their* timezone:
 *  • a slot time is now            → send that slot's pending items
 *  • a custom-time reminder is now → send it
 *  • N minutes after either (N = profile.follow_up_minutes, 0 = off) and still pending → one follow-up
 * Every send carries the app-icon badge count (pending items whose time has come).
 */
async function checkAndSend() {
  // 1. Devices → users who can receive push
  const { data: devices, error: dErr } = await supabase
    .from('push_devices').select('id, user_id, endpoint, p256dh, auth');
  if (dErr) return console.error('[scheduler] devices:', dErr.message);
  if (!devices.length) return;

  const devicesByUser = new Map();
  for (const d of devices) {
    if (!devicesByUser.has(d.user_id)) devicesByUser.set(d.user_id, []);
    devicesByUser.get(d.user_id).push(d);
  }

  // 2. Profiles (select * so a missing follow_up_minutes column can't break sending)
  const { data: profiles, error: pErr } = await supabase
    .from('profiles').select('*').in('id', [...devicesByUser.keys()]).eq('push_enabled', true);
  if (pErr) return console.error('[scheduler] profiles:', pErr.message);
  if (!profiles.length) return;

  const userIds = profiles.map(p => p.id);
  const dayByUser = new Map(profiles.map(p => [p.id, localNow(p.timezone || 'Asia/Kolkata')]));
  const dates = [...new Set([...dayByUser.values()].map(d => d.date))];

  // 3. Their active reminders + today's logs (small at this scale; revisit for 1000s of users)
  const [{ data: reminders, error: rErr }, { data: logs, error: lErr }] = await Promise.all([
    supabase.from('reminders')
      .select('user_id, id, title, slots, custom_time, repeat, repeat_days, once_date, is_active, medicine')
      .in('user_id', userIds).eq('is_active', true),
    supabase.from('dose_logs').select('user_id, id, status').in('user_id', userIds).in('date', dates),
  ]);
  if (rErr || lErr) return console.error('[scheduler] data:', (rErr || lErr).message);

  // Claim (user, date, key) once in the DB so restarts / extra servers never double-send.
  const claim = async (userId, date, key) => {
    const { data, error } = await supabase.from('notification_log')
      .upsert({ user_id: userId, date, slot: key }, { onConflict: 'user_id,date,slot', ignoreDuplicates: true }).select();
    if (error) { console.error('[scheduler] dedupe:', error.message); return false; }
    return !!data?.length;
  };
  const send = async (userId, date, key, payload, label) => {
    if (!(await claim(userId, date, key))) return;
    const sent = await sendToUser(userId, payload, devicesByUser.get(userId));
    console.log(`[scheduler] ${label} → ${short(userId)} (${sent} devices)`);
  };

  for (const p of profiles) {
    const day = dayByUser.get(p.id);
    const followUp = Number.isInteger(p.follow_up_minutes) ? p.follow_up_minutes : 15;
    const fuTime = followUp > 0 ? minusMinutes(day.time, followUp) : null;
    const rems = reminders.filter(r => r.user_id === p.id);
    if (!rems.length) continue;
    const logsById = new Map(logs.filter(l => l.user_id === p.id).map(l => [l.id, l]));
    const badge = () => pendingDueCount(rems, logsById, p.slot_times, day);

    for (const [slot, time] of Object.entries(p.slot_times || {})) {
      if (time === day.time) {
        const due = dueReminders(rems, logsById, slot, day);
        if (due.length) await send(p.id, day.date, slot, buildSlotNotification(slot, time, due, badge()), `${slot} (${due.length})`);
      }
      if (fuTime && time === fuTime) {
        const due = dueReminders(rems, logsById, slot, day);
        if (due.length) await send(p.id, day.date, `followup:${slot}`, buildSlotFollowUp(slot, due, badge()), `follow-up ${slot}`);
      }
    }

    for (const r of dueCustom(rems, logsById, day)) {
      await send(p.id, day.date, `custom:${r.id}`, buildCustomNotification(r, day.time, badge()), `custom ${day.time}`);
    }
    if (fuTime) {
      for (const r of dueCustom(rems, logsById, { ...day, time: fuTime })) {
        await send(p.id, day.date, `followup:custom:${r.id}`, buildCustomFollowUp(r, badge()), `follow-up custom ${fuTime}`);
      }
    }
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
