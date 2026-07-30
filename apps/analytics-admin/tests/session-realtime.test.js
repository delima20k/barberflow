'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

class RealtimeContractFixture {
  static source(relativePath) {
    return fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');
  }
}

describe('Session and Realtime contracts', () => {
  it('deve usar timeout de trinta minutos sem polling', () => {
    const config = RealtimeContractFixture.source('config/admin-config.js');
    const realtime = RealtimeContractFixture.source('services/RealtimeAnalyticsService.js');

    assert.match(config, /sessionTimeoutMinutes:\s*30/);
    assert.doesNotMatch(realtime, /setInterval|setTimeout\s*\(\s*async/);
  });

  it('deve preparar Presence privado com leitura exclusiva de administradores', () => {
    const presence = RealtimeContractFixture.source('services/PresenceService.js');
    const migration = RealtimeContractFixture.source(
      'supabase/migrations/20260730000001_create_analytics_admin.sql',
    );

    assert.match(presence, /private:\s*true/);
    assert.match(migration, /realtime\.messages/i);
    assert.match(migration, /is_anonymous/i);
    assert.match(migration, /is_analytics_admin/i);
  });
});
