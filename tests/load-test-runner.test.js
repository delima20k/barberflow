'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const LoadTestConfig = require('../load-tests/lib/LoadTestConfig');
const LoadTestMetrics = require('../load-tests/lib/LoadTestMetrics');
const LoadTestRunner = require('../load-tests/lib/LoadTestRunner');

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

  it('deve usar a BFF de producao como alvo padrao', () => {
    const config = new LoadTestConfig({
      args: ['--vus=1', '--duration=1'],
      env: {},
    });

    assert.equal(config.baseUrl, 'https://bff.berberflow.shop');
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

  it('deve registrar skips sem contar como erro', () => {
    const metrics = new LoadTestMetrics();
    metrics.skip('auth_me', 'LOADTEST_ACCESS_TOKEN ausente');

    const summary = metrics.summary({
      config: { baseUrl: 'https://bff.berberflow.shop', scenario: 'all', stage: 'prod-smoke', vus: 1, durationSeconds: 1, prefix: 'loadtest_20260608_prod_smoke' },
    });

    assert.equal(summary.totalErrors, 0);
    assert.equal(summary.skipped.auth_me, 'LOADTEST_ACCESS_TOKEN ausente');
  });

  it('deve permitir status protegidos em endpoints opcionais sem contar erro', () => {
    const metrics = new LoadTestMetrics();
    metrics.record({ name: 'metrics_final', method: 'GET', path: '/metrics', status: 403, durationMs: 12, ignored: true });

    const summary = metrics.summary({
      config: { baseUrl: 'https://bff.berberflow.shop', scenario: 'all', stage: 'prod-smoke', vus: 1, durationSeconds: 1, prefix: 'loadtest_20260608_prod_smoke' },
    });

    assert.equal(summary.totalErrors, 0);
    assert.equal(summary.totalRequests, 0);
    assert.equal(summary.optionalRequests, 1);
    assert.equal(summary.endpoints['GET /metrics'].statuses['403'], 1);
  });
});

describe('LoadTestRunner', () => {
  it('deve continuar a carga quando metrics_before falha', async () => {
    const calls = [];
    const config = new LoadTestConfig({
      args: ['--vus=1', '--duration=1', '--stage=metrics-best-effort', '--think-time=1'],
      env: {},
      now: new Date('2026-06-08T10:00:00Z'),
    });
    const runner = new LoadTestRunner({
      config,
      createClient: ({ metrics }) => ({
        async get(path, options = {}) {
          calls.push({ path, options });
          if (path === '/metrics' && options.name === 'metrics_before') {
            metrics.record({
              name: options.name,
              method: 'GET',
              path,
              status: 0,
              durationMs: options.timeoutMs,
              error: 'timeout',
              ignored: true,
            });
            return { ok: false, status: 0, error: 'timeout' };
          }
          metrics.record({
            name: options.name ?? path,
            method: 'GET',
            path,
            status: 200,
            durationMs: 5,
            ignored: Boolean(options.optional),
          });
          return { ok: true, status: 200, body: path === '/metrics' ? '' : {} };
        },
        skip(name, reason) {
          metrics.skip(name, reason);
        },
      }),
      writeSummary: false,
    });

    const { summary } = await runner.run();

    assert.equal(summary.metricsBefore.available, false);
    assert.equal(summary.metricsBefore.metricsError, 'timeout');
    assert.equal(summary.totalErrors, 0);
    assert.ok(summary.totalRequests > 0);
    assert.ok(calls.some(call => call.path === '/api/v1/barbearias/destaque?limit=5'));
  });

  it('deve usar timeout curto e opcional para coleta de metrics', async () => {
    const config = new LoadTestConfig({
      args: ['--vus=1', '--duration=1', '--stage=metrics-timeout', '--think-time=1'],
      env: {},
    });
    const runner = new LoadTestRunner({
      config,
      createClient: ({ metrics }) => ({
        async get(path, options = {}) {
          metrics.record({
            name: options.name ?? path,
            method: 'GET',
            path,
            status: 200,
            durationMs: 1,
            ignored: Boolean(options.optional),
          });
          return { ok: true, status: 200, body: path === '/metrics' ? '' : {} };
        },
        skip() {},
      }),
      writeSummary: false,
    });

    const { summary } = await runner.run();

    assert.equal(summary.metricsBefore.timeoutMs, 3000);
    assert.equal(summary.metricsAfter.timeoutMs, 3000);
    assert.equal(summary.optionalRequests >= 2, true);
  });
});
