'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { UpdateUserLocationUseCase } = require('../../../application/geo/UpdateUserLocationUseCase');
const { Coordinate }                = require('../../../domain/geo/value-objects/Coordinate');

// ── Stubs ──────────────────────────────────────────────────────

const makeRepo = (overrides = {}) => ({
  updateUserLocation: async (_u, _lat, _lng) =>
    ({ isOk: () => true, isFail: () => false, getValue: () => ({ prevLat: null, prevLng: null, prevLocationAt: null }) }),
  getUserLocation: async () =>
    ({ isOk: () => true, isFail: () => false, getValue: () => null }),
  getActiveGeofencesNearUser: async () =>
    ({ isOk: () => true, isFail: () => false, getValue: () => [] }),
  ...overrides,
});

const makeCache = (overrides = {}) => ({
  appendTrack:     async () => {},
  getTrack:        async () => [],
  getPresenceMap:  async () => ({}),
  savePresenceMap: async () => {},
  getUserLocation: async () => ({ isOk: () => false, isFail: () => true }),
  updateUserLocation: async (_u, lat, lng) =>
    ({ isOk: () => true, isFail: () => false, getValue: () => ({ prevLat: null, prevLng: null, prevLocationAt: null }) }),
  ...overrides,
});

const makeEventBus = (overrides = {}) => ({
  publish: async () => {},
  ...overrides,
});

const SP_LAT = -23.5505;
const SP_LNG = -46.6333;

describe('UpdateUserLocationUseCase', () => {

  describe('execute() — casos de sucesso', () => {
    it('retorna ok com coordenada válida', async () => {
      const useCase = new UpdateUserLocationUseCase({
        geoRepository: makeRepo(),
        geoCache:      makeCache(),
        eventBus:      makeEventBus(),
      });

      const result = await useCase.execute({ userId: 'user-1', lat: SP_LAT, lng: SP_LNG });
      assert.ok(result.isOk(), result.isFail() ? result.getError() : '');
    });

    it('chama geoCache.updateUserLocation com userId, lat, lng', async () => {
      const calls = [];
      const cache = makeCache({
        updateUserLocation: async (u, lat, lng) => {
          calls.push({ u, lat, lng });
          return { isOk: () => true, isFail: () => false, getValue: () => ({ prevLat: null, prevLng: null, prevLocationAt: null }) };
        },
      });

      const useCase = new UpdateUserLocationUseCase({
        geoRepository: makeRepo(),
        geoCache:      cache,
        eventBus:      makeEventBus(),
      });

      await useCase.execute({ userId: 'user-1', lat: SP_LAT, lng: SP_LNG });
      assert.equal(calls.length, 1);
      assert.equal(calls[0].u, 'user-1');
      assert.equal(calls[0].lat, SP_LAT);
      assert.equal(calls[0].lng, SP_LNG);
    });

    it('publica UserLocationUpdated no eventBus', async () => {
      const events = [];
      const bus = makeEventBus({ publish: async e => events.push(e) });

      const useCase = new UpdateUserLocationUseCase({
        geoRepository: makeRepo(),
        geoCache:      makeCache(),
        eventBus:      bus,
      });

      await useCase.execute({ userId: 'u1', lat: SP_LAT, lng: SP_LNG });
      assert.equal(events.length, 1);
      assert.equal(events[0].eventName, 'UserLocationUpdated');
    });

    it('flaggedSpoof = false para primeira leitura', async () => {
      const events = [];
      const bus = makeEventBus({ publish: async e => events.push(e) });

      const useCase = new UpdateUserLocationUseCase({
        geoRepository: makeRepo(),
        geoCache:      makeCache(),
        eventBus:      bus,
      });

      await useCase.execute({ userId: 'u1', lat: SP_LAT, lng: SP_LNG });
      assert.ok(!events[0].spoofFlagged, 'primeira leitura não deve ser spoof');
    });
  });

  describe('execute() — validação de input', () => {
    let useCase;

    beforeEach(() => {
      useCase = new UpdateUserLocationUseCase({
        geoRepository: makeRepo(),
        geoCache:      makeCache(),
        eventBus:      makeEventBus(),
      });
    });

    it('falha com userId ausente', async () => {
      const r = await useCase.execute({ lat: SP_LAT, lng: SP_LNG });
      assert.ok(r.isFail());
    });

    it('falha com lat inválida', async () => {
      const r = await useCase.execute({ userId: 'u1', lat: 200, lng: SP_LNG });
      assert.ok(r.isFail());
    });

    it('falha com lng inválida', async () => {
      const r = await useCase.execute({ userId: 'u1', lat: SP_LAT, lng: 999 });
      assert.ok(r.isFail());
    });

    it('falha com lat NaN', async () => {
      const r = await useCase.execute({ userId: 'u1', lat: NaN, lng: SP_LNG });
      assert.ok(r.isFail());
    });
  });

  describe('execute() — erro no repositório', () => {
    it('propaga falha do geoCache', async () => {
      const cache = makeCache({
        updateUserLocation: async () => ({ isOk: () => false, isFail: () => true, getError: () => 'DB error' }),
      });

      const useCase = new UpdateUserLocationUseCase({
        geoRepository: makeRepo(),
        geoCache:      cache,
        eventBus:      makeEventBus(),
      });

      const r = await useCase.execute({ userId: 'u1', lat: SP_LAT, lng: SP_LNG });
      assert.ok(r.isFail());
    });
  });
});
