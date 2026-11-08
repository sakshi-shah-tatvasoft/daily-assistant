const webpush  = require('web-push');
const cron     = require('node-cron');
const supabase = require('./db');
const { localNow, dueTitles, SLOT_LABELS } = require('./scheduleLogic');
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
      if (err.statusCode === 404 || err.statusCode === 410) {
        await supabase.from('push_devices').delete().eq('id', d.id);
        console.log(`[push] Removed expired device for ${short(userId)}`);
      } else {
        console.error(`[push] Failed for ${short(userId)}:`, err.statusCode || '', err.message);
      }
    }
  }));
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

  const due = []; // { userId, slot, day }
  for (const p of profiles) {
    const day = localNow(p.timezone || 'Asia/Kolkata');
    for (const [slot, time] of Object.entries(p.slot_times || {})) {
      if (time === day.time) due.push({ userId: p.id, slot, day });
    }
  }
  if (!due.length) return;

  // 3. Load reminders + today's logs for just those users
  const userIds = [...new Set(due.map(d => d.userId))];
  const dates   = [...new Set(due.map(d => d.day.date))];
  const [{ data: reminders, error: rErr }, { data: logs, error: lErr }] = await Promise.all([
    supabase.from('reminders')
      .select('user_id, id, title, slots, repeat, repeat_days, once_date, is_active')
      .in('user_id', userIds).eq('is_active', true),
    supabase.from('dose_logs').select('user_id, id, status').in('user_id', userIds).in('date', dates),
  ]);
  if (rErr || lErr) return console.error('[scheduler] data:', (rErr || lErr).message);

  for (const { userId, slot, day } of due) {
    const titles = dueTitles(
      reminders.filter(r => r.user_id === userId),
      new Map(logs.filter(l => l.user_id === userId).map(l => [l.id, l])),
      slot, day,
    );
    if (!titles.length) continue; // nothing left to do in this slot

    // 4. Dedupe in the DB so a restart or second server never double-sends
    const { data: claimed, error: cErr } = await supabase
      .from('notification_log')
      .upsert({ user_id: userId, date: day.date, slot }, { onConflict: 'user_id,date,slot', ignoreDuplicates: true })
      .select();
    if (cErr) { console.error('[scheduler] dedupe:', cErr.message); continue; }
    if (!claimed?.length) continue; // already sent

    const sent = await sendToUser(userId, {
      title: `${SLOT_LABELS[slot] ?? slot} Reminder`,
      body:  titles.map(t => `• ${t}`).join('\n'),
      tag:   `da-${slot}`,
      url:   '/',
    }, devicesByUser.get(userId));
    console.log(`[scheduler] ${slot} → ${short(userId)} (${titles.length} items, ${sent} devices)`);
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
