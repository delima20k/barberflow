'use strict';

// =============================================================
// repository-security.test.js
//
// Testes de segurança do padrão de repositório:
//   - BaseRepository: helpers _validarUuid / _validarEmail / _validarPayload
//   - SocialRepository.createStory(): validação de barbershop_id e author_id
//   - ClienteRepository.findByEmail(): validação de e-mail + rpc parametrizado
//
// ComunicacaoRepository.getConversa() e enviarMensagem() foram removidos —
// mensagens diretas migradas para P2P com E2E encryption.
// =============================================================

const { describe, test } = require('node:test');
const assert          = require('node:assert/strict');
const { fn }          = require('./_helpers.js');

const ComunicacaoRepository = require('../src/repositories/ComunicacaoRepository');
const SocialRepository      = require('../src/repositories/SocialRepository');
const ClienteRepository     = require('../src/repositories/ClienteRepository');
const BaseRepository        = require('../src/infra/BaseRepository');

// UUIDs válidos para os testes
const UUID_A = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const UUID_B = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

// ─── Mock builder Supabase (thenable) ────────────────────────────────────────
// Suporte a `await builder.limit()` sem .single() / .maybeSingle() explícitos.
// O .then() faz o builder funcionar como Promise quando usado com await.

function criarBuilder(resultado = { data: null, error: null }) {
  const qb = {};
  const metodos = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'in', 'is', 'not', 'or',
    'order', 'limit', 'range', 'filter', 'match',
  ];
  for (const m of metodos) qb[m] = fn().mockReturnValue(qb);
  qb.single      = fn().mockResolvedValue(resultado);
  qb.maybeSingle = fn().mockResolvedValue(resultado);
  // Thenable: `await qb` e `await qb.limit(n)` resolvem com resultado
  qb.then = (resolve, reject) => Promise.resolve(resultado).then(resolve, reject);
  return qb;
}

function criarSupa(builder, rpcResult = { data: null, error: null }) {
  return {
    from: fn().mockReturnValue(builder),
    rpc:  fn().mockResolvedValue(rpcResult),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BaseRepository — helpers de validação
// ─────────────────────────────────────────────────────────────────────────────

describe('BaseRepository — helpers de validação', () => {

  class RepoConcreto extends BaseRepository {
    constructor() { super('RepoConcreto'); }
    testarUuid(campo, valor)          { this._validarUuid(campo, valor); }
    testarEmail(valor)                { this._validarEmail(valor); }
    testarPayload(dados, campos)      { return this._validarPayload(dados, campos); }
  }

  const repo = new RepoConcreto();

  test('_validarUuid não lança para UUID v4 válido', () => {
    assert.doesNotThrow(() => repo.testarUuid('id', UUID_A));
  });

  test('_validarUuid lança TypeError para string inválida', () => {
    assert.throws(() => repo.testarUuid('id', 'nao-e-uuid'), TypeError);
  });

  test('_validarUuid mensagem inclui nome do campo e da classe', () => {
    try {
      repo.testarUuid('barbershopId', 'invalido');
      assert.fail('deveria ter lançado TypeError');
    } catch (err) {
      assert.ok(err instanceof TypeError);
      assert.ok(err.message.includes('barbershopId'), 'mensagem deve incluir o campo');
      assert.ok(err.message.includes('[RepoConcreto]'), 'mensagem deve incluir o nome da classe');
    }
  });

  test('_validarEmail não lança para e-mail válido', () => {
    assert.doesNotThrow(() => repo.testarEmail('usuario@barbearia.com'));
  });

  test('_validarEmail lança TypeError para e-mail malformado', () => {
    assert.throws(() => repo.testarEmail('nao-e-email'), TypeError);
  });

  test('_validarPayload retorna apenas campos permitidos (previne mass assignment)', () => {
    const resultado = repo.testarPayload(
      { full_name: 'João', role: 'admin', campo_proibido: 'hack' },
      ['full_name'],
    );
    assert.ok('full_name' in resultado, 'campo permitido deve estar presente');
    assert.ok(!('role' in resultado), 'role não deve passar');
    assert.ok(!('campo_proibido' in resultado), 'campo proibido não deve passar');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ComunicacaoRepository — métodos de mensagem removidos (P2P E2E)
// ─────────────────────────────────────────────────────────────────────────────

describe('ComunicacaoRepository — métodos de mensagem removidos', () => {

  test('getConversa não existe', () => {
    const repo = new ComunicacaoRepository(criarSupa(criarBuilder()));
    assert.strictEqual(typeof repo.getConversa, 'undefined');
  });

  test('enviarMensagem não existe', () => {
    const repo = new ComunicacaoRepository(criarSupa(criarBuilder()));
    assert.strictEqual(typeof repo.enviarMensagem, 'undefined');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SocialRepository — createStory()
// ─────────────────────────────────────────────────────────────────────────────

describe('SocialRepository — createStory()', () => {

  test('lança TypeError para barbershop_id inválido', async () => {
    const repo = new SocialRepository(criarSupa(criarBuilder()));
    await assert.rejects(
      () => repo.createStory({ barbershop_id: 'invalido', author_id: UUID_A, media_url: 'x', type: 'image' }),
      TypeError,
    );
  });

  test('lança TypeError para author_id inválido', async () => {
    const repo = new SocialRepository(criarSupa(criarBuilder()));
    await assert.rejects(
      () => repo.createStory({ barbershop_id: UUID_B, author_id: 'invalido', media_url: 'x', type: 'image' }),
      TypeError,
    );
  });

  test('cria story com dados válidos e retorna registro inserido', async () => {
    const storyRetornado = { id: UUID_A, barbershop_id: UUID_B, author_id: UUID_A };
    const b = criarBuilder({ data: storyRetornado, error: null });
    const repo = new SocialRepository(criarSupa(b));

    const resultado = await repo.createStory({
      barbershop_id: UUID_B,
      author_id:     UUID_A,
      media_url:     'https://cdn.example.com/img.jpg',
      type:          'image',
    });

    assert.deepEqual(resultado, storyRetornado);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ClienteRepository — findByEmail()
// ─────────────────────────────────────────────────────────────────────────────

describe('ClienteRepository — findByEmail()', () => {

  test('lança TypeError para e-mail inválido', async () => {
    const repo = new ClienteRepository(criarSupa(criarBuilder()));
    await assert.rejects(() => repo.findByEmail('nao-e-email'), TypeError);
  });

  test('retorna null quando perfil não encontrado', async () => {
    const supa = criarSupa(criarBuilder(), { data: null, error: null });
    const repo = new ClienteRepository(supa);
    const resultado = await repo.findByEmail('joao@barbearia.com');
    assert.equal(resultado, null);
  });

  test('retorna dados do perfil quando encontrado', async () => {
    const perfilMock = { id: UUID_A, full_name: 'João' };
    const supa = criarSupa(criarBuilder(), { data: perfilMock, error: null });
    const repo = new ClienteRepository(supa);
    const resultado = await repo.findByEmail('joao@barbearia.com');
    assert.deepEqual(resultado, perfilMock);
  });

  test('chama rpc com e-mail normalizado em minúsculas', async () => {
    const supa = criarSupa(criarBuilder(), { data: null, error: null });
    const repo = new ClienteRepository(supa);
    await repo.findByEmail('JOAO@BARBEARIA.COM');

    const [nomeFuncao, params] = supa.rpc.calls[0];
    assert.equal(nomeFuncao, 'get_client_by_email');
    assert.deepEqual(params, { p_email: 'joao@barbearia.com' });
  });
});
