'use strict';
/**
 * tests/fila-backend.test.js
 *
 * Testa FilaRepository e FilaService do backend Node.js.
 */

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const { fn }          = require('./_helpers.js');

const UUID_USER     = '00000000-0000-4000-8000-000000000001';
const UUID_SHOP     = 'b0000000-0000-4000-8000-000000000001';
const UUID_ENTRADA  = 'e0000000-0000-4000-8000-000000000001';

function criarSupabaseMock({ data = null, error = null } = {}) {
  const result  = { data, error };
  const builder = {
    select: fn(), insert: fn(), update: fn(), delete: fn(),
    eq:     fn(), neq: fn(), order: fn(), limit: fn(), in: fn(),
    single:      fn().mockResolvedValue(result),
    maybeSingle: fn().mockResolvedValue(result),
  };
  const chainable = ['select','insert','update','delete','eq','neq','order','limit','in'];
  for (const m of chainable) builder[m].mockReturnValue(builder);
  Object.defineProperty(builder, 'then', {
    get() { return Promise.resolve(result).then.bind(Promise.resolve(result)); },
  });
  const supabase = { from: fn().mockReturnValue(builder) };
  return { supabase, builder };
}

const FilaRepository = require('../src/repositories/FilaRepository');
const FilaService    = require('../src/services/FilaService');

// ─────────────────────────────────────────────────────────────────────────────
// FilaRepository
// ─────────────────────────────────────────────────────────────────────────────

suite('FilaRepository.getFila()', () => {

  test('busca tabela queue_entries', async () => {
    const { supabase } = criarSupabaseMock({ data: [] });
    const repo = new FilaRepository(supabase);
    await repo.getFila(UUID_SHOP);
    assert.ok(supabase.from.calls.some(([t]) => t === 'queue_entries'));
  });

  test('filtra por barbershop_id', async () => {
    const { supabase, builder } = criarSupabaseMock({ data: [] });
    const repo = new FilaRepository(supabase);
    await repo.getFila(UUID_SHOP);
    assert.ok(builder.eq.calls.some(([col, val]) => col === 'barbershop_id' && val === UUID_SHOP));
  });

  test('retorna array vazio quando data é null', async () => {
    const { supabase } = criarSupabaseMock({ data: null });
    const repo = new FilaRepository(supabase);
    const result = await repo.getFila(UUID_SHOP);
    assert.deepEqual(result, []);
  });
});

suite('FilaRepository.entrar()', () => {

  test('insere na tabela queue_entries', async () => {
    const entrada = { id: UUID_ENTRADA, barbershop_id: UUID_SHOP, user_id: UUID_USER, status: 'waiting' };
    const { supabase } = criarSupabaseMock({ data: entrada });
    const repo = new FilaRepository(supabase);
    await repo.entrar(UUID_SHOP, UUID_USER, {});
    assert.ok(supabase.from.calls.some(([t]) => t === 'queue_entries'));
  });
});

suite('FilaRepository.sair()', () => {

  test('deleta da tabela queue_entries', async () => {
    const { supabase } = criarSupabaseMock({ data: { id: UUID_ENTRADA } });
    const repo = new FilaRepository(supabase);
    await repo.sair(UUID_ENTRADA, UUID_USER);
    assert.ok(supabase.from.calls.some(([t]) => t === 'queue_entries'));
  });
});

suite('FilaRepository.atualizarStatus()', () => {

  test('atualiza tabela queue_entries', async () => {
    const { supabase } = criarSupabaseMock({ data: { id: UUID_ENTRADA, status: 'in_service' } });
    const repo = new FilaRepository(supabase);
    await repo.atualizarStatus(UUID_ENTRADA, 'in_service');
    assert.ok(supabase.from.calls.some(([t]) => t === 'queue_entries'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FilaService
// ─────────────────────────────────────────────────────────────────────────────

function criarFilaService({ fila = [], entrada = null } = {}) {
  const repo = {
    getFila:         fn().mockResolvedValue(fila),
    entrar:          fn().mockResolvedValue(entrada ?? { id: UUID_ENTRADA, status: 'waiting' }),
    sair:            fn().mockResolvedValue(true),
    atualizarStatus: fn().mockResolvedValue({ id: UUID_ENTRADA, status: 'in_service' }),
    getEntrada:      fn().mockResolvedValue(entrada),
  };
  return { service: new FilaService(repo), repo };
}

suite('FilaService.verFila()', () => {

  test('lança 400 para barbeariaId inválido', async () => {
    const { service } = criarFilaService();
    await assert.rejects(
      () => service.verFila('invalido'),
      (err) => err.status === 400,
    );
  });

  test('delega para repo.getFila()', async () => {
    const { service, repo } = criarFilaService({ fila: [{ id: UUID_ENTRADA }] });
    const result = await service.verFila(UUID_SHOP);
    assert.strictEqual(repo.getFila.calls.length, 1);
    assert.ok(Array.isArray(result));
  });
});

suite('FilaService.entrarFila()', () => {

  test('lança 400 para barbeariaId inválido', async () => {
    const { service } = criarFilaService();
    await assert.rejects(
      () => service.entrarFila('invalido', UUID_USER, {}),
      (err) => err.status === 400,
    );
  });

  test('delega para repo.entrar() com dados válidos', async () => {
    const { service, repo } = criarFilaService();
    await service.entrarFila(UUID_SHOP, UUID_USER, {});
    assert.strictEqual(repo.entrar.calls.length, 1);
  });
});

suite('FilaService.sairFila()', () => {

  test('lança 400 para entradaId inválido', async () => {
    const { service } = criarFilaService();
    await assert.rejects(
      () => service.sairFila('invalido', UUID_USER),
      (err) => err.status === 400,
    );
  });

  test('delega para repo.sair() com IDs válidos', async () => {
    const { service, repo } = criarFilaService();
    await service.sairFila(UUID_ENTRADA, UUID_USER);
    assert.strictEqual(repo.sair.calls.length, 1);
  });
});

suite('FilaService.atualizarStatusEntrada()', () => {

  test('lança 400 para status inválido', async () => {
    const { service } = criarFilaService({ entrada: { id: UUID_ENTRADA, status: 'waiting' } });
    await assert.rejects(
      () => service.atualizarStatusEntrada(UUID_ENTRADA, 'voando'),
      (err) => err.status === 400,
    );
  });

  test('status válido delega para repo.atualizarStatus()', async () => {
    const { service, repo } = criarFilaService({ entrada: { id: UUID_ENTRADA, status: 'waiting' } });
    await service.atualizarStatusEntrada(UUID_ENTRADA, 'in_service');
    assert.strictEqual(repo.atualizarStatus.calls.length, 1);
  });
});
