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

// ─────────────────────────────────────────────────────────────────────────────
// BarbeariaService — graceful degradation quando banco falha
// ─────────────────────────────────────────────────────────────────────────────

suite('BarbeariaService — graceful degradation (banco falha)', () => {

  const ERRO_BANCO = new Error('DB connection refused');

  test('listarProximas retorna [] quando repo.getNearby lança', async () => {
    const repo = { getNearby: async () => { throw ERRO_BANCO; } };
    const svc  = new BarbeariaService(repo);
    const rows = await svc.listarProximas(LAT, LNG, RAIO);

    assert.deepStrictEqual(rows, [], 'deve retornar [] sem propagar exceção');
  });

  test('listarDestaque retorna [] quando repo.getFeatured lança', async () => {
    const repo = { getFeatured: async () => { throw ERRO_BANCO; } };
    const svc  = new BarbeariaService(repo);
    const rows = await svc.listarDestaque(6);

    assert.deepStrictEqual(rows, [], 'deve retornar [] sem propagar exceção');
  });

  test('listarTodas retorna [] quando repo.getAll lança', async () => {
    const repo = { getAll: async () => { throw ERRO_BANCO; } };
    const svc  = new BarbeariaService(repo);
    const rows = await svc.listarTodas(60);

    assert.deepStrictEqual(rows, [], 'deve retornar [] sem propagar exceção');
  });

  test('listarProximas com coordenadas inválidas ainda lança AppError(400) — não engole validação', async () => {
    const repo = { getNearby: async () => [] };
    const svc  = new BarbeariaService(repo);

    await assert.rejects(
      () => svc.listarProximas(999, 999, RAIO),
      (err) => err.status === 400,
      'erro de validação de coordenada NÃO deve ser silenciado pelo catch de banco',
    );
  });

});

suite('BarbeariaService.salvarEndereco() — endereco completo da barbearia', () => {

  test('normaliza numero e complemento e delega atualizacao ao repositorio', async () => {
    let recebido = null;
    const repo = {
      updateEndereco: async (ownerId, payload) => {
        recebido = { ownerId, payload };
        return { id: 'shop-1', ...payload };
      },
    };
    const svc = new BarbeariaService(repo);

    const result = await svc.salvarEndereco('550e8400-e29b-41d4-a716-446655440000', {
      address: 'Rua A',
      numero: '123',
      complemento: 'Sala 2',
      city: 'Sao Paulo',
      state: 'SP',
      zip_code: '01001000',
      neighborhood: 'Centro',
      lat: -23.55,
      lng: -46.63,
    });

    assert.strictEqual(recebido.ownerId, '550e8400-e29b-41d4-a716-446655440000');
    assert.strictEqual(recebido.payload.address, 'Rua A, 123, Sala 2');
    assert.strictEqual(recebido.payload.latitude, -23.55);
    assert.strictEqual(recebido.payload.longitude, -46.63);
    assert.strictEqual(result.address, 'Rua A, 123, Sala 2');
  });

  test('rejeita endereco sem coordenadas validas', async () => {
    const repo = { updateEndereco: async () => ({}) };
    const svc = new BarbeariaService(repo);

    await assert.rejects(
      () => svc.salvarEndereco('550e8400-e29b-41d4-a716-446655440000', {
        address: 'Rua A',
        lat: 'abc',
        lng: -46.63,
      }),
      (err) => err.status === 400,
    );
  });

});
