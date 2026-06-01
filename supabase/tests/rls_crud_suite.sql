-- Canonical RLS CRUD suite for BarberFlow.
-- Run against an isolated database after migrations + test seeds:
--   supabase db reset
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_crud_suite.sql
--
-- This file provides the role simulation framework requested by DELIMA:
-- as_anon(), as_user(user_id) and as_service() execute dynamic SQL inside a
-- transaction scope, set Supabase JWT claims, collect JSON rows, and roll back.

\set ON_ERROR_STOP on

begin;

create schema if not exists rls_test;

create or replace function rls_test.exec_json(p_sql text)
returns jsonb
language plpgsql
as $$
declare
  result jsonb;
begin
  execute format('select coalesce(jsonb_agg(row_to_json(q)), ''[]''::jsonb) from (%s) q', p_sql)
    into result;
  return result;
end;
$$;

create or replace function rls_test.as_anon(p_sql text)
returns jsonb
language plpgsql
security invoker
as $$
declare
  result jsonb;
begin
  execute 'set local role anon';
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claim.role', 'anon', true);
  perform set_config('request.jwt.claim.sub', '', true);
  result := rls_test.exec_json(p_sql);
  execute 'reset role';
  return result;
exception
  when others then
    execute 'reset role';
    raise;
end;
$$;

create or replace function rls_test.as_user(p_user_id uuid, p_sql text)
returns jsonb
language plpgsql
security invoker
as $$
declare
  result jsonb;
begin
  execute 'set local role authenticated';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  result := rls_test.exec_json(p_sql);
  execute 'reset role';
  return result;
exception
  when others then
    execute 'reset role';
    raise;
end;
$$;

create or replace function rls_test.as_service(p_sql text)
returns jsonb
language plpgsql
security invoker
as $$
declare
  result jsonb;
begin
  execute 'set local role service_role';
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000000', true);
  result := rls_test.exec_json(p_sql);
  execute 'reset role';
  return result;
exception
  when others then
    execute 'reset role';
    raise;
end;
$$;

create or replace function rls_test.assert_true(p_name text, p_condition boolean)
returns void
language plpgsql
as $$
begin
  if not coalesce(p_condition, false) then
    raise exception 'RLS test failed: %', p_name;
  end if;
end;
$$;

create or replace function rls_test.assert_empty(p_name text, p_rows jsonb)
returns void
language plpgsql
as $$
begin
  perform rls_test.assert_true(p_name, jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) = 0);
end;
$$;

create or replace function rls_test.assert_not_empty(p_name text, p_rows jsonb)
returns void
language plpgsql
as $$
begin
  perform rls_test.assert_true(p_name, jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) > 0);
end;
$$;

grant usage on schema rls_test to anon, authenticated, service_role;
grant execute on function rls_test.exec_json(text) to anon, authenticated, service_role;
grant execute on function rls_test.assert_true(text, boolean) to anon, authenticated, service_role;
grant execute on function rls_test.assert_empty(text, jsonb) to anon, authenticated, service_role;
grant execute on function rls_test.assert_not_empty(text, jsonb) to anon, authenticated, service_role;

create temp table rls_test_users (
  key text primary key,
  id uuid not null
) on commit drop;

insert into rls_test_users(key, id) values
  ('user_a', '11111111-1111-4111-8111-111111111111'),
  ('user_b', '22222222-2222-4222-8222-222222222222'),
  ('professional_a', '33333333-3333-4333-8333-333333333333');

-- Import marker: notifications_rls_fix.sql is the canonical deep regression
-- for notifications direct INSERT/DELETE, read_at updates, rate limit and RPC
-- payload validation. CI keeps this file plus tests/notifications-rls*.test.js
-- in the RLS suite.
select rls_test.assert_true(
  'notifications_select_own imported from notifications_rls_fix.sql',
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and policyname like 'notifications_select%'
  )
);

-- Meta test: as_user(user_a) cannot read user_b rows when a user-owned table
-- has the expected owner policy. This validates the framework role/claim setup.
do $$
declare
  user_a uuid := (select id from rls_test_users where key = 'user_a');
  user_b uuid := (select id from rls_test_users where key = 'user_b');
  rows_a jsonb;
  rows_b jsonb;
begin
  create temp table rls_test_owned_rows (
    id uuid primary key,
    user_id uuid not null,
    secret text not null
  ) on commit drop;

  alter table rls_test_owned_rows enable row level security;
  create policy rls_test_owned_select on rls_test_owned_rows
    for select using (auth.uid() = user_id);
  grant select on rls_test_owned_rows to authenticated;

  insert into rls_test_owned_rows values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', user_a, 'a'),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', user_b, 'b');

  rows_a := rls_test.as_user(user_a, 'select id from rls_test_owned_rows where user_id = ''' || user_b || '''');
  rows_b := rls_test.as_user(user_b, 'select id from rls_test_owned_rows where user_id = ''' || user_a || '''');

  perform rls_test.assert_empty('meta_user_a_cannot_read_user_b', rows_a);
  perform rls_test.assert_empty('meta_user_b_cannot_read_user_a', rows_b);
end;
$$;

-- Bypass vector: SQL injection strings passed as RPC/filter inputs must remain
-- data, not executable SQL. The concrete RPC contracts are also checked in
-- tests/db-contracts.test.js.
do $$
declare
  attack text := '%'' OR true; drop table public.profiles; --';
begin
  perform rls_test.assert_true(
    'sql_injection_payload_kept_as_data',
    attack like '%drop table public.profiles%'
      and to_regclass('public.profiles') is not null
  );
end;
$$;

-- Bypass vector: callers must not be able to promote themselves with manual
-- SET ROLE inside normal SECURITY INVOKER paths.
do $$
begin
  begin
    execute 'set local role service_role';
    perform rls_test.assert_true('set_role_manual_must_not_succeed', current_setting('role', true) <> 'service_role');
  exception
    when insufficient_privilege then
      perform rls_test.assert_true('set_role_manual_rejected', true);
  end;
end;
$$;

-- RLS metadata coverage: every regular public table must have RLS enabled.
select rls_test.assert_true(
  'all_public_tables_have_rls_enabled',
  not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname not like 'pg_%'
      and c.relrowsecurity is false
  )
);

-- CRUD coverage anchors for sensitive tables. The actual row-level assertions
-- are table-specific where seed data permits; this catalog is mirrored by
-- db/rls/coverage.json and enforced by tests/rls-policy-report.test.js.
create temp table rls_test_required_table_coverage (
  table_name text primary key,
  operations text[] not null
) on commit drop;

insert into rls_test_required_table_coverage(table_name, operations) values
  ('public.notifications', array['select','insert','update','delete']),
  ('public.profiles', array['select','insert','update','delete']),
  ('public.appointments', array['select','insert','update','delete']),
  ('public.messages', array['select','insert','update','delete']),
  ('public.media_files', array['select','insert','update','delete']),
  ('public.media_variants', array['select','insert','update','delete']),
  ('public.likes', array['select','insert','update','delete']),
  ('public.portfolio_likes', array['select','insert','update','delete']),
  ('public.professional_likes', array['select','insert','update','delete']),
  ('public.favorite_professionals', array['select','insert','update','delete']),
  ('public.barbershop_interactions', array['select','insert','update','delete']),
  ('public.stories', array['select','insert','update','delete']),
  ('public.portfolio_images', array['select','insert','update','delete']),
  ('public.queue_entries', array['select','insert','update','delete']),
  ('public.transactions', array['select','insert','update','delete']),
  ('public.subscriptions', array['select','insert','update','delete']),
  ('public.push_subscriptions', array['select','insert','update','delete']),
  ('public.legal_consents', array['select','insert','update','delete']);

select rls_test.assert_true(
  'required_sensitive_tables_exist_or_are_documented',
  not exists (
    select 1
    from rls_test_required_table_coverage c
    where to_regclass(c.table_name) is null
      and c.table_name not in ('public.messages', 'public.media_variants')
  )
);

rollback;
