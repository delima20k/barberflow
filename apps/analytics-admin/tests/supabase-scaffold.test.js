'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

class SupabaseScaffoldFixture {
  static source(relativePath) {
    return fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');
  }
}

describe('Supabase Analytics scaffold', () => {
  it('deve manter migration idempotente e restrita ao contexto analytics', () => {
    const migration = SupabaseScaffoldFixture.source(
      'supabase/migrations/20260730000001_create_analytics_admin.sql',
    );

    assert.match(migration, /create table if not exists public\.analytics_events/i);
    assert.match(migration, /add column if not exists session_id/i);
    assert.match(migration, /drop policy if exists/i);
    assert.match(migration, /create or replace function public\.is_analytics_admin/i);
    assert.match(migration, /drop trigger if exists/i);
    assert.doesNotMatch(migration, /\bprofiles\b|\bbarbershops\b|\bprofessionals\b|\bqueue_entries\b/i);
  });

  it('deve falhar fechada sem configuracao e limitar payload', () => {
    const edge = SupabaseScaffoldFixture.source(
      'supabase/functions/collect-analytics-event/index.ts',
    );
    const validator = SupabaseScaffoldFixture.source(
      'supabase/functions/_shared/event-validator.ts',
    );

    assert.match(edge, /503/);
    assert.match(edge, /ANALYTICS_HMAC_SECRET/);
    assert.match(validator, /MAX_BODY_BYTES/);
    assert.match(validator, /ESSENTIAL_EVENTS/);
    assert.doesNotMatch(edge, /jfvjisqnzapxxagkbxcu|barberflow-bff/i);
  });
});
