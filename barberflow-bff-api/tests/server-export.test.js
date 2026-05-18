'use strict';

/**
 * server-export.test.js
 *
 * Verifica que server.js exporta um Express app válido quando executado
 * em modo serverless (VERCEL=1), sem chamar app.listen().
 *
 * Isso garante que o Vercel consiga usar server.js como serverless entry
 * mesmo quando api/index.js não está sendo usado como entry point.
 */

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');

// Simula ambiente Vercel ANTES de importar server.js,
// para evitar que app.listen() seja chamado durante o teste.
process.env.VERCEL                    = '1';
process.env.APP_ENV                   = 'test';
process.env.SUPABASE_URL              = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.SUPABASE_ANON_KEY         = 'test-anon-key';

suite('server.js — modo serverless (VERCEL=1)', () => {
  test('module.exports é um Express app com métodos use() e handle()', () => {
    const handler = require('../server');

    assert.ok(handler !== undefined,           'module.exports deve existir');
    assert.equal(typeof handler,        'function', 'Express app é uma função');
    assert.equal(typeof handler.use,    'function', 'deve ter método .use()');
    assert.equal(typeof handler.handle, 'function', 'deve ter método .handle()');
  });

  test('não chama listen() em modo serverless — sem porta aberta', () => {
    const net     = require('node:net');
    const config  = require('../config');

    // Em modo VERCEL=1, server.js não deve ter aberto nenhuma porta.
    // Tenta conectar na porta default do BFF — deve falhar (ECONNREFUSED).
    const socket = net.createConnection({ port: config.port, host: '127.0.0.1' });

    return new Promise((resolve) => {
      socket.on('error', (err) => {
        assert.equal(err.code, 'ECONNREFUSED', 'porta deve estar fechada em modo serverless');
        resolve();
      });
      socket.on('connect', () => {
        socket.destroy();
        assert.fail('listen() foi chamado — porta está aberta em modo serverless');
      });
    });
  });
});
