-- "Remind me again" (alarm-style) per reminder: {"every": 0|5|10|15|30, "times": 1..3}.
-- NULL = use the profile's follow-up default. Safe to run more than once.
alter table public.reminders add column if not exists remind_again jsonb;

alter table public.reminders drop constraint if exists reminders_remind_again_check;
alter table public.reminders add constraint reminders_remind_again_check check (
  remind_again is null or (
    jsonb_typeof(remind_again) = 'object'
    and (remind_again->>'every')::int in (0, 5, 10, 15, 30)
    and (remind_again->>'times')::int between 1 and 3
  )
);
