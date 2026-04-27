'use strict';
/**
 * tests/comunicacao-backend.test.js
 *
 * Testa ComunicacaoRepository e ComunicacaoService do backend Node.js.
 */

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const { fn }          = require('./_helpers.js');

const UUID_USER    = '00000000-0000-4000-8000-000000000001';
const UUID_CONTATO = '00000000-0000-4000-8000-000000000002';
const UUID_NOTIF   = '00000000-0000-4000-8000-000000000001';

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

suite('ComunicacaoRepository.getConversa()', () => {

  test('busca tabela direct_messages', async () => {
    const { supabase } = criarSupabaseMock({ data: [] });
    const repo = new ComunicacaoRepository(supabase);
    await repo.getConversa(UUID_USER, UUID_CONTATO);
    assert.ok(supabase.from.calls.some(([t]) => t === 'direct_messages'));
  });

  test('retorna array vazio quando data é null', async () => {
    const { supabase } = criarSupabaseMock({ data: null });
    const repo = new ComunicacaoRepository(supabase);
    const result = await repo.getConversa(UUID_USER, UUID_CONTATO);
    assert.deepEqual(result, []);
  });
});

suite('ComunicacaoRepository.enviarMensagem()', () => {

  test('insere na tabela direct_messages', async () => {
    const msg = { id: 'msg-1', sender_id: UUID_USER, receiver_id: UUID_CONTATO, content: 'Olá' };
    const { supabase } = criarSupabaseMock({ data: msg });
    const repo = new ComunicacaoRepository(supabase);
    await repo.enviarMensagem(UUID_USER, UUID_CONTATO, 'Olá');
    assert.ok(supabase.from.calls.some(([t]) => t === 'direct_messages'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ComunicacaoService
// ─────────────────────────────────────────────────────────────────────────────

function criarComunicacaoService({ notifs = [], msgs = [] } = {}) {
  const repo = {
    getNotificacoes: fn().mockResolvedValue(notifs),
    marcarLida:      fn().mockResolvedValue({ id: UUID_NOTIF, is_read: true }),
    getConversa:     fn().mockResolvedValue(msgs),
    enviarMensagem:  fn().mockResolvedValue({ id: 'msg-1' }),
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

suite('ComunicacaoService.listarConversa()', () => {

  test('lança 400 se contatoId inválido', async () => {
    const { service } = criarComunicacaoService();
    await assert.rejects(
      () => service.listarConversa(UUID_USER, 'invalido'),
      (err) => err.status === 400,
    );
  });

  test('delega para repo.getConversa()', async () => {
    const { service, repo } = criarComunicacaoService({ msgs: [{ id: 'msg-1' }] });
    await service.listarConversa(UUID_USER, UUID_CONTATO);
    assert.strictEqual(repo.getConversa.calls.length, 1);
  });
});

suite('ComunicacaoService.enviarMensagem()', () => {

  test('lança 400 quando conteúdo está vazio', async () => {
    const { service } = criarComunicacaoService();
    await assert.rejects(
      () => service.enviarMensagem(UUID_USER, UUID_CONTATO, '   '),
      (err) => err.status === 400,
    );
  });

  test('lança 400 quando conteúdo excede 2000 chars', async () => {
    const { service } = criarComunicacaoService();
    await assert.rejects(
      () => service.enviarMensagem(UUID_USER, UUID_CONTATO, 'x'.repeat(2001)),
      (err) => err.status === 400,
    );
  });

  test('delega para repo.enviarMensagem() com dados válidos', async () => {
    const { service, repo } = criarComunicacaoService();
    await service.enviarMensagem(UUID_USER, UUID_CONTATO, 'Olá, tudo bem?');
    assert.strictEqual(repo.enviarMensagem.calls.length, 1);
  });
});
