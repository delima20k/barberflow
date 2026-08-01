'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class RepositoryFixture {
  static load() {
    const root = path.resolve(__dirname, '..');
    const context = vm.createContext({ globalThis: {} });
    ['services/MockAnalyticsDataSource.js', 'services/AnalyticsRepository.js']
      .forEach((relativePath) => vm.runInContext(
        fs.readFileSync(path.join(root, relativePath), 'utf8'),
        context,
      ));
    return context.globalThis.AnalyticsRepository;
  }
}

describe('AnalyticsRepository', () => {
  it('deve normalizar sessoes e timelines retornadas pela RPC', async () => {
    const AnalyticsRepository = RepositoryFixture.load();
    const client = {
      schema(schemaName) {
        assert.equal(schemaName, 'analytics');
        return { rpc: async (functionName) => {
          assert.equal(functionName, 'get_analytics_sessions');
          return {
          data: [{
            session_id: 'session-1',
            visitor_id: 'visitor-1',
            started_at: '2026-07-30T10:00:00.000Z',
            last_activity_at: '2026-07-30T10:05:00.000Z',
            ended_at: null,
            duration_seconds: 300,
            status: 'active',
            source: 'instagram',
            campaign: 'campaign',
            device: 'mobile',
            events: [{
              id: 'event-1',
              session_id: 'session-1',
              visitor_id: 'visitor-1',
              event_name: 'landing_view',
              event_description: 'Landing aberta',
              source: 'instagram',
              campaign: 'campaign',
              device: 'mobile',
              created_at: '2026-07-30T10:00:00.000Z',
            }],
          }],
          error: null,
          };
        } };
      },
    };
    const repository = new AnalyticsRepository(
      client,
      null,
      { isDemo: () => false, pageSize: 12 },
    );

    const sessions = await repository.sessions();

    assert.equal(sessions[0].sessionId, 'session-1');
    assert.equal(sessions[0].events[0].eventName, 'landing_view');
  });
});
