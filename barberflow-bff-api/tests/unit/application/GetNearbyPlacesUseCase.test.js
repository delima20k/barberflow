'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { GetNearbyPlacesUseCase } = require('../../../application/geo/GetNearbyPlacesUseCase');

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

function makeGeoRepository({ places = [] } = {}) {
  return {
    async getNearbyPlaces() { return places; }
  };
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('GetNearbyPlacesUseCase', () => {
  describe('execute() — validação de input', () => {
    const useCase = new GetNearbyPlacesUseCase({ geoRepository: makeGeoRepository() });

    it('falha com lat ausente', async () => {
      const r = await useCase.execute({ lng: -43.1, radiusKm: 5 });
      assert.ok(r.isFail());
      assert.match(r.getError(), /lat/i);
    });

    it('falha com lng ausente', async () => {
      const r = await useCase.execute({ lat: -23.5, radiusKm: 5 });
      assert.ok(r.isFail());
      assert.match(r.getError(), /lng/i);
    });

    it('falha com lat inválida', async () => {
      const r = await useCase.execute({ lat: 200, lng: -43.1, radiusKm: 5 });
      assert.ok(r.isFail());
    });

    it('falha com radiusKm zero', async () => {
      const r = await useCase.execute({ lat: -23.5, lng: -43.1, radiusKm: 0 });
      assert.ok(r.isFail());
      assert.match(r.getError(), /raio/i);
    });

    it('falha com radiusKm negativo', async () => {
      const r = await useCase.execute({ lat: -23.5, lng: -43.1, radiusKm: -1 });
      assert.ok(r.isFail());
    });
  });

  describe('execute() — casos de sucesso', () => {
    it('retorna lista de places', async () => {
      const fakePlaces = [{ id: 'b1', name: 'Barbearia X', distanceMeters: 300 }];
      const useCase = new GetNearbyPlacesUseCase({
        geoRepository: makeGeoRepository({ places: fakePlaces })
      });

      const r = await useCase.execute({ lat: -23.5, lng: -43.1, radiusKm: 5 });
      assert.ok(r.isOk());
      assert.deepEqual(r.getValue(), fakePlaces);
    });

    it('retorna lista vazia quando não há places', async () => {
      const useCase = new GetNearbyPlacesUseCase({
        geoRepository: makeGeoRepository({ places: [] })
      });

      const r = await useCase.execute({ lat: -23.5, lng: -43.1, radiusKm: 5 });
      assert.ok(r.isOk());
      assert.deepEqual(r.getValue(), []);
    });

    it('usa limit default quando não fornecido', async () => {
      let capturedLimit;
      const repo = {
        async getNearbyPlaces({ limit }) {
          capturedLimit = limit;
          return [];
        }
      };
      const useCase = new GetNearbyPlacesUseCase({ geoRepository: repo });
      await useCase.execute({ lat: -23.5, lng: -43.1, radiusKm: 5 });
      assert.ok(capturedLimit > 0);
    });

    it('converte radiusKm para metros ao chamar repository', async () => {
      let capturedRadius;
      const repo = {
        async getNearbyPlaces({ radiusMeters }) {
          capturedRadius = radiusMeters;
          return [];
        }
      };
      const useCase = new GetNearbyPlacesUseCase({ geoRepository: repo });
      await useCase.execute({ lat: -23.5, lng: -43.1, radiusKm: 3 });
      assert.strictEqual(capturedRadius, 3000);
    });
  });

  describe('execute() — erro no repositório', () => {
    it('propaga erro do geoRepository', async () => {
      const repo = {
        async getNearbyPlaces() { throw new Error('DB down'); }
      };
      const useCase = new GetNearbyPlacesUseCase({ geoRepository: repo });
      const r = await useCase.execute({ lat: -23.5, lng: -43.1, radiusKm: 5 });
      assert.ok(r.isFail());
      assert.match(r.getError(), /DB down/);
    });
  });
});
