-- Analytics tables are deliberately absent from public.
-- Existing public.analytics_* tables are preserved by the preceding migration.
create extension if not exists pgcrypto with schema extensions;

create table if not exists analytics.analytics_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table analytics.analytics_admins
  add column if not exists active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists analytics.analytics_events (
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
  scroll_percentage smallint check (scroll_percentage in (25, 50, 75, 100)),
  email_hmac text check (email_hmac is null or email_hmac ~ '^[a-f0-9]{64}$'),
  voucher_opened boolean not null default false,
  voucher_generated boolean not null default false,
  account_created boolean not null default false,
  email_confirmed boolean not null default false,
  first_login boolean not null default false,
  created_at timestamptz not null default now(),
  received_at timestamptz not null default now()
);

alter table analytics.analytics_events
  add column if not exists email_hmac text,
  add column if not exists received_at timestamptz not null default now();

create table if not exists analytics.analytics_sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id text not null unique,
  visitor_id text not null,
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  status text not null default 'active' check (status in ('active', 'ended')),
  entry_page text,
  exit_page text,
  source text,
  campaign text,
  device text,
  event_count integer not null default 0 check (event_count >= 0),
  converted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists analytics.analytics_rate_limits (
  bucket_key text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table analytics.analytics_rate_limits
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists analytics.analytics_idempotency_keys (
  id uuid primary key default extensions.gen_random_uuid(),
  idempotency_key text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists analytics.analytics_daily_metrics (
  id uuid primary key default extensions.gen_random_uuid(),
  metric_date date not null,
  source text,
  campaign text,
  device text,
  sessions_count integer not null default 0,
  events_count integer not null default 0,
  conversions_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (metric_date, source, campaign, device)
);

create table if not exists analytics.analytics_funnel_metrics (
  id uuid primary key default extensions.gen_random_uuid(),
  metric_date date not null,
  step_name text not null,
  source text,
  campaign text,
  device text,
  total_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (metric_date, step_name, source, campaign, device)
);

create table if not exists analytics.analytics_realtime_events (
  id uuid primary key default extensions.gen_random_uuid(),
  event_name text not null,
  occurred_at timestamptz not null default now(),
  button_name text,
  conversion boolean not null default false
);

-- rollback: after a verified backup, drop only newly created analytics tables in reverse order.
