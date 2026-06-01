'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert                        = require('node:assert/strict');
const { RateLimiter, SlidingWindow, TokenBucket } = require('../../../middlewares/abuse/RateLimiter');
const { InMemoryStore }             = require('../../../middlewares/abuse/StoreAdapter');

describe('SlidingWindow', () => {
  /** @type {InMemoryStore} */ let store;

  beforeEach(() => { store = new InMemoryStore(); });

  it('permite requisições dentro do limite', async () => {
    const sw = new SlidingWindow({ store, windowMs: 60_000, max: 5 });
    for (let i = 0; i < 5; i++) {
      const r = await sw.consume('u1');
      assert.equal(r.allowed, true, `tentativa ${i + 1} deve ser permitida`);
    }
  });

  it('bloqueia quando o limite é excedido', async () => {
    const sw = new SlidingWindow({ store, windowMs: 60_000, max: 3 });
    for (let i = 0; i < 3; i++) await sw.consume('u2');
    const r = await sw.consume('u2');
    assert.equal(r.allowed, false, 'deve bloquear na 4ª requisição');
    assert.equal(r.remaining, 0);
  });

  it('chaves distintas têm contadores independentes', async () => {
    const sw = new SlidingWindow({ store, windowMs: 60_000, max: 2 });
    const a = await sw.consume('a');
    const b = await sw.consume('b');
    assert.equal(a.allowed, true);
    assert.equal(b.allowed, true);
  });

  it('reset limpa o contador', async () => {
    const sw = new SlidingWindow({ store, windowMs: 60_000, max: 2 });
    await sw.consume('r1'); await sw.consume('r1');
    assert.equal((await sw.consume('r1')).allowed, false);
    await sw.reset('r1');
    assert.equal((await sw.consume('r1')).allowed, true);
  });

  it('retorna remaining correto', async () => {
    const sw = new SlidingWindow({ store, windowMs: 60_000, max: 5 });
    const r1 = await sw.consume('x');
    const r2 = await sw.consume('x');
    assert.equal(r1.remaining, 4);
    assert.equal(r2.remaining, 3);
  });
});

describe('TokenBucket', () => {
  /** @type {InMemoryStore} */ let store;

  beforeEach(() => { store = new InMemoryStore(); });

  it('permite até a capacidade máxima inicialmente', async () => {
    const tb = new TokenBucket({ store, capacity: 3, refillPerSec: 1 });
    for (let i = 0; i < 3; i++) {
      const r = await tb.consume('u');
      assert.equal(r.allowed, true, `tentativa ${i + 1} deve ser permitida`);
    }
  });

  it('bloqueia quando bucket está vazio', async () => {
    const tb = new TokenBucket({ store, capacity: 2, refillPerSec: 0.1 });
    await tb.consume('u'); await tb.consume('u');
    const r = await tb.consume('u');
    assert.equal(r.allowed, false);
  });

  it('reporta remaining correto', async () => {
    const tb = new TokenBucket({ store, capacity: 5, refillPerSec: 1 });
    const r = await tb.consume('u');
    assert.equal(r.allowed, true);
    assert.ok(r.remaining >= 3 && r.remaining <= 4, `remaining=${r.remaining} fora do range esperado`);
  });

  it('rejeita strategy não-RateLimiterStrategy via RateLimiter wrapper', () => {
    assert.throws(
      () => new RateLimiter({}),
      /strategy deve ser RateLimiterStrategy/,
    );
  });
});

describe('RateLimiter (contexto Strategy)', () => {
  it('delega consume à strategy injetada', async () => {
    const store = new InMemoryStore();
    const sw    = new SlidingWindow({ store, windowMs: 60_000, max: 10 });
    const rl    = new RateLimiter(sw);
    const r     = await rl.consume('delegate-test');
    assert.equal(r.allowed, true);
  });

  it('delega reset à strategy injetada', async () => {
    const store = new InMemoryStore();
    const sw    = new SlidingWindow({ store, windowMs: 60_000, max: 1 });
    const rl    = new RateLimiter(sw);
    await rl.consume('r');
    await rl.consume('r'); // over limit
    await rl.reset('r');
    const after = await rl.consume('r');
    assert.equal(after.allowed, true);
  });
});
