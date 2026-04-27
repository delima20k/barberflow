'use strict';
/**
 * tests/profissional-backend.test.js
 *
 * Testa ProfissionalRepository e ProfissionalService do backend Node.js.
 * Usa injeção de dependência direta (sem vm sandbox) porque os módulos
 * usam require() do CommonJS.
 */

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const { fn }          = require('./_helpers.js');

const UUID_PRO  = 'a0000000-0000-4000-8000-000000000001';
const UUID_SHOP = 'b0000000-0000-4000-8000-000000000001';

// ── Fábrica de supabase mock ──────────────────────────────────────────────────

function criarSupabaseMock({ data = null, error = null } = {}) {
  const result  = { data, error };
  const builder = {
    select: fn(), insert: fn(), update: fn(), delete: fn(), upsert: fn(),
    eq:     fn(), neq:   fn(), gte: fn(), lte: fn(), in: fn(), is: fn(),
    order:  fn(), limit: fn(), range: fn(), filter: fn(), or: fn(), not: fn(),
    single:      fn().mockResolvedValue(result),
    maybeSingle: fn().mockResolvedValue(result),
  };
  const chainable = [
    'select','insert','update','delete','upsert','eq','neq','gte','lte',
    'in','is','order','limit','range','filter','or','not',
  ];
  for (const m of chainable) builder[m].mockReturnValue(builder);
  Object.defineProperty(builder, 'then', {
    get() { return Promise.resolve(result).then.bind(Promise.resolve(result)); },
  });
  const supabase = { from: fn().mockReturnValue(builder) };
  return { supabase, builder };
}

const ProfissionalRepository = require('../src/repositories/ProfissionalRepository');
const ProfissionalService     = require('../src/services/ProfissionalService');

// ─────────────────────────────────────────────────────────────────────────────
// ProfissionalRepository
// ─────────────────────────────────────────────────────────────────────────────

suite('ProfissionalRepository.getById()', () => {

  test('busca professionals pela tabela correta', async () => {
    const { supabase } = criarSupabaseMock({ data: { id: UUID_PRO, is_active: true } });
    const repo = new ProfissionalRepository(supabase);
    await repo.getById(UUID_PRO);
    assert.ok(supabase.from.calls.some(([t]) => t === 'professionals'));
  });

  test('lança TypeError para UUID inválido', async () => {
    const { supabase } = criarSupabaseMock();
    const repo = new ProfissionalRepository(supabase);
    await assert.rejects(() => repo.getById('invalido'), TypeError);
  });

  test('retorna null quando not found', async () => {
    const { supabase } = criarSupabaseMock({ data: null, error: null });
    const repo = new ProfissionalRepository(supabase);
    const result = await repo.getById(UUID_PRO);
    assert.strictEqual(result, null);
  });
});

suite('ProfissionalRepository.getByBarbershop()', () => {

  test('busca professionals filtrando por barbershop_id', async () => {
    const { supabase, builder } = criarSupabaseMock({ data: [] });
    const repo = new ProfissionalRepository(supabase);
    await repo.getByBarbershop(UUID_SHOP);
    const eqCalls = builder.eq.calls;
    assert.ok(eqCalls.some(([col, val]) => col === 'barbershop_id' && val === UUID_SHOP));
  });

  test('retorna array vazio quando data é null', async () => {
    const { supabase } = criarSupabaseMock({ data: null });
    const repo = new ProfissionalRepository(supabase);
    const result = await repo.getByBarbershop(UUID_SHOP);
    assert.deepEqual(result, []);
  });
});

suite('ProfissionalRepository.getCadeiras()', () => {

  test('busca tabela chairs', async () => {
    const { supabase } = criarSupabaseMock({ data: [] });
    const repo = new ProfissionalRepository(supabase);
    await repo.getCadeiras(UUID_SHOP);
    assert.ok(supabase.from.calls.some(([t]) => t === 'chairs'));
  });
});

suite('ProfissionalRepository.getPortfolio()', () => {

  test('busca tabela portfolio_images', async () => {
    const { supabase } = criarSupabaseMock({ data: [] });
    const repo = new ProfissionalRepository(supabase);
    await repo.getPortfolio(UUID_PRO);
    assert.ok(supabase.from.calls.some(([t]) => t === 'portfolio_images'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ProfissionalService
// ─────────────────────────────────────────────────────────────────────────────

function criarService({ data = null } = {}) {
  const repo = {
    getById:         fn().mockResolvedValue(data),
    getByBarbershop: fn().mockResolvedValue(data ?? []),
    update:          fn().mockResolvedValue(data),
    getCadeiras:     fn().mockResolvedValue(data ?? []),
    getPortfolio:    fn().mockResolvedValue(data ?? []),
    addPortfolioImage:    fn().mockResolvedValue({ id: 'img-1' }),
    removePortfolioImage: fn().mockResolvedValue(true),
  };
  return { service: new ProfissionalService(repo), repo };
}

suite('ProfissionalService.buscarProfissional()', () => {

  test('retorna entidade quando profissional existe', async () => {
    const row = { id: UUID_PRO, is_active: true, full_name: 'João', role: 'barber', user_id: UUID_PRO, barbershop_id: UUID_SHOP };
    const { service } = criarService({ data: row });
    const result = await service.buscarProfissional(UUID_PRO);
    assert.ok(result.toJSON, 'deve retornar entidade com toJSON()');
  });

  test('lança 404 quando profissional não existe', async () => {
    const { service } = criarService({ data: null });
    await assert.rejects(
      () => service.buscarProfissional(UUID_PRO),
      (err) => err.status === 404,
    );
  });

  test('lança 400 para UUID inválido', async () => {
    const { service } = criarService();
    await assert.rejects(
      () => service.buscarProfissional('invalido'),
      (err) => err.status === 400,
    );
  });
});

suite('ProfissionalService.listarCadeiras()', () => {

  test('delega para repo.getCadeiras()', async () => {
    const { service, repo } = criarService({ data: [{ id: 'c1' }] });
    await service.listarCadeiras(UUID_SHOP);
    assert.strictEqual(repo.getCadeiras.calls.length, 1);
  });
});

suite('ProfissionalService.adicionarPortfolioImagem()', () => {

  test('lança 400 para image_url ausente', async () => {
    const { service } = criarService();
    await assert.rejects(
      () => service.adicionarPortfolioImagem(UUID_PRO, {}),
      (err) => err.status === 400,
    );
  });

  test('delega para repo.addPortfolioImage() com dados válidos', async () => {
    const { service, repo } = criarService();
    const dados = { image_url: 'https://cdn.example.com/img.jpg', professional_id: UUID_PRO };
    await service.adicionarPortfolioImagem(UUID_PRO, dados);
    assert.strictEqual(repo.addPortfolioImage.calls.length, 1);
  });
});
