const express = require('express');
const router  = express.Router();
const { requireUser } = require('../auth');
const { rateLimit }   = require('../rateLimit');

// Devices register themselves directly in Supabase (RPC register_push_device, protected by RLS).
// The backend only needs the VAPID private key for actually sending.

// POST /api/push/test — send a test notification to all of the signed-in user's devices
router.post('/test', requireUser, rateLimit({ windowMs: 60_000, max: 5 }), async (req, res, next) => {
  try {
    const { sendToUser } = require('../scheduler');
    const sent = await sendToUser(req.user.id, {
      title: '🔔 Daily Assistant Test',
      body:  'Your push notifications are working perfectly!',
      tag:   'test',
      url:   '/',
    });
    if (sent > 0) res.json({ ok: true, sent });
    else res.status(404).json({ error: 'No devices registered for notifications' });
  } catch (err) { next(err); }
});

module.exports = router;
