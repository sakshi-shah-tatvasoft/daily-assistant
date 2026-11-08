-- ══════════════════════════════════════════════════════════════════════════════
-- Daily Assistant — Phase 6: accounts, per-user data, invite-only signup
-- Run in: Supabase Dashboard → SQL Editor → New query → paste all → Run
-- Safe to re-run (idempotent).
--
-- Security model:
--   • Every user table has RLS with policies "user_id = auth.uid()" — a signed-in
--     user can only ever see/change their own rows.
--   • The frontend uses the public anon key. The service-role key stays on the backend.
--   • allowed_emails / notification_log have RLS with NO policies → backend only.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 0. Clean up the unused Phase 5 device-based tables (never used in production) ──
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'daily_tasks' and column_name = 'device_id') then
    drop table if exists public.task_logs;
    drop table if exists public.daily_tasks;
  end if;
end $$;

-- ── 1. Invite list ────────────────────────────────────────────────────────────
-- Add testers with:  insert into allowed_emails (email) values ('friend@gmail.com');
create table if not exists public.allowed_emails (
  email      text primary key check (email = lower(email)),
  note       text,
  created_at timestamptz not null default now()
);
alter table public.allowed_emails enable row level security;

-- ── 2. Profiles (one per user) ────────────────────────────────────────────────
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  display_name    text check (char_length(display_name) <= 60),
  timezone        text not null default 'Asia/Kolkata',
  theme           text not null default 'system' check (theme in ('light','dark','system')),
  slot_times      jsonb not null default '{"morning":"08:00","afternoon":"13:00","after_dinner":"20:30","overall":"22:00"}',
  push_enabled    boolean not null default false,
  onboarded       boolean not null default false,
  legacy_imported boolean not null default false,
  follow_up_minutes int not null default 15 check (follow_up_minutes in (0, 15, 30, 60)),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- ── 3. Signup gate + profile creation (triggers on auth.users) ────────────────
create or replace function public.enforce_invite_only()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.allowed_emails where email = lower(new.email)) then
    raise exception 'EMAIL_NOT_INVITED';
  end if;
  return new;
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists enforce_invite_only on auth.users;
create trigger enforce_invite_only before insert on auth.users
  for each row execute function public.enforce_invite_only();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 4. Reminders (medicines, habits, routines) ────────────────────────────────
create table if not exists public.reminders (
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  id           text not null check (char_length(id) <= 80),
  title        text not null check (char_length(title) between 1 and 120),
  description  text check (char_length(description) <= 500),
  category     text not null check (category in ('medicine','habit','routine','task')),
  slots        text[] not null default '{}',
  custom_time  text check (custom_time ~ '^\d{2}:\d{2}$'),
  repeat       text not null check (repeat in ('daily','weekdays','weekly','monthly','custom','once')),
  repeat_days  int[] not null default '{}',
  once_date    date,
  notes        text check (char_length(notes) <= 1000),
  is_active    boolean not null default true,
  medicine     jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.reminders enable row level security;

-- ── 5. Dose / task instance logs (one row per reminder per slot per day) ─────
create table if not exists public.dose_logs (
  user_id        uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  id             text not null check (char_length(id) <= 160),
  reminder_id    text not null,
  date           date not null,
  scheduled_time text not null,
  slot           text,
  title          text not null check (char_length(title) <= 120),
  category       text not null,
  status         text not null check (status in ('pending','completed','skipped')),
  completed_at   timestamptz,
  skipped_reason text check (char_length(skipped_reason) <= 300),
  is_late        boolean,
  updated_at     timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists dose_logs_user_date_idx on public.dose_logs (user_id, date);
alter table public.dose_logs enable row level security;

-- ── 6. Daily task checklist (Phase 5, now per user) ───────────────────────────
create table if not exists public.daily_tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  task_name   text not null check (char_length(task_name) between 1 and 100),
  sort_order  int  not null default 0,
  is_active   boolean not null default true,   -- soft delete keeps history
  created_at  timestamptz not null default now()
);
create index if not exists daily_tasks_user_idx on public.daily_tasks (user_id, sort_order) where is_active;
alter table public.daily_tasks enable row level security;

create table if not exists public.task_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  task_id      uuid not null references public.daily_tasks(id) on delete cascade,
  date         date not null,
  completed    boolean not null default false,
  submitted_at timestamptz not null default now(),
  unique (user_id, task_id, date)
);
create index if not exists task_logs_user_date_idx on public.task_logs (user_id, date);
alter table public.task_logs enable row level security;

-- ── 7. Push devices (a user can have several: phone, iPad…) ──────────────────
create table if not exists public.push_devices (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  endpoint        text not null unique check (char_length(endpoint) <= 1000),
  p256dh          text not null check (char_length(p256dh) <= 200),
  auth            text not null check (char_length(auth) <= 100),
  user_agent      text check (char_length(user_agent) <= 300),
  created_at      timestamptz not null default now(),
  last_success_at timestamptz
);
create index if not exists push_devices_user_idx on public.push_devices (user_id);
alter table public.push_devices enable row level security;

-- ── 8. Sent-notification log (dedupe across server restarts) — backend only ──
create table if not exists public.notification_log (
  user_id  uuid not null references public.profiles(id) on delete cascade,
  date     date not null,
  slot     text not null,
  sent_at  timestamptz not null default now(),
  primary key (user_id, date, slot)
);
alter table public.notification_log enable row level security;

-- ── 9. Feedback from testers ──────────────────────────────────────────────────
create table if not exists public.feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  message    text not null check (char_length(message) between 1 and 2000),
  page       text check (char_length(page) <= 100),
  user_agent text check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;

-- ── 10. RLS policies: own rows only ───────────────────────────────────────────
do $$
declare t text;
begin
  -- profiles: read + update own (rows are created by the signup trigger, deleted with the account)
  drop policy if exists own_select on public.profiles;
  drop policy if exists own_update on public.profiles;
  create policy own_select on public.profiles for select to authenticated using (id = (select auth.uid()));
  create policy own_update on public.profiles for update to authenticated
    using (id = (select auth.uid())) with check (id = (select auth.uid()));

  foreach t in array array['reminders','dose_logs','daily_tasks','task_logs','push_devices'] loop
    execute format('drop policy if exists own_all on public.%I', t);
    execute format(
      'create policy own_all on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;

  -- feedback: users can submit and read their own, never edit/delete
  drop policy if exists own_insert on public.feedback;
  drop policy if exists own_select on public.feedback;
  create policy own_insert on public.feedback for insert to authenticated with check (user_id = (select auth.uid()));
  create policy own_select on public.feedback for select to authenticated using (user_id = (select auth.uid()));
end $$;

-- task_logs may only reference the user's own tasks
create or replace function public.task_logs_check_owner()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from public.daily_tasks where id = new.task_id and user_id = new.user_id) then
    raise exception 'task does not belong to user';
  end if;
  return new;
end $$;
drop trigger if exists task_logs_check_owner on public.task_logs;
create trigger task_logs_check_owner before insert or update on public.task_logs
  for each row execute function public.task_logs_check_owner();

-- Users must not be able to change who owns a profile flag they shouldn't (only safe columns updatable)
revoke update on public.profiles from authenticated;
alter table public.profiles add column if not exists follow_up_minutes int not null default 15 check (follow_up_minutes in (0, 15, 30, 60));
grant  update (display_name, timezone, theme, slot_times, push_enabled, onboarded, legacy_imported, follow_up_minutes, updated_at)
  on public.profiles to authenticated;

-- ── 11. RPC: Submit Day (server decides "today" in the user's timezone) ──────
create or replace function public.submit_day(p_completed uuid[])
returns json language plpgsql security invoker set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_tz    text;
  v_date  date;
  v_total int;
  v_done  int;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select timezone into v_tz from profiles where id = v_uid;
  v_date := (now() at time zone coalesce(v_tz, 'Asia/Kolkata'))::date;

  if exists (select 1 from task_logs where user_id = v_uid and date = v_date) then
    raise exception 'ALREADY_SUBMITTED';
  end if;

  insert into task_logs (user_id, task_id, date, completed)
  select v_uid, t.id, v_date, t.id = any(coalesce(p_completed, '{}'))
  from daily_tasks t where t.user_id = v_uid and t.is_active;

  get diagnostics v_total = row_count;
  if v_total = 0 then raise exception 'NO_TASKS'; end if;
  select count(*) into v_done from task_logs where user_id = v_uid and date = v_date and completed;

  return json_build_object('date', v_date, 'completed', v_done, 'total', v_total);
end $$;

-- ── 12. RPC: register this device for push (moves an endpoint between accounts safely) ──
create or replace function public.register_push_device(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  -- One endpoint = one browser install; if someone else was signed in on it before, it now belongs to this user.
  delete from push_devices where endpoint = p_endpoint and user_id <> v_uid;
  insert into push_devices (user_id, endpoint, p256dh, auth, user_agent)
  values (v_uid, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;
  update profiles set push_enabled = true, updated_at = now() where id = v_uid;
end $$;

revoke all on function public.register_push_device(text, text, text, text) from public, anon;
grant execute on function public.register_push_device(text, text, text, text) to authenticated;
revoke all on function public.submit_day(uuid[]) from public, anon;
grant execute on function public.submit_day(uuid[]) to authenticated;
revoke all on function public.enforce_invite_only() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ── 13. Your own account ──────────────────────────────────────────────────────
-- Replace with your email, then run once:
-- insert into allowed_emails (email, note) values ('sakshi@gearedfinance.com.au', 'owner') on conflict do nothing;
