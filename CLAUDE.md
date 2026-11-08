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
| Frontend hosting | Vercel (not yet deployed) |
| Backend hosting | Railway (deployment in progress — see issues below) |

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
│   ├── .env.local     VITE_API_URL + VITE_VAPID_PUBLIC_KEY (already filled)
│   └── vercel.json    Vercel deployment config
├── backend/
│   ├── src/
│   │   ├── index.js   Express server
│   │   ├── db.js      Supabase client (service role)
│   │   ├── scheduler.js  node-cron push sender
│   │   └── routes/push.js
│   ├── .env           All secrets (never commit — gitignored)
│   ├── railway.json   Railway deployment config
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
- ✅ Push notifications tested and working locally (Send Test confirmed)
- ✅ Code pushed to GitHub: github.com/sakshi-shah-tatvasoft/daily-assistant

## Current status — IN PROGRESS
### Railway backend deployment (FIX PUSHED — needs redeploy)
- Original problem: Railpack failed to detect Node.js because the repo root had no package.json
- Fix: root `package.json` (build = `npm --prefix backend ci --omit=dev`, start = `npm --prefix backend start`)
  + root `railway.json` (builder RAILPACK). `nixpacks.toml` removed (Nixpacks is deprecated on Railway).
- Works either way: Root Directory blank → uses root package.json; Root Directory `/backend` → uses backend/package.json + backend/railway.json
- Verified locally: `npm run build && npm start` from repo root boots server, `/health` returns ok
- **Next**: Railway service → Settings → Builder = Railpack, Root Directory blank (simplest) → Redeploy
  → Settings → Networking → Generate Domain → check `https://<domain>/health`
- Railway project URL: railway.com/project/73de94b7-028f-4317-9d5e-a84326b15f8b
- Service already has all env vars added (SUPABASE_URL, SUPABASE_SERVICE_KEY, VAPID keys, etc.)

### Vercel frontend deployment (NOT STARTED)
- After Railway is working and you have a backend URL, update frontend/.env.local: VITE_API_URL=https://your-backend.railway.app
- Then: go to vercel.com → New Project → Import from GitHub → sakshi-shah-tatvasoft/daily-assistant → set Root Directory to `frontend` → Deploy
- Add env var in Vercel: VITE_VAPID_PUBLIC_KEY=BBox61hXVL7ChfkcJPzE-uJw7D3MKzNxC6kKo42Qg0ptRRJCzv4ZXU5tyMwTZEbudi26mGWUmSRgvNDOYkG3ChI
- After Vercel gives a URL, update Railway env var FRONTEND_URL to that URL

## Supabase
- Project: iiyeyisdmafernjjxkzu.supabase.co
- Table: push_subscriptions (already created with RLS enabled, no policies = backend-only access)
- Schema already applied

## VAPID keys (public key only — private key is in backend/.env)
- Public: BBox61hXVL7ChfkcJPzE-uJw7D3MKzNxC6kKo42Qg0ptRRJCzv4ZXU5tyMwTZEbudi26mGWUmSRgvNDOYkG3ChI

## Planned future features (in priority order)
1. Skip pattern insights — "you always miss Monday mornings" weekly insight card
2. Grouped slot card with meal context — one "After Dinner" card showing all meds with before/after/with meal labels
3. PDF adherence report export — doctor-shareable timestamped completion history
4. Caregiver share link — read-only daily dashboard via URL, no account needed
5. Dose history editing — fix wrong log without deleting and re-entering

## Market position
No app currently combines: slot-based notifications + meal-aware medicine timing + habit/routine tracking + completion dashboard in a single free PWA. Closest competitor is CareClinic (clunky, expensive, no PWA). Gap confirmed via Reddit research.

## Running locally
```bash
# Backend
cd C:\Users\LPI73\daily-assistant\backend
npm run dev        # starts on port 3001

# Frontend
cd C:\Users\LPI73\daily-assistant\frontend
npm run dev        # starts on port 5173
```
