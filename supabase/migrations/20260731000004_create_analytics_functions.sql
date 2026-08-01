-- Private write functions used only by the collect-event Edge Function.
create or replace function analytics.consume_analytics_rate_limit(
  p_scope_type text,
  p_scope_key text,
  p_limit integer,
  p_window_seconds integer default 60
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, analytics
as $function$
declare
  key_value text;
  current_count integer;
begin
  if p_scope_type not in ('ip', 'session', 'origin')
     or nullif(btrim(p_scope_key), '') is null
     or p_limit < 1
     or p_window_seconds < 1 then
    return false;
  end if;

  key_value := p_scope_type || ':' || p_scope_key;
  insert into analytics.analytics_rate_limits as rate_limit (
    bucket_key,
    window_started_at,
    request_count
  ) values (
    key_value,
    now(),
    1
  )
  on conflict (bucket_key) do update set
    window_started_at = case
      when rate_limit.window_started_at
        <= now() - make_interval(secs => greatest(p_window_seconds, 1))
      then now()
      else rate_limit.window_started_at
    end,
    request_count = case
      when rate_limit.window_started_at
        <= now() - make_interval(secs => greatest(p_window_seconds, 1))
      then 1
      else rate_limit.request_count + 1
    end,
    updated_at = now()
  returning request_count into current_count;

  return current_count <= least(greatest(p_limit, 1), 10000);
end;
$function$;

create or replace function analytics.collect_analytics_event(
  p_event jsonb,
  p_ip_hash text,
  p_origin text,
  p_user_agent text,
  p_country text,
  p_ip_limit integer,
  p_session_limit integer
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, analytics
as $function$
declare
  idempotency_value text := p_event ->> 'idempotency_key';
  session_value text := p_event ->> 'session_id';
  received_at_value timestamptz := now();
  event_name_value text := p_event ->> 'event_name';
  is_conversion boolean := event_name_value in (
    'email_submitted', 'voucher_generated', 'account_created',
    'email_confirmed', 'first_login'
  );
begin
  if not analytics.consume_analytics_rate_limit('ip', p_ip_hash, p_ip_limit)
     or not analytics.consume_analytics_rate_limit(
       'session', session_value, p_session_limit
     )
     or not analytics.consume_analytics_rate_limit(
       'origin', p_origin, p_ip_limit * 10
     ) then
    return jsonb_build_object('accepted', false, 'reason', 'rate_limited');
  end if;

  insert into analytics.analytics_idempotency_keys (idempotency_key, expires_at)
  values (idempotency_value, received_at_value + interval '24 hours')
  on conflict (idempotency_key) do nothing;

  if not found then
    return jsonb_build_object('accepted', true, 'duplicate', true);
  end if;

  insert into analytics.analytics_events (
    idempotency_key, session_id, visitor_id, event_name, event_description,
    page, button_name, campaign, source, medium, device, browser, os,
    screen_width, screen_height, language, country, ip_hash, referrer,
    scroll_percentage, email_hmac, voucher_opened, voucher_generated,
    created_at, received_at
  ) values (
    idempotency_value,
    session_value,
    p_event ->> 'visitor_id',
    event_name_value,
    replace(event_name_value, '_', ' '),
    p_event ->> 'page',
    p_event ->> 'button_name',
    p_event ->> 'campaign',
    p_event ->> 'source',
    p_event ->> 'medium',
    p_event ->> 'device',
    p_event ->> 'browser',
    p_event ->> 'os',
    nullif(p_event ->> 'screen_width', '')::integer,
    nullif(p_event ->> 'screen_height', '')::integer,
    p_event ->> 'language',
    p_country,
    p_ip_hash,
    p_event ->> 'referrer',
    nullif(p_event ->> 'scroll_percentage', '')::smallint,
    p_event ->> 'email_hmac',
    coalesce((p_event ->> 'voucher_opened')::boolean, false),
    coalesce((p_event ->> 'voucher_generated')::boolean, false),
    received_at_value,
    received_at_value
  );

  insert into analytics.analytics_sessions as session_row (
    session_id, visitor_id, entry_page, source, campaign, device,
    event_count, converted
  ) values (
    session_value,
    p_event ->> 'visitor_id',
    p_event ->> 'page',
    p_event ->> 'source',
    p_event ->> 'campaign',
    p_event ->> 'device',
    1,
    is_conversion
  )
  on conflict (session_id) do update set
    last_activity_at = received_at_value,
    exit_page = p_event ->> 'page',
    event_count = session_row.event_count + 1,
    converted = session_row.converted or is_conversion,
    status = case
      when event_name_value = 'session_ended' then 'ended'
      else session_row.status
    end,
    ended_at = case
      when event_name_value = 'session_ended' then received_at_value
      else session_row.ended_at
    end,
    duration_seconds = case
      when event_name_value = 'session_ended'
        then extract(epoch from received_at_value - session_row.started_at)::integer
      else session_row.duration_seconds
    end,
    updated_at = received_at_value;

  insert into analytics.analytics_realtime_events (
    event_name,
    button_name,
    conversion
  ) values (
    event_name_value,
    p_event ->> 'button_name',
    is_conversion
  );

  return jsonb_build_object('accepted', true);
end;
$function$;

revoke all on function analytics.consume_analytics_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
revoke all on function analytics.collect_analytics_event(jsonb, text, text, text, text, integer, integer)
  from public, anon, authenticated;
grant usage on schema analytics to service_role;
grant execute on function analytics.collect_analytics_event(jsonb, text, text, text, text, integer, integer)
  to service_role;

-- rollback: DROP FUNCTION analytics.collect_analytics_event(...), then
-- DROP FUNCTION analytics.consume_analytics_rate_limit(...).
