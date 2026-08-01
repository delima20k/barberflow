-- Retention is prepared but deliberately has no automatic scheduler.
create or replace function analytics.cleanup_analytics_data(
  p_reference_time timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, analytics
as $function$
declare
  deleted_events integer;
  deleted_sessions integer;
  deleted_idempotency_keys integer;
  deleted_rate_limits integer;
  deleted_realtime_events integer;
begin
  delete from analytics.analytics_events
  where created_at < p_reference_time - interval '90 days';
  get diagnostics deleted_events = row_count;

  delete from analytics.analytics_sessions
  where last_activity_at < p_reference_time - interval '180 days';
  get diagnostics deleted_sessions = row_count;

  delete from analytics.analytics_idempotency_keys
  where expires_at < p_reference_time;
  get diagnostics deleted_idempotency_keys = row_count;

  delete from analytics.analytics_rate_limits
  where window_started_at < p_reference_time - interval '2 days';
  get diagnostics deleted_rate_limits = row_count;

  delete from analytics.analytics_realtime_events
  where occurred_at < p_reference_time - interval '1 day';
  get diagnostics deleted_realtime_events = row_count;

  return jsonb_build_object(
    'events', deleted_events,
    'sessions', deleted_sessions,
    'idempotency_keys', deleted_idempotency_keys,
    'rate_limits', deleted_rate_limits,
    'realtime_events', deleted_realtime_events
  );
end;
$function$;

revoke all on function analytics.cleanup_analytics_data(timestamptz)
  from public, anon, authenticated;
grant execute on function analytics.cleanup_analytics_data(timestamptz)
  to service_role;

-- Aggregated daily/funnel metrics are intentionally permanent.
-- rollback: DROP FUNCTION analytics.cleanup_analytics_data(timestamptz).
