import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

class AnalyticsSchemaFixture {
  static #MIGRATIONS = Object.freeze([
    '../../supabase/migrations/20260731000001_create_analytics_schema.sql',
    '../../supabase/migrations/20260731000002_create_analytics_tables.sql',
    '../../supabase/migrations/20260731000003_create_analytics_indexes.sql',
    '../../supabase/migrations/20260731000004_create_analytics_functions.sql',
    '../../supabase/migrations/20260731000005_create_analytics_rpcs.sql',
    '../../supabase/migrations/20260731000006_create_analytics_rls.sql',
    '../../supabase/migrations/20260731000007_create_analytics_retention.sql',
  ]);

  static #TABLES = Object.freeze([
    'analytics_admins',
    'analytics_events',
    'analytics_sessions',
    'analytics_rate_limits',
    'analytics_idempotency_keys',
    'analytics_daily_metrics',
    'analytics_funnel_metrics',
  ]);

  static #RPCS = Object.freeze([
    'get_analytics_overview',
    'get_analytics_funnel',
    'get_analytics_sessions',
    'get_analytics_top_ctas',
    'get_analytics_scroll_depth',
    'get_analytics_sources',
    'get_analytics_realtime_summary',
  ]);

  constructor() {
    this.migrations = AnalyticsSchemaFixture.#MIGRATIONS.map((path) =>
      fs.readFileSync(new URL(path, import.meta.url), 'utf8'),
    );
    this.sql = this.migrations.join('\n');
    this.collector = fs.readFileSync(
      new URL('../../supabase/functions/collect-event/index.ts', import.meta.url),
      'utf8',
    );
    this.repository = fs.readFileSync(
      new URL('../src/repositories/AnalyticsRepository.mjs', import.meta.url),
      'utf8',
    );
    this.landing = [
      '../../apps/landing-page/js/analytics-tracker.js',
      '../../apps/landing-page/js/analytics.js',
      '../../apps/landing-page/js/main.js',
    ].map((path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');
  }

  get tables() { return AnalyticsSchemaFixture.#TABLES; }
  get rpcs() { return AnalyticsSchemaFixture.#RPCS; }
}

test('migrations criam somente tabelas analytics no schema isolado com RLS', () => {
  const fixture = new AnalyticsSchemaFixture();

  assert.match(fixture.sql, /create schema if not exists analytics/i);
  for (const table of fixture.tables) {
    assert.match(fixture.sql, new RegExp(`create table if not exists analytics\\.${table}`, 'i'));
    assert.match(fixture.sql, new RegExp(`alter table analytics\\.${table} enable row level security`, 'i'));
  }
  assert.doesNotMatch(fixture.sql, /create table(?: if not exists)? public\.analytics_/i);
  assert.doesNotMatch(fixture.sql, /(?:alter|drop|truncate) table public\.(?:profiles|barbershops|professionals|services|appointments|queue_entries)/i);
});

test('admin do Analytics reutiliza auth.users e acesso exige status ativo', () => {
  const fixture = new AnalyticsSchemaFixture();

  assert.match(fixture.sql, /user_id uuid primary key references auth\.users\s*\(id\)/i);
  assert.match(fixture.sql, /from analytics\.analytics_admins[\s\S]*active = true/i);
  assert.match(fixture.sql, /revoke all on schema analytics from public, anon/i);
  assert.match(fixture.sql, /revoke all on all tables in schema analytics from public, anon, authenticated/i);
});

test('RPCs do painel consultam exclusivamente o schema analytics', () => {
  const fixture = new AnalyticsSchemaFixture();

  for (const rpc of fixture.rpcs) {
    assert.match(fixture.sql, new RegExp(`function analytics\\.${rpc}`, 'i'));
  }
  assert.doesNotMatch(fixture.sql, /function public\.get_analytics_/i);
  assert.doesNotMatch(fixture.sql, /\bfrom public\.analytics_/i);
});

test('collector grava pelo schema analytics e mantém barreiras de segurança', () => {
  const fixture = new AnalyticsSchemaFixture();

  for (const rule of [
    "method !== 'POST'",
    'isAllowedOrigin',
    'isPayloadWithinLimit',
    'AnalyticsEventValidator',
    'emailHmac',
    'ipHash',
  ]) assert.match(fixture.collector, new RegExp(rule));

  assert.match(fixture.repository, /schema\('analytics'\)/);
  assert.match(fixture.repository, /collect_analytics_event/);
  assert.doesNotMatch(fixture.collector, /console\.log\([^)]*email/i);
  assert.match(fixture.collector, /delete normalized\.email/);
  assert.match(fixture.sql, /consume_analytics_rate_limit\(\s*'ip'/i);
  assert.match(fixture.sql, /consume_analytics_rate_limit\(\s*'session'/i);
  assert.match(fixture.sql, /analytics\.analytics_idempotency_keys/i);
});

test('landing acessa somente collect-event e nunca tabelas ou RPCs Analytics', () => {
  const fixture = new AnalyticsSchemaFixture();

  assert.match(fixture.landing, /analyticsCollectorUrl/);
  assert.doesNotMatch(fixture.landing, /\.schema\(['"]analytics['"]\)/);
  assert.doesNotMatch(fixture.landing, /\.from\(['"]analytics_/);
  assert.doesNotMatch(fixture.landing, /\.rpc\(/);
});

test('retenção fica preparada sem agendamento automático', () => {
  const fixture = new AnalyticsSchemaFixture();

  assert.match(fixture.sql, /interval '90 days'/i);
  assert.match(fixture.sql, /interval '180 days'/i);
  assert.match(fixture.sql, /function analytics\.cleanup_analytics_data/i);
  assert.doesNotMatch(fixture.sql, /cron\.schedule|pg_cron/i);
});
