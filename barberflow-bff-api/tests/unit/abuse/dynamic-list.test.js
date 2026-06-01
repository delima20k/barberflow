'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert                        = require('node:assert/strict');
const { DynamicList }               = require('../../../middlewares/abuse/DynamicList');
const { Action }                    = require('../../../middlewares/abuse/ActionPolicy');

describe('DynamicList', () => {
  /** @type {DynamicList} */ let list;

  beforeEach(() => { list = new DynamicList(); });

  it('retorna null para chave ausente', () => {
    assert.equal(list.check('inexistente'), null);
  });

  it('retorna a ação registrada para chave existente', () => {
    list.add('user-abc', Action.HARD_BLOCK, 60_000);
    const r = list.check('user-abc');
    assert.ok(r !== null);
    assert.equal(r.action, Action.HARD_BLOCK);
  });

  it('entrada sem TTL (permanente) permanece indefinidamente', () => {
    list.add('perm', Action.ALLOW, 0);
    assert.ok(list.check('perm') !== null);
  });

  it('entrada com TTL expirado retorna null', () => {
    list.add('expired', Action.SOFT_BLOCK, 1); // 1ms
    return new Promise(resolve => {
      setTimeout(() => {
        assert.equal(list.check('expired'), null);
        resolve();
      }, 10);
    });
  });

  it('remove apaga a entrada', () => {
    list.add('r1', Action.THROTTLE, 60_000);
    list.remove('r1');
    assert.equal(list.check('r1'), null);
  });

  it('sweep remove entradas expiradas', () => {
    list.add('e1', Action.SOFT_BLOCK, 1);
    list.add('e2', Action.ALLOW, 60_000);
    return new Promise(resolve => {
      setTimeout(() => {
        list.sweep();
        assert.equal(list.size(), 1);
        resolve();
      }, 10);
    });
  });

  it('size() conta apenas entradas válidas', () => {
    list.add('a', Action.ALLOW, 60_000);
    list.add('b', Action.HARD_BLOCK, 1);
    return new Promise(resolve => {
      setTimeout(() => {
        assert.equal(list.size(), 1);
        resolve();
      }, 10);
    });
  });

  it('clear esvazia a lista', () => {
    list.add('x', Action.HARD_BLOCK, 0);
    list.add('y', Action.ALLOW, 0);
    list.clear();
    assert.equal(list.size(), 0);
  });

  it('add retorna a própria instância (fluent)', () => {
    const returned = list.add('z', Action.ALLOW, 0);
    assert.equal(returned, list);
  });
});
