# Moving the backend off Railway (₹0)

**Status: DONE 9 Nov 2026.** **Before:** Railway ran an always-on Node server (every-minute reminders, Send Test, Delete account) — trial ends ~5 Dec.
**After:** the same code runs as **Vercel functions** in the app's own project (`frontend/api/*`), and
**Supabase pg_cron** calls `/api/cron/tick` every minute. Both are free at this scale.

Running both at once is safe: every notification is claimed in `notification_log` before sending,
so nobody gets duplicates during the switch.

## Steps (in order)
1. **Supabase SQL:** run `backend/supabase/migrations/2026-11-10-cron-1-secret.sql` → copy the secret it shows.
2. **Vercel → Settings → Environment Variables** (Production), type **Secret** unless noted:
   | Name | Value |
   |---|---|
   | `SUPABASE_URL` (Config) | `https://iiyeyisdmafernjjxkzu.supabase.co` |
   | `SUPABASE_SERVICE_KEY` | the **secret** key `sb_secret_…` (copy from Railway's variable) |
   | `VAPID_PUBLIC_KEY` (Config) | same as `VITE_VAPID_PUBLIC_KEY` |
   | `VAPID_PRIVATE_KEY` | copy from Railway's variable |
   | `VAPID_EMAIL` (Config) | copy from Railway's variable (starts with `mailto:`) |
   | `CRON_SECRET` | the secret from step 1 |
   None of these start with `VITE_`, so they never reach the browser.
3. **Merge the PR** → Vercel deploys the functions. Check `https://daily-assistant-eta.vercel.app/api/health`:
   every `configured` value should be true / `secret`.
4. **App → Settings → Send Test** (now served by Vercel).
5. **Supabase SQL:** run `2026-11-10-cron-2-schedule.sql`. After 2–3 min, the check query shows status 200 rows.
6. **Wait for a real scheduled reminder** to arrive.
7. **Railway:** delete the service (Project → Settings → Danger → Delete). Nothing else depends on it.

## Rollback
`select cron.unschedule('daily-assistant-tick');` — and Railway keeps working until you delete it.
