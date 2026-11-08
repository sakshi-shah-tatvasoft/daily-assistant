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
    if (sent > 0) return res.json({ ok: true, sent });
    const failures = sendToUser.lastFailures || [];
    if (!failures.length) return res.status(404).json({ error: 'This device is not registered yet — tap Disable, then Enable again.' });
    const f = failures[0];
    console.error('[push/test] all sends failed:', JSON.stringify(failures));
    const why = f.status === 403 ? 'the push service rejected our signing key (VAPID)'
      : f.status === 404 || f.status === 410 ? 'this device subscription has expired'
      : f.status ? `push service error ${f.status}` : f.message || 'unknown error';
    res.status(502).json({ error: `Could not deliver: ${why}. Tap Disable, then Enable again.`, detail: f });
  } catch (err) { next(err); }
});

module.exports = router;
