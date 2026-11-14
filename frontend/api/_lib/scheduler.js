// Reminder engine: called once a minute by Supabase pg_cron → POST /api/cron/tick.
// (Moved from backend/src/scheduler.js when the backend left Railway; logic unchanged.)
import webpush from 'web-push';
import nodemailer from 'nodemailer';
import { admin } from './supabaseAdmin.js';
import {
  localNow, dueReminders, dueCustom, pendingDueCount, stockStatus, repeatsDue, waterDue, buildWaterNotification, recentTimes, weeklySummary, buildWeeklyNotification, familyDue, buildFamilyNotification, buildFamilyStockNotification,
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
  // Minutes checked this tick (now + a few before) so a late or skipped tick never loses a reminder.
  const windowByUser = new Map(profiles.map(p => [p.id, recentTimes(dayByUser.get(p.id).time)]));
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
  const stockUsers = profiles.filter(p => windowByUser.get(p.id).includes(p.slot_times?.morning)
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
    if (!(await claim(userId, date, key))) return false;
    const sent = await sendToUser(userId, payload, devicesByUser.get(userId));
    console.log(`[scheduler] ${label} → ${short(userId)} (${sent} devices)`);
    return true;
  };

  // Water: today's glass count for people whose water reminder is due this minute.
  const waterUsers = profiles.filter(p => windowByUser.get(p.id).some(t => waterDue(p.water, t, -1))).map(p => p.id);
  const glassesByUser = new Map();
  if (waterUsers.length) {
    const { data: wl, error: wErr } = await admin().from('water_logs').select('user_id, date, glasses').in('user_id', waterUsers).in('date', dates);
    if (wErr) console.error('[scheduler] water:', wErr.message);
    for (const w of wl || []) if (w.date === dayByUser.get(w.user_id)?.date) glassesByUser.set(w.user_id, w.glasses);
  }

  // Sunday summary: last 4 weeks of logs for people whose Sunday night-check time is now.
  const isPaused = p => !!p.paused_until && dayByUser.get(p.id).date <= p.paused_until;
  const weeklyUsers = profiles.filter(p => !isPaused(p) && dayByUser.get(p.id).weekday === 6
    && windowByUser.get(p.id).includes(p.slot_times?.overall)).map(p => p.id);
  const weekRowsByUser = new Map();
  if (weeklyUsers.length) {
    const since = dates.map(d => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - 27); return x.toISOString().slice(0, 10); }).sort()[0];
    const { data: wr, error: wkErr } = await admin().from('dose_logs').select('user_id, id, date, slot, status, skipped_reason')
      .in('user_id', weeklyUsers).gte('date', since);
    if (wkErr) console.error('[scheduler] weekly:', wkErr.message);
    for (const r of wr || []) { if (!weekRowsByUser.has(r.user_id)) weekRowsByUser.set(r.user_id, []); weekRowsByUser.get(r.user_id).push(r); }
  }

  for (const p of profiles) {
    const day = dayByUser.get(p.id);
    if (isPaused(p)) continue;                          // holiday mode: nothing at all
    const recent = windowByUser.get(p.id);              // oldest → newest
    if (weeklyUsers.includes(p.id)) {
      const sum = weeklySummary(weekRowsByUser.get(p.id) || [], day.date);
      if (sum) await send(p.id, day.date, `weekly:${day.date}`, buildWeeklyNotification(sum), `weekly ${sum.pct}%`);
    }
    if (waterUsers.includes(p.id)) {
      const glasses = glassesByUser.get(p.id) ?? 0;
      // Only the latest due water time — a late tick shouldn't send two water pushes at once.
      const t = [...recent].reverse().find(x => waterDue(p.water, x, glasses));
      if (t) await send(p.id, day.date, `water:${t}`, buildWaterNotification(glasses, p.water.goal), `water ${t}`);
    }
    const followUp = Number.isInteger(p.follow_up_minutes) ? p.follow_up_minutes : 15;
    const rems = reminders.filter(r => r.user_id === p.id);
    if (!rems.length) continue;
    const logsById = new Map(logs.filter(l => l.user_id === p.id).map(l => [l.id, l]));
    const badge = () => pendingDueCount(rems, logsById, p.slot_times, day);

    const justSent = new Set();   // check-ins whose first notification went out this tick (late tick) → no repeat on top
    for (const [slot, time] of Object.entries(p.slot_times || {})) {
      if (recent.includes(time)) {
        const due = dueReminders(rems, logsById, slot, day);
        if (due.length && await send(p.id, day.date, slot, buildSlotNotification(slot, time, due, badge()), `${slot} (${due.length})`)) justSent.add(slot);
      }
    }

    for (const t of recent) {
      for (const r of dueCustom(rems, logsById, { ...day, time: t })) {
        if (await send(p.id, day.date, `custom:${r.id}`, buildCustomNotification(r, t, badge()), `custom ${t}`)) justSent.add(`custom-${r.id}`);
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
      // A snoozed reminder replaces any further repeats for that check-in today.
      await claim(p.id, day.date, `nomore:${z.key}`);
      stopped.add(`${p.id}|${z.key}`);                // …including a repeat that falls in this same minute
      const sent = await sendToUser(p.id, buildSnoozeNotification(label, due, badge(), `/checkin/${z.key}`), devicesByUser.get(p.id));
      console.log(`[scheduler] snoozed ${z.key} → ${short(p.id)} (${sent} devices)`);
    }

    // "Remind me again": per-reminder repeats (alarm-style), default = profile follow-up. Snoozes override.
    // Newest minute first; at most one repeat per check-in per tick (a late tick never sends a burst).
    const repeated = new Set();
    for (const t of [...recent].reverse()) {
      for (const g of repeatsDue(rems, logsById, p.slot_times, { ...day, time: t }, followUp)) {
        if (repeated.has(g.key) || justSent.has(g.key) || snoozed.has(`${p.id}|${g.key}`) || stopped.has(`${p.id}|${g.key}`)) continue;
        const key = `again:${g.key}:${g.offset}`;
        if (!(await claim(p.id, day.date, key))) { repeated.add(g.key); continue; }   // newest already sent → don't resend older
        repeated.add(g.key);
        const payload = g.slot ? buildSlotFollowUp(g.slot, g.items, badge()) : buildCustomFollowUp(g.items[0], badge());
        const sent = await sendToUser(p.id, payload, devicesByUser.get(p.id));
        console.log(`[scheduler] remind again ${g.key} +${g.offset}m → ${short(p.id)} (${sent} devices)`);
      }
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
 * Family: tell followers when the person they follow hasn't ticked a medicine N minutes after its time, and
 * (at that person's morning time) when one of their medicines runs low. Works even if that person has no
 * notifications themselves. Skipped while they're on holiday. Each alert once (claim on the follower).
 */
export async function checkFamily() {
  const { data: links, error } = await admin().from('care_links')
    .select('id, owner_id, carer_id, alert_after, nickname').eq('status', 'active');
  if (error) { if (!/care_links/.test(error.message)) console.error('[family] links:', error.message); return; }
  if (!links?.length) return;
  const carerIds = [...new Set(links.map(l => l.carer_id))];
  const { data: devices } = await admin().from('push_devices').select('id, user_id, endpoint, p256dh, auth').in('user_id', carerIds);
  const { data: carers } = await admin().from('profiles').select('id, push_enabled').in('id', carerIds);
  const canPush = new Set((carers || []).filter(c => c.push_enabled).map(c => c.id));
  const devicesBy = new Map();
  for (const d of devices || []) if (canPush.has(d.user_id)) { if (!devicesBy.has(d.user_id)) devicesBy.set(d.user_id, []); devicesBy.get(d.user_id).push(d); }
  const live = links.filter(l => devicesBy.has(l.carer_id));
  if (!live.length) return;

  const ownerIds = [...new Set(live.map(l => l.owner_id))];
  const { data: owners } = await admin().from('profiles').select('*').in('id', ownerIds);
  const ownerBy = new Map((owners || []).map(o => [o.id, o]));
  const dayBy = new Map((owners || []).map(o => [o.id, localNow(o.timezone || 'Asia/Kolkata')]));
  const dates = [...new Set([...dayBy.values()].map(d => d.date))];
  const [{ data: rems }, { data: logs }] = await Promise.all([
    admin().from('reminders').select('*').in('user_id', ownerIds).eq('category', 'medicine').eq('is_active', true),
    admin().from('dose_logs').select('user_id, id, status, skipped_reason, completed_at, reminder_id').in('user_id', ownerIds).in('date', dates),
  ]);

  // Stock needs completed doses since each refill — only for owners whose morning time is now.
  const stockOwners = (owners || []).filter(o => recentTimes(dayBy.get(o.id).time).includes(o.slot_times?.morning)
    && (rems || []).some(r => r.user_id === o.id && r.medicine?.stock)).map(o => o.id);
  const doneBy = new Map();
  if (stockOwners.length) {
    const since = (rems || []).filter(r => stockOwners.includes(r.user_id) && r.medicine?.stock).map(r => r.medicine.stock.refilledAt).sort()[0];
    const { data: done } = await admin().from('dose_logs').select('user_id, reminder_id, completed_at')
      .in('user_id', stockOwners).eq('status', 'completed').gte('completed_at', since);
    for (const x of done || []) { const k = `${x.user_id}|${x.reminder_id}`; if (!doneBy.has(k)) doneBy.set(k, []); doneBy.get(k).push(new Date(x.completed_at).toISOString()); }
  }

  const claim = async (userId, date, key) => {
    const { data } = await admin().from('notification_log')
      .upsert({ user_id: userId, date, slot: key }, { onConflict: 'user_id,date,slot', ignoreDuplicates: true }).select();
    return !!data?.length;
  };
  for (const l of live) {
    const o = ownerBy.get(l.owner_id); if (!o) continue;
    const day = dayBy.get(o.id);
    if (o.paused_until && day.date <= o.paused_until) continue;           // on holiday
    const name = l.nickname || o.display_name || 'Your family member';
    const mine = (rems || []).filter(r => r.user_id === o.id);
    const logsById = new Map((logs || []).filter(x => x.user_id === o.id).map(x => [x.id, x]));
    for (const g of familyDue(mine, logsById, o.slot_times, day, l.alert_after, recentTimes(day.time))) {
      if (!(await claim(l.carer_id, day.date, `care:${l.id}:${g.key}`))) continue;
      const sent = await sendToUser(l.carer_id, buildFamilyNotification(name, g, l.id), devicesBy.get(l.carer_id));
      console.log(`[family] not taken ${g.key} → ${short(l.carer_id)} (${sent} devices)`);
    }
    if (stockOwners.includes(o.id)) {
      for (const r of mine.filter(x => x.medicine?.stock)) {
        const st = stockStatus(r, doneBy.get(`${o.id}|${r.id}`) || [], day.date);
        if (!st || !(st.low || st.out)) continue;
        if (!(await claim(l.carer_id, day.date, `care-stock:${l.id}:${r.id}`))) continue;
        const sent = await sendToUser(l.carer_id, buildFamilyStockNotification(name, r, st, l.id), devicesBy.get(l.carer_id));
        console.log(`[family] stock ${r.title} → ${short(l.carer_id)} (${sent} devices)`);
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

/**
 * Email the owner a digest of app errors from testers' phones — at most once an hour (first minutes of the hour),
 * so an error storm can't flood the inbox. Each error is included once (claim `error:<id>`).
 */
export async function emailNewErrors(now = new Date()) {
  const { SMTP_USER, SMTP_PASS, FEEDBACK_EMAIL_TO } = process.env;
  if (!SMTP_USER || !SMTP_PASS || !FEEDBACK_EMAIL_TO) return 0;
  if (now.getUTCMinutes() > 4) return 0;
  const { data: owner } = await admin().from('profiles').select('id').eq('is_admin', true).limit(1).maybeSingle();
  if (!owner) return 0;
  const hourKey = `errors:${now.toISOString().slice(0, 13)}`, today = now.toISOString().slice(0, 10);
  const claimKey = (userId, date, slot) => admin().from('notification_log')
    .upsert({ user_id: userId, date, slot }, { onConflict: 'user_id,date,slot', ignoreDuplicates: true }).select();
  const unclaim = (userId, date, slot) => admin().from('notification_log').delete().eq('user_id', userId).eq('date', date).eq('slot', slot);

  const since = new Date(now.getTime() - 2 * 864e5).toISOString();
  const { data: rows, error } = await admin().from('client_errors')
    .select('id, user_id, message, stack, page, app_version, user_agent, created_at').gte('created_at', since).order('created_at').limit(500);
  if (error) { if (!/client_errors/.test(error.message)) console.error('[errors] read:', error.message); return 0; }
  if (!rows?.length) return 0;
  const { data: gate } = await claimKey(owner.id, today, hourKey);
  if (!gate?.length) return 0;                                   // already handled this hour

  const fresh = [];
  for (const r of rows) {
    if (!r.user_id) continue;
    const { data: c } = await claimKey(r.user_id, r.created_at.slice(0, 10), `error:${r.id}`);
    if (c?.length) fresh.push(r);
  }
  if (!fresh.length) { await unclaim(owner.id, today, hourKey); return 0; }

  const groups = new Map();
  for (const r of fresh) {
    const g = groups.get(r.message) || { message: r.message, count: 0, users: new Set(), last: r };
    g.count++; g.users.add(r.user_id); g.last = r; groups.set(r.message, g);
  }
  const ids = [...new Set(fresh.map(r => r.user_id))];
  const { data: profs } = await admin().from('profiles').select('id, display_name').in('id', ids);
  const nameOf = id => profs?.find(p => p.id === id)?.display_name || 'a tester';
  const body = [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 20).map(g => [
    `• ${g.message}`,
    `  ${g.count}× · ${g.users.size} person(s): ${[...g.users].map(nameOf).join(', ')}`,
    `  Last: ${new Date(g.last.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} on ${g.last.page || '?'} · app ${g.last.app_version || '?'}`,
    `  Device: ${g.last.user_agent || '?'}`,
    g.last.stack ? `  ${g.last.stack.split('\n').slice(0, 4).join('\n  ')}` : '',
  ].filter(Boolean).join('\n')).join('\n\n');
  try {
    await mailer().sendMail({
      from: `Daily Assistant <${SMTP_USER}>`, to: FEEDBACK_EMAIL_TO,
      subject: `⚠️ ${fresh.length} app error${fresh.length === 1 ? '' : 's'} on testers' phones`,
      text: `${body}\n\n—\nForward this to Claude to fix it. Nothing here includes medicine details.`,
    });
    console.log(`[errors] emailed ${fresh.length}`);
    return fresh.length;
  } catch (e) {
    console.error('[errors] email failed:', e.message);
    await unclaim(owner.id, today, hourKey);
    for (const r of fresh) await unclaim(r.user_id, r.created_at.slice(0, 10), `error:${r.id}`);
    return 0;
  }
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
  await admin().from('client_errors').delete().lt('created_at', new Date(Date.now() - 14 * 864e5).toISOString());
}
