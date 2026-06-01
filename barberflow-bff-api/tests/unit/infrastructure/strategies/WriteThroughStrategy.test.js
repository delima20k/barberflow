'use strict';

const { describe, it } = require('node:test');
const assert           = require('node:assert/strict');
const { MemoryCache }          = require('../../../../infrastructure/cache/MemoryCache');
const { CacheMetrics }         = require('../../../../infrastructure/cache/CacheMetrics');
const { SingleFlightCache }    = require('../../../../infrastructure/cache/SingleFlightCache');
const { WriteThroughStrategy } = require('../../../../infrastructure/cache/strategies/WriteThroughStrategy');

function make() {
  const metrics = new CacheMetrics();
  const cache   = new SingleFlightCache({ cache: new MemoryCache(), metrics });
  return { cache, metrics, strategy: new WriteThroughStrategy({ cache, metrics }) };
}

describe('WriteThroughStrategy', () => {
  it('write persiste em cache e chama persistFn simultaneamente', async () => {
    const { cache, strategy } = make();
    let persisted = null;
    await strategy.write('k', { name: 'test' }, v => { persisted = v; return Promise.resolve(); }, 60);

    assert.deepEqual(await cache.get('k'), { name: 'test' });
    assert.deepEqual(persisted, { name: 'test' });
  });

  it('write remove do cache se persistFn lança erro', async () => {
    const { cache, strategy } = make();
    await assert.rejects(
      () => strategy.write('k', 'value', () => Promise.reject(new Error('DB down')), 60),
      /DB down/,
    );
    assert.equal(await cache.get('k'), null);
  });

  it('read com cache hit não chama fetchFn', async () => {
    const { cache, strategy } = make();
    await cache.set('k', 'cached', 60);
    let calls = 0;
    const v = await strategy.read('k', () => { calls++; return Promise.resolve('fresh'); }, 60);
    assert.equal(v, 'cached');
    assert.equal(calls, 0);
  });

  it('read com cache miss busca na fonte', async () => {
    const { strategy } = make();
    const v = await strategy.read('k', () => Promise.resolve('fetched'), 60);
    assert.equal(v, 'fetched');
  });

  it('invalidate remove a chave e registra eviction', async () => {
    const { cache, metrics, strategy } = make();
    await cache.set('k', 'v', 60);
    await strategy.invalidate('k');
    assert.equal(await cache.get('k'), null);
    assert.equal(metrics.getSnapshot().evictions, 1);
  });
});
