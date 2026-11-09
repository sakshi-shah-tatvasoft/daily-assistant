// Reminder engine: called once a minute by Supabase pg_cron → POST /api/cron/tick.
// (Moved from backend/src/scheduler.js when the backend left Railway; logic unchanged.)
import webpush from 'web-push';
import { admin } from './supabaseAdmin.js';
import {
  localNow, dueReminders, dueCustom, minusMinutes, pendingDueCount, stockStatus,
  buildSlotNotification, buildSlotFollowUp, buildCustomNotification, buildCustomFollowUp,
  buildStockNotification, buildSnoozeNotification, SLOT_LABELS,
} from './scheduleLogic.js';

let vapidReady = false;
function ensureVapid() {
  if (vapidReady) return;
  const { VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  if (!VAPID_EMAIL || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) throw new Error('VAPID_EMAIL / VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set');
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidReady = true;
}

const short = id => id.slice(0, 8) + '…';

/** Send a payload to every registered device of a user. Removes dead subscriptions. */
export async function sendToUser(userId, payload, devices) {
  ensureVapid();
  if (!devices) {
    const { data, error } = await admin()
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
      await admin().from('push_devices').update({ last_success_at: new Date().toISOString() }).eq('id', d.id);
    } catch (err) {
      failures.push({ status: err.statusCode || null, message: (err.body || err.message || '').toString().slice(0, 200) });
      if (err.statusCode === 404 || err.statusCode === 410) {
        await admin().from('push_devices').delete().eq('id', d.id);
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
export async function checkAndSend() {
  // 1. Devices → users who can receive push
  const { data: devices, error: dErr } = await admin()
    .from('push_devices').select('id, user_id, endpoint, p256dh, auth');
  if (dErr) return console.error('[scheduler] devices:', dErr.message);
  if (!devices.length) return;

  const devicesByUser = new Map();
  for (const d of devices) {
    if (!devicesByUser.has(d.user_id)) devicesByUser.set(d.user_id, []);
    devicesByUser.get(d.user_id).push(d);
  }

  // 2. Profiles (select * so a missing follow_up_minutes column can't break sending)
  const { data: profiles, error: pErr } = await admin()
    .from('profiles').select('*').in('id', [...devicesByUser.keys()]).eq('push_enabled', true);
  if (pErr) return console.error('[scheduler] profiles:', pErr.message);
  if (!profiles.length) return;

  const userIds = profiles.map(p => p.id);
  const dayByUser = new Map(profiles.map(p => [p.id, localNow(p.timezone || 'Asia/Kolkata')]));
  const dates = [...new Set([...dayByUser.values()].map(d => d.date))];

  // 3. Their active reminders + today's logs (small at this scale; revisit for 1000s of users)
  const [{ data: reminders, error: rErr }, { data: logs, error: lErr }] = await Promise.all([
    admin().from('reminders')
      .select('user_id, id, title, slots, custom_time, repeat, repeat_days, once_date, is_active, medicine')
      .in('user_id', userIds).eq('is_active', true),
    admin().from('dose_logs').select('user_id, id, status').in('user_id', userIds).in('date', dates),
  ]);
  if (rErr || lErr) return console.error('[scheduler] data:', (rErr || lErr).message);

  // Snoozes: atomically take the due ones (delete … returning → only one server ever gets a row);
  // the still-future ones suppress follow-ups for that check-in.
  const nowIso = new Date().toISOString();
  const [dueSnoozeRes, futureSnoozeRes] = await Promise.all([
    admin().from('snoozes').delete().lte('due_at', nowIso).in('user_id', userIds).select('user_id, key'),
    admin().from('snoozes').select('user_id, key').gt('due_at', nowIso).in('user_id', userIds),
  ]);
  if (dueSnoozeRes.error && !/relation .*snoozes/.test(dueSnoozeRes.error.message)) console.error('[scheduler] snoozes:', dueSnoozeRes.error.message);
  const dueSnoozes = dueSnoozeRes.data || [];
  const snoozed = new Set((futureSnoozeRes.data || []).map(z => `${z.user_id}|${z.key}`));

  // Completed-dose timestamps for stock tracking — only fetched when someone's morning time is now.
  const stockUsers = profiles.filter(p => p.slot_times?.morning === dayByUser.get(p.id).time
    && reminders.some(r => r.user_id === p.id && r.medicine?.stock)).map(p => p.id);
  let completedByReminder = new Map();
  if (stockUsers.length) {
    const since = reminders.filter(r => stockUsers.includes(r.user_id) && r.medicine?.stock)
      .map(r => r.medicine.stock.refilledAt).sort()[0];
    const { data: done, error: cErr } = await admin().from('dose_logs')
      .select('reminder_id, user_id, completed_at').in('user_id', stockUsers)
      .eq('status', 'completed').gte('completed_at', since);
    if (cErr) console.error('[scheduler] stock logs:', cErr.message);
    for (const d of done || []) {
      const k = `${d.user_id}|${d.reminder_id}`;
      if (!completedByReminder.has(k)) completedByReminder.set(k, []);
      completedByReminder.get(k).push(new Date(d.completed_at).toISOString());
    }
  }

  // Claim (user, date, key) once in the DB so restarts / extra servers never double-send.
  const claim = async (userId, date, key) => {
    const { data, error } = await admin().from('notification_log')
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
      if (fuTime && time === fuTime && !snoozed.has(`${p.id}|${slot}`)) {
        const due = dueReminders(rems, logsById, slot, day);
        if (due.length) await send(p.id, day.date, `followup:${slot}`, buildSlotFollowUp(slot, due, badge()), `follow-up ${slot}`);
      }
    }

    for (const r of dueCustom(rems, logsById, day)) {
      await send(p.id, day.date, `custom:${r.id}`, buildCustomNotification(r, day.time, badge()), `custom ${day.time}`);
    }
    if (fuTime) {
      for (const r of dueCustom(rems, logsById, { ...day, time: fuTime })) {
        if (snoozed.has(`${p.id}|custom-${r.id}`)) continue;
        await send(p.id, day.date, `followup:custom:${r.id}`, buildCustomFollowUp(r, badge()), `follow-up custom ${fuTime}`);
      }
    }

    // Snoozed check-ins that are due now: send only if something is still pending.
    for (const z of dueSnoozes.filter(z => z.user_id === p.id)) {
      let due = [], label = 'Reminder';
      if (z.key.startsWith('custom-')) {
        const r = rems.find(x => x.id === z.key.slice(7));
        if (r && r.custom_time) due = dueCustom([r], logsById, { ...day, time: r.custom_time });
      } else {
        due = dueReminders(rems, logsById, z.key, day);
        label = (SLOT_LABELS[z.key] || z.key).replace(/^\S+\s/, '');
      }
      if (!due.length) continue;
      // A snoozed reminder replaces the follow-up for that check-in, so claim it first.
      const fuKey = z.key.startsWith('custom-') ? `followup:custom:${z.key.slice(7)}` : `followup:${z.key}`;
      await claim(p.id, day.date, fuKey);
      const sent = await sendToUser(p.id, buildSnoozeNotification(label, due, badge(), `/checkin/${z.key}`), devicesByUser.get(p.id));
      console.log(`[scheduler] snoozed ${z.key} → ${short(p.id)} (${sent} devices)`);
    }

    // Refill warnings, once a day at the user's morning time.
    if (stockUsers.includes(p.id)) {
      for (const r of rems.filter(x => x.medicine?.stock)) {
        const st = stockStatus(r, completedByReminder.get(`${p.id}|${r.id}`) || [], day.date);
        if (st && (st.low || st.out)) await send(p.id, day.date, `stock:${r.id}`, buildStockNotification(r, st), `stock ${r.title}`);
      }
    }
  }
}

/** Keep the dedupe table small: drop entries older than 7 days, daily. */
export async function cleanup() {
  const cutoff = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  await admin().from('notification_log').delete().lt('date', cutoff);
  // Snoozes of users who turned notifications off are never taken by the scheduler — drop stale ones.
  await admin().from('snoozes').delete().lt('due_at', new Date(Date.now() - 864e5).toISOString());
}
