'use strict';

// =============================================================
// repository-security.test.js
//
// Testes de segurança do padrão de repositório:
//   - BaseRepository: helpers _validarUuid / _validarEmail / _validarPayload
//   - ComunicacaoRepository.getConversa(): sem interpolação de string em .or()
//   - ComunicacaoRepository.enviarMensagem(): validação de UUIDs
//   - SocialRepository.createStory(): validação de barbershop_id e author_id
//   - ClienteRepository.findByEmail(): validação de e-mail + rpc parametrizado
// =============================================================

const { suite, test } = require('node:test');
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

suite('BaseRepository — helpers de validação', () => {

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
// ComunicacaoRepository — getConversa()
// ─────────────────────────────────────────────────────────────────────────────

suite('ComunicacaoRepository — getConversa()', () => {

  test('lança TypeError para userId inválido', async () => {
    const repo = new ComunicacaoRepository(criarSupa(criarBuilder()));
    await assert.rejects(() => repo.getConversa('nao-uuid', UUID_B), TypeError);
  });

  test('lança TypeError para contatoId inválido', async () => {
    const repo = new ComunicacaoRepository(criarSupa(criarBuilder()));
    await assert.rejects(() => repo.getConversa(UUID_A, 'nao-uuid'), TypeError);
  });

  test('NÃO usa .or() — elimina interpolação de string na query', async () => {
    let orFoiChamado = false;
    const b = criarBuilder({ data: [], error: null });
    b.or = fn(() => { orFoiChamado = true; return b; });

    const supa = { from: fn().mockReturnValue(b), rpc: fn() };
    const repo = new ComunicacaoRepository(supa);
    await repo.getConversa(UUID_A, UUID_B);

    assert.equal(orFoiChamado, false, 'getConversa não deve chamar .or() com interpolação');
  });

  test('faz exatamente 2 consultas ao banco (uma por direção da conversa)', async () => {
    let chamadas = 0;
    const supa = {
      from: fn(() => { chamadas++; return criarBuilder({ data: [], error: null }); }),
      rpc: fn(),
    };
    const repo = new ComunicacaoRepository(supa);
    await repo.getConversa(UUID_A, UUID_B);

    assert.equal(chamadas, 2, 'deve fazer exatamente 2 consultas');
  });

  test('mescla e ordena mensagens das duas direções por created_at', async () => {
    const msgMaisNova = {
      id: 'm1', sender_id: UUID_A, receiver_id: UUID_B,
      content: 'oi', created_at: '2024-01-01T10:00:00Z',
    };
    const msgMaisAntiga = {
      id: 'm2', sender_id: UUID_B, receiver_id: UUID_A,
      content: 'oi tb', created_at: '2024-01-01T09:00:00Z',
    };

    let chamada = 0;
    const supa = {
      from: fn(() => {
        chamada++;
        return criarBuilder({ data: chamada === 1 ? [msgMaisNova] : [msgMaisAntiga], error: null });
      }),
      rpc: fn(),
    };
    const repo = new ComunicacaoRepository(supa);
    const msgs = await repo.getConversa(UUID_A, UUID_B);

    assert.equal(msgs.length, 2);
    assert.equal(msgs[0].id, 'm2', 'mensagem mais antiga deve vir primeiro');
    assert.equal(msgs[1].id, 'm1', 'mensagem mais nova deve vir depois');
  });

  test('propaga erro do banco como exceção', async () => {
    const erroDB = new Error('connection refused');
    const b = criarBuilder({ data: null, error: erroDB });
    const repo = new ComunicacaoRepository(criarSupa(b));

    await assert.rejects(
      () => repo.getConversa(UUID_A, UUID_B),
      err => err === erroDB,
    );
  });

  test('respeita o limite — não retorna mais mensagens que o solicitado', async () => {
    const msgs = Array.from({ length: 5 }, (_, i) => ({
      id: `m${i}`, created_at: `2024-01-0${i + 1}T00:00:00Z`,
    }));

    let chamada = 0;
    const supa = {
      from: fn(() => {
        chamada++;
        return criarBuilder({ data: chamada === 1 ? msgs : [], error: null });
      }),
      rpc: fn(),
    };
    const repo = new ComunicacaoRepository(supa);
    const resultado = await repo.getConversa(UUID_A, UUID_B, 3);

    assert.equal(resultado.length, 3, 'não deve ultrapassar o limit solicitado');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ComunicacaoRepository — enviarMensagem()
// ─────────────────────────────────────────────────────────────────────────────

suite('ComunicacaoRepository — enviarMensagem()', () => {

  test('lança TypeError para remetente (UUID) inválido', async () => {
    const repo = new ComunicacaoRepository(criarSupa(criarBuilder()));
    await assert.rejects(() => repo.enviarMensagem('invalido', UUID_B, 'olá'), TypeError);
  });

  test('lança TypeError para destinatário (UUID) inválido', async () => {
    const repo = new ComunicacaoRepository(criarSupa(criarBuilder()));
    await assert.rejects(() => repo.enviarMensagem(UUID_A, 'invalido', 'olá'), TypeError);
  });

  test('lança TypeError para conteúdo vazio', async () => {
    const repo = new ComunicacaoRepository(criarSupa(criarBuilder()));
    await assert.rejects(() => repo.enviarMensagem(UUID_A, UUID_B, ''), TypeError);
  });

  test('lança TypeError para conteúdo muito longo (> 2000 chars)', async () => {
    const repo = new ComunicacaoRepository(criarSupa(criarBuilder()));
    const longo = 'x'.repeat(2001);
    await assert.rejects(() => repo.enviarMensagem(UUID_A, UUID_B, longo), TypeError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SocialRepository — createStory()
// ─────────────────────────────────────────────────────────────────────────────

suite('SocialRepository — createStory()', () => {

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

suite('ClienteRepository — findByEmail()', () => {

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
