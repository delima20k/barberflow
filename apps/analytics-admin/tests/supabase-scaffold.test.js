'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

class SupabaseScaffoldFixture {
  static root = path.resolve(__dirname, '..', '..', '..');

  static source(relativePath) {
    return fs.readFileSync(path.join(this.root, relativePath), 'utf8');
  }
}

describe('Supabase Analytics scaffold', () => {
  it('deve manter migrations no schema analytics do projeto compartilhado', () => {
    const schema = SupabaseScaffoldFixture.source(
      'supabase/migrations/20260731000001_create_analytics_schema.sql',
    );
    const tables = SupabaseScaffoldFixture.source(
      'supabase/migrations/20260731000002_create_analytics_tables.sql',
    );
    const rls = SupabaseScaffoldFixture.source(
      'supabase/migrations/20260731000006_create_analytics_rls.sql',
    );

    assert.match(schema, /create schema if not exists analytics/i);
    assert.match(tables, /analytics\.analytics_events/i);
    assert.match(rls, /enable row level security/i);
    assert.doesNotMatch(`${schema}\n${tables}`, /create table[^;]+public\.analytics_/i);
    assert.doesNotMatch(tables, /\bprofiles\b|\bbarbershops\b|\bprofessionals\b|\bqueue_entries\b/i);
  });

  it('deve falhar fechada e limitar o payload na Edge Function compartilhada', () => {
    const edge = SupabaseScaffoldFixture.source('supabase/functions/collect-event/index.ts');
    const validator = SupabaseScaffoldFixture.source(
      'analytics/src/validators/AnalyticsEventValidator.mjs',
    );

    assert.match(edge, /ANALYTICS_HMAC_SECRET|hmacSecret/);
    assert.match(edge, /isPayloadWithinLimit/);
    assert.match(validator, /#EVENTS/);
    assert.match(edge, /\.schema\('analytics'\)|AnalyticsRepository/);
    assert.doesNotMatch(edge, /jfvjisqnzapxxagkbxcu|barberflow-bff/i);
  });
});
