'use strict';

const { describe, it } = require('node:test');
const assert           = require('node:assert/strict');
const { MemoryCache }         = require('../../../../infrastructure/cache/MemoryCache');
const { CacheMetrics }        = require('../../../../infrastructure/cache/CacheMetrics');
const { SingleFlightCache }   = require('../../../../infrastructure/cache/SingleFlightCache');
const { CacheAsideStrategy }  = require('../../../../infrastructure/cache/strategies/CacheAsideStrategy');

function make() {
  const metrics = new CacheMetrics();
  const cache   = new SingleFlightCache({ cache: new MemoryCache(), metrics });
  return { cache, metrics, strategy: new CacheAsideStrategy({ cache, metrics }) };
}

describe('CacheAsideStrategy', () => {
  it('lança TypeError sem cache', () => {
    assert.throws(
      () => new CacheAsideStrategy({ cache: null, metrics: new CacheMetrics() }),
      /cache é obrigatório/,
    );
  });

  it('retorna dado do cache em hit', async () => {
    const { cache, strategy } = make();
    await cache.set('k', 'cached', 60);
    let calls = 0;
    const v = await strategy.read('k', () => { calls++; return Promise.resolve('fresh'); }, 60);
    assert.equal(v, 'cached');
    assert.equal(calls, 0);
  });

  it('busca na fonte em miss e popula cache', async () => {
    const { strategy, cache } = make();
    let calls = 0;
    const v = await strategy.read('k', () => { calls++; return Promise.resolve('fresh'); }, 60);
    assert.equal(v, 'fresh');
    assert.equal(calls, 1);
    // Deve estar no cache agora
    assert.equal(await cache.get('k'), 'fresh');
  });

  it('invalidate remove a chave', async () => {
    const { cache, strategy } = make();
    await cache.set('k', 'v', 60);
    await strategy.invalidate('k');
    assert.equal(await cache.get('k'), null);
  });

  it('invalidateByPrefix remove chaves com o prefixo', async () => {
    const { cache, strategy } = make();
    await cache.set('bf:ctx:e:id1:v1', 'a', 60);
    await cache.set('bf:ctx:e:id2:v1', 'b', 60);
    await cache.set('other:key', 'c', 60);
    await strategy.invalidateByPrefix('bf:ctx:e:');
    assert.equal(await cache.get('bf:ctx:e:id1:v1'), null);
    assert.equal(await cache.get('bf:ctx:e:id2:v1'), null);
    assert.equal(await cache.get('other:key'), 'c');
  });

  it('registra eviction nas métricas ao invalidar', async () => {
    const { cache, metrics, strategy } = make();
    await cache.set('k', 'v', 60);
    await strategy.invalidate('k');
    assert.equal(metrics.getSnapshot().evictions, 1);
  });
});
