begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.analytics_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.analytics_admins
  add column if not exists user_id uuid,
  add column if not exists created_at timestamptz not null default now();

create table if not exists public.analytics_events (
  id uuid primary key default extensions.gen_random_uuid(),
  idempotency_key text not null,
  session_id text not null,
  visitor_id text not null,
  event_name text not null,
  event_description text,
  page text,
  button_name text,
  campaign text,
  source text,
  medium text,
  device text,
  browser text,
  os text,
  screen_width integer,
  screen_height integer,
  language text,
  country text,
  city text,
  ip_hash text,
  referrer text,
  scroll_percentage smallint,
  email_hash text,
  voucher_opened boolean not null default false,
  voucher_generated boolean not null default false,
  account_created boolean not null default false,
  email_confirmed boolean not null default false,
  first_login boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.analytics_events
  add column if not exists idempotency_key text,
  add column if not exists session_id text,
  add column if not exists visitor_id text,
  add column if not exists event_name text,
  add column if not exists event_description text,
  add column if not exists page text,
  add column if not exists button_name text,
  add column if not exists campaign text,
  add column if not exists source text,
  add column if not exists medium text,
  add column if not exists device text,
  add column if not exists browser text,
  add column if not exists os text,
  add column if not exists screen_width integer,
  add column if not exists screen_height integer,
  add column if not exists language text,
  add column if not exists country text,
  add column if not exists city text,
  add column if not exists ip_hash text,
  add column if not exists referrer text,
  add column if not exists scroll_percentage smallint,
  add column if not exists email_hash text,
  add column if not exists voucher_opened boolean not null default false,
  add column if not exists voucher_generated boolean not null default false,
  add column if not exists account_created boolean not null default false,
  add column if not exists email_confirmed boolean not null default false,
  add column if not exists first_login boolean not null default false,
  add column if not exists created_at timestamptz not null default now();

create unique index if not exists analytics_events_idempotency_key_idx
  on public.analytics_events (idempotency_key);
create index if not exists analytics_events_created_at_idx
  on public.analytics_events (created_at desc);
create index if not exists analytics_events_session_created_idx
  on public.analytics_events (session_id, created_at);
create index if not exists analytics_events_event_created_idx
  on public.analytics_events (event_name, created_at);

create table if not exists public.analytics_rate_limits (
  bucket_key text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0
);

alter table public.analytics_rate_limits
  add column if not exists bucket_key text,
  add column if not exists window_started_at timestamptz not null default now(),
  add column if not exists request_count integer not null default 0;

alter table public.analytics_rate_limits enable row level security;

create or replace function public.is_analytics_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.analytics_admins
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_analytics_admin() from public;
grant execute on function public.is_analytics_admin() to authenticated;

alter table public.analytics_admins enable row level security;
alter table public.analytics_events enable row level security;

drop policy if exists "analytics_admins_read_self" on public.analytics_admins;
create policy "analytics_admins_read_self"
  on public.analytics_admins
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "analytics_events_admin_read" on public.analytics_events;
create policy "analytics_events_admin_read"
  on public.analytics_events
  for select
  to authenticated
  using ((select public.is_analytics_admin()));

drop function if exists public.analytics_sessions_page(integer, timestamptz);

create function public.analytics_sessions_page(
  p_limit integer default 12,
  p_cursor timestamptz default null
)
returns table (
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
language sql
stable
security invoker
set search_path = public
as $$
  select
    e.session_id,
    min(e.visitor_id),
    min(e.created_at),
    max(e.created_at),
    max(e.created_at) filter (where e.event_name = 'session_ended'),
    greatest(0, extract(epoch from max(e.created_at) - min(e.created_at))::integer),
    case
      when max(e.created_at) filter (where e.event_name = 'session_ended') is null
        and max(e.created_at) > now() - interval '30 minutes'
      then 'active'
      else 'ended'
    end,
    min(e.source),
    min(e.campaign),
    min(e.device),
    count(*),
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'session_id', e.session_id,
        'visitor_id', e.visitor_id,
        'event_name', e.event_name,
        'event_description', e.event_description,
        'campaign', e.campaign,
        'source', e.source,
        'device', e.device,
        'created_at', e.created_at
      )
      order by e.created_at
    )
  from public.analytics_events e
  where p_cursor is null or e.created_at < p_cursor
  group by e.session_id
  order by max(e.created_at) desc
  limit least(greatest(p_limit, 1), 100);
$$;

revoke all on function public.analytics_sessions_page(integer, timestamptz) from public;
grant execute on function public.analytics_sessions_page(integer, timestamptz) to authenticated;

create or replace function public.analytics_funnel_metrics(
  p_start timestamptz,
  p_end timestamptz
)
returns table (event_name text, visitors bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select event_name, count(distinct visitor_id)
  from public.analytics_events
  where created_at between p_start and p_end
  group by event_name;
$$;

revoke all on function public.analytics_funnel_metrics(timestamptz, timestamptz) from public;
grant execute on function public.analytics_funnel_metrics(timestamptz, timestamptz) to authenticated;

create or replace function public.claim_analytics_rate_limit(
  p_bucket_key text,
  p_limit integer default 60,
  p_window_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
begin
  insert into public.analytics_rate_limits (
    bucket_key,
    window_started_at,
    request_count
  )
  values (p_bucket_key, now(), 1)
  on conflict (bucket_key) do update
    set
      window_started_at = case
        when public.analytics_rate_limits.window_started_at
          <= now() - make_interval(secs => greatest(p_window_seconds, 1))
        then now()
        else public.analytics_rate_limits.window_started_at
      end,
      request_count = case
        when public.analytics_rate_limits.window_started_at
          <= now() - make_interval(secs => greatest(p_window_seconds, 1))
        then 1
        else public.analytics_rate_limits.request_count + 1
      end
  returning request_count into current_count;

  return current_count <= least(greatest(p_limit, 1), 600);
end;
$$;

revoke all on function public.claim_analytics_rate_limit(text, integer, integer) from public;
grant execute on function public.claim_analytics_rate_limit(text, integer, integer) to service_role;

create or replace function public.set_analytics_event_description()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.event_description := coalesce(new.event_description, replace(new.event_name, '_', ' '));
  return new;
end;
$$;

drop trigger if exists set_analytics_event_description on public.analytics_events;
create trigger set_analytics_event_description
before insert on public.analytics_events
for each row execute function public.set_analytics_event_description();

drop policy if exists "analytics_presence_admin_receive" on realtime.messages;
create policy "analytics_presence_admin_receive"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.topic() = 'analytics:landing:presence'
    and extension = 'presence'
    and (select public.is_analytics_admin())
  );

drop policy if exists "analytics_presence_visitor_publish_own" on realtime.messages;
create policy "analytics_presence_visitor_publish_own"
  on realtime.messages
  for insert
  to authenticated
  with check (
    realtime.topic() = 'analytics:landing:presence'
    and extension = 'presence'
    and (select auth.uid()) is not null
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
  );

commit;
