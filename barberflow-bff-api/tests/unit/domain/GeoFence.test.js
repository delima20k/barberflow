'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { GeoFence }   = require('../../../domain/geo/entities/GeoFence');
const { Coordinate } = require('../../../domain/geo/value-objects/Coordinate');

const makeCoord = (lat, lng) => Coordinate.create({ lat, lng }).getValue();

// Centro em São Paulo
const CENTER_SP = makeCoord(-23.5505, -46.6333);
// Ponto próximo (~100m a norte de São Paulo)
const NEAR_SP   = makeCoord(-23.5496, -46.6333);
// Rio de Janeiro (~357 km de São Paulo)
const RJ        = makeCoord(-22.9068, -43.1729);

describe('GeoFence', () => {

  describe('construção', () => {
    it('cria geofence válida', () => {
      const gf = new GeoFence({
        id: 'gf-1', name: 'Barbearia do João', ownerId: 'owner-1',
        center: CENTER_SP, radiusMeters: 500,
      });
      assert.equal(gf.id, 'gf-1');
      assert.equal(gf.name, 'Barbearia do João');
      assert.equal(gf.radiusMeters, 500);
      assert.ok(gf.isActive);
    });

    it('cria com isActive = false', () => {
      const gf = new GeoFence({
        id: 'gf-2', name: 'Test', ownerId: 'o1',
        center: CENTER_SP, radiusMeters: 100, isActive: false,
      });
      assert.ok(!gf.isActive);
    });

    it('lança para radiusMeters = 0', () => {
      assert.throws(() => new GeoFence({
        id: 'gf-3', name: 'T', ownerId: 'o1',
        center: CENTER_SP, radiusMeters: 0,
      }), TypeError);
    });

    it('lança para center inválido', () => {
      assert.throws(() => new GeoFence({
        id: 'gf-4', name: 'T', ownerId: 'o1',
        center: { lat: 0, lng: 0 }, radiusMeters: 100,
      }), TypeError);
    });
  });

  describe('contains()', () => {
    it('ponto próximo (<500m) está dentro', () => {
      const gf = new GeoFence({
        id: 'gf-1', name: 'T', ownerId: 'o1',
        center: CENTER_SP, radiusMeters: 500,
      });
      assert.ok(gf.contains(NEAR_SP), 'ponto próximo deve estar dentro');
    });

    it('mesmo ponto do centro está dentro', () => {
      const gf = new GeoFence({
        id: 'gf-1', name: 'T', ownerId: 'o1',
        center: CENTER_SP, radiusMeters: 100,
      });
      assert.ok(gf.contains(CENTER_SP));
    });

    it('Rio de Janeiro não está dentro de 500m de São Paulo', () => {
      const gf = new GeoFence({
        id: 'gf-1', name: 'T', ownerId: 'o1',
        center: CENTER_SP, radiusMeters: 500,
      });
      assert.ok(!gf.contains(RJ), 'RJ deve estar fora de 500m de SP');
    });

    it('lança para coordinate inválido', () => {
      const gf = new GeoFence({
        id: 'gf-1', name: 'T', ownerId: 'o1',
        center: CENTER_SP, radiusMeters: 500,
      });
      assert.throws(() => gf.contains({ lat: 0, lng: 0 }), TypeError);
    });
  });

  describe('activate() / deactivate()', () => {
    it('deactivate() desativa a geofence', () => {
      const gf = new GeoFence({
        id: 'gf-1', name: 'T', ownerId: 'o1',
        center: CENTER_SP, radiusMeters: 100,
      });
      gf.deactivate();
      assert.ok(!gf.isActive);
    });

    it('activate() reativa a geofence', () => {
      const gf = new GeoFence({
        id: 'gf-1', name: 'T', ownerId: 'o1',
        center: CENTER_SP, radiusMeters: 100, isActive: false,
      });
      gf.activate();
      assert.ok(gf.isActive);
    });
  });
});
