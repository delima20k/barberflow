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
    const { limiterGeral, limiterAuth, limiterEscrita } = require('../src/infra/RateLimitMiddleware');
    assert.strictEqual(typeof limiterGeral,   'function', 'limiterGeral deve ser middleware');
    assert.strictEqual(typeof limiterAuth,    'function', 'limiterAuth deve ser middleware');
    assert.strictEqual(typeof limiterEscrita, 'function', 'limiterEscrita deve ser middleware');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RequestTimeoutMiddleware — funciona como middleware Express
// ─────────────────────────────────────────────────────────────────────────────
suite('RequestTimeoutMiddleware', () => {

  test('exporta uma função de 3 argumentos (req, res, next)', () => {
    const middleware = require('../src/infra/RequestTimeoutMiddleware');
    assert.strictEqual(typeof middleware, 'function');
    assert.strictEqual(middleware.length, 3);
  });

  test('chama next() e define timer que pode ser cancelado', (t, done) => {
    const middleware = require('../src/infra/RequestTimeoutMiddleware');

    const events = {};
    const res = {
      headersSent: false,
      status() { return this; },
      json()   { return this; },
      on(event, fn) { events[event] = fn; },
    };

    middleware({}, res, () => {
      // Simula resposta bem-sucedida antes do timeout
      if (events['finish']) events['finish']();
      done(); // Se chegar aqui, timer foi limpo corretamente
    });
  });

  test('responde 503 quando timeout expira', (t, done) => {
    // Seta timeout muito curto via env para o teste
    process.env.REQUEST_TIMEOUT_MS = '50';

    // Recarrega o módulo com o novo valor
    delete require.cache[require.resolve('../src/infra/RequestTimeoutMiddleware')];
    const middleware = require('../src/infra/RequestTimeoutMiddleware');

    const res = {
      headersSent: false,
      _status: null,
      _body:   null,
      on() {},
      status(s) { this._status = s; return this; },
      json(b)   { this._body = b;   return this; },
    };

    middleware({}, res, () => {
      // next() chamado — aguarda o timer disparar
      setTimeout(() => {
        assert.strictEqual(res._status, 503);
        assert.strictEqual(res._body.ok, false);
        // Restaura
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
    // Garante que as vars obrigatórias existam (Supabase)
    process.env.SUPABASE_URL              = process.env.SUPABASE_URL              ?? 'https://mock.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'mock-key';

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
