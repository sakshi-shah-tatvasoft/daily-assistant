-- Snooze: "remind me again in 10 / 30 / 60 minutes" from a check-in screen.
-- One active snooze per user per check-in key ('after_dinner', 'custom-<reminderId>').
-- The scheduler sends and deletes rows when due_at passes. Safe to run more than once.
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
