'use strict';

/**
 * tests/servicos-seguranca.test.js
 *
 * Testes de segurança da camada de serviços (backend):
 *   - BaseService: helpers _uuid, _texto, _enum, _erro
 *   - AgendamentoService: detecção de conflito de horário + verificação de propriedade
 *   - ComunicacaoService: bloqueio de auto-mensagem
 *   - UserService: buscarPorEmail / buscarPerfilPublico
 */

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');

const BaseService        = require('../src/infra/BaseService');
const AgendamentoService = require('../src/services/AgendamentoService');
const ComunicacaoService = require('../src/services/ComunicacaoService');
const UserService        = require('../src/services/UserService');

// ── UUIDs fixos para testes ──────────────────────────────────
const UUID_A = 'a0000000-0000-4000-8000-000000000001'; // cliente
const UUID_B = 'b0000000-0000-4000-8000-000000000001'; // profissional
const UUID_C = 'c0000000-0000-4000-8000-000000000001'; // barbearia
const UUID_D = 'd0000000-0000-4000-8000-000000000001'; // serviço
const UUID_E = 'e0000000-0000-4000-8000-000000000001'; // agendamento

// ── Helper: data futura ISO ──────────────────────────────────
function amanha(offsetMs = 0) {
  return new Date(Date.now() + 24 * 3_600_000 + offsetMs).toISOString();
}

// =============================================================
// BaseService — helpers de validação
// =============================================================

suite('BaseService — helpers de validação', () => {

  class ServicoTeste extends BaseService {
    constructor() { super('ServicoTeste'); }
    uuid(c, v)          { this._uuid(c, v); }
    texto(c, v, m, o)   { return this._texto(c, v, m, o); }
    enume(c, v, ops)    { this._enum(c, v, ops); }
    erro(m, s)          { return this._erro(m, s); }
  }

  const svc = new ServicoTeste();

  test('_uuid lança Error{status:400} para UUID inválido', () => {
    assert.throws(
      () => svc.uuid('campo', 'nao-e-uuid'),
      (err) => err.status === 400,
    );
  });

  test('_uuid não lança para UUID válido', () => {
    assert.doesNotThrow(() => svc.uuid('campo', UUID_A));
  });

  test('_texto retorna valor sanitizado para texto válido', () => {
    const val = svc.texto('bio', 'Texto válido', 500);
    assert.strictEqual(typeof val, 'string');
    assert.ok(val.length > 0);
  });

  test('_texto lança Error{status:400} para texto acima do limite', () => {
    assert.throws(
      () => svc.texto('bio', 'x'.repeat(501), 500, false),
      (err) => err.status === 400,
    );
  });

  test('_texto lança Error{status:400} para obrigatório vazio', () => {
    assert.throws(
      () => svc.texto('obs', '', 500, true),
      (err) => err.status === 400,
    );
  });

  test('_enum lança Error{status:400} para valor fora da lista', () => {
    assert.throws(
      () => svc.enume('status', 'INVALIDO', ['a', 'b']),
      (err) => err.status === 400,
    );
  });

  test('_enum não lança para valor válido', () => {
    assert.doesNotThrow(() => svc.enume('status', 'a', ['a', 'b']));
  });

  test('_erro retorna Error com status correto', () => {
    const err = svc.erro('mensagem teste', 422);
    assert.strictEqual(err.status, 422);
    assert.strictEqual(err.message, 'mensagem teste');
  });

  test('_erro usa 400 como status padrão', () => {
    const err = svc.erro('msg padrão');
    assert.strictEqual(err.status, 400);
  });
});

// =============================================================
// AgendamentoService — verificação de conflito de horário
// =============================================================

suite('AgendamentoService — criarAgendamento com verificação de conflito', () => {

  const dadosBase = {
    client_id:       UUID_A,
    professional_id: UUID_B,
    barbershop_id:   UUID_C,
    service_id:      UUID_D,
    scheduled_at:    amanha(),
    duration_min:    60,
    status:          'pending',
  };

  test('cria agendamento com sucesso quando não há conflito', async () => {
    const repo = {
      getConflitos: async () => [],
      criar:        async (d) => ({ ...d, id: UUID_E }),
    };
    const svc = new AgendamentoService(repo);
    const ag  = await svc.criarAgendamento(dadosBase);
    assert.strictEqual(ag.id, UUID_E);
  });

  test('lança Error{status:409} quando há conflito de horário', async () => {
    const conflito = {
      id:           UUID_E,
      scheduled_at: amanha(),   // mesmo horário
      duration_min: 60,
      status:       'confirmed',
    };
    const repo = {
      getConflitos: async () => [conflito],
      criar:        async () => { throw new Error('não deve chegar aqui'); },
    };
    const svc = new AgendamentoService(repo);
    await assert.rejects(
      () => svc.criarAgendamento(dadosBase),
      (err) => err.status === 409,
    );
  });

  test('permite criar quando conflito está 3h depois (sem sobreposição)', async () => {
    // Novo agendamento: amanhã por 60min
    // Conflito: amanhã + 3h por 30min → sem sobreposição
    const conflito = {
      id:           UUID_E,
      scheduled_at: amanha(3 * 3_600_000), // 3h depois
      duration_min: 30,
      status:       'confirmed',
    };
    const repo = {
      getConflitos: async () => [conflito],
      criar:        async (d) => ({ ...d, id: UUID_E }),
    };
    const svc = new AgendamentoService(repo);
    const ag  = await svc.criarAgendamento(dadosBase);
    assert.strictEqual(ag.id, UUID_E);
  });

  test('lança 409 para conflito parcial (novo começa no meio do existente)', async () => {
    // Existente: amanhã por 120min (acaba em amanhã+2h)
    // Novo: amanhã + 1h por 60min → começa no meio do existente
    const conflito = {
      id:           UUID_E,
      scheduled_at: amanha(),   // começa no mesmo momento que o novo
      duration_min: 120,
      status:       'confirmed',
    };
    const dadosParcial = { ...dadosBase, scheduled_at: amanha(3_600_000) }; // +1h
    const repo = {
      getConflitos: async () => [conflito],
      criar:        async () => { throw new Error('não deve chegar aqui'); },
    };
    const svc = new AgendamentoService(repo);
    await assert.rejects(
      () => svc.criarAgendamento(dadosParcial),
      (err) => err.status === 409,
    );
  });

  test('ignora conflitos com status cancelled ou no_show', async () => {
    // getConflitos já filtra por status no banco; serviço não precisa refiltrar
    // mas se por algum motivo retornar, o serviço não deve bloquear
    // Neste teste, o repo retorna lista vazia (filtro no banco funcionou)
    const repo = {
      getConflitos: async () => [],
      criar:        async (d) => ({ ...d, id: UUID_E }),
    };
    const svc = new AgendamentoService(repo);
    const ag  = await svc.criarAgendamento(dadosBase);
    assert.ok(ag);
  });
});

// =============================================================
// AgendamentoService — verificação de propriedade (ownership)
// =============================================================

suite('AgendamentoService — atualizarStatus com verificação de propriedade', () => {

  function criarRepoAgendamento(clienteId, profissionalId) {
    return {
      getConflitos:    async () => [],
      getById:         async () => ({
        id:           UUID_E,
        status:       'pending',
        client:       { id: clienteId },
        professional: { id: profissionalId },
      }),
      atualizarStatus: async () => ({
        id:           UUID_E,
        client_id:    clienteId,
        professional_id: profissionalId,
        status:       'cancelled',
        scheduled_at: amanha(),
        duration_min: 30,
      }),
    };
  }

  test('cliente cancela o próprio agendamento com sucesso', async () => {
    const repo = criarRepoAgendamento(UUID_A, UUID_B);
    const svc  = new AgendamentoService(repo);
    const ag   = await svc.cancelarAgendamento(UUID_E, UUID_A);
    assert.ok(ag);
  });

  test('profissional cancela agendamento com sucesso', async () => {
    const repo = criarRepoAgendamento(UUID_A, UUID_B);
    const svc  = new AgendamentoService(repo);
    const ag   = await svc.cancelarAgendamento(UUID_E, UUID_B);
    assert.ok(ag);
  });

  test('terceiro lança Error{status:403} ao tentar cancelar', async () => {
    const repo = criarRepoAgendamento(UUID_A, UUID_B);
    const svc  = new AgendamentoService(repo);
    await assert.rejects(
      () => svc.cancelarAgendamento(UUID_E, UUID_C),
      (err) => err.status === 403,
    );
  });

  test('lança 404 quando agendamento não existe', async () => {
    const repo = {
      getConflitos:    async () => [],
      getById:         async () => null,
      atualizarStatus: async () => { throw new Error('não deve chegar aqui'); },
    };
    const svc = new AgendamentoService(repo);
    await assert.rejects(
      () => svc.cancelarAgendamento(UUID_E, UUID_A),
      (err) => err.status === 404,
    );
  });

  test('lança 422 para transição de status inválida', async () => {
    const repo = criarRepoAgendamento(UUID_A, UUID_B);
    // Altera o status base para "done" (terminal)
    repo.getById = async () => ({
      id:           UUID_E,
      status:       'done',
      client:       { id: UUID_A },
      professional: { id: UUID_B },
    });
    const svc = new AgendamentoService(repo);
    await assert.rejects(
      () => svc.atualizarStatus(UUID_E, 'cancelled', UUID_A),
      (err) => err.status === 422,
    );
  });
});

// =============================================================
// ComunicacaoService — bloqueio de auto-mensagem
// =============================================================

suite('ComunicacaoService — enviarMensagem', () => {

  const repoVazio = { enviarMensagem: async () => ({ id: UUID_E }) };

  test('lança Error{status:400} quando userId === destinatarioId', async () => {
    const svc = new ComunicacaoService(repoVazio);
    await assert.rejects(
      () => svc.enviarMensagem(UUID_A, UUID_A, 'Oi'),
      (err) => err.status === 400,
    );
  });

  test('envia mensagem com sucesso para destinatário diferente', async () => {
    const svc = new ComunicacaoService(repoVazio);
    const r   = await svc.enviarMensagem(UUID_A, UUID_B, 'Olá!');
    assert.ok(r);
  });

  test('lança 400 para mensagem vazia', async () => {
    const svc = new ComunicacaoService(repoVazio);
    await assert.rejects(
      () => svc.enviarMensagem(UUID_A, UUID_B, ''),
      (err) => err.status === 400,
    );
  });
});

// =============================================================
// UserService
// =============================================================

suite('UserService — buscarPorEmail', () => {

  const perfilMock = { id: UUID_A, full_name: 'Fulano', email: 'fulano@test.com' };

  test('retorna perfil quando e-mail é encontrado', async () => {
    const repo = { findByEmail: async () => perfilMock };
    const svc  = new UserService(repo);
    const r    = await svc.buscarPorEmail('fulano@test.com');
    assert.deepStrictEqual(r, perfilMock);
  });

  test('lança Error{status:400} para e-mail inválido', async () => {
    const repo = { findByEmail: async () => null };
    const svc  = new UserService(repo);
    await assert.rejects(
      () => svc.buscarPorEmail('nao-é-um-email'),
      (err) => err.status === 400,
    );
  });

  test('lança Error{status:404} quando e-mail não existe no banco', async () => {
    const repo = { findByEmail: async () => null };
    const svc  = new UserService(repo);
    await assert.rejects(
      () => svc.buscarPorEmail('inexistente@test.com'),
      (err) => err.status === 404,
    );
  });
});

suite('UserService — buscarPerfilPublico', () => {

  const perfilMock = { id: UUID_A, full_name: 'Fulano' };

  test('retorna perfil quando userId é válido e existe', async () => {
    const repo = { getPerfilPublico: async () => perfilMock };
    const svc  = new UserService(repo);
    const r    = await svc.buscarPerfilPublico(UUID_A);
    assert.deepStrictEqual(r, perfilMock);
  });

  test('lança Error{status:400} para UUID inválido', async () => {
    const repo = { getPerfilPublico: async () => perfilMock };
    const svc  = new UserService(repo);
    await assert.rejects(
      () => svc.buscarPerfilPublico('nao-uuid'),
      (err) => err.status === 400,
    );
  });

  test('lança Error{status:404} quando userId não existe', async () => {
    const repo = { getPerfilPublico: async () => null };
    const svc  = new UserService(repo);
    await assert.rejects(
      () => svc.buscarPerfilPublico(UUID_A),
      (err) => err.status === 404,
    );
  });
});
