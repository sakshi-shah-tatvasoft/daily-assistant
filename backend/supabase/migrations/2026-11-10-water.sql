-- Water reminders: settings on the profile + one glass count per user per day.
-- Safe to run more than once.

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
