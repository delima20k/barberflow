'use strict';

const { describe, it }     = require('node:test');
const assert               = require('node:assert/strict');
const { BaseValueObject }  = require('../../../domain/shared/BaseValueObject');
const { Result }           = require('../../../domain/shared/Result');

class Money extends BaseValueObject {
  constructor(props) { super(props); }
  static create(amount, currency) {
    const vo = new Money({ amount, currency });
    return vo._validate();
  }
  _validate() {
    if (typeof this._props.amount !== 'number' || this._props.amount < 0) {
      return Result.fail('Money: amount deve ser número >= 0');
    }
    if (!this._props.currency) return Result.fail('Money: currency é obrigatório');
    return Result.ok(this);
  }
  get amount()   { return this._props.amount; }
  get currency() { return this._props.currency; }
}

describe('BaseValueObject', () => {
  it('cria value object válido', () => {
    const r = Money.create(100, 'BRL');
    assert.equal(r.isOk(), true);
    assert.equal(r.getValue().amount, 100);
  });

  it('retorna fail se inválido', () => {
    const r = Money.create(-5, 'BRL');
    assert.equal(r.isFail(), true);
    assert.ok(r.getError().includes('amount'));
  });

  it('props são frozen', () => {
    const r = Money.create(10, 'USD');
    assert.equal(Object.isFrozen(r.getValue()._props), true);
  });

  describe('equals', () => {
    it('retorna true para mesmos valores', () => {
      const a = Money.create(50, 'BRL').getValue();
      const b = Money.create(50, 'BRL').getValue();
      assert.equal(a.equals(b), true);
    });

    it('retorna false para valores diferentes', () => {
      const a = Money.create(50, 'BRL').getValue();
      const b = Money.create(51, 'BRL').getValue();
      assert.equal(a.equals(b), false);
    });

    it('retorna false para tipos diferentes', () => {
      const a = Money.create(50, 'BRL').getValue();
      assert.equal(a.equals({ amount: 50, currency: 'BRL' }), false);
    });
  });

  it('toJSON retorna clone das props', () => {
    const m = Money.create(99, 'EUR').getValue();
    assert.deepEqual(m.toJSON(), { amount: 99, currency: 'EUR' });
  });

  it('lança se _validate() não implementado em subclasse sem override', () => {
    class Bare extends BaseValueObject {
      constructor() { super({ x: 1 }); }
    }
    const bare = new Bare();
    assert.throws(() => bare._validate(), /_validate\(\) não implementado/);
  });

  it('lança TypeError se props não for objeto', () => {
    assert.throws(() => new Money(null), /props deve ser um objeto/);
  });
});
