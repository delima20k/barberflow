'use strict';
/**
 * tests/lgpd-backend.test.js
 *
 * Testa LgpdRepository e LgpdService do backend Node.js.
 */

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const { fn }          = require('./_helpers.js');

const UUID_USER = '00000000-0000-4000-8000-000000000001';
const UUID_CONS = 'c0000000-0000-4000-8000-000000000001';

function criarSupabaseMock({ data = null, error = null } = {}) {
  const result  = { data, error };
  const builder = {
    select: fn(), insert: fn(), update: fn(),
    eq:     fn(), order: fn(), limit: fn(), neq: fn(),
    single:      fn().mockResolvedValue(result),
    maybeSingle: fn().mockResolvedValue(result),
  };
  const chainable = ['select','insert','update','eq','order','limit','neq'];
  for (const m of chainable) builder[m].mockReturnValue(builder);
  Object.defineProperty(builder, 'then', {
    get() { return Promise.resolve(result).then.bind(Promise.resolve(result)); },
  });
  const supabase = { from: fn().mockReturnValue(builder) };
  return { supabase, builder };
}

const LgpdRepository = require('../src/repositories/LgpdRepository');
const LgpdService    = require('../src/services/LgpdService');

// ─────────────────────────────────────────────────────────────────────────────
// LgpdRepository
// ─────────────────────────────────────────────────────────────────────────────

suite('LgpdRepository.verificarAceite()', () => {

  test('busca tabela legal_consents', async () => {
    const { supabase } = criarSupabaseMock({ data: { id: UUID_CONS, user_id: UUID_USER } });
    const repo = new LgpdRepository(supabase);
    await repo.verificarAceite(UUID_USER);
    assert.ok(supabase.from.calls.some(([t]) => t === 'legal_consents'));
  });

  test('retorna null quando não há aceite (data null)', async () => {
    const { supabase } = criarSupabaseMock({ data: null });
    const repo = new LgpdRepository(supabase);
    const result = await repo.verificarAceite(UUID_USER);
    assert.strictEqual(result, null);
  });
});

suite('LgpdRepository.registrarAceite()', () => {

  test('insere na tabela legal_consents', async () => {
    const consent = { id: UUID_CONS, user_id: UUID_USER, version: '1.0' };
    const { supabase } = criarSupabaseMock({ data: consent });
    const repo = new LgpdRepository(supabase);
    await repo.registrarAceite(UUID_USER, { version: '1.0', ip: '127.0.0.1' });
    assert.ok(supabase.from.calls.some(([t]) => t === 'legal_consents'));
  });
});

suite('LgpdRepository.solicitarExclusao()', () => {

  test('insere na tabela data_deletion_requests', async () => {
    const { supabase } = criarSupabaseMock({ data: { id: 'del-1', user_id: UUID_USER } });
    const repo = new LgpdRepository(supabase);
    await repo.solicitarExclusao(UUID_USER, 'Não quero mais usar o app.');
    assert.ok(supabase.from.calls.some(([t]) => t === 'data_deletion_requests'));
  });
});

suite('LgpdRepository.registrarLogAcesso()', () => {

  test('insere na tabela data_access_log', async () => {
    const { supabase } = criarSupabaseMock({ data: { id: 'log-1' } });
    const repo = new LgpdRepository(supabase);
    await repo.registrarLogAcesso({ accessed_by: UUID_USER, target_user_id: UUID_USER, data_type: 'profile', purpose: 'view' });
    assert.ok(supabase.from.calls.some(([t]) => t === 'data_access_log'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LgpdService
// ─────────────────────────────────────────────────────────────────────────────

function criarLgpdService({ aceite = null } = {}) {
  const repo = {
    verificarAceite:   fn().mockResolvedValue(aceite),
    registrarAceite:   fn().mockResolvedValue({ id: UUID_CONS }),
    solicitarExclusao: fn().mockResolvedValue({ id: 'del-1' }),
    registrarLogAcesso: fn().mockResolvedValue({ id: 'log-1' }),
  };
  return { service: new LgpdService(repo), repo };
}

suite('LgpdService.verificarConsentimento()', () => {

  test('lança 400 para UUID inválido', async () => {
    const { service } = criarLgpdService();
    await assert.rejects(
      () => service.verificarConsentimento('invalido'),
      (err) => err.status === 400,
    );
  });

  test('retorna false quando não há aceite', async () => {
    const { service } = criarLgpdService({ aceite: null });
    const result = await service.verificarConsentimento(UUID_USER);
    assert.strictEqual(result.aceitou, false);
  });

  test('retorna true quando há aceite', async () => {
    const { service } = criarLgpdService({ aceite: { id: UUID_CONS, version: '1.0', accepted_at: new Date().toISOString() } });
    const result = await service.verificarConsentimento(UUID_USER);
    assert.strictEqual(result.aceitou, true);
  });
});

suite('LgpdService.registrarConsentimento()', () => {

  test('lança 400 quando version está ausente', async () => {
    const { service } = criarLgpdService();
    await assert.rejects(
      () => service.registrarConsentimento(UUID_USER, {}),
      (err) => err.status === 400,
    );
  });

  test('delega para repo.registrarAceite() com dados válidos', async () => {
    const { service, repo } = criarLgpdService();
    await service.registrarConsentimento(UUID_USER, { version: '1.0', ip: '127.0.0.1' });
    assert.strictEqual(repo.registrarAceite.calls.length, 1);
  });
});

suite('LgpdService.solicitarExclusaoDados()', () => {

  test('lança 400 para UUID inválido', async () => {
    const { service } = criarLgpdService();
    await assert.rejects(
      () => service.solicitarExclusaoDados('invalido', 'motivo'),
      (err) => err.status === 400,
    );
  });

  test('lança 400 quando motivo está vazio', async () => {
    const { service } = criarLgpdService();
    await assert.rejects(
      () => service.solicitarExclusaoDados(UUID_USER, ''),
      (err) => err.status === 400,
    );
  });

  test('delega para repo.solicitarExclusao() com dados válidos', async () => {
    const { service, repo } = criarLgpdService();
    await service.solicitarExclusaoDados(UUID_USER, 'Quero minha conta excluída.');
    assert.strictEqual(repo.solicitarExclusao.calls.length, 1);
  });
});
