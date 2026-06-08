'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const LoadTestConfig = require('../load-tests/lib/LoadTestConfig');
const LoadTestMetrics = require('../load-tests/lib/LoadTestMetrics');

describe('LoadTestConfig', () => {
  it('deve aceitar somente etapas de VUs autorizadas', () => {
    const config = new LoadTestConfig({
      args: ['--vus=7', '--duration=1', '--stage=7vus'],
      env: {},
      now: new Date('2026-06-08T10:00:00Z'),
    });

    assert.equal(config.vus, 7);
    assert.equal(config.prefix, 'loadtest_20260608_7vus');
    assert.equal(config.thinkTimeMs, 250);
  });

  it('deve bloquear VUs fora da carga autorizada', () => {
    assert.throws(() => new LoadTestConfig({
      args: ['--vus=8', '--duration=1'],
      env: {},
    }), /VUs nao autorizados/);
  });

  it('deve impedir push sem escrita explicitamente habilitada', () => {
    assert.throws(() => new LoadTestConfig({
      args: ['--vus=1', '--duration=1', '--enable-push=true'],
      env: {},
    }), /LOADTEST_ENABLE_PUSH exige/);
  });
});

describe('LoadTestMetrics', () => {
  it('deve calcular percentis e taxa de erro por endpoint', () => {
    const metrics = new LoadTestMetrics();
    metrics.record({ name: 'health', method: 'GET', path: '/api/v1/health', status: 200, durationMs: 10 });
    metrics.record({ name: 'health', method: 'GET', path: '/api/v1/health', status: 500, durationMs: 30 });
    metrics.recordResourceSample();

    const summary = metrics.summary({
      config: { baseUrl: 'http://127.0.0.1:3002', scenario: 'all', stage: 'smoke', vus: 1, durationSeconds: 1, prefix: 'loadtest_20260608_smoke' },
    });

    assert.equal(summary.totalRequests, 2);
    assert.equal(summary.totalErrors, 1);
    assert.equal(summary.endpoints['GET /api/v1/health'].p95Ms, 30);
  });
});
