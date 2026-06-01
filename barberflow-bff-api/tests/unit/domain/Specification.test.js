'use strict';

const { describe, it }  = require('node:test');
const assert            = require('node:assert/strict');
const { Specification } = require('../../../domain/shared/Specification');

class IsPositive extends Specification {
  isSatisfiedBy(n) { return n > 0; }
}

class IsEven extends Specification {
  isSatisfiedBy(n) { return n % 2 === 0; }
}

describe('Specification', () => {
  it('isSatisfiedBy avalia corretamente', () => {
    const spec = new IsPositive();
    assert.equal(spec.isSatisfiedBy(5), true);
    assert.equal(spec.isSatisfiedBy(-1), false);
  });

  describe('and', () => {
    it('AND verdadeiro quando ambos satisfeitos', () => {
      const spec = new IsPositive().and(new IsEven());
      assert.equal(spec.isSatisfiedBy(4), true);
    });

    it('AND falso quando um não satisfeito', () => {
      const spec = new IsPositive().and(new IsEven());
      assert.equal(spec.isSatisfiedBy(3), false);
      assert.equal(spec.isSatisfiedBy(-2), false);
    });
  });

  describe('or', () => {
    it('OR verdadeiro quando ao menos um satisfeito', () => {
      const spec = new IsPositive().or(new IsEven());
      assert.equal(spec.isSatisfiedBy(3), true);  // positivo, ímpar
      assert.equal(spec.isSatisfiedBy(-2), true); // negativo, par
    });

    it('OR falso quando nenhum satisfeito', () => {
      const spec = new IsPositive().or(new IsEven());
      assert.equal(spec.isSatisfiedBy(-3), false);
    });
  });

  describe('not', () => {
    it('NOT inverte o resultado', () => {
      const spec = new IsPositive().not();
      assert.equal(spec.isSatisfiedBy(5), false);
      assert.equal(spec.isSatisfiedBy(-1), true);
    });
  });

  describe('composição', () => {
    it('(A and B) or (not C)', () => {
      const spec = new IsPositive().and(new IsEven()).or(new IsPositive().not());
      assert.equal(spec.isSatisfiedBy(4), true);   // positivo e par
      assert.equal(spec.isSatisfiedBy(-1), true);  // não positivo
      assert.equal(spec.isSatisfiedBy(3), false);  // positivo e ímpar
    });
  });

  it('lança se isSatisfiedBy() não implementado na base', () => {
    const spec = new Specification();
    assert.throws(() => spec.isSatisfiedBy(1), /isSatisfiedBy\(\) não implementado/);
  });
});
