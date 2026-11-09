-- Move off Railway — part 2: call the Vercel reminder engine every minute.
-- Run AFTER the Vercel deploy has CRON_SECRET set. Re-running updates the same job.
select cron.schedule(
  'daily-assistant-tick',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://daily-assistant-eta.vercel.app/api/cron/tick',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'daily_assistant_cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);

-- Check it (wait 2–3 minutes): every row should say status 200.
-- select status_code, left(content::text, 80) as reply, created
--   from net._http_response order by created desc limit 5;

-- To stop it (rollback):  select cron.unschedule('daily-assistant-tick');
