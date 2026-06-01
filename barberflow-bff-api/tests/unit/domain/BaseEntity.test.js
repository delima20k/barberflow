'use strict';

const { describe, it } = require('node:test');
const assert           = require('node:assert/strict');
const { BaseEntity }   = require('../../../domain/shared/BaseEntity');

class ConcreteEntity extends BaseEntity {
  constructor(id, createdAt, updatedAt) { super(id, createdAt, updatedAt); }
  touch() { this._touch(); }
}

describe('BaseEntity', () => {
  it('cria entidade com id e datas geradas', () => {
    const e = new ConcreteEntity('abc-123');
    assert.equal(e.id, 'abc-123');
    assert.ok(e.createdAt instanceof Date);
    assert.ok(e.updatedAt instanceof Date);
  });

  it('aceita datas explícitas', () => {
    const d = new Date('2024-01-01T00:00:00Z');
    const e = new ConcreteEntity('id', d, d);
    assert.equal(e.createdAt.toISOString(), d.toISOString());
  });

  it('lança TypeError se id estiver ausente', () => {
    assert.throws(() => new ConcreteEntity(''), /id deve ser uma string/);
    assert.throws(() => new ConcreteEntity(null), /id deve ser uma string/);
  });

  describe('equals', () => {
    it('retorna true para mesmos ids', () => {
      const a = new ConcreteEntity('x');
      const b = new ConcreteEntity('x');
      assert.equal(a.equals(b), true);
    });

    it('retorna false para ids diferentes', () => {
      const a = new ConcreteEntity('x');
      const b = new ConcreteEntity('y');
      assert.equal(a.equals(b), false);
    });

    it('retorna false para não-entidade', () => {
      const a = new ConcreteEntity('x');
      assert.equal(a.equals(null), false);
      assert.equal(a.equals('x'), false);
    });
  });

  it('_touch() atualiza updatedAt', async () => {
    const e = new ConcreteEntity('id');
    const before = e.updatedAt;
    await new Promise(r => setTimeout(r, 5));
    e.touch();
    assert.ok(e.updatedAt > before);
  });

  it('toJSON retorna campos corretos', () => {
    const e = new ConcreteEntity('z');
    const json = e.toJSON();
    assert.ok(Object.hasOwn(json, 'id'));
    assert.ok(Object.hasOwn(json, 'createdAt'));
    assert.ok(Object.hasOwn(json, 'updatedAt'));
    assert.equal(json.id, 'z');
  });

  it('toString retorna representação legível', () => {
    const e = new ConcreteEntity('myid');
    assert.ok(e.toString().includes('myid'));
  });
});
