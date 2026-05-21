'use strict';

const { describe, it } = require('node:test');
const assert           = require('node:assert/strict');
const { MemoryCache }         = require('../../../../infrastructure/cache/MemoryCache');
const { CacheMetrics }        = require('../../../../infrastructure/cache/CacheMetrics');
const { SingleFlightCache }   = require('../../../../infrastructure/cache/SingleFlightCache');
const { WriteBehindStrategy } = require('../../../../infrastructure/cache/strategies/WriteBehindStrategy');

function make() {
  const metrics = new CacheMetrics();
  const cache   = new SingleFlightCache({ cache: new MemoryCache(), metrics });
  return { cache, metrics, strategy: new WriteBehindStrategy({ cache, metrics }) };
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

describe('WriteBehindStrategy', () => {
  it('write popula cache imediatamente', async () => {
    const { cache, strategy } = make();
    let persisted = false;
    // persistFn demora 50ms mas cache deve estar pronto ANTES
    await strategy.write('k', 'value', async () => { await delay(50); persisted = true; }, 60);
    assert.equal(await cache.get('k'), 'value');
    // persistFn ainda não rodou (apenas setImmediate foi agendado)
    assert.equal(persisted, false);
    // aguardar persistência
    await delay(80);
    assert.equal(persisted, true);
  });

  it('falha na persistência remove a chave do cache após retries', async () => {
    const { cache, strategy } = make();
    let calls = 0;
    await strategy.write('k', 'v', async () => { calls++; throw new Error('fail'); }, 60);
    // Aguardar 3 retries: 200ms + 400ms + 600ms → ~1200ms + margem
    await delay(1500);
    // Após falha definitiva, a chave deve ter sido removida do cache
    assert.equal(await cache.get('k'), null);
    assert.equal(calls, 3);
  });

  it('read com cache hit não chama fetchFn', async () => {
    const { cache, strategy } = make();
    await cache.set('k', 'cached', 60);
    let calls = 0;
    const v = await strategy.read('k', () => { calls++; return Promise.resolve('new'); }, 60);
    assert.equal(v, 'cached');
    assert.equal(calls, 0);
  });

  it('invalidate remove a chave', async () => {
    const { cache, strategy } = make();
    await cache.set('k', 'v', 60);
    await strategy.invalidate('k');
    assert.equal(await cache.get('k'), null);
  });
});
