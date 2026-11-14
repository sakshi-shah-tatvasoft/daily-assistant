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
create table if not exists public.snoozes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  key        text not null check (key ~ '^(morning|afternoon|after_dinner|overall|custom-[A-Za-z0-9_-]{1,80})$'),
  due_at     timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, key),
  check (due_at > created_at and due_at <= created_at + interval '3 hours')
);
create index if not exists snoozes_due_idx on public.snoozes (due_at);
alter table public.snoozes enable row level security;

drop policy if exists own_all on public.snoozes;
create policy own_all on public.snoozes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- created_at always comes from the database clock (clients can't backdate it to stretch a snooze).
create or replace function public.snoozes_set_created_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.created_at := now();
  return new;
end $$;
drop trigger if exists snoozes_set_created_at on public.snoozes;
create trigger snoozes_set_created_at before insert or update on public.snoozes
  for each row execute function public.snoozes_set_created_at();
alter table public.reminders add column if not exists remind_again jsonb;

alter table public.reminders drop constraint if exists reminders_remind_again_check;
alter table public.reminders add constraint reminders_remind_again_check check (
  remind_again is null or (
    jsonb_typeof(remind_again) = 'object'
    and (remind_again->>'every')::int in (0, 5, 10, 15, 30)
    and (remind_again->>'times')::int between 1 and 3
  )
);

-- ── Water reminders (migrations/2026-11-10-water.sql) ─────────────────────────

-- 1. Settings: {"on": true, "every": 120, "from": "08:00", "to": "22:00", "goal": 8}
alter table public.profiles add column if not exists water jsonb;
alter table public.profiles drop constraint if exists profiles_water_check;
alter table public.profiles add constraint profiles_water_check check (
  water is null or (
    jsonb_typeof(water) = 'object'
    and jsonb_typeof(water->'on') = 'boolean'
    and (water->>'every')::int in (30, 60, 120, 180)
    and water->>'from' ~ '^\d{2}:\d{2}$'
    and water->>'to'   ~ '^\d{2}:\d{2}$'
    and (water->>'goal')::int between 1 and 20
  )
);
-- Users may change their own water settings (profiles uses column-level update grants).
grant update (water) on public.profiles to authenticated;

-- 2. Glasses per day
create table if not exists public.water_logs (
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  date       date not null,
  glasses    int  not null default 0 check (glasses between 0 and 30),
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);
alter table public.water_logs enable row level security;
drop policy if exists own_all on public.water_logs;
create policy own_all on public.water_logs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 3. +1 / -1 glass, atomic (two phones tapping at once both count). Runs as the caller, so RLS applies.
create or replace function public.add_water(p_date date, p_delta int)
returns int language sql security invoker set search_path = public as $$
  insert into public.water_logs (user_id, date, glasses)
  values (auth.uid(), p_date, greatest(0, least(1, p_delta)))
  on conflict (user_id, date) do update
    set glasses = greatest(0, least(30, public.water_logs.glasses + greatest(-1, least(1, p_delta)))),
        updated_at = now()
  returning glasses;
$$;
revoke all on function public.add_water(date, int) from public, anon;
grant execute on function public.add_water(date, int) to authenticated;

-- ── Holiday mode (migrations/2026-11-11-holiday-mode.sql) ─────────────────────
alter table public.profiles add column if not exists paused_until date;
-- Users may change their own pause (profiles uses column-level update grants).
grant update (paused_until) on public.profiles to authenticated;

-- ── Invites from the app + error reports (migrations/2026-11-12-invites-and-errors.sql) ──

-- ── Owner / admin flag ─────────────────────────────────────────────────────────
-- Users can NOT change this themselves: profiles has column-level update grants and is_admin is not granted.
alter table public.profiles add column if not exists is_admin boolean not null default false;
update public.profiles set is_admin = true
  where id in (select id from auth.users where lower(email) in ('sakshishah5704@gmail.com', 'sakshi@gearedfinance.com.au'));

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

-- List invites + whether each person has joined (admins only).
create or replace function public.admin_list_invites()
returns table (email text, note text, invited_at timestamptz, joined boolean, joined_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  return query
    select a.email, a.note, a.created_at, u.id is not null, u.created_at
    from public.allowed_emails a
    left join auth.users u on lower(u.email) = a.email
    order by a.created_at desc;
end $$;

-- Invite one email (admins only). Returns the cleaned email.
create or replace function public.admin_invite(p_email text, p_note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(p_email));
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then raise exception 'BAD_EMAIL'; end if;
  insert into public.allowed_emails (email, note) values (v_email, left(nullif(trim(p_note), ''), 100))
  on conflict (email) do update set note = coalesce(excluded.note, public.allowed_emails.note);
  return v_email;
end $$;

-- Remove an invite (admins only). Stops NEW sign-ups for that email; an existing account keeps working.
create or replace function public.admin_remove_invite(p_email text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if lower(trim(p_email)) in (select lower(u.email) from auth.users u join public.profiles p on p.id = u.id where p.is_admin) then
    raise exception 'CANNOT_REMOVE_ADMIN';
  end if;
  delete from public.allowed_emails where email = lower(trim(p_email));
end $$;

revoke all on function public.is_admin() from public, anon;
revoke all on function public.admin_list_invites() from public, anon;
revoke all on function public.admin_invite(text, text) from public, anon;
revoke all on function public.admin_remove_invite(text) from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.admin_list_invites() to authenticated;
grant execute on function public.admin_invite(text, text) to authenticated;
grant execute on function public.admin_remove_invite(text) to authenticated;

-- ── App error reports ──────────────────────────────────────────────────────────
create table if not exists public.client_errors (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid default auth.uid() references public.profiles(id) on delete cascade,
  message     text not null check (char_length(message) between 1 and 500),
  stack       text check (char_length(stack) <= 4000),
  page        text check (char_length(page) <= 200),
  app_version text check (char_length(app_version) <= 80),
  user_agent  text check (char_length(user_agent) <= 300),
  created_at  timestamptz not null default now()
);
create index if not exists client_errors_created_idx on public.client_errors (created_at);
alter table public.client_errors enable row level security;
-- Signed-in users can only ADD reports about themselves; nobody can read them from the app (backend emails them).
drop policy if exists own_insert on public.client_errors;
create policy own_insert on public.client_errors for insert to authenticated with check (user_id = (select auth.uid()));
-- created_at always from the database clock
create or replace function public.client_errors_set_created_at()
returns trigger language plpgsql set search_path = public as $$
begin new.created_at := now(); return new; end $$;
drop trigger if exists client_errors_set_created_at on public.client_errors;
create trigger client_errors_set_created_at before insert on public.client_errors
  for each row execute function public.client_errors_set_created_at();

-- ── Family (migrations/2026-11-14-family.sql) ───────────────────────────────────

-- ── 1. Who invited whom (family members can be invited by any user, max 5 each) ─
alter table public.allowed_emails add column if not exists invited_by uuid references auth.users(id) on delete set null;

-- ── 2. Links ───────────────────────────────────────────────────────────────────
create table if not exists public.care_links (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid references public.profiles(id) on delete cascade,     -- takes the medicines
  carer_id     uuid references public.profiles(id) on delete cascade,     -- follows them
  created_by   uuid not null references public.profiles(id) on delete cascade,
  code         text unique check (code ~ '^[A-Z2-9]{8}$'),
  status       text not null default 'pending' check (status in ('pending', 'active', 'ended')),
  can_manage   boolean not null default false,
  alert_after  int not null default 60 check (alert_after in (0, 30, 60, 120)),   -- follower's choice, 0 = off
  nickname     text check (char_length(nickname) <= 40),                         -- what the follower calls the owner
  invite_email text check (char_length(invite_email) <= 254),
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  expires_at   timestamptz not null default now() + interval '7 days',
  check (owner_id is null or carer_id is null or owner_id <> carer_id),
  check (status <> 'active' or (owner_id is not null and carer_id is not null))
);
create unique index if not exists care_links_active_pair on public.care_links (owner_id, carer_id) where status = 'active';
create index if not exists care_links_carer_idx on public.care_links (carer_id) where status = 'active';
create index if not exists care_links_owner_idx on public.care_links (owner_id) where status = 'active';
alter table public.care_links enable row level security;
-- Read your own links only. All changes go through the functions below (no direct insert/update/delete).
drop policy if exists own_links on public.care_links;
create policy own_links on public.care_links for select to authenticated
  using ((select auth.uid()) in (owner_id, carer_id, created_by));

-- ── 3. Helpers used by the sharing policies ────────────────────────────────────
create or replace function public.follows(p_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.care_links
                 where owner_id = p_owner and carer_id = auth.uid() and status = 'active')
$$;
create or replace function public.manages(p_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.care_links
                 where owner_id = p_owner and carer_id = auth.uid() and status = 'active' and can_manage)
$$;
revoke all on function public.follows(uuid) from public, anon;
revoke all on function public.manages(uuid) from public, anon;
grant execute on function public.follows(uuid) to authenticated;
grant execute on function public.manages(uuid) to authenticated;

-- ── 4. Sharing policies: medicines only ────────────────────────────────────────
drop policy if exists family_read on public.reminders;
create policy family_read on public.reminders for select to authenticated
  using (category = 'medicine' and public.follows(user_id));
drop policy if exists family_insert on public.reminders;
create policy family_insert on public.reminders for insert to authenticated
  with check (category = 'medicine' and public.manages(user_id));
drop policy if exists family_update on public.reminders;
create policy family_update on public.reminders for update to authenticated
  using (category = 'medicine' and public.manages(user_id)) with check (category = 'medicine' and public.manages(user_id));
drop policy if exists family_delete on public.reminders;
create policy family_delete on public.reminders for delete to authenticated
  using (category = 'medicine' and public.manages(user_id));

drop policy if exists family_read on public.dose_logs;
create policy family_read on public.dose_logs for select to authenticated
  using (category = 'medicine' and public.follows(user_id));
drop policy if exists family_insert on public.dose_logs;
create policy family_insert on public.dose_logs for insert to authenticated
  with check (category = 'medicine' and public.manages(user_id));
drop policy if exists family_update on public.dose_logs;
create policy family_update on public.dose_logs for update to authenticated
  using (category = 'medicine' and public.manages(user_id)) with check (category = 'medicine' and public.manages(user_id));

-- ── 5. Functions (all checks happen here, as the signed-in user) ───────────────
-- Random 8-char code without look-alike characters (no 0/O/1/I).
create or replace function public.care_new_code()
returns text language plpgsql volatile set search_path = public as $$
declare chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text; i int;
begin
  loop
    c := '';
    for i in 1..8 loop c := c || substr(chars, 1 + floor(random() * length(chars))::int, 1); end loop;
    exit when not exists (select 1 from public.care_links where code = c);
  end loop;
  return c;
end $$;

-- p_role = 'owner'  → "let someone follow me"   (I am the owner; can_manage chosen now)
-- p_role = 'carer'  → "I want to follow someone" (I am the follower; the owner decides can_manage when accepting)
-- p_email (optional) → also lets that email sign up (family invite, max 5 per person).
create or replace function public.care_create_invite(p_role text, p_email text default null, p_nickname text default null, p_can_manage boolean default false)
returns table (id uuid, code text) language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_email text := lower(trim(p_email)); v_code text; v_id uuid;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  if p_role not in ('owner', 'carer') then raise exception 'BAD_ROLE'; end if;
  if (select count(*) from public.care_links l where l.created_by = v_uid and l.status = 'pending' and l.expires_at > now()) >= 10 then
    raise exception 'TOO_MANY_INVITES';
  end if;
  if v_email is not null and v_email <> '' then
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then raise exception 'BAD_EMAIL'; end if;
    if not exists (select 1 from public.allowed_emails where email = v_email) then
      if (select count(*) from public.allowed_emails where invited_by = v_uid) >= 5 then raise exception 'FAMILY_INVITE_LIMIT'; end if;
      insert into public.allowed_emails (email, note, invited_by) values (v_email, 'family', v_uid);
    end if;
  else v_email := null;
  end if;
  v_code := public.care_new_code();
  insert into public.care_links (owner_id, carer_id, created_by, code, can_manage, nickname, invite_email)
  values (case when p_role = 'owner' then v_uid end, case when p_role = 'carer' then v_uid end, v_uid, v_code,
          case when p_role = 'owner' then coalesce(p_can_manage, false) else false end,
          case when p_role = 'carer' then left(nullif(trim(p_nickname), ''), 40) end, v_email)
  returning care_links.id into v_id;
  return query select v_id, v_code;
end $$;

-- What the person opening an invite link sees before accepting.
create or replace function public.care_invite_preview(p_code text)
returns table (inviter_name text, inviter_role text, can_manage boolean, valid boolean, reason text)
language plpgsql stable security definer set search_path = public as $$
declare l public.care_links; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  select * into l from public.care_links where code = upper(trim(p_code));
  if not found then return query select null::text, null::text, false, false, 'NOT_FOUND'; return; end if;
  if l.status <> 'pending' then return query select null::text, null::text, false, false, 'USED'; return; end if;
  if l.expires_at < now() then return query select null::text, null::text, false, false, 'EXPIRED'; return; end if;
  if l.created_by = v_uid then return query select null::text, null::text, false, false, 'OWN_INVITE'; return; end if;
  return query select coalesce((select display_name from public.profiles where id = l.created_by), 'Someone'),
                      case when l.owner_id is not null then 'owner' else 'carer' end, l.can_manage, true, null::text;
end $$;

-- Accept: fills the empty side with me. If I'm the owner accepting a follow request, I choose can_manage now.
create or replace function public.care_accept(p_code text, p_can_manage boolean default null, p_nickname text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare l public.care_links; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  select * into l from public.care_links where code = upper(trim(p_code)) for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if l.status <> 'pending' then raise exception 'USED'; end if;
  if l.expires_at < now() then raise exception 'EXPIRED'; end if;
  if l.created_by = v_uid then raise exception 'OWN_INVITE'; end if;
  if l.owner_id is null then        -- a follow request: I am the owner
    if exists (select 1 from public.care_links where owner_id = v_uid and carer_id = l.carer_id and status = 'active') then raise exception 'ALREADY_LINKED'; end if;
    update public.care_links set owner_id = v_uid, status = 'active', accepted_at = now(), code = null,
      can_manage = coalesce(p_can_manage, false) where id = l.id;
  else                              -- "follow me": I am the follower
    if exists (select 1 from public.care_links where owner_id = l.owner_id and carer_id = v_uid and status = 'active') then raise exception 'ALREADY_LINKED'; end if;
    update public.care_links set carer_id = v_uid, status = 'active', accepted_at = now(), code = null,
      nickname = left(nullif(trim(p_nickname), ''), 40) where id = l.id;
  end if;
  return l.id;
end $$;

-- Either side can end a link (or cancel a pending invite they created).
create or replace function public.care_end(p_link uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.care_links set status = 'ended', code = null
  where id = p_link and auth.uid() in (owner_id, carer_id, created_by) and status <> 'ended';
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

-- Owner: allow / stop "can manage". Follower: alert time + nickname. Nobody else.
create or replace function public.care_update(p_link uuid, p_can_manage boolean default null, p_alert_after int default null, p_nickname text default null)
returns void language plpgsql security definer set search_path = public as $$
declare l public.care_links; v_uid uuid := auth.uid();
begin
  select * into l from public.care_links where id = p_link and status = 'active';
  if not found or v_uid not in (l.owner_id, l.carer_id) then raise exception 'NOT_FOUND'; end if;
  if p_can_manage is not null then
    if v_uid <> l.owner_id then raise exception 'ONLY_OWNER'; end if;
    update public.care_links set can_manage = p_can_manage where id = p_link;
  end if;
  if p_alert_after is not null or p_nickname is not null then
    if v_uid <> l.carer_id then raise exception 'ONLY_FOLLOWER'; end if;
    if p_alert_after is not null and p_alert_after not in (0, 30, 60, 120) then raise exception 'BAD_ALERT'; end if;
    update public.care_links set alert_after = coalesce(p_alert_after, alert_after),
      nickname = case when p_nickname is null then nickname else left(nullif(trim(p_nickname), ''), 40) end
    where id = p_link;
  end if;
end $$;

-- My family: everyone I follow / who follows me, with ONLY the profile fields needed (no email, water, settings).
create or replace function public.care_people()
returns table (link_id uuid, role text, person_id uuid, name text, nickname text, can_manage boolean, alert_after int,
               slot_times jsonb, timezone text, paused_until date, since timestamptz)
language sql stable security definer set search_path = public as $$
  select l.id, 'following', l.owner_id, p.display_name, l.nickname, l.can_manage, l.alert_after,
         p.slot_times, p.timezone, p.paused_until, l.accepted_at
  from public.care_links l join public.profiles p on p.id = l.owner_id
  where l.carer_id = auth.uid() and l.status = 'active'
  union all
  select l.id, 'follower', l.carer_id, p.display_name, null, l.can_manage, l.alert_after,
         null, null, null, l.accepted_at
  from public.care_links l join public.profiles p on p.id = l.carer_id
  where l.owner_id = auth.uid() and l.status = 'active'
$$;

do $$
declare f text;
begin
  foreach f in array array['care_new_code()', 'care_create_invite(text, text, text, boolean)', 'care_invite_preview(text)',
                           'care_accept(text, boolean, text)', 'care_end(uuid)', 'care_update(uuid, boolean, int, text)', 'care_people()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke all on function public.care_new_code() from authenticated;   -- internal only
