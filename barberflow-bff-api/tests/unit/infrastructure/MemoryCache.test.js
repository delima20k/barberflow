'use strict';

const { describe, it } = require('node:test');
const assert           = require('node:assert/strict');
const { MemoryCache }  = require('../../../infrastructure/cache/MemoryCache');

describe('MemoryCache', () => {
  it('set e get retornam o valor', async () => {
    const cache = new MemoryCache();
    await cache.set('k', { hello: 'world' });
    assert.deepEqual(await cache.get('k'), { hello: 'world' });
  });

  it('get retorna null para chave inexistente', async () => {
    const cache = new MemoryCache();
    assert.equal(await cache.get('nope'), null);
  });

  it('del remove a chave', async () => {
    const cache = new MemoryCache();
    await cache.set('a', 1);
    await cache.del('a');
    assert.equal(await cache.get('a'), null);
  });

  it('delByPrefix remove apenas chaves com o prefixo', async () => {
    const cache = new MemoryCache();
    await cache.set('user:1', 'alice');
    await cache.set('user:2', 'bob');
    await cache.set('other', 'x');
    await cache.delByPrefix('user:');
    assert.equal(await cache.get('user:1'), null);
    assert.equal(await cache.get('user:2'), null);
    assert.equal(await cache.get('other'), 'x');
  });

  it('flush limpa tudo', async () => {
    const cache = new MemoryCache();
    await cache.set('a', 1);
    await cache.set('b', 2);
    await cache.flush();
    assert.equal(cache.size, 0);
  });

  it('TTL expira corretamente', async () => {
    const cache = new MemoryCache();
    await cache.set('tmp', 'value', 0.05); // 50ms
    assert.equal(await cache.get('tmp'), 'value');
    await new Promise(r => setTimeout(r, 60));
    assert.equal(await cache.get('tmp'), null);
  });

  it('sem TTL não expira', async () => {
    const cache = new MemoryCache();
    await cache.set('perm', 'ok');
    await new Promise(r => setTimeout(r, 20));
    assert.equal(await cache.get('perm'), 'ok');
  });
});
