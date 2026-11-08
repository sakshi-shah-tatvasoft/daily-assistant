-- ══════════════════════════════════════════════════════════════
-- Daily Assistant — Phase 5: Daily Task Checklist
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run (idempotent).
-- ══════════════════════════════════════════════════════════════

-- User's task definitions
create table if not exists daily_tasks (
  id          uuid        primary key default gen_random_uuid(),
  device_id   text        not null,
  task_name   text        not null check (char_length(task_name) between 1 and 100),
  sort_order  int         not null default 0,
  is_active   boolean     not null default true,   -- soft delete keeps history intact
  created_at  timestamptz not null default now()
);

create index if not exists daily_tasks_device_idx
  on daily_tasks (device_id, sort_order)
  where is_active = true;

-- Daily completion logs (one row per task per submitted day)
create table if not exists task_logs (
  id           uuid        primary key default gen_random_uuid(),
  device_id    text        not null,
  task_id      uuid        not null references daily_tasks(id),
  date         date        not null,               -- IST date, e.g. '2026-11-08'
  completed    boolean     not null default false,
  submitted_at timestamptz,                        -- set when Submit Day is pressed
  unique (device_id, task_id, date)
);

create index if not exists task_logs_device_date_idx
  on task_logs (device_id, date);

-- ── Row Level Security ────────────────────────────────────────
-- No policies = no direct client access. Only the backend (service role) can read/write.
alter table daily_tasks enable row level security;
alter table task_logs   enable row level security;
