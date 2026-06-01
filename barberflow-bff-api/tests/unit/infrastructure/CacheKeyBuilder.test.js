'use strict';

const { describe, it } = require('node:test');
const assert           = require('node:assert/strict');
const { CacheKeyBuilder } = require('../../../infrastructure/cache/CacheKeyBuilder');

describe('CacheKeyBuilder', () => {
  describe('build', () => {
    it('gera chave no formato correto', () => {
      const key = CacheKeyBuilder.build('agendamento', 'agendamento', 'abc-123');
      assert.equal(key, 'bf:agendamento:agendamento:abc-123:v1');
    });

    it('aceita versão customizada', () => {
      const key = CacheKeyBuilder.build('fila', 'entrada', 'id-1', 'v2');
      assert.equal(key, 'bf:fila:entrada:id-1:v2');
    });

    it('lança TypeError se context ausente', () => {
      assert.throws(() => CacheKeyBuilder.build('', 'e', 'id'), /context obrigatório/);
    });

    it('lança TypeError se entity ausente', () => {
      assert.throws(() => CacheKeyBuilder.build('ctx', '', 'id'), /entity obrigatório/);
    });

    it('lança TypeError se id ausente', () => {
      assert.throws(() => CacheKeyBuilder.build('ctx', 'e', ''), /id obrigatório/);
    });
  });

  describe('buildList', () => {
    it('gera chave de lista sem parâmetros', () => {
      const key = CacheKeyBuilder.buildList('fila', 'entrada');
      assert.equal(key, 'bf:fila:entrada:list:*:v1');
    });

    it('gera chave de lista com parâmetros ordenados', () => {
      const key = CacheKeyBuilder.buildList('agendamento', 'agendamento', { clienteId: 'x', status: 'pending' });
      assert.equal(key, 'bf:agendamento:agendamento:list:clienteId=x;status=pending:v1');
    });

    it('parâmetros são ordenados alfabeticamente (determinístico)', () => {
      const a = CacheKeyBuilder.buildList('ctx', 'e', { z: 1, a: 2 });
      const b = CacheKeyBuilder.buildList('ctx', 'e', { a: 2, z: 1 });
      assert.equal(a, b);
    });

    it('ignora parâmetros null/undefined', () => {
      const key = CacheKeyBuilder.buildList('ctx', 'e', { id: 'x', skip: null, also: undefined });
      assert.ok(key.includes('id=x'));
      assert.ok(!key.includes('skip'));
      assert.ok(!key.includes('also'));
    });
  });

  describe('prefix', () => {
    it('gera prefixo correto', () => {
      assert.equal(CacheKeyBuilder.prefix('agendamento', 'agendamento'), 'bf:agendamento:agendamento:');
    });
  });

  describe('contextPrefix', () => {
    it('gera prefixo de contexto', () => {
      assert.equal(CacheKeyBuilder.contextPrefix('fila'), 'bf:fila:');
    });
  });

  describe('idempotency', () => {
    it('gera chave de idempotência', () => {
      const key = CacheKeyBuilder.idempotency('my-uuid-key');
      assert.equal(key, 'bf:idempotency:my-uuid-key');
    });
  });
});
