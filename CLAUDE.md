# Daily Assistant — Project Brief for Claude

## What this is
A personal PWA (Progressive Web App) — medicine reminder + habit tracker + routine monitor.
Installable on iPhone 17 via Safari → Share → Add to Home Screen.
Built for Sakshi (sakshi@gearedfinance.com.au).

## Security rules — never break these
- Never expose secret API keys in frontend code
- Medicine and personal routine info must stay private
- Use secure authentication and database permissions
- The app must NOT recommend medicines, change doses, or make medical decisions — only remind per the schedule entered

## Medicine schedule (pre-loaded in app)
- Iron Syrup: 10ml, twice daily (morning after meal + after dinner)
- Vitamin D3: 60,000 IU, every Thursday morning
- Vitamin B12: 1 tablet, daily morning after meal

## Tech stack
| Layer | Tech |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| PWA | vite-plugin-pwa (injectManifest strategy) + custom sw.ts |
| Routing | React Router DOM v6 |
| Backend | Node.js + Express (Railway) |
| Database | Supabase (PostgreSQL + RLS) — backend only, never frontend |
| Push notifications | web-push + VAPID |
| Scheduler | node-cron (every minute, IST timezone) |
| Frontend hosting | Vercel — https://daily-assistant-eta.vercel.app |
| Backend hosting | Railway — https://daily-assistant-production.up.railway.app |

## Project structure
```
C:\Users\LPI73\daily-assistant\
├── frontend/          React PWA
│   ├── src/
│   │   ├── pages/     Home, Reminders, AddReminder, Reports, Calendar, Settings
│   │   ├── context/   AppContext.tsx (all state + local scheduler)
│   │   ├── hooks/     usePushNotifications.ts
│   │   ├── lib/       api.ts (typed backend client)
│   │   ├── utils/     constants.ts, dateHelpers.ts, notifications.ts
│   │   ├── types/     index.ts
│   │   ├── data/      initialData.ts
│   │   └── sw.ts      Custom service worker (push handler)
│   ├── .env.local     VITE_API_URL=https://daily-assistant-production.up.railway.app
│   │                  VITE_VAPID_PUBLIC_KEY=BBox61hXVL7ChfkcJPzE-uJw7D3MKzNxC6kKo42Qg0ptRRJCzv4ZXU5tyMwTZEbudi26mGWUmSRgvNDOYkG3ChI
│   └── vercel.json    Vercel deployment config
├── backend/
│   ├── src/
│   │   ├── index.js   Express server
│   │   ├── db.js      Supabase client + ws WebSocket polyfill for Node 20
│   │   ├── scheduler.js  node-cron push sender
│   │   └── routes/push.js
│   ├── .env           All secrets (never commit — gitignored)
│   ├── railway.json   Railway deployment config (Railpack)
│   └── supabase-schema.sql  (already run in Supabase)
├── package.json       Root build/start delegating to backend/ (Railway)
├── railway.json       Railway config (Railpack)
├── .gitignore
└── CLAUDE.md          ← this file
```

## Key design decisions
- **4 notification slots** per day: morning, afternoon, after_dinner, overall (times configurable)
- **Twice-daily medicine**: single Reminder with `slots: ['morning', 'after_dinner']`
- **Weekly**: `repeat: 'weekly'`, `repeatDays: [3]` (0=Mon…6=Sun, so 3=Thu)
- **Monthly**: `repeat: 'monthly'`, `repeatDays: [1,15]` (day numbers)
- **LocalStorage keys**: `da_reminders_v2`, `da_logs_v2`, `da_settings_v2` (v2 to avoid old schema)
- **Timezone**: Asia/Kolkata (IST) throughout
- **Backend security**: frontend never talks to Supabase directly — only backend uses service role key
- **Device identity**: random UUID in localStorage (`da_device_id`), no user accounts

## Completed phases
- ✅ Phase 1: Project setup, accounts (Supabase, Railway, Vercel, GitHub)
- ✅ Phase 2: Full frontend PWA — Home (4 slot cards), Reminders, AddReminder, Reports, Calendar, Settings
- ✅ Phase 3: Backend push notifications — Express + node-cron + web-push + Supabase, frontend hook + service worker
- ✅ Phase 4: Full deployment — both Railway + Vercel live, push notifications confirmed working end-to-end
- ✅ Phase 5: Daily Task Checklist — code done (Tasks tab, Submit Day, weekly grid, Manage screen)
  - ⚠️ Must run `backend/supabase-schema-phase5.sql` in Supabase SQL Editor before it works in production

## Live URLs
- Frontend: https://daily-assistant-eta.vercel.app
- Backend: https://daily-assistant-production.up.railway.app
- GitHub: github.com/sakshi-shah-tatvasoft/daily-assistant

## Deployment details
### Railway (backend)
- Project: railway.com/project/73de94b7-028f-4317-9d5e-a84326b15f8b
- Variables: SUPABASE_URL, SUPABASE_SERVICE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL, PORT=3001, FRONTEND_URL=https://daily-assistant-eta.vercel.app, NODE_VERSION=22
- Note: Railway runs Node 20 at runtime; fixed via `global.WebSocket = require('ws')` polyfill in backend/src/db.js

### Vercel (frontend)
- Env vars set: VITE_API_URL=https://daily-assistant-production.up.railway.app, VITE_VAPID_PUBLIC_KEY=...
- Root Directory: frontend

## Supabase
- Project: iiyeyisdmafernjjxkzu.supabase.co
- Table: push_subscriptions (RLS enabled, no policies = backend-only access via service role key)
- Schema already applied (backend/supabase-schema.sql)

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

## Planned future features (after Phase 5)
1. Skip pattern insights — "you always miss Monday mornings" weekly insight card
2. Grouped slot card with meal context — one "After Dinner" card showing all meds with before/after/with meal labels
3. PDF adherence report export — doctor-shareable timestamped completion history
4. Caregiver share link — read-only daily dashboard via URL, no account needed
5. Dose history editing — fix wrong log without deleting and re-entering

## Market position
No app currently combines: slot-based notifications + meal-aware medicine timing + habit/routine tracking + completion dashboard in a single free PWA. Closest competitor is CareClinic (clunky, expensive, no PWA). Gap confirmed via Reddit research.
