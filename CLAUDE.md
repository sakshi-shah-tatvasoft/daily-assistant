# Daily Assistant — Project Brief for Claude

## What this is
A personal PWA (Progressive Web App) — medicine reminder + habit tracker + routine monitor.
Installable on iPhone 17 via Safari → Share → Add to Home Screen.
Built for Sakshi (sakshi@gearedfinance.com.au).

## How to work with Sakshi (her preference — always follow)
- Sakshi is new to this. When a task needs actions from her (dashboards, settings, accounts):
  1. First give a short overview: **why** it's needed and the **list of all steps** (one line each).
  2. Then give **only Step 1** in detail (exact clicks, what she should see).
  3. Wait for her to report back (screenshot/result), then give the next step based on what happened.
- Never ask her to paste secrets (passwords, service_role key, app passwords) into chat.
- Keep language simple; explain unfamiliar terms briefly.

## Security rules — never break these
- Never expose secret API keys in frontend code
- Medicine and personal routine info must stay private
- Use secure authentication and database permissions
- The app must NOT recommend medicines, change doses, or make medical decisions — only remind per the schedule entered

## Medicine schedule (Sakshi's — no longer pre-loaded)
- Iron Syrup: 10ml, twice daily (morning after meal + after dinner)
- Vitamin D3: 60,000 IU, every Thursday morning
- Vitamin B12: 1 tablet, daily morning after meal
- Since Phase 6 new users start EMPTY. Sakshi's schedule lives in her account; `data/initialData.ts`
  (`LEGACY_DEFAULT_REMINDERS`) exists only to import pre-account data from her phone.

## Tech stack
| Layer | Tech |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| PWA | vite-plugin-pwa (injectManifest strategy) + custom sw.ts |
| Routing | React Router DOM v6 |
| Backend | Node.js + Express (Railway) |
| Database | Supabase (PostgreSQL + RLS). Frontend uses anon key + RLS; backend uses service role |
| Auth | Supabase Auth — 6-digit email OTP, invite-only (`allowed_emails`), SMTP via Gmail app password |
| Push notifications | web-push + VAPID |
| Scheduler | node-cron every minute on Railway; per-user timezone; reads reminders/profiles from DB |
| Frontend hosting | Vercel — https://daily-assistant-eta.vercel.app |
| Backend hosting | Railway — https://daily-assistant-production.up.railway.app |

## Project structure
```
C:\Users\LPI73\daily-assistant\
├── frontend/          React PWA
│   ├── src/
│   │   ├── components/ui/  ProgressRing, EmptyState, Celebration (celebrate('msg'))
│   │   ├── pages/     Home(Today), Tasks, TasksWeek, ManageTasks, Reminders, AddReminder, Progress(Reports+Calendar),
│   │   │              Settings, Login, Welcome (onboarding), Privacy, Feedback
│   │   ├── context/   AuthContext.tsx (session), AppContext.tsx (per-user data + sync engine)
│   │   ├── hooks/     usePushNotifications.ts (multi-device, register_push_device RPC)
│   │   ├── lib/       supabase.ts (anon client), sync.ts (row mapping, diff, legacy import),
│   │   │              tasks.ts (daily checklist data), api.ts (backend: test push, delete account)
│   │   ├── utils/     constants.ts, dateHelpers.ts, notifications.ts
│   │   ├── types/     index.ts
│   │   ├── data/      initialData.ts
│   │   └── sw.ts      Custom service worker (push handler)
│   ├── .env.example   VITE_API_URL, VITE_VAPID_PUBLIC_KEY, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (all public)
│   └── vercel.json    Vercel deployment config
├── backend/
│   ├── src/
│   │   ├── index.js   Express server (CORS, rate limit)
│   │   ├── db.js      Supabase client (service role) + ws WebSocket polyfill for Node 20
│   │   ├── auth.js    requireUser: verifies Supabase JWT
│   │   ├── scheduler.js  every-minute push sender, DB dedupe (notification_log)
│   │   ├── scheduleLogic.js  pure helpers (tested: npm test)
│   │   └── routes/    push.js (POST /api/push/test), account.js (POST /api/account/delete)
│   ├── supabase/phase6-schema.sql  ← current schema (profiles, reminders, dose_logs, daily_tasks,
│   │                                 task_logs, push_devices, notification_log, feedback, allowed_emails)
│   ├── .env           All secrets (never commit — gitignored)
│   ├── railway.json   Railway deployment config (Railpack)
│   └── supabase-schema.sql  Phase 3 (old push_subscriptions table — unused since Phase 6, drop later)
├── docs/SETUP-PHASE6.md  Step-by-step Supabase/Gmail/Vercel setup + invite admin
├── package.json       Root build/start delegating to backend/ (Railway)
├── railway.json       Railway config (Railpack)
├── .gitignore
└── CLAUDE.md          ← this file
```

## Key design decisions
- **4 notification slots** per day: morning, afternoon, after_dinner, overall (times configurable)
- **Custom-time reminders** (`customTime`, no slots) are pushed by the scheduler too (dedupe key `custom:<reminderId>`)
- **Check-in** (`/checkin/:slot` or `/checkin/custom-<id>`): notification tap opens it; ticked → completed, unticked →
  `skipped` with `skippedReason: 'missed'` (counts as NOT done in stats; deliberate skips stay excused — see isExcused/isMissed)
- **Follow-up**: `profiles.follow_up_minutes` (0/15/30/60, default 15; migration backend/supabase/migrations/2026-11-09-follow-up.sql)
  → one "Still pending" push N min after a slot/custom reminder if still pending (dedupe `followup:<slot>` / `followup:custom:<id>`)
- **App-icon badge**: push payload `badge` (pending items whose time has come) → SW `setAppBadge`; app recomputes every minute
- **App updates**: sw.ts calls skipWaiting + clientsClaim; main.tsx checks for updates on every open (visibilitychange)
  and reloads once when a new version takes over. Settings shows build time + commit (`__BUILD_TIME__`, `__COMMIT__`).
  (Before 9 Nov 2026 new versions waited until the iOS app was fully killed — testers could run old builds for days.)
- **No home-screen widgets**: iOS/Android only allow widgets for native store apps (would need Capacitor + WidgetKit, $99/yr)
- **Twice-daily medicine**: single Reminder with `slots: ['morning', 'after_dinner']`
- **Weekly**: `repeat: 'weekly'`, `repeatDays: [3]` (0=Mon…6=Sun, so 3=Thu)
- **Monthly**: `repeat: 'monthly'`, `repeatDays: [1,15]` (day numbers)
- **Accounts (Phase 6)**: Supabase Auth email OTP. Invite-only via `allowed_emails` + BEFORE INSERT trigger on auth.users.
- **Data**: Supabase is source of truth. AppContext keeps `data` (UI) and `synced` (server copy); a debounced flush
  upserts the diff; offline edits wait and retry. Cached per user in localStorage `da_cache_v3_<uid>` (cleared on logout).
- **Security model**: frontend uses the **anon/public key**; every user table has RLS `user_id = auth.uid()`.
  The **service-role key never leaves the backend**. Backend endpoints verify the Supabase JWT.
- **Legacy keys** `da_reminders_v2`/`da_logs_v2`/`da_settings_v2`/`da_device_id`: imported on first login, then
  archived to `da_legacy_backup_v2`. Old app kept default reminders in memory → import falls back to LEGACY_DEFAULT_REMINDERS.
- **Timezone**: profile.timezone (default Asia/Kolkata). Backend scheduler honours it; frontend still uses IST helpers.
- **Dose log ids**: `${reminderId}__${slot}__${date}` (deterministic → safe across devices).

## Completed phases
- ✅ Phase 1: Project setup, accounts (Supabase, Railway, Vercel, GitHub)
- ✅ Phase 2: Full frontend PWA — Home (4 slot cards), Reminders, AddReminder, Reports, Calendar, Settings
- ✅ Phase 3: Backend push notifications — Express + node-cron + web-push + Supabase, frontend hook + service worker
- ✅ Phase 4: Full deployment — both Railway + Vercel live, push notifications confirmed working end-to-end
- ✅ Phase 5: Daily Task Checklist — code done (Tasks tab, Submit Day, weekly grid, Manage screen)
  - Not merged to main / SQL not run in prod — will be folded into Phase 6b (user-scoped) instead
- ✅ Phase 6 (6a–6d, 6f): accounts, per-user server data, onboarding, multi-device push, privacy/feedback/delete
  — code done & tested locally (RLS tests in real Postgres + browser E2E). **Needs setup: docs/SETUP-PHASE6.md**
- ✅ Phase 7 (UI): Bloom theme (teal #0F766E / saffron #F5A524 / cream #FBF7F0, Tailwind `brand` + `saffron`),
  Gentle Nudge logo (bubble + tick + saffron dot; public/icon*.svg/png, apple-touch-icon, maskable, badge-96),
  Poppins font (Devanagari-ready, bundled), Today screen (teal header band, ring + next-up + slot dots,
  saffron "Due now/Up next" slot), 4 tabs Today/Tasks/Reminders/Progress (Settings via avatar), undo,
  celebrations, EmptyState, push text with dose ("Iron Syrup — 10 ml, after meal")
- ⏭️ Phase 6e: move scheduler off Railway (pg_cron + Edge Function) — **Railway trial ends ~5 Dec 2026** (27 days left on 8 Nov)

## Live URLs
- Frontend: https://daily-assistant-eta.vercel.app
- Backend: https://daily-assistant-production.up.railway.app
- GitHub: github.com/sakshi-shah-tatvasoft/daily-assistant

## Deployment details
### Railway (backend)
- Project: railway.com/project/73de94b7-028f-4317-9d5e-a84326b15f8b
- Variables: SUPABASE_URL, SUPABASE_SERVICE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL, PORT=3001, FRONTEND_URL=https://daily-assistant-eta.vercel.app, NODE_VERSION=22
- ⚠️ SUPABASE_SERVICE_KEY must be a Supabase **secret** key (`sb_secret_…`, named `railway-backend`, created 9 Nov 2026).
  With a publishable key the backend still authenticates users but RLS silently hides all rows → scheduler sends
  nothing and /api/push/test says "not registered". (Happened once — keys got swapped between Vercel and Railway.)
- Old default secret key leaked into the frontend bundle on 8 Nov 2026 → replaced by `railway-backend` key.
- Note: Railway runs Node 20 at runtime; fixed via `global.WebSocket = require('ws')` polyfill in backend/src/db.js

### Vercel (frontend)
- Env vars set: VITE_API_URL=https://daily-assistant-production.up.railway.app, VITE_VAPID_PUBLIC_KEY=...,
  VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (= Supabase **publishable** key `sb_publishable_…`; supabase-js 2.119 supports it)
- Frontend gets ONLY the publishable key. Backend gets ONLY a secret key. Never the other way round.
- Root Directory: frontend

## Supabase
- Project: iiyeyisdmafernjjxkzu.supabase.co
- Schema: backend/supabase/phase6-schema.sql (idempotent). See docs/SETUP-PHASE6.md for auth/SMTP/template config.
- Invite a tester: `insert into allowed_emails (email, note) values ('x@gmail.com', 'who');` (lowercase)
- Invited so far: sakshi@gearedfinance.com.au, sakshishah5704@gmail.com (owner)
- Setup progress (Nov 2026): Gmail app password ✅, SMTP ✅, email templates ✅ (OTP length 6), schema ✅, owner invites ✅
- Feedback: Table Editor → feedback

## VAPID keys (public key only — private key is in backend/.env and Railway vars)
- Public: BBox61hXVL7ChfkcJPzE-uJw7D3MKzNxC6kKo42Qg0ptRRJCzv4ZXU5tyMwTZEbudi26mGWUmSRgvNDOYkG3ChI

## Running locally
```bash
# Backend
cd C:\Users\LPI73\daily-assistant\backend
npm run dev        # starts on port 3001

# Frontend
cd C:\Users\LPI73\daily-assistant\frontend
npm run dev        # starts on port 5173
```

## Phase 5: Daily Task Checklist (BUILT — original spec kept below for reference)

### As built
- Backend: `backend/src/routes/tasks.js` mounted at `/api/tasks`
  - `GET /api/tasks?device_id=` · `POST /api/tasks` · `POST /api/tasks/delete` · `POST /api/tasks/reorder`
  - `POST /api/tasks/submit` (409 if already submitted today) · `GET /api/tasks/week?device_id=&start=` (Mon–Sun week)
  - "Today" is computed server-side in IST; all queries scoped by device_id; delete is soft (`is_active=false`) so history stays
  - Delete/reorder use POST (CORS only allows GET/POST)
- Frontend: `pages/Tasks.tsx` (/tasks), `pages/TasksWeek.tsx` (/tasks/week), `pages/ManageTasks.tsx` (/tasks/manage); new Tasks tab in BottomNav
  - In-progress ticks saved in localStorage `da_task_checks_v1` keyed by IST date → auto-reset each morning
  - Reorder uses up/down arrows (HTML5 drag doesn't work on iOS Safari touch)
  - Device id helper moved to `lib/device.ts` (shared with push hook)

### What Sakshi wants
- A checklist of daily tasks shown on screen (or new Tasks tab)
- Each task has a checkbox — tick done or leave undone
- A **Submit Day** button — logs the day's completions to database, clears the screen
- Weekend review: see day-by-day progress for the week (which tasks done each day)

### Suggested implementation

**New Supabase tables** (run in Supabase SQL Editor):
```sql
-- User's task definitions
create table if not exists daily_tasks (
  id          uuid primary key default gen_random_uuid(),
  device_id   text not null,
  task_name   text not null,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Daily completion logs
create table if not exists task_logs (
  id           uuid primary key default gen_random_uuid(),
  device_id    text not null,
  task_id      uuid not null references daily_tasks(id),
  date         date not null,           -- IST date, e.g. '2026-11-08'
  completed    boolean not null default false,
  submitted_at timestamptz,             -- null until Submit Day is pressed
  unique(device_id, task_id, date)
);

-- RLS: block direct client access
alter table daily_tasks enable row level security;
alter table task_logs enable row level security;
```

**New backend routes** (add to backend/src/routes/):
- `GET /api/tasks?device_id=` — fetch user's active tasks + today's log
- `POST /api/tasks` — create a new task
- `POST /api/tasks/submit` — save all checked/unchecked for today, set submitted_at
- `GET /api/tasks/week?device_id=` — return last 7 days of task_logs for progress view

**New frontend page**: `frontend/src/pages/Tasks.tsx`
- Shows list of tasks with checkboxes
- If today already submitted: shows completion summary (e.g. "6/8 tasks done today")
- If not submitted: shows checkboxes + Submit Day button
- Manage Tasks link to add/remove/reorder tasks

**Progress view**: in Reports page or new Tasks sub-view
- 7-day grid: rows = tasks, columns = Mon–Sun
- Green tick = completed, red cross = missed, grey = not submitted

### Design spec
- Task list resets each morning (all unchecked on new day)
- User checks off tasks throughout the day
- Presses "Submit Day" → saves to DB → shows "X/Y tasks done" summary → clears checkboxes for the day
- Already submitted today → show summary instead of checkboxes
- Tasks are user-defined (simple manage screen: add name, drag to reorder, delete)

## Product direction (agreed Nov 2026)
Goal: grow from personal app → proper app for 1000+ people, in stages. Not all at once.

### Ground rules
- **Cost: ₹0.** Free tiers only for at least the first year. Only acceptable spend: a domain (~₹500–1,600/yr) when ready.
- **Users: India only** for now — but store timezone per user anyway (default `Asia/Kolkata`) so we never rewrite this.
- **App stays free** for users; no ads, no trackers.
- **Stay a PWA** (link → Safari → Add to Home Screen). No App Store / Play Store until there is real demand.
- **Build the foundation before more features** — anything that would force a flow rewrite later goes first.
- New feature ideas go on the side list below; Sakshi decides what gets built and when.

### Rollout stages
1. **Sakshi only (now)** — test everything in Safari, request changes as needed.
2. **10–20 friends & family** — invite-only, gather feedback, add agreed suggestions.
3. **~100 people** — harden (custom email sender, rate limits, backups, privacy policy, landing page).
4. **1000+ / public** — uptime monitoring, load testing, cost review, maybe app stores.

### Phase 6 — Foundation for 10–20 testers (NEXT, in this order)
Each step ships and gets tested on Sakshi's phone before the next.
- **6a. Login + profiles (invite-only)**
  - Supabase Auth with **6-digit email code (OTP)**, typed inside the app. Not Google OAuth — on iOS the
    home-screen app and Safari have separate storage, so OAuth redirects leave users logged in to the wrong one.
  - Email sending: Gmail SMTP + app password (free, ~500/day) until a domain is bought; then Resend free tier
    (3,000/mo) from `no-reply@<domain>`.
  - Invite-only: only allow-listed emails can sign up.
  - `profiles` table: name, timezone (default Asia/Kolkata), notification slot times.
- **6b. Data on the server, per user**
  - Move reminders, dose logs, settings, daily tasks from localStorage/device_id → Supabase rows keyed by `user_id`.
  - RLS policies `user_id = auth.uid()` on every table (the main security layer).
  - Keep a local cache for instant load; server is source of truth.
  - One-time import of Sakshi's existing localStorage data into her account on first login.
  - Fold Phase 5 into this: daily_tasks/task_logs become user-scoped (phase5 SQL was never run in prod — don't run it).
- **6c. No pre-loaded medicines** — new users start empty with an "add your first medicine" onboarding.
  Sakshi's Iron/D3/B12 come across via the 6b import. Remove hardcoded schedule from `data/initialData.ts`.
- **6d. Multi-device push** — `push_subscriptions` keyed by user + endpoint (not one per device_id).
  Move "already sent today" dedupe from in-memory Set to a DB table (restarts currently cause duplicate/missed pushes).
- **6e. Retire Railway → ₹0** — move the every-minute scheduler to Supabase (pg_cron + Edge Function sending web-push).
- **6f. Trust & safety** — delete account + all data, data export, short privacy note, medical disclaimer,
  in-app feedback button, Sentry free tier for error tracking.

**Rule change (landed in Phase 6):** frontend talks to Supabase directly using the **anon/public key**, protected by RLS.
The **service-role key still never goes in the frontend.**
**Not done yet from 6f:** Sentry error tracking (optional, needs a free Sentry account + DSN).

### Branding (in progress)
- **Name chosen: "Daily Assistant"** (Sakshi's pick, Nov 2026). Domain not yet bought.
- Trademark check done 8 Nov 2026 (ipindia, Wordmark/Contains, "Daily Assistant" + "Dailyassistant", classes 9/42/44): **no results** — clear.
- Domain check (Namecheap, 8 Nov 2026) — all available: **dailyassistant.in ₹937 (renews ~₹1,125/yr) ← recommended**,
  dailyassistant.app ₹1,031 (renews ~₹1,689), dailyassistant.co.in ₹750 (renews ~₹890), dailyassistant.org ₹796 (renews ~₹1,360).
  dailyassistant.com is premium (₹6.8 lakh) — skip. Not bought yet. Buy domain only, no add-ons (hosting/email/SSL/DNS not needed).
- Trade-offs accepted: generic name (harder to find in search; descriptive marks are hard to register as a trademark).
  Mitigate with a distinctive logo + tagline, e.g. "Daily Assistant — medicine & routine reminders".
- Earlier alternatives considered: Dincharya, DawaiDost, Niyam, RozCare, DoseDay.
- Before buying: check domain (.in / .com / .app) on a registrar, and search the Indian trademark registry
  (ipindia.gov.in → Trademark search, classes 9, 42, 44).
- With a domain, a matching Gmail isn't needed: Cloudflare Email Routing (free) forwards `hello@<domain>` to Gmail;
  Resend sends login codes from `no-reply@<domain>`.
- App name and sender email are config values — Phase 6 work does not need to wait for the name.

### Feature ideas — side list (build only after Phase 6, Sakshi picks)
Sakshi's original list:
1. Skip pattern insights — "you always miss Monday mornings" weekly insight card
2. Grouped slot card with meal context — one "After Dinner" card showing all meds with before/after/with meal labels
3. PDF adherence report export — doctor-shareable timestamped completion history
4. Caregiver share link — read-only daily dashboard via URL, no account needed
5. Dose history editing — fix wrong log without deleting and re-entering

Suggested additions (ranked by usefulness for Indian users):
6. Family care mode — manage a parent's meds from your phone, alert if they miss a dose (extends #4)
7. Stock & refill alerts — "Iron Syrup runs out in ~5 days", computed from doses taken
8. Missed-dose follow-up — re-notify after 30 min if not marked; quiet hours
9. Course duration — "antibiotic for 5 days", auto-stops (startDate/endDate fields already exist)
10. Health readings log — BP, sugar, weight with simple charts; pairs with #3
11. Hindi + regional languages
12. Doctor appointment & lab test reminders
13. Weekly Sunday summary notification (pairs with #1)

Notes: iOS web push does NOT support action buttons ("Mark done" from the notification) — tap opens the app.
Avoid storing prescription photos for a long time (most sensitive data, not worth the early risk).

## Market position
No app currently combines: slot-based notifications + meal-aware medicine timing + habit/routine tracking + completion dashboard in a single free PWA. Closest competitor is CareClinic (clunky, expensive, no PWA). Gap confirmed via Reddit research.
