'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

// Importa após as implementações existirem — TDD define o contrato
const { Coordinate } = require('../../../domain/geo/value-objects/Coordinate');

describe('Coordinate', () => {

  // ── Casos válidos ──────────────────────────────────────────────

  describe('create() — válidos', () => {
    it('cria coordenada no equador/meridiano de Greenwich (0, 0)', () => {
      const r = Coordinate.create({ lat: 0, lng: 0 });
      assert.ok(r.isOk(), r.isFail() ? r.getError() : '');
      const c = r.getValue();
      assert.equal(c.lat, 0);
      assert.equal(c.lng, 0);
    });

    it('aceita polo norte exato (90, 0)', () => {
      const r = Coordinate.create({ lat: 90, lng: 0 });
      assert.ok(r.isOk());
      assert.equal(r.getValue().lat, 90);
    });

    it('aceita polo sul exato (-90, 0)', () => {
      const r = Coordinate.create({ lat: -90, lng: 0 });
      assert.ok(r.isOk());
    });

    it('aceita antimeridiano leste exato (0, 180)', () => {
      const r = Coordinate.create({ lat: 0, lng: 180 });
      assert.ok(r.isOk());
    });

    it('aceita antimeridiano oeste exato (0, -180)', () => {
      const r = Coordinate.create({ lat: 0, lng: -180 });
      assert.ok(r.isOk());
    });

    it('aceita São Paulo (-23.5505, -46.6333)', () => {
      const r = Coordinate.create({ lat: -23.5505, lng: -46.6333 });
      assert.ok(r.isOk());
      assert.ok(Math.abs(r.getValue().lat - (-23.5505)) < 1e-10);
    });

    it('aceita valores de alta precisão', () => {
      const r = Coordinate.create({ lat: 51.50853, lng: -0.12574 });
      assert.ok(r.isOk());
    });
  });

  // ── Casos inválidos ────────────────────────────────────────────

  describe('create() — inválidos', () => {
    it('rejeita lat > 90', () => {
      assert.ok(Coordinate.create({ lat: 90.000001, lng: 0 }).isFail());
    });

    it('rejeita lat < -90', () => {
      assert.ok(Coordinate.create({ lat: -90.000001, lng: 0 }).isFail());
    });

    it('rejeita lng > 180', () => {
      assert.ok(Coordinate.create({ lat: 0, lng: 180.000001 }).isFail());
    });

    it('rejeita lng < -180', () => {
      assert.ok(Coordinate.create({ lat: 0, lng: -180.000001 }).isFail());
    });

    it('rejeita lat NaN', () => {
      assert.ok(Coordinate.create({ lat: NaN, lng: 0 }).isFail());
    });

    it('rejeita lng NaN', () => {
      assert.ok(Coordinate.create({ lat: 0, lng: NaN }).isFail());
    });

    it('rejeita lat Infinity', () => {
      assert.ok(Coordinate.create({ lat: Infinity, lng: 0 }).isFail());
    });

    it('rejeita lat string', () => {
      assert.ok(Coordinate.create({ lat: '-23', lng: 0 }).isFail());
    });

    it('rejeita lat null', () => {
      assert.ok(Coordinate.create({ lat: null, lng: 0 }).isFail());
    });

    it('rejeita lat undefined', () => {
      assert.ok(Coordinate.create({ lat: undefined, lng: 0 }).isFail());
    });

    it('rejeita props ausentes', () => {
      assert.ok(Coordinate.create({}).isFail());
    });
  });

  // ── Getters e transformações ───────────────────────────────────

  describe('getters e transformações', () => {
    let coord;

    before(() => {
      coord = Coordinate.create({ lat: -23.5505, lng: -46.6333 }).getValue();
    });

    it('toLatLng() retorna [lat, lng]', () => {
      const pair = coord.toLatLng();
      assert.deepEqual(pair, [-23.5505, -46.6333]);
    });

    it('toPostGIS() retorna { x: lng, y: lat }', () => {
      const pg = coord.toPostGIS();
      assert.equal(pg.x, -46.6333);
      assert.equal(pg.y, -23.5505);
    });

    it('toJSON() serializa lat e lng', () => {
      const j = coord.toJSON();
      assert.equal(j.lat, -23.5505);
      assert.equal(j.lng, -46.6333);
    });
  });

  // ── Igualdade ──────────────────────────────────────────────────

  describe('equals()', () => {
    it('dois Coordinates com mesmos valores são iguais', () => {
      const a = Coordinate.create({ lat: 0, lng: 0 }).getValue();
      const b = Coordinate.create({ lat: 0, lng: 0 }).getValue();
      assert.ok(a.equals(b));
    });

    it('Coordinates com valores diferentes não são iguais', () => {
      const a = Coordinate.create({ lat: 0, lng: 0 }).getValue();
      const b = Coordinate.create({ lat: 1, lng: 0 }).getValue();
      assert.ok(!a.equals(b));
    });

    it('equals com null retorna false', () => {
      const a = Coordinate.create({ lat: 0, lng: 0 }).getValue();
      assert.ok(!a.equals(null));
    });
  });
});
