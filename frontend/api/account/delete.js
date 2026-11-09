// POST /api/account/delete — permanently delete the signed-in user and ALL their data
// (every user table cascades from profiles → auth.users).
import { json, onlyPost, requireUser, limited } from '../_lib/http.js';
import { admin } from '../_lib/supabaseAdmin.js';

export default async function handler(req, res) {
  if (!onlyPost(req, res)) return;
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    if (limited(`delete:${user.id}`, 3)) return json(res, 429, { error: 'Too many requests' });
    const { error } = await admin().auth.admin.deleteUser(user.id);
    if (error) { console.error('[account] delete failed:', error.message); return json(res, 500, { error: 'Could not delete account' }); }
    console.log(`[account] Deleted user ${user.id.slice(0, 8)}…`);
    return json(res, 200, { ok: true });
  } catch (e) {
    console.error('[account]', e.message);
    return json(res, 500, { error: 'Request failed' });
  }
}
