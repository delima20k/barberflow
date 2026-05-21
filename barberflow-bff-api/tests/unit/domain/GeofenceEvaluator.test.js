'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { GeofenceEvaluator }  = require('../../../domain/geo/services/GeofenceEvaluator');
const { GeoFence }           = require('../../../domain/geo/entities/GeoFence');
const { Coordinate }         = require('../../../domain/geo/value-objects/Coordinate');

const makeCoord = (lat, lng) => Coordinate.create({ lat, lng }).getValue();

const SP     = makeCoord(-23.5505, -46.6333);
const NEAR_SP= makeCoord(-23.5496, -46.6333); // ~100m a norte de SP
const RJ     = makeCoord(-22.9068, -43.1729);

const makeFence = (id, center, radiusMeters, isActive = true) =>
  new GeoFence({ id, name: `Fence-${id}`, ownerId: 'owner-1', center, radiusMeters, isActive });

describe('GeofenceEvaluator', () => {

  describe('evaluate()', () => {
    it('retorna entered quando entra em uma geofence (outside→inside)', () => {
      const fence = makeFence('f1', SP, 500);     // 500m ao redor de SP
      // Posição anterior: RJ (fora); nova: perto de SP (dentro)
      const result = GeofenceEvaluator.evaluate({
        userId:       'u1',
        newCoord:     NEAR_SP,
        prevCoord:    RJ,
        geofences:    [fence],
        presenceMap:  {},
      });

      assert.equal(result.entered.length, 1, 'devia ter 1 entrada');
      assert.equal(result.entered[0].id, 'f1');
      assert.equal(result.left.length, 0);
    });

    it('retorna left quando sai de uma geofence (inside→outside)', () => {
      const fence = makeFence('f1', SP, 500);
      // Posição anterior: dentro (SP); nova: RJ (fora)
      const result = GeofenceEvaluator.evaluate({
        userId:      'u1',
        newCoord:    RJ,
        prevCoord:   SP,
        geofences:   [fence],
        presenceMap: { 'f1': true }, // estava dentro
      });

      assert.equal(result.left.length, 1, 'devia ter 1 saída');
      assert.equal(result.left[0].id, 'f1');
      assert.equal(result.entered.length, 0);
    });

    it('retorna vazio quando permanece dentro (inside→inside)', () => {
      const fence = makeFence('f1', SP, 500);
      const result = GeofenceEvaluator.evaluate({
        userId:      'u1',
        newCoord:    NEAR_SP,
        prevCoord:   SP,
        geofences:   [fence],
        presenceMap: { 'f1': true },
      });

      assert.equal(result.entered.length, 0);
      assert.equal(result.left.length, 0);
    });

    it('retorna vazio quando permanece fora (outside→outside)', () => {
      const fence = makeFence('f1', SP, 500);
      const result = GeofenceEvaluator.evaluate({
        userId:      'u1',
        newCoord:    RJ,
        prevCoord:   RJ,
        geofences:   [fence],
        presenceMap: {},
      });

      assert.equal(result.entered.length, 0);
      assert.equal(result.left.length, 0);
    });

    it('ignora geofences inativas', () => {
      const inactive = makeFence('f1', SP, 50000, false);  // inativa, raio enorme
      const result = GeofenceEvaluator.evaluate({
        userId:      'u1',
        newCoord:    SP,
        prevCoord:   RJ,
        geofences:   [inactive],
        presenceMap: {},
      });
      assert.equal(result.entered.length, 0, 'geofence inativa não deve entrar');
    });

    it('trata múltiplas geofences corretamente', () => {
      const f1 = makeFence('f1', SP, 500);
      const f2 = makeFence('f2', SP, 1000);
      const result = GeofenceEvaluator.evaluate({
        userId:      'u1',
        newCoord:    NEAR_SP,
        prevCoord:   RJ,
        geofences:   [f1, f2],
        presenceMap: {},
      });
      assert.equal(result.entered.length, 2, 'devia entrar em 2 geofences');
    });

    it('retorna updatedPresenceMap com estado correto', () => {
      const fence = makeFence('f1', SP, 500);
      const { updatedPresenceMap } = GeofenceEvaluator.evaluate({
        userId:      'u1',
        newCoord:    NEAR_SP,
        prevCoord:   RJ,
        geofences:   [fence],
        presenceMap: {},
      });
      assert.equal(updatedPresenceMap['f1'], true);
    });
  });
});
