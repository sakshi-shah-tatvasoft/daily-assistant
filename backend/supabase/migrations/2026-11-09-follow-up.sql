-- Follow-up reminders: minutes after a reminder to nudge again if it is still pending.
-- 0 = off. Default 15. Safe to run more than once.
alter table public.profiles
  add column if not exists follow_up_minutes int not null default 15
  check (follow_up_minutes in (0, 15, 30, 60));

-- Let users change their own setting (profiles uses column-level update grants).
grant update (follow_up_minutes) on public.profiles to authenticated;
