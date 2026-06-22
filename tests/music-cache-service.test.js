'use strict';

// Testes do MusicCacheService — TTL 30min + stale (offline parcial).

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { MusicCacheService } = require('../shared/js/MusicCacheService');

test('get() devolve valor dentro do TTL e undefined depois (30min)', () => {
  let agora = 0;
  const cache = new MusicCacheService({ ttlMs: 30 * 60 * 1000, now: () => agora });
  cache.set('k', { x: 1 });

  agora = 29 * 60 * 1000;
  assert.deepEqual(cache.get('k'), { x: 1 }, 'válido aos 29min');
  assert.equal(cache.valido('k'), true);

  agora = 31 * 60 * 1000;
  assert.equal(cache.get('k'), undefined, 'expirou aos 31min');
  assert.equal(cache.valido('k'), false);
});

test('stale() devolve o último valor mesmo expirado (offline parcial)', () => {
  let agora = 0;
  const cache = new MusicCacheService({ ttlMs: 1000, now: () => agora });
  cache.set('k', 'v');
  agora = 5000;
  assert.equal(cache.get('k'), undefined);
  assert.equal(cache.stale('k'), 'v', 'stale ainda acessível');
});

test('invalidar() limpa a chave / tudo', () => {
  const cache = new MusicCacheService();
  cache.set('a', 1); cache.set('b', 2);
  cache.invalidar('a');
  assert.equal(cache.stale('a'), undefined);
  assert.equal(cache.stale('b'), 2);
  cache.invalidar();
  assert.equal(cache.stale('b'), undefined);
});
