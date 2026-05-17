'use strict';
/**
 * tests/comunicacao-backend.test.js
 *
 * Testa ComunicacaoRepository e ComunicacaoService do backend Node.js.
 * Cobre apenas: notificações.
 *
 * Mensagens diretas foram migradas para P2P com E2E encryption —
 * os métodos enviarMensagem/getConversa foram removidos.
 */

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const { fn }          = require('./_helpers.js');

const UUID_USER  = '00000000-0000-4000-8000-000000000001';
const UUID_NOTIF = '00000000-0000-4000-8000-000000000001';

function criarSupabaseMock({ data = null, error = null } = {}) {
  const result  = { data, error };
  const builder = {
    select: fn(), insert: fn(), update: fn(), delete: fn(),
    eq:     fn(), or:  fn(), order: fn(), limit: fn(), in: fn(),
    single:      fn().mockResolvedValue(result),
    maybeSingle: fn().mockResolvedValue(result),
  };
  const chainable = ['select','insert','update','delete','eq','or','order','limit','in'];
  for (const m of chainable) builder[m].mockReturnValue(builder);
  Object.defineProperty(builder, 'then', {
    get() { return Promise.resolve(result).then.bind(Promise.resolve(result)); },
  });
  const supabase = { from: fn().mockReturnValue(builder) };
  return { supabase, builder };
}

const ComunicacaoRepository = require('../src/repositories/ComunicacaoRepository');
const ComunicacaoService    = require('../src/services/ComunicacaoService');

// ─────────────────────────────────────────────────────────────────────────────
// ComunicacaoRepository
// ─────────────────────────────────────────────────────────────────────────────

suite('ComunicacaoRepository.getNotificacoes()', () => {

  test('busca tabela notifications', async () => {
    const { supabase } = criarSupabaseMock({ data: [] });
    const repo = new ComunicacaoRepository(supabase);
    await repo.getNotificacoes(UUID_USER);
    assert.ok(supabase.from.calls.some(([t]) => t === 'notifications'));
  });

  test('filtra por user_id', async () => {
    const { supabase, builder } = criarSupabaseMock({ data: [] });
    const repo = new ComunicacaoRepository(supabase);
    await repo.getNotificacoes(UUID_USER);
    assert.ok(builder.eq.calls.some(([col, val]) => col === 'user_id' && val === UUID_USER));
  });

  test('retorna array vazio quando data é null', async () => {
    const { supabase } = criarSupabaseMock({ data: null });
    const repo = new ComunicacaoRepository(supabase);
    const result = await repo.getNotificacoes(UUID_USER);
    assert.deepEqual(result, []);
  });
});

suite('ComunicacaoRepository.marcarLida()', () => {

  test('atualiza tabela notifications', async () => {
    const { supabase } = criarSupabaseMock({ data: { id: UUID_NOTIF, is_read: true } });
    const repo = new ComunicacaoRepository(supabase);
    await repo.marcarLida(UUID_NOTIF, UUID_USER);
    assert.ok(supabase.from.calls.some(([t]) => t === 'notifications'));
  });
});

suite('ComunicacaoRepository — métodos de mensagem removidos', () => {

  test('getConversa não existe', () => {
    const { supabase } = criarSupabaseMock({ data: [] });
    const repo = new ComunicacaoRepository(supabase);
    assert.strictEqual(typeof repo.getConversa, 'undefined');
  });

  test('enviarMensagem não existe', () => {
    const { supabase } = criarSupabaseMock({ data: [] });
    const repo = new ComunicacaoRepository(supabase);
    assert.strictEqual(typeof repo.enviarMensagem, 'undefined');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ComunicacaoService
// ─────────────────────────────────────────────────────────────────────────────

function criarComunicacaoService({ notifs = [] } = {}) {
  const repo = {
    getNotificacoes: fn().mockResolvedValue(notifs),
    marcarLida:      fn().mockResolvedValue({ id: UUID_NOTIF, is_read: true }),
  };
  return { service: new ComunicacaoService(repo), repo };
}

suite('ComunicacaoService.listarNotificacoes()', () => {

  test('lança 400 para UUID inválido', async () => {
    const { service } = criarComunicacaoService();
    await assert.rejects(
      () => service.listarNotificacoes('invalido'),
      (err) => err.status === 400,
    );
  });

  test('delega para repo.getNotificacoes()', async () => {
    const { service, repo } = criarComunicacaoService({ notifs: [{ id: UUID_NOTIF }] });
    const result = await service.listarNotificacoes(UUID_USER);
    assert.strictEqual(repo.getNotificacoes.calls.length, 1);
    assert.ok(Array.isArray(result));
  });
});

suite('ComunicacaoService.marcarNotificacaoLida()', () => {

  test('lança 400 para ID inválido', async () => {
    const { service } = criarComunicacaoService();
    await assert.rejects(
      () => service.marcarNotificacaoLida('invalido', UUID_USER),
      (err) => err.status === 400,
    );
  });

  test('delega para repo.marcarLida()', async () => {
    const { service, repo } = criarComunicacaoService();
    await service.marcarNotificacaoLida(UUID_NOTIF, UUID_USER);
    assert.strictEqual(repo.marcarLida.calls.length, 1);
  });
});

suite('ComunicacaoService — métodos de mensagem removidos', () => {

  test('listarConversa não existe', () => {
    const { service } = criarComunicacaoService();
    assert.strictEqual(typeof service.listarConversa, 'undefined');
  });

  test('enviarMensagem não existe', () => {
    const { service } = criarComunicacaoService();
    assert.strictEqual(typeof service.enviarMensagem, 'undefined');
  });
});
