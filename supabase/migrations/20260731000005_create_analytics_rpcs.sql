-- Dashboard RPCs. Every query is schema-qualified and admin-guarded.
create or replace function analytics.is_analytics_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, analytics
as $function$
  select exists (
    select 1
    from analytics.analytics_admins
    where user_id = auth.uid()
      and active = true
  );
$function$;

create or replace function analytics.analytics_guard()
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, analytics
as $function$
begin
  if not analytics.is_analytics_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
end;
$function$;

create or replace function analytics.get_analytics_overview(
  p_start timestamptz,
  p_end timestamptz,
  p_source text default null,
  p_campaign text default null,
  p_device text default null
) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, analytics
as $function$
begin
  perform analytics.analytics_guard();
  return (
    select jsonb_build_object(
      'events', count(*),
      'visitors', count(distinct event_row.visitor_id),
      'sessions', count(distinct event_row.session_id),
      'conversions', count(*) filter (where event_row.event_name in (
        'email_submitted', 'voucher_generated', 'account_created',
        'email_confirmed', 'first_login'
      ))
    )
    from analytics.analytics_events as event_row
    where event_row.created_at >= p_start
      and event_row.created_at < p_end
      and (p_source is null or event_row.source = p_source)
      and (p_campaign is null or event_row.campaign = p_campaign)
      and (p_device is null or event_row.device = p_device)
  );
end;
$function$;

create or replace function analytics.get_analytics_funnel(
  p_start timestamptz,
  p_end timestamptz,
  p_source text default null,
  p_campaign text default null,
  p_device text default null
) returns table (event_name text, total bigint)
language plpgsql stable security definer
set search_path = pg_catalog, analytics
as $function$
begin
  perform analytics.analytics_guard();
  return query
  select event_row.event_name, count(distinct event_row.visitor_id)
  from analytics.analytics_events as event_row
  where event_row.created_at >= p_start
    and event_row.created_at < p_end
    and (p_source is null or event_row.source = p_source)
    and (p_campaign is null or event_row.campaign = p_campaign)
    and (p_device is null or event_row.device = p_device)
  group by event_row.event_name
  order by count(distinct event_row.visitor_id) desc;
end;
$function$;

create or replace function analytics.get_analytics_sessions(
  p_start timestamptz,
  p_end timestamptz,
  p_source text default null,
  p_campaign text default null,
  p_device text default null,
  p_limit integer default 50
) returns table (
  session_id text,
  visitor_id text,
  started_at timestamptz,
  last_activity_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  status text,
  source text,
  campaign text,
  device text,
  event_count bigint,
  events jsonb
)
language plpgsql stable security definer
set search_path = pg_catalog, analytics
as $function$
begin
  perform analytics.analytics_guard();
  return query
  select
    event_row.session_id,
    min(event_row.visitor_id),
    min(event_row.created_at),
    max(event_row.created_at),
    max(event_row.created_at) filter (where event_row.event_name = 'session_ended'),
    greatest(0, extract(epoch from max(event_row.created_at) - min(event_row.created_at))::integer),
    case
      when max(event_row.created_at) filter (where event_row.event_name = 'session_ended') is null
        and max(event_row.created_at) > now() - interval '30 minutes'
      then 'active'
      else 'ended'
    end,
    min(event_row.source),
    min(event_row.campaign),
    min(event_row.device),
    count(*),
    jsonb_agg(
      jsonb_build_object(
        'id', event_row.id,
        'session_id', event_row.session_id,
        'visitor_id', event_row.visitor_id,
        'event_name', event_row.event_name,
        'event_description', event_row.event_description,
        'campaign', event_row.campaign,
        'source', event_row.source,
        'device', event_row.device,
        'created_at', event_row.created_at
      ) order by event_row.created_at
    )
  from analytics.analytics_events as event_row
  where event_row.created_at >= p_start
    and event_row.created_at < p_end
    and (p_source is null or event_row.source = p_source)
    and (p_campaign is null or event_row.campaign = p_campaign)
    and (p_device is null or event_row.device = p_device)
  group by event_row.session_id
  order by max(event_row.created_at) desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
end;
$function$;

create or replace function analytics.get_analytics_top_ctas(
  p_start timestamptz,
  p_end timestamptz,
  p_source text default null,
  p_campaign text default null,
  p_device text default null
) returns table (cta_id text, total bigint)
language plpgsql stable security definer
set search_path = pg_catalog, analytics
as $function$
begin
  perform analytics.analytics_guard();
  return query
  select event_row.button_name, count(*)
  from analytics.analytics_events as event_row
  where event_row.event_name = 'cta_click'
    and nullif(event_row.button_name, '') is not null
    and event_row.created_at >= p_start and event_row.created_at < p_end
    and (p_source is null or event_row.source = p_source)
    and (p_campaign is null or event_row.campaign = p_campaign)
    and (p_device is null or event_row.device = p_device)
  group by event_row.button_name
  order by count(*) desc;
end;
$function$;

create or replace function analytics.get_analytics_scroll_depth(
  p_start timestamptz,
  p_end timestamptz,
  p_source text default null,
  p_campaign text default null,
  p_device text default null
) returns table (scroll_depth smallint, total bigint)
language plpgsql stable security definer
set search_path = pg_catalog, analytics
as $function$
begin
  perform analytics.analytics_guard();
  return query
  select event_row.scroll_percentage, count(*)
  from analytics.analytics_events as event_row
  where event_row.scroll_percentage is not null
    and event_row.created_at >= p_start and event_row.created_at < p_end
    and (p_source is null or event_row.source = p_source)
    and (p_campaign is null or event_row.campaign = p_campaign)
    and (p_device is null or event_row.device = p_device)
  group by event_row.scroll_percentage
  order by event_row.scroll_percentage;
end;
$function$;

create or replace function analytics.get_analytics_sources(
  p_start timestamptz,
  p_end timestamptz,
  p_source text default null,
  p_campaign text default null,
  p_device text default null
) returns table (source text, campaign text, total bigint)
language plpgsql stable security definer
set search_path = pg_catalog, analytics
as $function$
begin
  perform analytics.analytics_guard();
  return query
  select coalesce(event_row.source, 'direct'), coalesce(event_row.campaign, ''), count(*)
  from analytics.analytics_events as event_row
  where event_row.created_at >= p_start and event_row.created_at < p_end
    and (p_source is null or event_row.source = p_source)
    and (p_campaign is null or event_row.campaign = p_campaign)
    and (p_device is null or event_row.device = p_device)
  group by 1, 2
  order by count(*) desc;
end;
$function$;

create or replace function analytics.get_analytics_realtime_summary(
  p_start timestamptz default now() - interval '15 minutes',
  p_end timestamptz default now(),
  p_source text default null,
  p_campaign text default null,
  p_device text default null
) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, analytics
as $function$
begin
  perform analytics.analytics_guard();
  return (
    select jsonb_build_object(
      'events', count(*),
      'sessions', count(distinct event_row.session_id),
      'conversions', count(*) filter (where event_row.event_name in (
        'email_submitted', 'voucher_generated', 'account_created',
        'email_confirmed', 'first_login'
      ))
    )
    from analytics.analytics_events as event_row
    where event_row.created_at >= p_start and event_row.created_at < p_end
      and (p_source is null or event_row.source = p_source)
      and (p_campaign is null or event_row.campaign = p_campaign)
      and (p_device is null or event_row.device = p_device)
  );
end;
$function$;

revoke all on all functions in schema analytics from public, anon;
grant usage on schema analytics to authenticated, service_role;
grant execute on function analytics.is_analytics_admin() to authenticated;
grant execute on function analytics.get_analytics_overview(timestamptz, timestamptz, text, text, text) to authenticated;
grant execute on function analytics.get_analytics_funnel(timestamptz, timestamptz, text, text, text) to authenticated;
grant execute on function analytics.get_analytics_sessions(timestamptz, timestamptz, text, text, text, integer) to authenticated;
grant execute on function analytics.get_analytics_top_ctas(timestamptz, timestamptz, text, text, text) to authenticated;
grant execute on function analytics.get_analytics_scroll_depth(timestamptz, timestamptz, text, text, text) to authenticated;
grant execute on function analytics.get_analytics_sources(timestamptz, timestamptz, text, text, text) to authenticated;
grant execute on function analytics.get_analytics_realtime_summary(timestamptz, timestamptz, text, text, text) to authenticated;

-- rollback: revoke dashboard grants and drop analytics.get_analytics_* functions,
-- analytics.analytics_guard and analytics.is_analytics_admin in reverse order.
