'use strict';

/**
 * tests/barbearia-service.test.js
 *
 * Testa BarbeariaService — lógica de negócio da camada de serviço.
 * Usa repo mockado (sem Supabase) para isolar a conversão distancia_m → distancia_km
 * e a validação de raio que não é coberta pelos testes de repositório.
 */

process.env.APP_ENV                   = 'development';
process.env.SUPABASE_URL              = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.SUPABASE_ANON_KEY         = 'test-anon-key';

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');

const BarbeariaService = require('../services/BarbeariaService');

const LAT  = -23.4516;
const LNG  = -46.7460;
const RAIO = 5;

// ─────────────────────────────────────────────────────────────────────────────
// BarbeariaService.listarProximas() — conversão distancia_m → distancia_km
// ─────────────────────────────────────────────────────────────────────────────

suite('BarbeariaService.listarProximas() — conversão distancia_m → distancia_km', () => {

  test('converte distancia_m para distancia_km corretamente', async () => {
    const repo = { getNearby: async () => [{ id: 'a', distancia_m: 1500 }] };
    const svc  = new BarbeariaService(repo);
    const rows = await svc.listarProximas(LAT, LNG, RAIO);

    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].distancia_km, 1.5);
  });

  test('distancia_m = 0 resulta em distancia_km = 0', async () => {
    const repo = { getNearby: async () => [{ id: 'b', distancia_m: 0 }] };
    const svc  = new BarbeariaService(repo);
    const rows = await svc.listarProximas(LAT, LNG, RAIO);

    assert.strictEqual(rows[0].distancia_km, 0);
  });

  test('distancia_m = null resulta em distancia_km = null (sem crash)', async () => {
    const repo = { getNearby: async () => [{ id: 'c', distancia_m: null }] };
    const svc  = new BarbeariaService(repo);
    const rows = await svc.listarProximas(LAT, LNG, RAIO);

    assert.strictEqual(rows[0].distancia_km, null);
  });

  test('campos originais da barbearia são preservados no resultado', async () => {
    const barbearia = { id: 'd', name: 'Barbearia D', distancia_m: 3000 };
    const repo = { getNearby: async () => [barbearia] };
    const svc  = new BarbeariaService(repo);
    const rows = await svc.listarProximas(LAT, LNG, RAIO);

    assert.strictEqual(rows[0].id,   'd');
    assert.strictEqual(rows[0].name, 'Barbearia D');
    assert.strictEqual(rows[0].distancia_km, 3);
  });

  test('retorna [] quando repositório retorna lista vazia', async () => {
    const repo = { getNearby: async () => [] };
    const svc  = new BarbeariaService(repo);
    const rows = await svc.listarProximas(LAT, LNG, RAIO);

    assert.ok(Array.isArray(rows));
    assert.strictEqual(rows.length, 0);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// BarbeariaService.listarProximas() — validação de raio
// ─────────────────────────────────────────────────────────────────────────────

suite('BarbeariaService.listarProximas() — validação de raio', () => {

  test('lança AppError(400) para raio > 100', async () => {
    const repo = { getNearby: async () => [] };
    const svc  = new BarbeariaService(repo);

    await assert.rejects(
      () => svc.listarProximas(LAT, LNG, 101),
      (err) => {
        assert.strictEqual(err.status, 400);
        return true;
      },
    );
  });

  test('lança AppError(400) para raio = 0', async () => {
    const repo = { getNearby: async () => [] };
    const svc  = new BarbeariaService(repo);

    await assert.rejects(
      () => svc.listarProximas(LAT, LNG, 0),
      (err) => err.status === 400,
    );
  });

  test('lança AppError(400) para raio negativo', async () => {
    const repo = { getNearby: async () => [] };
    const svc  = new BarbeariaService(repo);

    await assert.rejects(
      () => svc.listarProximas(LAT, LNG, -1),
      (err) => err.status === 400,
    );
  });

  test('não lança para raio = 100 (limite máximo)', async () => {
    const repo = { getNearby: async () => [] };
    const svc  = new BarbeariaService(repo);

    await assert.doesNotReject(() => svc.listarProximas(LAT, LNG, 100));
  });

  test('não lança para raio = 5 (valor padrão)', async () => {
    const repo = { getNearby: async () => [] };
    const svc  = new BarbeariaService(repo);

    await assert.doesNotReject(() => svc.listarProximas(LAT, LNG, 5));
  });

});
