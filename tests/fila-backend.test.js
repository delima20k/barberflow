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

/**
 * Mock para FilaRepository.getEstado() que retorna respostas diferentes
 * para a query de fila (primeiro from()) e a de timestamp (segundo from()).
 */
function criarGetEstadoMock({ fila = [], tsDoneAt = null, tsCheckInAt = null } = {}) {
  const filaBuilder = { select: fn(), eq: fn(), in: fn(), order: fn() };
  for (const m of ['select', 'eq', 'in', 'order']) filaBuilder[m].mockReturnValue(filaBuilder);
  const filaData = { data: fila, error: null };
  Object.defineProperty(filaBuilder, 'then', {
    get() { return Promise.resolve(filaData).then.bind(Promise.resolve(filaData)); },
  });

  const tsData = (tsDoneAt !== null || tsCheckInAt !== null)
    ? { done_at: tsDoneAt, check_in_at: tsCheckInAt }
    : null;
  const tsBuilder = { select: fn(), eq: fn(), order: fn(), limit: fn(),
    maybeSingle: fn().mockResolvedValue({ data: tsData, error: null }) };
  for (const m of ['select', 'eq', 'order', 'limit']) tsBuilder[m].mockReturnValue(tsBuilder);

  let callCount = 0;
  const supabase = { from: fn().mockImplementation(() => { callCount++; return callCount === 1 ? filaBuilder : tsBuilder; }) };
  return { supabase };
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

// ─────────────────────────────────────────────────────────────────────────────
// FilaRepository.getEstado() — ultimaMudanca inclui served_at
// ─────────────────────────────────────────────────────────────────────────────

suite('FilaRepository.getEstado()', () => {

  test('served_at é usado quando é o timestamp mais recente (in_service)', async () => {
    const servedAt = '2025-01-10T12:00:00.000Z';
    const checkIn  = '2025-01-10T11:00:00.000Z';
    const fila = [{ id: UUID_ENTRADA, status: 'in_service', served_at: servedAt, check_in_at: checkIn }];
    const { supabase } = criarGetEstadoMock({ fila, tsDoneAt: null, tsCheckInAt: checkIn });
    const repo = new FilaRepository(supabase);
    const result = await repo.getEstado(UUID_SHOP);
    // served_at (12h) é mais recente que check_in_at (11h) → ultimaMudanca deve ser served_at
    assert.equal(result.ultimaMudanca, servedAt);
  });

  test('done_at é usado quando é o timestamp mais recente (serviço finalizado)', async () => {
    const doneAt  = '2025-01-10T15:00:00.000Z';
    const checkIn = '2025-01-10T11:00:00.000Z';
    const fila = [{ id: UUID_ENTRADA, status: 'waiting', served_at: null, check_in_at: checkIn }];
    const { supabase } = criarGetEstadoMock({ fila, tsDoneAt: doneAt, tsCheckInAt: checkIn });
    const repo = new FilaRepository(supabase);
    const result = await repo.getEstado(UUID_SHOP);
    // done_at (15h) é mais recente que served_at (null) e check_in_at (11h)
    assert.equal(result.ultimaMudanca, doneAt);
  });

  test('retorna null quando não há nenhum timestamp', async () => {
    const { supabase } = criarGetEstadoMock({ fila: [], tsDoneAt: null, tsCheckInAt: null });
    const repo = new FilaRepository(supabase);
    const result = await repo.getEstado(UUID_SHOP);
    assert.equal(result.ultimaMudanca, null);
  });

  test('retorna a fila corretamente', async () => {
    const fila = [{ id: UUID_ENTRADA, status: 'waiting', served_at: null, check_in_at: '2025-01-10T11:00:00.000Z' }];
    const { supabase } = criarGetEstadoMock({ fila });
    const repo = new FilaRepository(supabase);
    const result = await repo.getEstado(UUID_SHOP);
    assert.deepEqual(result.fila, fila);
  });
});
