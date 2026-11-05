const express = require('express');
const router  = express.Router();
const supabase = require('../db');

// POST /api/push/subscribe
// Body: { deviceId, subscription: {endpoint, keys:{p256dh,auth}}, slotTimes, slotItems, timezone }
router.post('/subscribe', async (req, res) => {
  const { deviceId, subscription, slotTimes, slotItems, timezone } = req.body;

  if (!deviceId || !subscription?.endpoint || !subscription?.keys) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        device_id:   deviceId,
        endpoint:    subscription.endpoint,
        p256dh:      subscription.keys.p256dh,
        auth:        subscription.keys.auth,
        slot_times:  slotTimes  || { morning: '08:00', afternoon: '13:00', after_dinner: '20:30', overall: '22:00' },
        slot_items:  slotItems  || {},
        timezone:    timezone   || 'Asia/Kolkata',
        is_active:   true,
        updated_at:  new Date().toISOString(),
      },
      { onConflict: 'device_id' }
    );

  if (error) {
    console.error('Subscribe error:', error);
    return res.status(500).json({ error: 'Failed to save subscription' });
  }

  res.json({ ok: true, message: 'Subscribed successfully' });
});

// POST /api/push/update-schedule
// Body: { deviceId, slotTimes, slotItems }
router.post('/update-schedule', async (req, res) => {
  const { deviceId, slotTimes, slotItems } = req.body;

  if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });

  const { error } = await supabase
    .from('push_subscriptions')
    .update({ slot_times: slotTimes, slot_items: slotItems, updated_at: new Date().toISOString() })
    .eq('device_id', deviceId);

  if (error) return res.status(500).json({ error: 'Failed to update schedule' });

  res.json({ ok: true });
});

// POST /api/push/unsubscribe
// Body: { deviceId }
router.post('/unsubscribe', async (req, res) => {
  const { deviceId } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });

  const { error } = await supabase
    .from('push_subscriptions')
    .update({ is_active: false })
    .eq('device_id', deviceId);

  if (error) return res.status(500).json({ error: 'Failed to unsubscribe' });

  res.json({ ok: true });
});

// POST /api/push/test
// Body: { deviceId }  — sends a test notification immediately
router.post('/test', async (req, res) => {
  const { deviceId } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });

  const { sendToDevice } = require('../scheduler');
  const sent = await sendToDevice(deviceId, {
    title: '🔔 Daily Assistant Test',
    body:  'Your push notifications are working perfectly!',
    tag:   'test',
    url:   '/',
  });

  if (sent) res.json({ ok: true, message: 'Test notification sent' });
  else res.status(500).json({ error: 'Failed to send test notification' });
});

module.exports = router;
