-- The schema can be exposed to PostgREST for RPCs without exposing its tables.
revoke all on all tables in schema analytics from public, anon, authenticated;
revoke all on all sequences in schema analytics from public, anon, authenticated;

alter table analytics.analytics_admins enable row level security;
alter table analytics.analytics_events enable row level security;
alter table analytics.analytics_sessions enable row level security;
alter table analytics.analytics_rate_limits enable row level security;
alter table analytics.analytics_idempotency_keys enable row level security;
alter table analytics.analytics_daily_metrics enable row level security;
alter table analytics.analytics_funnel_metrics enable row level security;
alter table analytics.analytics_realtime_events enable row level security;

drop policy if exists analytics_events_admin_read
  on analytics.analytics_events;
create policy analytics_events_admin_read
  on analytics.analytics_events
  for select
  to authenticated
  using (analytics.is_analytics_admin());

drop policy if exists analytics_realtime_admin_read
  on analytics.analytics_realtime_events;
create policy analytics_realtime_admin_read
  on analytics.analytics_realtime_events
  for select
  to authenticated
  using (analytics.is_analytics_admin());

grant select on analytics.analytics_events, analytics.analytics_realtime_events
  to authenticated;

alter default privileges in schema analytics
  revoke all on tables from public, anon, authenticated;
alter default privileges in schema analytics
  revoke all on sequences from public, anon, authenticated;
alter default privileges in schema analytics
  revoke execute on functions from public, anon;

-- Sessions and aggregates remain RPC-only. Event SELECT exists solely for the
-- authenticated admin panel and Realtime, guarded by the active-admin policy.
-- rollback: revoke the realtime SELECT, drop its policy, then disable RLS only
-- if the entire Analytics schema is being rolled back after a verified backup.
