-- Family: one person (the "follower", e.g. a daughter) follows another person's medicines (the "owner", e.g. Mummy).
-- Nothing is shared until BOTH have agreed: one side creates an invite code, the other accepts it.
-- Followers see ONLY medicines (reminders with category 'medicine' + their dose logs) and limited profile info.
-- "can manage" (set by the owner) lets the follower add/edit medicines and tick doses for the owner.
-- Safe to run more than once.

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
