'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { ReverseGeocodeUseCase } = require('../../../application/geo/ReverseGeocodeUseCase');
const { Result }                = require('../../../domain/shared/Result');

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

function makeGeocoder({ address = 'Rua Fake, 123', fail = false } = {}) {
  return {
    async reverseGeocode() {
      if (fail) return Result.fail('Geocoder offline');
      return Result.ok(address);
    }
  };
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('ReverseGeocodeUseCase', () => {
  describe('execute() — validação de input', () => {
    const useCase = new ReverseGeocodeUseCase({ reverseGeocoder: makeGeocoder() });

    it('falha com lat ausente', async () => {
      const r = await useCase.execute({ lng: -43.1 });
      assert.ok(r.isFail());
      assert.match(r.getError(), /lat/i);
    });

    it('falha com lng ausente', async () => {
      const r = await useCase.execute({ lat: -23.5 });
      assert.ok(r.isFail());
      assert.match(r.getError(), /lng/i);
    });

    it('falha com coordenada inválida', async () => {
      const r = await useCase.execute({ lat: 999, lng: -43.1 });
      assert.ok(r.isFail());
    });
  });

  describe('execute() — casos de sucesso', () => {
    it('retorna endereço do geocoder', async () => {
      const useCase = new ReverseGeocodeUseCase({ reverseGeocoder: makeGeocoder({ address: 'Av. Brasil, 50' }) });
      const r = await useCase.execute({ lat: -23.5, lng: -43.1 });
      assert.ok(r.isOk());
      assert.strictEqual(r.getValue(), 'Av. Brasil, 50');
    });
  });

  describe('execute() — falha do geocoder', () => {
    it('propaga falha do geocoder', async () => {
      const useCase = new ReverseGeocodeUseCase({ reverseGeocoder: makeGeocoder({ fail: true }) });
      const r = await useCase.execute({ lat: -23.5, lng: -43.1 });
      assert.ok(r.isFail());
      assert.match(r.getError(), /Geocoder offline/);
    });
  });
});
