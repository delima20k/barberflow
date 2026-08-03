'use strict';

const { afterEach, describe, test } = require('node:test');
const assert = require('node:assert/strict');

const { NominatimGeocoderAdapter } = require('../infrastructure/geo/NominatimGeocoderAdapter');

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

function criarResposta(data) {
  return {
    ok: true,
    json: async () => data,
  };
}

describe('NominatimGeocoderAdapter.forwardGeocode', () => {
  test('restringe a busca estruturada ao Brasil com countrycodes', async () => {
    const urls = [];
    global.fetch = async (url) => {
      urls.push(url);
      return criarResposta([{ lat: '-23.5001', lon: '-46.6001' }]);
    };

    const adapter = new NominatimGeocoderAdapter();
    const result = await adapter.forwardGeocode({
      address: 'Rua Teste',
      city: 'São Paulo',
      state: 'SP',
    });
    const query = new URL(urls[0]).searchParams;

    assert.equal(result.isOk(), true);
    assert.equal(query.get('countrycodes'), 'br');
    assert.equal(query.get('country'), null);
  });

  test('formata o CEP antes de usar o fallback estruturado', async () => {
    const urls = [];
    global.fetch = async (url) => {
      urls.push(url);
      return criarResposta([{ lat: '-23.4001', lon: '-46.7001' }]);
    };

    const adapter = new NominatimGeocoderAdapter();
    const result = await adapter.forwardGeocode({ zipCode: '02983021' });
    const query = new URL(urls[0]).searchParams;

    assert.equal(result.isOk(), true);
    assert.equal(query.get('postalcode'), '02983-021');
    assert.equal(query.get('countrycodes'), 'br');
  });
});
