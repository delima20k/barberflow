'use strict';

const { describe, it } = require('node:test');
const assert           = require('node:assert/strict');
const { MemoryCache }          = require('../../../infrastructure/cache/MemoryCache');
const { CacheMetrics }         = require('../../../infrastructure/cache/CacheMetrics');
const { SingleFlightCache }    = require('../../../infrastructure/cache/SingleFlightCache');
const { IdempotencyMiddleware } = require('../../../interfaces/bff/middlewares/IdempotencyMiddleware');

function makeSFC() {
  return new SingleFlightCache({ cache: new MemoryCache(), metrics: new CacheMetrics() });
}

function makeResMock() {
  const res = {
    statusCode: 200,
    _body: null,
    _headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this._body = body; return this; },
    setHeader(k, v) { this._headers[k] = v; },
  };
  return res;
}

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('IdempotencyMiddleware', () => {
  it('lança TypeError se cache ausente', () => {
    assert.throws(() => new IdempotencyMiddleware({ cache: null }), /cache é obrigatório/);
  });

  it('sem header Idempotency-Key chama next()', async () => {
    const mw = new IdempotencyMiddleware({ cache: makeSFC() });
    let nextCalled = false;
    const req = { headers: {} };
    const res = makeResMock();
    await mw.handler()(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });

  it('Idempotency-Key inválida retorna 400', async () => {
    const mw = new IdempotencyMiddleware({ cache: makeSFC() });
    const req = { headers: { 'idempotency-key': 'not-a-uuid' } };
    const res = makeResMock();
    await mw.handler()(req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.ok(res._body?.error?.includes('UUID'));
  });

  it('nova chave chama next() e armazena resposta', async () => {
    const mw = new IdempotencyMiddleware({ cache: makeSFC() });
    const req = { headers: { 'idempotency-key': VALID_UUID } };
    const res = makeResMock();
    let nextCalled = false;

    await mw.handler()(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);

    // Simular resposta do handler de rota
    await res.json({ created: true });
  });

  it('segunda chamada com mesma chave retorna resposta cacheada sem chamar next()', async () => {
    const cache = makeSFC();
    const mw    = new IdempotencyMiddleware({ cache });
    const handler = mw.handler();
    const req = { headers: { 'idempotency-key': VALID_UUID } };

    // Primeira chamada — processa e armazena
    const res1 = makeResMock();
    await handler(req, res1, () => {});
    await res1.json({ id: 'abc' });

    // Segunda chamada — deve reproduzir resposta cacheada
    const res2 = makeResMock();
    let nextCalled = false;
    await handler(req, res2, () => { nextCalled = true; });

    assert.equal(nextCalled, false, 'next não deve ser chamado para chave repetida');
    assert.equal(res2._headers['X-Idempotent-Replayed'], 'true');
    assert.deepEqual(res2._body, { id: 'abc' });
  });

  it('respostas 5xx não são cacheadas', async () => {
    const cache = makeSFC();
    const mw    = new IdempotencyMiddleware({ cache });
    const handler = mw.handler();
    const req = { headers: { 'idempotency-key': VALID_UUID } };

    // Simular erro 500
    const res1 = makeResMock();
    res1.statusCode = 500;
    await handler(req, res1, () => {});
    await res1.json({ error: 'internal' });

    // Segunda chamada deve chamar next() normalmente (não replay)
    const res2 = makeResMock();
    let nextCalled = false;
    await handler(req, res2, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });
});
