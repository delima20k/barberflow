'use strict';

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');

// ─────────────────────────────────────────────────────────────────────────────
// LoggerService — instancia sem lançar exceção
// ─────────────────────────────────────────────────────────────────────────────
suite('LoggerService', () => {

  test('importa sem lançar exceção', () => {
    assert.doesNotThrow(() => require('../src/infra/LoggerService'));
  });

  test('possui os métodos de log esperados', () => {
    const logger = require('../src/infra/LoggerService');
    for (const metodo of ['info', 'warn', 'error', 'debug', 'fatal']) {
      assert.strictEqual(typeof logger[metodo], 'function', `logger.${metodo} deve ser function`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RateLimitMiddleware — exporta os 3 limiters
// ─────────────────────────────────────────────────────────────────────────────
suite('RateLimitMiddleware', () => {

  test('exporta limiterGeral, limiterAuth e limiterEscrita', () => {
    const RL = require('../src/infra/RateLimitMiddleware');
    assert.strictEqual(typeof RL.geral,   'function', 'geral deve ser middleware');
    assert.strictEqual(typeof RL.auth,    'function', 'auth deve ser middleware');
    assert.strictEqual(typeof RL.escrita, 'function', 'escrita deve ser middleware');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RequestTimeoutMiddleware — funciona como middleware Express
// ─────────────────────────────────────────────────────────────────────────────
suite('RequestTimeoutMiddleware', () => {

  test('exporta handle como função de 3 argumentos (req, res, next)', () => {
    const RTM = require('../src/infra/RequestTimeoutMiddleware');
    assert.strictEqual(typeof RTM.handle, 'function');
    assert.strictEqual(RTM.handle.length, 3);
  });

  test('chama next() e define timer que pode ser cancelado', (t, done) => {
    const { handle } = require('../src/infra/RequestTimeoutMiddleware');

    const events = {};
    const res = {
      headersSent: false,
      status() { return this; },
      json()   { return this; },
      on(event, fn) { events[event] = fn; },
    };

    handle({}, res, () => {
      if (events['finish']) events['finish']();
      done();
    });
  });

  test('responde 503 quando timeout expira', (t, done) => {
    process.env.REQUEST_TIMEOUT_MS = '50';

    delete require.cache[require.resolve('../src/infra/RequestTimeoutMiddleware')];
    const { handle } = require('../src/infra/RequestTimeoutMiddleware');

    const res = {
      headersSent: false,
      _status: null,
      _body:   null,
      on() {},
      status(s) { this._status = s; return this; },
      json(b)   { this._body = b;   return this; },
    };

    handle({}, res, () => {
      setTimeout(() => {
        assert.strictEqual(res._status, 503);
        assert.strictEqual(res._body.ok, false);
        delete process.env.REQUEST_TIMEOUT_MS;
        delete require.cache[require.resolve('../src/infra/RequestTimeoutMiddleware')];
        done();
      }, 100);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// app.js — monta sem lançar exceção (sem banco real)
// ─────────────────────────────────────────────────────────────────────────────
suite('criarApp()', () => {

  test('importa e monta app sem exceção com env vars mockadas', () => {
    process.env.SUPABASE_URL              = process.env.SUPABASE_URL              ?? 'https://mock.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'mock-key';
    process.env.MEDIA_SIGNING_SECRET      = process.env.MEDIA_SIGNING_SECRET      ?? 'mock-media-signing-secret-32chars!!';
    process.env.R2_ACCOUNT_ID             = process.env.R2_ACCOUNT_ID             ?? 'mock-account-id';
    process.env.R2_ACCESS_KEY_ID          = process.env.R2_ACCESS_KEY_ID          ?? 'mock-access-key-id';
    process.env.R2_SECRET_ACCESS_KEY      = process.env.R2_SECRET_ACCESS_KEY      ?? 'mock-secret-access-key';
    process.env.R2_BUCKET_NAME            = process.env.R2_BUCKET_NAME            ?? 'mock-bucket';

    // Limpa cache para pegar o módulo atualizado
    Object.keys(require.cache)
      .filter(k => k.includes('src\\app') || k.includes('src/app'))
      .forEach(k => delete require.cache[k]);

    assert.doesNotThrow(() => {
      const criarApp = require('../src/app');
      criarApp();
    });
  });
});
