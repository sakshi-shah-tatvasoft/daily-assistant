-- Move off Railway — part 1: turn on the scheduler extensions and create the cron secret.
-- Safe to run more than once (keeps the same secret). The last line shows the secret to copy into Vercel.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net  with schema extensions;

select vault.create_secret(
  replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),   -- 64 random hex characters
  'daily_assistant_cron_secret',
  'Authorizes Supabase pg_cron to call /api/cron/tick on Vercel')
where not exists (select 1 from vault.secrets where name = 'daily_assistant_cron_secret');

select decrypted_secret as cron_secret_copy_this_into_vercel
from vault.decrypted_secrets where name = 'daily_assistant_cron_secret';
