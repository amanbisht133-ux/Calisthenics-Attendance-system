-- ============================================================================
-- Schedule the two report Edge Functions with pg_cron + pg_net.
--
-- IMPORTANT: Before running this migration, replace the two placeholders
-- below (<PROJECT_REF> and <SERVICE_ROLE_KEY>) with your actual Supabase
-- project ref and service role key, OR simply configure these two cron jobs
-- from the Supabase Dashboard → Database → Cron Jobs UI instead, which is
-- often easier since it lets you paste secrets without editing SQL.
-- ============================================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Daily Demo Visitor email — every day at 20:00 UTC.
select cron.schedule(
  'daily-demo-visitor-report',
  '0 20 * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/daily-demo-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Weekly Expired Membership email — every Monday at 07:00 UTC.
select cron.schedule(
  'weekly-expired-membership-report',
  '0 7 * * 1',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/weekly-expired-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To inspect or remove jobs later:
--   select * from cron.job;
--   select cron.unschedule('daily-demo-visitor-report');
