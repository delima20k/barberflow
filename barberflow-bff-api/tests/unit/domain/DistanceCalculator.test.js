'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { DistanceCalculator } = require('../../../domain/geo/services/DistanceCalculator');
const { Coordinate }         = require('../../../domain/geo/value-objects/Coordinate');

const makeCoord = (lat, lng) => Coordinate.create({ lat, lng }).getValue();

const SP = makeCoord(-23.5505, -46.6333);
const RJ = makeCoord(-22.9068, -43.1729);

// Stub de IDistanceStrategy para testes unitários
class StubStrategy {
  get name() { return 'stub'; }
  calculateMeters(_from, _to) { return 100; }
}

class StubReturns0 {
  get name() { return 'stub0'; }
  calculateMeters() { return 0; }
}

describe('DistanceCalculator', () => {

  describe('calculate()', () => {
    it('retorna Distance com valor da strategy', () => {
      const calc = new DistanceCalculator({ strategy: new StubStrategy() });
      const result = calc.calculate(SP, RJ);
      assert.ok(result.isOk(), result.isFail() ? result.getError() : '');
      assert.equal(result.getValue().meters, 100);
    });

    it('retorna Distance com metros = 0', () => {
      const calc = new DistanceCalculator({ strategy: new StubReturns0() });
      const result = calc.calculate(SP, SP);
      assert.ok(result.isOk());
      assert.equal(result.getValue().meters, 0);
    });

    it('falha se from não for Coordinate', () => {
      const calc = new DistanceCalculator({ strategy: new StubStrategy() });
      const result = calc.calculate({ lat: 0, lng: 0 }, RJ);
      assert.ok(result.isFail());
    });

    it('falha se to não for Coordinate', () => {
      const calc = new DistanceCalculator({ strategy: new StubStrategy() });
      const result = calc.calculate(SP, null);
      assert.ok(result.isFail());
    });

    it('expõe strategyName', () => {
      const calc = new DistanceCalculator({ strategy: new StubStrategy() });
      assert.equal(calc.strategyName, 'stub');
    });
  });
});
