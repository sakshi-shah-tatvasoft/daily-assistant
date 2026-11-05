-- ══════════════════════════════════════════════════════════════
-- Daily Assistant — Phase 3 Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run
-- ══════════════════════════════════════════════════════════════

create table if not exists push_subscriptions (
  id          uuid        primary key default gen_random_uuid(),
  device_id   text        unique not null,          -- random UUID from the client device
  endpoint    text        not null,                 -- push service endpoint URL
  p256dh      text        not null,                 -- client public key
  auth        text        not null,                 -- auth secret
  slot_times  jsonb       not null default '{"morning":"08:00","afternoon":"13:00","after_dinner":"20:30","overall":"22:00"}',
  slot_items  jsonb       not null default '{}',    -- {"morning":["Iron Syrup","Vitamin B12"], ...}
  timezone    text        not null default 'Asia/Kolkata',
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Index for fast lookup by device_id
create index if not exists push_subscriptions_device_id_idx
  on push_subscriptions (device_id);

-- Only active subscriptions queried by scheduler
create index if not exists push_subscriptions_active_idx
  on push_subscriptions (is_active)
  where is_active = true;

-- ── Row Level Security ────────────────────────────────────────
-- The backend uses the service-role key which bypasses RLS.
-- Block all direct client access (frontend never talks to Supabase directly).
alter table push_subscriptions enable row level security;

-- No policies = no direct client access. Only the backend service role can read/write.
-- This keeps push subscriptions private.
