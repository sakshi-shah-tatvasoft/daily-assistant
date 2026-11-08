const express  = require('express');
const router   = express.Router();
const supabase = require('../db');
const { requireUser } = require('../auth');
const { rateLimit }   = require('../rateLimit');

// POST /api/account/delete — permanently delete the signed-in user and ALL their data.
// Every user table references profiles → auth.users with ON DELETE CASCADE.
router.post('/delete', requireUser, rateLimit({ windowMs: 60_000, max: 3 }), async (req, res, next) => {
  try {
    const { error } = await supabase.auth.admin.deleteUser(req.user.id);
    if (error) {
      console.error('[account] delete failed:', error.message);
      return res.status(500).json({ error: 'Could not delete account' });
    }
    console.log(`[account] Deleted user ${req.user.id.slice(0, 8)}…`);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
