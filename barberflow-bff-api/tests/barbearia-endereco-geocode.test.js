'use strict';

/**
 * tests/barbearia-endereco-geocode.test.js
 *
 * Testa o salvamento de endereço com geocodificação como enriquecimento opcional em
 * BarbeariaService.salvarEndereco() com geocoder mockado (sem rede).
 *
 * Cenários:
 *  a) coords enviadas pelo cliente → geocoder NÃO é chamado
 *  b) coords ausentes + geocoder resolve → updateEndereco recebe lat/lng
 *  c) coords ausentes + geocoder falha/sem resultado → endereço ainda é salvo
 *  d) coords ausentes + geocoder não injetado → endereço ainda é salvo
 */

process.env.APP_ENV                   = 'development';
process.env.SUPABASE_URL              = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.SUPABASE_ANON_KEY         = 'test-anon-key';

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');

const BarbeariaService = require('../services/BarbeariaService');
const { Result }       = require('../domain/shared/Result');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const SHOP_ID = '22222222-2222-4222-8222-222222222222';

const DADOS_BASE = {
  barbershop_id: SHOP_ID,
  address:       'Rua José da Silva Guimarães',
  numero:        '120',
  city:          'São Paulo',
  state:         'SP',
  zip_code:      '02943060',
  neighborhood:  'Jardim Cidade Pirituba',
};

function criarRepoMock() {
  const chamadas = [];
  return {
    chamadas,
    updateEndereco: async (userId, payload, barbershopId) => {
      chamadas.push({ userId, payload, barbershopId });
      return { id: barbershopId, ...payload };
    },
  };
}

suite('BarbeariaService.salvarEndereco() — geocodificação opcional', () => {

  test('a) coords do cliente → geocoder NÃO é chamado, coords persistidas', async () => {
    const repo = criarRepoMock();
    let geocoderChamado = false;
    const geocoder = {
      forwardGeocode: async () => { geocoderChamado = true; return Result.ok({ lat: 0, lng: 0 }); },
    };
    const svc = new BarbeariaService(repo, null, null, null, geocoder);

    await svc.salvarEndereco(USER_ID, { ...DADOS_BASE, lat: -23.45, lng: -46.73 });

    assert.strictEqual(geocoderChamado, false, 'geocoder não deve ser chamado quando cliente envia coords');
    assert.strictEqual(repo.chamadas.length, 1);
    assert.strictEqual(repo.chamadas[0].payload.latitude,  -23.45);
    assert.strictEqual(repo.chamadas[0].payload.longitude, -46.73);
  });

  test('b) sem coords + geocoder resolve → updateEndereco recebe lat/lng do geocoder', async () => {
    const repo = criarRepoMock();
    const geocoder = {
      forwardGeocode: async () => Result.ok({ lat: -23.4489525, lng: -46.7312735 }),
    };
    const svc = new BarbeariaService(repo, null, null, null, geocoder);

    await svc.salvarEndereco(USER_ID, { ...DADOS_BASE });

    assert.strictEqual(repo.chamadas.length, 1);
    assert.strictEqual(repo.chamadas[0].payload.latitude,  -23.4489525);
    assert.strictEqual(repo.chamadas[0].payload.longitude, -46.7312735);
  });

  test('c1) sem coords + geocoder sem resultado → salva o endereço sem coordenadas', async () => {
    const repo = criarRepoMock();
    const geocoder = { forwardGeocode: async () => Result.ok(null) };
    const svc = new BarbeariaService(repo, null, null, null, geocoder);

    await svc.salvarEndereco(USER_ID, { ...DADOS_BASE });

    assert.strictEqual(repo.chamadas.length, 1);
    assert.strictEqual(repo.chamadas[0].payload.latitude, undefined);
    assert.strictEqual(repo.chamadas[0].payload.longitude, undefined);
  });

  test('c2) sem coords + geocoder falha (Result.fail) → salva o endereço sem coordenadas', async () => {
    const repo = criarRepoMock();
    const geocoder = { forwardGeocode: async () => Result.fail('HTTP 503') };
    const svc = new BarbeariaService(repo, null, null, null, geocoder);

    await svc.salvarEndereco(USER_ID, { ...DADOS_BASE });

    assert.strictEqual(repo.chamadas.length, 1);
    assert.strictEqual(repo.chamadas[0].payload.latitude, undefined);
    assert.strictEqual(repo.chamadas[0].payload.longitude, undefined);
  });

  test('d) sem coords + geocoder não injetado → salva o endereço sem coordenadas', async () => {
    const repo = criarRepoMock();
    const svc = new BarbeariaService(repo);

    await svc.salvarEndereco(USER_ID, { ...DADOS_BASE });

    assert.strictEqual(repo.chamadas.length, 1);
    assert.strictEqual(repo.chamadas[0].payload.latitude, undefined);
    assert.strictEqual(repo.chamadas[0].payload.longitude, undefined);
  });

  test('geocoder recebe os campos de endereço validados', async () => {
    const repo = criarRepoMock();
    let recebido = null;
    const geocoder = {
      forwardGeocode: async (params) => { recebido = params; return Result.ok({ lat: -23.4, lng: -46.7 }); },
    };
    const svc = new BarbeariaService(repo, null, null, null, geocoder);

    await svc.salvarEndereco(USER_ID, { ...DADOS_BASE });

    assert.strictEqual(recebido.address,      'Rua José da Silva Guimarães');
    assert.strictEqual(recebido.city,         'São Paulo');
    assert.strictEqual(recebido.state,        'SP');
    assert.strictEqual(recebido.zipCode,      '02943060');
    assert.strictEqual(recebido.neighborhood, 'Jardim Cidade Pirituba');
  });
});
