'use strict';

const { describe, it } = require('node:test');
const assert           = require('node:assert/strict');
const { MemoryCache }      = require('../../../infrastructure/cache/MemoryCache');
const { CacheMetrics }     = require('../../../infrastructure/cache/CacheMetrics');
const { SingleFlightCache } = require('../../../infrastructure/cache/SingleFlightCache');

function makeSFC() {
  return new SingleFlightCache({
    cache:   new MemoryCache(),
    metrics: new CacheMetrics(),
  });
}

describe('SingleFlightCache', () => {
  it('lança TypeError se cache ausente', () => {
    assert.throws(() => new SingleFlightCache({ cache: null, metrics: new CacheMetrics() }), /cache é obrigatório/);
  });

  it('lança TypeError se metrics ausente', () => {
    assert.throws(() => new SingleFlightCache({ cache: new MemoryCache(), metrics: null }), /metrics é obrigatório/);
  });

  it('delega get/set/del ao cache interno', async () => {
    const sfc = makeSFC();
    await sfc.set('k', 'v', 60);
    assert.equal(await sfc.get('k'), 'v');
    await sfc.del('k');
    assert.equal(await sfc.get('k'), null);
  });

  it('getOrCompute retorna valor do cache em hit', async () => {
    const sfc = makeSFC();
    await sfc.set('k', 'cached', 60);
    let calls = 0;
    const result = await sfc.getOrCompute('k', () => { calls++; return Promise.resolve('computed'); }, 60);
    assert.equal(result, 'cached');
    assert.equal(calls, 0);
  });

  it('getOrCompute executa computeFn em miss e popula cache', async () => {
    const sfc = makeSFC();
    let calls = 0;
    const result = await sfc.getOrCompute('k', () => { calls++; return Promise.resolve('fresh'); }, 60);
    assert.equal(result, 'fresh');
    assert.equal(calls, 1);
    // Segunda leitura deve vir do cache
    const result2 = await sfc.getOrCompute('k', () => { calls++; return Promise.resolve('fresh2'); }, 60);
    assert.equal(result2, 'fresh');
    assert.equal(calls, 1);
  });

  it('single-flight: N chamadas simultâneas executam computeFn apenas 1 vez', async () => {
    const sfc = makeSFC();
    let calls = 0;
    const slowFn = () => new Promise(resolve => {
      calls++;
      setTimeout(() => resolve('result'), 20);
    });

    // Disparar 5 requisições simultâneas para a mesma chave
    const [a, b, c, d, e] = await Promise.all([
      sfc.getOrCompute('k', slowFn, 60),
      sfc.getOrCompute('k', slowFn, 60),
      sfc.getOrCompute('k', slowFn, 60),
      sfc.getOrCompute('k', slowFn, 60),
      sfc.getOrCompute('k', slowFn, 60),
    ]);

    assert.equal(calls, 1, 'computeFn deve ser chamada exatamente 1 vez');
    assert.equal(a, 'result');
    assert.equal(b, 'result');
    assert.equal(c, 'result');
    assert.equal(d, 'result');
    assert.equal(e, 'result');
  });

  it('in-flight é limpo após resolução', async () => {
    const sfc = makeSFC();
    await sfc.getOrCompute('k', () => Promise.resolve('v'), 60);
    assert.equal(sfc.inFlightCount, 0);
  });

  it('in-flight é limpo após rejeição', async () => {
    const sfc = makeSFC();
    await assert.rejects(
      () => sfc.getOrCompute('fail', () => Promise.reject(new Error('boom')), 60),
      /boom/,
    );
    assert.equal(sfc.inFlightCount, 0);
  });

  it('getMetrics delega para CacheMetrics', async () => {
    const sfc = makeSFC();
    await sfc.set('k', 'v', 60);
    await sfc.getOrCompute('k', () => Promise.resolve('x'), 60); // hit
    await sfc.getOrCompute('miss', () => Promise.resolve('y'), 60); // miss
    const snap = sfc.getMetrics();
    assert.equal(snap.hits, 1);
    assert.equal(snap.misses, 1);
  });
});
