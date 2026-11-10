-- Holiday mode: pause all reminders until a date (inclusive). NULL = not paused.
-- Safe to run more than once.
alter table public.profiles add column if not exists paused_until date;
-- Users may change their own pause (profiles uses column-level update grants).
grant update (paused_until) on public.profiles to authenticated;
