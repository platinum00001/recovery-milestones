-- =====================================================================
-- Recovery Milestones — 002_schedule.sql
-- Daily milestone emails + hourly meeting reminders via pg_cron + pg_net.
--
-- Before running: create two Vault secrets (SQL Editor):
--   select vault.create_secret('https://<project-ref>.supabase.co', 'rtr_project_url');
--   select vault.create_secret('<same value as the CRON_SECRET function secret>', 'rtr_cron_secret');
-- The jobs read them at run time, so secrets can also be added afterwards.
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 13:00 UTC = 9:00 AM Eastern (daylight time) / 8:00 AM (standard time).
select cron.schedule(
  'rtr-milestone-notify-daily',
  '0 13 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'rtr_project_url') || '/functions/v1/milestone-notify?task=daily',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'rtr_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000);
  $$
);

-- Top of every hour: meeting reminders for meetings starting in the next hour.
select cron.schedule(
  'rtr-meeting-reminders-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'rtr_project_url') || '/functions/v1/milestone-notify?task=reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'rtr_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000);
  $$
);

-- To check:   select * from cron.job;  select * from cron.job_run_details order by start_time desc limit 20;
-- To stop:    select cron.unschedule('rtr-milestone-notify-daily'); select cron.unschedule('rtr-meeting-reminders-hourly');
