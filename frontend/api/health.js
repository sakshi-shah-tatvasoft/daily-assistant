// GET /api/health — quick check that the API is deployed and configured (no secrets revealed).
const keyType = k => !k ? 'missing'
  : k.startsWith('sb_secret_') ? 'secret'
  : k.startsWith('eyJ') ? 'legacy service key'
  : 'WRONG — use a Supabase secret key (sb_secret_…)';

export default function handler(_req, res) {
  const has = k => Boolean(process.env[k]);
  res.status(200).json({
    status: 'ok',
    time: new Date().toISOString(),
    configured: {
      supabase: has('SUPABASE_URL') && has('SUPABASE_SERVICE_KEY'),
      secretKeyType: keyType(process.env.SUPABASE_SERVICE_KEY || ''),
      vapid: has('VAPID_PUBLIC_KEY') && has('VAPID_PRIVATE_KEY') && has('VAPID_EMAIL'),
      cronSecret: (process.env.CRON_SECRET || '').length >= 32,
    },
  });
}
