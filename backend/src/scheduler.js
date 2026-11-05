const webpush  = require('web-push');
const cron     = require('node-cron');
const { utcToZonedTime, format } = require('date-fns-tz');
const supabase = require('./db');
require('dotenv').config();

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
);

const SLOT_LABELS = {
  morning:     '☀️ Morning',
  afternoon:   '🌤️ Afternoon',
  after_dinner:'🌙 After Dinner',
  overall:     '🔔 Overall',
};

// deviceId-slot-date keys that have already fired today (in-memory guard)
const firedToday = new Set();

function getISTTime() {
  const now = utcToZonedTime(new Date(), 'Asia/Kolkata');
  return format(now, 'HH:mm');
}

function getISTDate() {
  const now = utcToZonedTime(new Date(), 'Asia/Kolkata');
  return format(now, 'yyyy-MM-dd');
}

// Reset fired set at midnight IST every day
cron.schedule('0 0 * * *', () => {
  firedToday.clear();
  console.log('[scheduler] Fired-today set reset at midnight IST');
}, { timezone: 'Asia/Kolkata' });

// Send push to a specific device
async function sendToDevice(deviceId, payload) {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('device_id', deviceId)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    console.error(`[scheduler] Device not found: ${deviceId}`);
    return false;
  }

  const pushSubscription = {
    endpoint: data.endpoint,
    keys: { p256dh: data.p256dh, auth: data.auth },
  };

  try {
    await webpush.sendNotification(pushSubscription, JSON.stringify(payload));
    return true;
  } catch (err) {
    if (err.statusCode === 410) {
      // Subscription expired — deactivate it
      await supabase
        .from('push_subscriptions')
        .update({ is_active: false })
        .eq('device_id', deviceId);
      console.log(`[scheduler] Deactivated expired subscription: ${deviceId}`);
    } else {
      console.error(`[scheduler] Push failed for ${deviceId}:`, err.message);
    }
    return false;
  }
}

// Main cron — runs every minute, checks all active subscriptions
async function checkAndSend() {
  const nowTime = getISTTime();
  const today   = getISTDate();

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('device_id, endpoint, p256dh, auth, slot_times, slot_items')
    .eq('is_active', true);

  if (error) {
    console.error('[scheduler] DB error:', error.message);
    return;
  }

  for (const sub of subs ?? []) {
    const slotTimes = sub.slot_times ?? {};
    const slotItems = sub.slot_items ?? {};

    for (const [slot, slotTime] of Object.entries(slotTimes)) {
      if (slotTime !== nowTime) continue;

      const key = `${sub.device_id}-${slot}-${today}`;
      if (firedToday.has(key)) continue; // already sent this slot today
      firedToday.add(key);

      const items    = slotItems[slot] ?? [];
      const label    = SLOT_LABELS[slot] ?? slot;
      const bodyText = items.length
        ? items.map(i => `• ${i}`).join('\n')
        : 'Time for your reminder';

      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };

      try {
        await webpush.sendNotification(
          pushSubscription,
          JSON.stringify({
            title: `${label} Reminder`,
            body:  bodyText,
            tag:   `da-${slot}`,
            url:   '/',
          })
        );
        console.log(`[scheduler] ✓ Sent ${slot} notification to ${sub.device_id.slice(0, 8)}…`);
      } catch (err) {
        if (err.statusCode === 410) {
          await supabase
            .from('push_subscriptions')
            .update({ is_active: false })
            .eq('device_id', sub.device_id);
          console.log(`[scheduler] Deactivated expired: ${sub.device_id.slice(0, 8)}…`);
        } else {
          console.error(`[scheduler] Push error:`, err.message);
        }
      }
    }
  }
}

// Start the every-minute cron
function startScheduler() {
  cron.schedule('* * * * *', checkAndSend, { timezone: 'Asia/Kolkata' });
  console.log('[scheduler] Started — checking every minute (IST)');
}

module.exports = { startScheduler, sendToDevice };
