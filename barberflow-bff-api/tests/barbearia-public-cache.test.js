'use strict';

const { suite, test } = require('node:test');
const assert = require('node:assert/strict');

const BarbeariaService = require('../services/BarbeariaService');

class FakeBarbeariaRepository {
  featuredCalls = 0;
  allCalls = 0;

  async getFeatured(limit) {
    this.featuredCalls++;
    return [{ id: 'featured-1', limit }];
  }

  async getAll(limit) {
    this.allCalls++;
    return [{ id: 'all-1', limit }];
  }
}

class FakeCache {
  keys = [];
  sets = [];
  values = new Map();
  failGet = false;
  failSet = false;

  async get(key) {
    this.keys.push(key);
    if (this.failGet) throw new Error('redis get failed');
    return this.values.has(key) ? this.values.get(key) : null;
  }

  async set(key, value, ttlSeconds) {
    if (this.failSet) throw new Error('redis set failed');
    this.sets.push({ key, value, ttlSeconds });
    this.values.set(key, value);
  }
}

suite('BarbeariaService - cache publico de barbearias', () => {
  test('retorna do cache quando existe', async () => {
    const repo = new FakeBarbeariaRepository();
    const cache = new FakeCache();
    cache.values.set('bf:barbershops:featured:limit:3:v1', [{ id: 'cached' }]);

    const service = new BarbeariaService(repo, null, null, cache);
    const result = await service.listarDestaque(3);

    assert.deepStrictEqual(result, [{ id: 'cached' }]);
    assert.strictEqual(repo.featuredCalls, 0);
  });

  test('busca no Supabase e salva cache quando miss', async () => {
    const repo = new FakeBarbeariaRepository();
    const cache = new FakeCache();
    const service = new BarbeariaService(repo, null, null, cache);

    const result = await service.listarDestaque(4);

    assert.deepStrictEqual(result, [{ id: 'featured-1', limit: 4 }]);
    assert.strictEqual(repo.featuredCalls, 1);
    assert.deepStrictEqual(cache.sets[0], {
      key: 'bf:barbershops:featured:limit:4:v1',
      value: [{ id: 'featured-1', limit: 4 }],
      ttlSeconds: 60,
    });
  });

  test('falha do Redis nao derruba endpoint', async () => {
    const repo = new FakeBarbeariaRepository();
    const cache = new FakeCache();
    cache.failGet = true;
    const service = new BarbeariaService(repo, null, null, cache);

    const result = await service.listarTodas(5);

    assert.deepStrictEqual(result, [{ id: 'all-1', limit: 5 }]);
    assert.strictEqual(repo.allCalls, 1);
  });

  test('chave respeita limit e endpoint', async () => {
    const repo = new FakeBarbeariaRepository();
    const cache = new FakeCache();
    const service = new BarbeariaService(repo, null, null, cache);

    await service.listarDestaque(7);
    await service.listarTodas(8);

    assert.deepStrictEqual(cache.keys, [
      'bf:barbershops:featured:limit:7:v1',
      'bf:barbershops:all:limit:8:v1',
    ]);
  });
});
