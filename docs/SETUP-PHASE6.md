# Phase 6 setup — accounts & invite-only login

Do these steps **in this order**. Total time: about 20–30 minutes.
Nothing here costs money. Supabase menu names can shift slightly over time — look for the closest match.

> ⚠️ Do steps 1–5 **before** merging the code (step 6). The new app needs the new database tables.

---

## Step 1 — Create a Gmail app password (for sending login codes)

Supabase's built-in email sender only emails your own team, so login codes go through a Gmail account.
A separate Gmail (e.g. `dailyassistant.app@gmail.com`) is best, but your own works too.

1. Sign in to that Gmail account → open **myaccount.google.com** → **Security**.
2. Turn on **2-Step Verification** (required for app passwords).
3. Search the settings for **App passwords** (or open myaccount.google.com/apppasswords).
4. App name: `Daily Assistant` → **Create**.
5. Copy the 16-character password (e.g. `abcd efgh ijkl mnop`). You'll paste it in step 2. **Don't share it with anyone, including me.**

Gmail limit: ~500 emails/day — plenty for 10–20 testers.
(Later, once you buy `dailyassistant.in`, we switch to Resend so codes come from `no-reply@dailyassistant.in`.)

## Step 2 — Supabase: email sending (SMTP)

Supabase Dashboard → your project → **Authentication** → **Emails** (or Project Settings → Authentication) → **SMTP Settings** → **Enable custom SMTP**:

| Field | Value |
|---|---|
| Sender email | the Gmail address from step 1 |
| Sender name | `Daily Assistant` |
| Host | `smtp.gmail.com` |
| Port | `465` |
| Username | the Gmail address |
| Password | the 16-character app password (no spaces) |

Save.

## Step 3 — Supabase: make emails show a 6-digit code

**Authentication → Emails → Templates.** Edit **both** "Magic Link" and "Confirm signup" (new users get one, returning users the other):

**Subject:** `Your Daily Assistant login code`

**Body (paste):**
```html
<h2>Your login code</h2>
<p style="font-size:32px;font-weight:bold;letter-spacing:8px;margin:16px 0">{{ .Token }}</p>
<p>Enter this code in the Daily Assistant app. It expires in 1 hour.</p>
<p style="color:#888">If you didn't request this, you can ignore this email.</p>
```
Save both.

Also check **Authentication → Sign In / Providers → Email**:
- **Enable Email provider**: ON
- **Allow new users to sign up**: ON (the invite list below is what restricts who can join)
- Email OTP length: 6 is fine

## Step 4 — Supabase: create the new tables

1. **SQL Editor → New query**.
2. Open `backend/supabase/phase6-schema.sql` from GitHub, copy **all** of it, paste, **Run**. You should see "Success". (Safe to run again if unsure.)
3. New query — add yourself to the invite list (use the email you'll log in with):
   ```sql
   insert into allowed_emails (email, note) values ('sakshi@gearedfinance.com.au', 'owner') on conflict do nothing;
   ```
   Emails must be **lowercase**.

## Step 5 — Vercel: add the two new public settings

1. Supabase → **Project Settings → API** (or "API Keys"). Copy:
   - **Project URL** — `https://iiyeyisdmafernjjxkzu.supabase.co`
   - **anon / public** key (the long one labelled *anon public* or *publishable*). ⚠️ **Not** the `service_role` / secret key.
2. Vercel → `daily-assistant` project → **Settings → Environment Variables** → add:
   - `VITE_SUPABASE_URL` = the Project URL
   - `VITE_SUPABASE_ANON_KEY` = the anon public key
3. Railway: check `FRONTEND_URL` is exactly `https://daily-assistant-eta.vercel.app`. Nothing else changes on Railway.

## Step 6 — Merge the code

Merge the pull request into `main`. Vercel and Railway redeploy automatically (~2 min).
Check `https://daily-assistant-production.up.railway.app/health` says `ok`.

## Step 7 — First login on your iPhone

1. Open the Daily Assistant app from your Home Screen (fully close and reopen it once so it picks up the new version).
2. Enter your email → **Send login code** → type the code from the email.
3. The Welcome screen should say it **found your reminders from the earlier version** — your Iron / D3 / B12, history and notification times are moved into your account automatically.
4. Settings → **Push Notifications → Enable** (needed once per device, because notifications are now linked to your account) → **Send Test**.

If the import message does not appear and your reminders are missing: Settings → **Import data from old version**.

---

## Everyday admin

**Invite a tester** (SQL Editor):
```sql
insert into allowed_emails (email, note) values ('friend@gmail.com', 'Priya - college') on conflict do nothing;
```
Then send them the app link: `https://daily-assistant-eta.vercel.app` + "Open in Safari → Share → Add to Home Screen".

**Remove an invite** (stops new sign-ups; existing account keeps working):
```sql
delete from allowed_emails where email = 'friend@gmail.com';
```

**Read feedback:** Supabase → **Table Editor → feedback**.

**See who has joined:** Supabase → **Authentication → Users**.

## Troubleshooting

| Problem | Fix |
|---|---|
| "This email hasn't been invited yet" | Add it to `allowed_emails` (lowercase). |
| No email arrives | Check spam. Re-check step 2 (app password, port 465). Supabase → Logs → Auth shows SMTP errors. |
| Email has a link but no code | Step 3 — the template needs `{{ .Token }}`. |
| "App is not configured" on login screen | Step 5 — Vercel env vars missing; redeploy after adding. |
| Notifications stopped | Settings → Push Notifications → Disable → Enable → Send Test. |
