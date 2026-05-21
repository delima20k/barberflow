'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

const { Distance } = require('../../../domain/geo/value-objects/Distance');

describe('Distance', () => {

  // ── Casos válidos ──────────────────────────────────────────────

  describe('create() — válidos', () => {
    it('cria distância zero', () => {
      const r = Distance.create({ meters: 0 });
      assert.ok(r.isOk(), r.isFail() ? r.getError() : '');
      assert.equal(r.getValue().meters, 0);
    });

    it('cria distância 1 metro', () => {
      const r = Distance.create({ meters: 1 });
      assert.ok(r.isOk());
    });

    it('cria distância 357000 metros (SP→RJ aprox)', () => {
      const r = Distance.create({ meters: 357000 });
      assert.ok(r.isOk());
    });

    it('ofKm() converte km para metros', () => {
      const r = Distance.ofKm(1);
      assert.ok(r.isOk());
      assert.equal(r.getValue().meters, 1000);
    });

    it('ofKm(357) para SP→RJ', () => {
      const r = Distance.ofKm(357);
      assert.ok(r.isOk());
      assert.equal(r.getValue().meters, 357000);
    });
  });

  // ── Casos inválidos ────────────────────────────────────────────

  describe('create() — inválidos', () => {
    it('rejeita metros negativos', () => {
      assert.ok(Distance.create({ meters: -1 }).isFail());
    });

    it('rejeita metros NaN', () => {
      assert.ok(Distance.create({ meters: NaN }).isFail());
    });

    it('rejeita metros Infinity', () => {
      assert.ok(Distance.create({ meters: Infinity }).isFail());
    });

    it('rejeita metros string', () => {
      assert.ok(Distance.create({ meters: '100' }).isFail());
    });

    it('ofKm() rejeita km negativos', () => {
      assert.ok(Distance.ofKm(-1).isFail());
    });
  });

  // ── Conversões ────────────────────────────────────────────────

  describe('conversões', () => {
    let d;

    before(() => {
      d = Distance.create({ meters: 2500 }).getValue();
    });

    it('km retorna valor em quilômetros', () => {
      assert.equal(d.km, 2.5);
    });

    it('toJSON() inclui meters e km', () => {
      const j = d.toJSON();
      assert.equal(j.meters, 2500);
      assert.equal(j.km, 2.5);
    });
  });

  // ── Comparações ───────────────────────────────────────────────

  describe('comparações', () => {
    it('isGreaterThan() funciona', () => {
      const a = Distance.create({ meters: 1000 }).getValue();
      const b = Distance.create({ meters: 500 }).getValue();
      assert.ok(a.isGreaterThan(b));
      assert.ok(!b.isGreaterThan(a));
    });

    it('isLessThan() funciona', () => {
      const a = Distance.create({ meters: 100 }).getValue();
      const b = Distance.create({ meters: 200 }).getValue();
      assert.ok(a.isLessThan(b));
    });

    it('equals() para mesma distância', () => {
      const a = Distance.create({ meters: 500 }).getValue();
      const b = Distance.create({ meters: 500 }).getValue();
      assert.ok(a.equals(b));
    });
  });
});
