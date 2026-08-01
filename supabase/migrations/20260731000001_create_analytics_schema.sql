-- BarberFlow Analytics shares this Supabase project and remains isolated here.
create schema if not exists analytics authorization postgres;

comment on schema analytics is
  'Isolated BarberFlow Analytics objects in the shared Supabase project.';

revoke all on schema analytics from public, anon, authenticated;

-- Preserve data if an earlier draft created Analytics tables in public.
do $migration$
declare
  table_name text;
begin
  foreach table_name in array array[
    'analytics_admins',
    'analytics_events',
    'analytics_sessions',
    'analytics_rate_limits',
    'analytics_idempotency_keys',
    'analytics_daily_metrics',
    'analytics_funnel_metrics',
    'analytics_realtime_events'
  ] loop
    if to_regclass(format('analytics.%I', table_name)) is null
       and to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I set schema analytics', table_name);
    end if;
  end loop;
end;
$migration$;

-- rollback: back up the analytics schema first; move any preserved tables back
-- with ALTER TABLE analytics.<name> SET SCHEMA public, then DROP SCHEMA analytics.
