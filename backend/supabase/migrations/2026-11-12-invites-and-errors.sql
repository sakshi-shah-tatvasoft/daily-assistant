-- 1) Owner can invite people from inside the app (no SQL needed).
-- 2) App errors are saved so the owner gets an hourly email if something breaks on a tester's phone.
-- Safe to run more than once.

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
