// Reminder engine: called once a minute by Supabase pg_cron → POST /api/cron/tick.
// (Moved from backend/src/scheduler.js when the backend left Railway; logic unchanged.)
import webpush from 'web-push';
import nodemailer from 'nodemailer';
import { admin } from './supabaseAdmin.js';
import {
  localNow, dueReminders, dueCustom, pendingDueCount, stockStatus, repeatsDue,
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
      .select('*')   // includes remind_again when the column exists
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

  // Check-ins whose repeats were stopped today (a snoozed reminder already re-sent them).
  const { data: stops } = await admin().from('notification_log').select('user_id, slot')
    .in('user_id', userIds).in('date', dates).like('slot', 'nomore:%');
  const stopped = new Set((stops || []).map(x => `${x.user_id}|${x.slot.slice(7)}`));

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
    const rems = reminders.filter(r => r.user_id === p.id);
    if (!rems.length) continue;
    const logsById = new Map(logs.filter(l => l.user_id === p.id).map(l => [l.id, l]));
    const badge = () => pendingDueCount(rems, logsById, p.slot_times, day);

    for (const [slot, time] of Object.entries(p.slot_times || {})) {
      if (time === day.time) {
        const due = dueReminders(rems, logsById, slot, day);
        if (due.length) await send(p.id, day.date, slot, buildSlotNotification(slot, time, due, badge()), `${slot} (${due.length})`);
      }
    }

    for (const r of dueCustom(rems, logsById, day)) {
      await send(p.id, day.date, `custom:${r.id}`, buildCustomNotification(r, day.time, badge()), `custom ${day.time}`);
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
      // A snoozed reminder replaces any further repeats for that check-in today.
      await claim(p.id, day.date, `nomore:${z.key}`);
      stopped.add(`${p.id}|${z.key}`);                // …including a repeat that falls in this same minute
      const sent = await sendToUser(p.id, buildSnoozeNotification(label, due, badge(), `/checkin/${z.key}`), devicesByUser.get(p.id));
      console.log(`[scheduler] snoozed ${z.key} → ${short(p.id)} (${sent} devices)`);
    }

    // "Remind me again": per-reminder repeats (alarm-style), default = profile follow-up. Snoozes override.
    for (const g of repeatsDue(rems, logsById, p.slot_times, day, followUp)) {
      if (snoozed.has(`${p.id}|${g.key}`) || stopped.has(`${p.id}|${g.key}`)) continue;
      const payload = g.slot ? buildSlotFollowUp(g.slot, g.items, badge()) : buildCustomFollowUp(g.items[0], badge());
      await send(p.id, day.date, `again:${g.key}:${g.offset}`, payload, `remind again ${g.key} +${g.offset}m`);
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

/**
 * Email the owner about new in-app feedback (each message once). Runs every tick; cheap when nothing is new.
 * Needs SMTP_USER, SMTP_PASS (Gmail app password) and FEEDBACK_EMAIL_TO; silently skipped if not configured.
 */
export async function emailNewFeedback() {
  const { SMTP_USER, SMTP_PASS, FEEDBACK_EMAIL_TO } = process.env;
  if (!SMTP_USER || !SMTP_PASS || !FEEDBACK_EMAIL_TO) return 0;
  const since = new Date(Date.now() - 2 * 864e5).toISOString();
  const { data: rows, error } = await admin().from('feedback')
    .select('id, user_id, message, page, user_agent, created_at').gte('created_at', since).order('created_at');
  if (error) { console.error('[feedback] read:', error.message); return 0; }
  let sent = 0;
  for (const f of rows || []) {
    const date = f.created_at.slice(0, 10);
    const { data: claimed, error: cErr } = await admin().from('notification_log')
      .upsert({ user_id: f.user_id, date, slot: `feedback:${f.id}` }, { onConflict: 'user_id,date,slot', ignoreDuplicates: true }).select();
    if (cErr || !claimed?.length) continue;                 // already emailed (or can't claim)
    const [{ data: prof }, { data: u }] = await Promise.all([
      admin().from('profiles').select('display_name').eq('id', f.user_id).maybeSingle(),
      admin().auth.admin.getUserById(f.user_id),
    ]);
    try {
      await mailer().sendMail({
        from: `Daily Assistant <${SMTP_USER}>`,
        to: FEEDBACK_EMAIL_TO,
        replyTo: u?.user?.email || undefined,
        subject: `💬 New feedback from ${prof?.display_name || u?.user?.email || 'a tester'}`,
        text: [
          f.message, '', '—',
          `From: ${prof?.display_name || '(no name)'} <${u?.user?.email || 'unknown'}>`,
          `When: ${new Date(f.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
          `Device: ${f.user_agent || 'unknown'}`,
          '', 'Reply to this email to answer them directly.',
        ].join('\n'),
      });
      sent++;
    } catch (e) {
      console.error('[feedback] email failed:', e.message);
      await admin().from('notification_log').delete().eq('user_id', f.user_id).eq('date', date).eq('slot', `feedback:${f.id}`); // retry next tick
    }
  }
  if (sent) console.log(`[feedback] emailed ${sent}`);
  return sent;
}

let transport;
function mailer() {
  if (!transport) transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com', port: Number(process.env.SMTP_PORT) || 465, secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transport;
}

/** Keep the dedupe table small: drop entries older than 7 days, daily. */
export async function cleanup() {
  const cutoff = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  await admin().from('notification_log').delete().lt('date', cutoff);
  // Snoozes of users who turned notifications off are never taken by the scheduler — drop stale ones.
  await admin().from('snoozes').delete().lt('due_at', new Date(Date.now() - 864e5).toISOString());
}
