-- Selective indexes for dashboard filters, retention and rate limiting.
create index if not exists analytics_events_created_at_idx
  on analytics.analytics_events (created_at desc);
create index if not exists analytics_events_funnel_idx
  on analytics.analytics_events (event_name, created_at desc);
create index if not exists analytics_events_session_idx
  on analytics.analytics_events (session_id, created_at desc);
create index if not exists analytics_events_source_idx
  on analytics.analytics_events (source, campaign, created_at desc);
create index if not exists analytics_sessions_last_seen_idx
  on analytics.analytics_sessions (last_activity_at desc);
create index if not exists analytics_sessions_source_idx
  on analytics.analytics_sessions (source, campaign, started_at desc);
create index if not exists analytics_rate_limits_lookup_idx
  on analytics.analytics_rate_limits (window_started_at desc);
create index if not exists analytics_idempotency_expiry_idx
  on analytics.analytics_idempotency_keys (expires_at);
create index if not exists analytics_realtime_occurred_idx
  on analytics.analytics_realtime_events (occurred_at desc);

-- rollback: DROP INDEX analytics.<index_name> for each index above.
