// POST /api/push/test — send a test notification to all of the signed-in user's devices.
import { json, onlyPost, requireUser, limited } from '../_lib/http.js';
import { sendToUser } from '../_lib/scheduler.js';
import { admin } from '../_lib/supabaseAdmin.js';
import { tr, normLang } from '../_lib/i18n.js';

export default async function handler(req, res) {
  if (!onlyPost(req, res)) return;
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    if (limited(`test:${user.id}`, 5)) return json(res, 429, { error: 'Too many tests — please wait a minute' });
    const { data: prof } = await admin().from('profiles').select('*').eq('id', user.id).maybeSingle();
    const L = normLang(prof?.language);
    const sent = await sendToUser(user.id, {
      title: tr(L, '🔔 Daily Assistant Test'), body: tr(L, 'Your push notifications are working perfectly!'), tag: 'test', url: '/',
    });
    if (sent > 0) return json(res, 200, { ok: true, sent });
    const failures = sendToUser.lastFailures || [];
    if (!failures.length) return json(res, 404, { error: 'This device is not registered yet — tap Disable, then Enable again.' });
    const f = failures[0];
    console.error('[push/test] all sends failed:', JSON.stringify(failures));
    const why = f.status === 403 ? 'the push service rejected our signing key (VAPID)'
      : f.status === 404 || f.status === 410 ? 'this device subscription has expired'
      : f.status ? `push service error ${f.status}` : f.message || 'unknown error';
    return json(res, 502, { error: `Could not deliver: ${why}. Tap Disable, then Enable again.` });
  } catch (e) {
    console.error('[push/test]', e.message);
    return json(res, 500, { error: 'Request failed' });
  }
}
