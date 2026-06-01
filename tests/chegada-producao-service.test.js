'use strict';
/**
 * tests/chegada-producao-service.test.js
 *
 * Testa ChegadaProducaoService: fluxo de chegada na cadeira de produção.
 * O cliente escolhe entre "Já estou na barbearia" ou "Estou a caminho"
 * após selecionar o serviço.
 *
 * Cenários:
 *   - modal abre com config correto (título, 2 ações: 'aqui' e 'caminho')
 *   - dismiss (null) → nenhuma operação, retorna null
 *   - 'aqui' → CadeiraService.sentar sem push cliente → pular → notif client_at_shop → updateClientConfirmed('arriving') → toast
 *   - 'caminho' → CadeiraService.sentar sem push cliente → pular → notif client_not_seated → updateClientConfirmed('arriving') → toast
 *   - pular() chamado imediatamente após sentar (antes do await updateClientConfirmed)
 *   - sentar() rejeita → toast de erro, retorna null, sem notificação
 *   - guard: sem barbershopId → retorna null sem abrir modal
 *   - guard: sem professionalId → retorna null sem abrir modal
 */

const { describe, test } = require('node:test');
const assert           = require('node:assert/strict');
const vm               = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

const BARBERSHOP_ID    = 'aaaa0000-0000-4000-8000-000000000001';
const PROFESSIONAL_ID  = 'bbbb0000-0000-4000-8000-000000000002';
const CLIENT_ID        = 'cccc0000-0000-4000-8000-000000000003';
const ENTRY_ID         = 'dddd0000-0000-4000-8000-000000000004';
const SERVICE_IDS      = ['eeee0000-0000-4000-8000-000000000005'];

const SHOP_DATA   = { id: BARBERSHOP_ID, name: 'Barbearia Test' };
const PERFIL      = { id: CLIENT_ID, full_name: 'João Silva', role: 'client' };
const ENTRADA_OK  = { id: ENTRY_ID, status: 'in_service', client_id: CLIENT_ID };

// ─── Factory da sandbox VM ────────────────────────────────────────────────────

function criarSandbox({ fluxoResposta = 'aqui', sentarRetorno = ENTRADA_OK, sentarRejeita = false } = {}) {
  const insertCalls   = [];
  const rpcCalls      = [];
  const pularCalls    = [];

  const sandbox = vm.createContext({
    console,

    FluxoDeFila: {
      abrir:   fn().mockResolvedValue(fluxoResposta),
      escapar: (s) => String(s ?? ''),
    },

    CadeiraService: {
      sentar: sentarRejeita
        ? fn().mockRejectedValue(new Error('Erro simulado'))
        : fn().mockResolvedValue(sentarRetorno),
    },

    CadeiraConfirmacaoService: {
      pular: fn().mockImplementation((id) => { pularCalls.push(id); }),
    },

    QueueRepository: {
      updateClientConfirmed: fn().mockResolvedValue(null),
    },

    // ApiService: chainable para outros usos + rpc para notificações
    ApiService: {
      from: fn().mockImplementation((tabela) => ({
        insert: fn().mockImplementation((dados) => {
          insertCalls.push({ tabela, dados });
          return Promise.resolve({ data: null, error: null });
        }),
      })),
      rpc: fn().mockImplementation((fn_name, args) => {
        rpcCalls.push({ fn: fn_name, args });
        return Promise.resolve({ data: null, error: null });
      }),
    },

    AuthService: {
      getPerfil: fn().mockReturnValue(PERFIL),
    },

    NotificationService: {
      mostrarToast: fn(),
      TIPOS: { AGENDAMENTO: 'agendamento', SISTEMA: 'sistema' },
    },

    LoggerService: {
      warn:  fn(),
      error: fn(),
    },
  });

  carregar(sandbox, 'shared/js/ChegadaProducaoService.js');

  return { sandbox, insertCalls, rpcCalls, pularCalls };
}

const ARGS_BASE = {
  barbershopId:   BARBERSHOP_ID,
  professionalId: PROFESSIONAL_ID,
  clientId:       CLIENT_ID,
  serviceIds:     SERVICE_IDS,
  shopData:       SHOP_DATA,
  clientePerfil:  PERFIL,
};

// ─── Guards ───────────────────────────────────────────────────────────────────

describe('ChegadaProducaoService — guards', () => {

  test('retorna null sem abrir modal se barbershopId ausente', async () => {
    const { sandbox } = criarSandbox();
    const { ChegadaProducaoService, FluxoDeFila } = sandbox;

    const resultado = await ChegadaProducaoService.iniciarFluxo({ ...ARGS_BASE, barbershopId: null });

    assert.equal(resultado, null);
    assert.equal(FluxoDeFila.abrir.calls.length, 0);
  });

  test('retorna null sem abrir modal se professionalId ausente', async () => {
    const { sandbox } = criarSandbox();
    const { ChegadaProducaoService, FluxoDeFila } = sandbox;

    const resultado = await ChegadaProducaoService.iniciarFluxo({ ...ARGS_BASE, professionalId: null });

    assert.equal(resultado, null);
    assert.equal(FluxoDeFila.abrir.calls.length, 0);
  });
});

// ─── Config do modal ──────────────────────────────────────────────────────────

describe('ChegadaProducaoService — configuração da modal', () => {

  test('abre FluxoDeFila com título e 2 ações', async () => {
    const { sandbox } = criarSandbox();
    const { ChegadaProducaoService, FluxoDeFila } = sandbox;

    await ChegadaProducaoService.iniciarFluxo(ARGS_BASE);

    assert.equal(FluxoDeFila.abrir.calls.length, 1);
    const config = FluxoDeFila.abrir.calls[0][0];
    assert.ok(config.titulo,   'deve ter titulo');
    assert.ok(config.corpo,    'deve ter corpo');
    assert.ok(Array.isArray(config.acoes), 'acoes deve ser array');
    assert.equal(config.acoes.length, 2);
    const valores = config.acoes.map(a => a.valor);
    assert.ok(valores.includes('aqui'),    'deve ter ação "aqui"');
    assert.ok(valores.includes('caminho'), 'deve ter ação "caminho"');
  });
});

// ─── Dismiss ─────────────────────────────────────────────────────────────────

describe('ChegadaProducaoService — dismiss (null)', () => {

  test('não chama sentar quando modal é descartado', async () => {
    const { sandbox } = criarSandbox({ fluxoResposta: null });
    const { ChegadaProducaoService, CadeiraService } = sandbox;

    const resultado = await ChegadaProducaoService.iniciarFluxo(ARGS_BASE);

    assert.equal(resultado, null);
    assert.equal(CadeiraService.sentar.calls.length, 0);
  });

  test('não insere notificação quando modal é descartado', async () => {
    const { sandbox, insertCalls } = criarSandbox({ fluxoResposta: null });
    const { ChegadaProducaoService } = sandbox;

    await ChegadaProducaoService.iniciarFluxo(ARGS_BASE);

    assert.equal(insertCalls.length, 0);
  });
});

// ─── Resposta "aqui" ──────────────────────────────────────────────────────────

describe('ChegadaProducaoService — resposta "aqui"', () => {

  test('chama CadeiraService.sentar com tipo producao', async () => {
    const { sandbox } = criarSandbox({ fluxoResposta: 'aqui' });
    const { ChegadaProducaoService, CadeiraService } = sandbox;

    await ChegadaProducaoService.iniciarFluxo(ARGS_BASE);

    assert.equal(CadeiraService.sentar.calls.length, 1);
    const args = CadeiraService.sentar.calls[0][0];
    assert.equal(args.tipo, 'producao');
    assert.equal(args.barbershopId,   BARBERSHOP_ID);
    assert.equal(args.professionalId, PROFESSIONAL_ID);
    assert.deepEqual(args.serviceIds, SERVICE_IDS);
    assert.equal(args.notificarCliente, false);
  });

  test('chama CadeiraConfirmacaoService.pular com id da entrada', async () => {
    const { sandbox, pularCalls } = criarSandbox({ fluxoResposta: 'aqui' });
    const { ChegadaProducaoService } = sandbox;

    await ChegadaProducaoService.iniciarFluxo(ARGS_BASE);

    assert.equal(pularCalls.length, 1);
    assert.equal(pularCalls[0], ENTRY_ID);
  });

  test('chama updateClientConfirmed com "arriving" (barbeiro confirmará depois)', async () => {
    const { sandbox } = criarSandbox({ fluxoResposta: 'aqui' });
    const { ChegadaProducaoService, QueueRepository } = sandbox;

    await ChegadaProducaoService.iniciarFluxo(ARGS_BASE);

    assert.equal(QueueRepository.updateClientConfirmed.calls.length, 1);
    const [id, valor] = QueueRepository.updateClientConfirmed.calls[0];
    assert.equal(id,    ENTRY_ID);
    assert.equal(valor, 'arriving');
  });

  test('insere notificação client_at_shop com tipo_acao correto', async () => {
    const { sandbox, rpcCalls } = criarSandbox({ fluxoResposta: 'aqui' });
    const { ChegadaProducaoService } = sandbox;

    await ChegadaProducaoService.iniciarFluxo(ARGS_BASE);

    const call = rpcCalls.find(c => c.fn === 'notificar_barbeiro_chegada');
    assert.ok(call, 'deve chamar RPC notificar_barbeiro_chegada');
    assert.equal(call.args.p_professional_id, PROFESSIONAL_ID);
    assert.equal(call.args.p_type,            'client_at_shop');
    assert.ok(call.args.p_title,              'p_title deve ser fornecido');
    assert.equal(call.args.p_data?.tipo_acao, 'client_at_shop');
  });

  test('exibe toast de confirmação', async () => {
    const { sandbox } = criarSandbox({ fluxoResposta: 'aqui' });
    const { ChegadaProducaoService, NotificationService } = sandbox;

    await ChegadaProducaoService.iniciarFluxo(ARGS_BASE);

    assert.equal(NotificationService.mostrarToast.calls.length, 1);
  });

  test('retorna a entrada criada', async () => {
    const { sandbox } = criarSandbox({ fluxoResposta: 'aqui' });
    const { ChegadaProducaoService } = sandbox;

    const resultado = await ChegadaProducaoService.iniciarFluxo(ARGS_BASE);

    assert.deepEqual(resultado, ENTRADA_OK);
  });
});

// ─── Resposta "caminho" ───────────────────────────────────────────────────────

describe('ChegadaProducaoService — resposta "caminho"', () => {

  test('chama CadeiraService.sentar com tipo producao', async () => {
    const { sandbox } = criarSandbox({ fluxoResposta: 'caminho' });
    const { ChegadaProducaoService, CadeiraService } = sandbox;

    await ChegadaProducaoService.iniciarFluxo(ARGS_BASE);

    assert.equal(CadeiraService.sentar.calls.length, 1);
    const args = CadeiraService.sentar.calls[0][0];
    assert.equal(args.tipo, 'producao');
    assert.equal(args.notificarCliente, false);
  });

  test('chama CadeiraConfirmacaoService.pular com id da entrada', async () => {
    const { sandbox, pularCalls } = criarSandbox({ fluxoResposta: 'caminho' });
    const { ChegadaProducaoService } = sandbox;

    await ChegadaProducaoService.iniciarFluxo(ARGS_BASE);

    assert.equal(pularCalls.length, 1);
    assert.equal(pularCalls[0], ENTRY_ID);
  });

  test('chama updateClientConfirmed com "arriving"', async () => {
    const { sandbox } = criarSandbox({ fluxoResposta: 'caminho' });
    const { ChegadaProducaoService, QueueRepository } = sandbox;

    await ChegadaProducaoService.iniciarFluxo(ARGS_BASE);

    assert.equal(QueueRepository.updateClientConfirmed.calls.length, 1);
    const [id, valor] = QueueRepository.updateClientConfirmed.calls[0];
    assert.equal(id,    ENTRY_ID);
    assert.equal(valor, 'arriving');
  });

  test('insere notificação client_not_seated com flag booleana', async () => {
    const { sandbox, rpcCalls } = criarSandbox({ fluxoResposta: 'caminho' });
    const { ChegadaProducaoService } = sandbox;

    await ChegadaProducaoService.iniciarFluxo(ARGS_BASE);

    const call = rpcCalls.find(c => c.fn === 'notificar_barbeiro_chegada');
    assert.ok(call, 'deve chamar RPC notificar_barbeiro_chegada');
    assert.equal(call.args.p_professional_id, PROFESSIONAL_ID);
    assert.equal(call.args.p_type,            'client_not_seated');
    assert.ok(call.args.p_title,              'p_title deve ser fornecido');
    // MinhaBarbeariaPage.#onClienteAusente verifica data.client_not_seated === true
    assert.equal(call.args.p_data?.client_not_seated, true);
  });

  test('exibe toast informando que barbeiro foi avisado', async () => {
    const { sandbox } = criarSandbox({ fluxoResposta: 'caminho' });
    const { ChegadaProducaoService, NotificationService } = sandbox;

    await ChegadaProducaoService.iniciarFluxo(ARGS_BASE);

    assert.equal(NotificationService.mostrarToast.calls.length, 1);
  });

  test('retorna a entrada criada', async () => {
    const { sandbox } = criarSandbox({ fluxoResposta: 'caminho' });
    const { ChegadaProducaoService } = sandbox;

    const resultado = await ChegadaProducaoService.iniciarFluxo(ARGS_BASE);

    assert.deepEqual(resultado, ENTRADA_OK);
  });
});

// ─── Erro em sentar() ─────────────────────────────────────────────────────────

describe('ChegadaProducaoService — erro em sentar()', () => {

  test('exibe toast de erro', async () => {
    const { sandbox } = criarSandbox({ fluxoResposta: 'aqui', sentarRejeita: true });
    const { ChegadaProducaoService, NotificationService } = sandbox;

    await ChegadaProducaoService.iniciarFluxo(ARGS_BASE);

    assert.equal(NotificationService.mostrarToast.calls.length, 1);
    const [titulo] = NotificationService.mostrarToast.calls[0];
    assert.equal(titulo, 'Erro');
  });

  test('não insere notificação quando sentar() falha', async () => {
    const { sandbox, insertCalls } = criarSandbox({ fluxoResposta: 'aqui', sentarRejeita: true });
    const { ChegadaProducaoService } = sandbox;

    await ChegadaProducaoService.iniciarFluxo(ARGS_BASE);

    assert.equal(insertCalls.length, 0);
  });

  test('retorna null quando sentar() falha', async () => {
    const { sandbox } = criarSandbox({ fluxoResposta: 'aqui', sentarRejeita: true });
    const { ChegadaProducaoService } = sandbox;

    const resultado = await ChegadaProducaoService.iniciarFluxo(ARGS_BASE);

    assert.equal(resultado, null);
  });
});

// ─── BffApiService — push-barbeiro ────────────────────────────────────────────

describe('ChegadaProducaoService — BffApiService push-barbeiro', () => {

  function criarSandboxComBff({
    fluxoResposta = 'aqui',
    bffErro = null,
    bffData = { enviados: 1, destinatarios: 1 },
    rpcRejeita = false,
  } = {}) {
    const warnArgs = [];
    const ordem    = [];
    const sandbox = vm.createContext({
      console,
      FluxoDeFila: {
        abrir:   fn().mockResolvedValue(fluxoResposta),
        escapar: (s) => String(s ?? ''),
      },
      CadeiraService:            { sentar: fn().mockResolvedValue(ENTRADA_OK) },
      CadeiraConfirmacaoService: { pular: fn() },
      QueueRepository: {
        updateClientConfirmed: fn().mockImplementation(() => {
          ordem.push('persistir');
          return Promise.resolve(null);
        }),
      },
      ApiService: {
        from: fn(),
        rpc:  rpcRejeita
          ? fn().mockRejectedValue(new Error('RPC indisponivel'))
          : fn().mockResolvedValue({ data: null, error: null }),
      },
      AuthService:        { getPerfil: fn().mockReturnValue(PERFIL) },
      NotificationService: { mostrarToast: fn(), TIPOS: { AGENDAMENTO: 'agendamento', SISTEMA: 'sistema' } },
      LoggerService: {
        warn:  fn().mockImplementation((...args) => { warnArgs.push(args); }),
        error: fn(),
      },
      BffApiService: {
        post: fn().mockImplementation(async () => {
          ordem.push('push-bff');
          await Promise.resolve();
          ordem.push('push-bff-resolvido');
          return { data: bffData, error: bffErro };
        }),
      },
    });
    carregar(sandbox, 'shared/js/ChegadaProducaoService.js');
    return { sandbox, warnArgs, ordem };
  }

  test('chama BffApiService.post com path e type client_at_shop após resposta "aqui"', async () => {
    const { sandbox } = criarSandboxComBff({ fluxoResposta: 'aqui' });
    const { ChegadaProducaoService, BffApiService } = sandbox;

    await ChegadaProducaoService.iniciarFluxo(ARGS_BASE);
    await new Promise(r => setTimeout(r, 0));

    const chamada = BffApiService.post.calls.find(([path]) => path === '/api/v1/notificacoes/push-barbeiro');
    assert.ok(chamada, 'BffApiService.post deve ser chamado com path push-barbeiro');
    const [, body] = chamada;
    assert.equal(body.professionalId, PROFESSIONAL_ID);
    assert.equal(body.entradaId,      ENTRY_ID);
    assert.equal(body.barbershopId,   BARBERSHOP_ID);
    assert.equal(body.type,           'client_at_shop');
    assert.equal(body.clienteNome,    PERFIL.full_name);
    assert.equal(body.statusLabel,    'Cliente ja chegou');
    assert.equal(body.cadeira,        'Cadeira de producao');
    assert.equal(body.cliente?.id,    CLIENT_ID);
    assert.equal(body.cliente?.nome,  PERFIL.full_name);
  });

  test('chama BffApiService.post com type client_not_seated após resposta "caminho"', async () => {
    const { sandbox } = criarSandboxComBff({ fluxoResposta: 'caminho' });
    const { ChegadaProducaoService, BffApiService } = sandbox;

    await ChegadaProducaoService.iniciarFluxo(ARGS_BASE);
    await new Promise(r => setTimeout(r, 0));

    const chamada = BffApiService.post.calls.find(([path]) => path === '/api/v1/notificacoes/push-barbeiro');
    assert.ok(chamada);
    const [, body] = chamada;
    assert.equal(body.type,        'client_not_seated');
    assert.equal(body.statusLabel, 'Cliente esta a caminho');
    assert.equal(body.cadeira,     'Cadeira de producao');
  });

  test('dispara push-barbeiro antes de persistir arriving', async () => {
    const { sandbox, ordem } = criarSandboxComBff({ fluxoResposta: 'caminho' });
    const { ChegadaProducaoService } = sandbox;

    await ChegadaProducaoService.iniciarFluxo(ARGS_BASE);
    await new Promise(r => setTimeout(r, 0));

    assert.deepEqual(
      ordem.slice(0, 3),
      ['push-bff', 'push-bff-resolvido', 'persistir'],
      'push do barbeiro deve ser aguardado antes da persistência best-effort em queue_entries',
    );
  });

  test('dispara push-barbeiro mesmo quando RPC de realtime falha', async () => {
    const { sandbox } = criarSandboxComBff({ fluxoResposta: 'caminho', rpcRejeita: true });
    const { ChegadaProducaoService, BffApiService } = sandbox;

    await ChegadaProducaoService.iniciarFluxo(ARGS_BASE);
    await new Promise(r => setTimeout(r, 0));

    const chamada = BffApiService.post.calls.find(([path]) => path === '/api/v1/notificacoes/push-barbeiro');
    assert.ok(chamada, 'push BFF não pode depender do RPC de realtime');
  });

  test('clienteNome com apenas espaços é normalizado para "Cliente"', async () => {
    const { sandbox } = criarSandboxComBff({ fluxoResposta: 'aqui' });
    const { ChegadaProducaoService, BffApiService } = sandbox;

    await ChegadaProducaoService.iniciarFluxo({
      ...ARGS_BASE,
      clientePerfil: { id: CLIENT_ID, full_name: '   ' },
    });
    await new Promise(r => setTimeout(r, 0));

    const chamada = BffApiService.post.calls.find(([path]) => path === '/api/v1/notificacoes/push-barbeiro');
    assert.ok(chamada);
    const [, body] = chamada;
    assert.equal(body.clienteNome, 'Cliente', 'nome com apenas espaços deve virar "Cliente"');
  });

  test('loga warn via LoggerService quando BffApiService retorna erro', async () => {
    const { sandbox, warnArgs } = criarSandboxComBff({
      fluxoResposta: 'aqui',
      bffErro:       new Error('VAPID não configurado'),
    });
    const { ChegadaProducaoService } = sandbox;

    await ChegadaProducaoService.iniciarFluxo(ARGS_BASE);
    await new Promise(r => setTimeout(r, 0));

    const logado = warnArgs.some(args =>
      args.some(a => typeof a === 'string' && a.includes('push-barbeiro')),
    );
    assert.ok(logado, 'LoggerService.warn deve ser chamado com mensagem de erro do push-barbeiro');
  });

  test('loga warn quando BFF retorna enviados:0', async () => {
    const { sandbox, warnArgs } = criarSandboxComBff({
      fluxoResposta: 'aqui',
      bffData:       { enviados: 0, destinatarios: 1 },
    });
    const { ChegadaProducaoService } = sandbox;

    await ChegadaProducaoService.iniciarFluxo(ARGS_BASE);

    const logado = warnArgs.some(args =>
      args.some(a => typeof a === 'string' && a.includes('enviados=0')),
    );
    assert.ok(logado, 'LoggerService.warn deve indicar push sem envio quando enviados=0');
  });
});

// ─── confirmarChegada ─────────────────────────────────────────────────────────

describe('ChegadaProducaoService — confirmarChegada', () => {

  test('chama updateClientConfirmed("yes") com o entradaId correto', async () => {
    const { sandbox } = criarSandbox();
    const { ChegadaProducaoService, QueueRepository } = sandbox;

    await ChegadaProducaoService.confirmarChegada({
      entradaId:      ENTRY_ID,
      professionalId: PROFESSIONAL_ID,
      barbershopId:   BARBERSHOP_ID,
      clienteNome:    'João Silva',
    });

    assert.equal(QueueRepository.updateClientConfirmed.calls.length, 1);
    const [id, valor] = QueueRepository.updateClientConfirmed.calls[0];
    assert.equal(id,    ENTRY_ID);
    assert.equal(valor, 'yes');
  });

  test('insere notificação client_at_shop para o barbeiro', async () => {
    const { sandbox, rpcCalls } = criarSandbox();
    const { ChegadaProducaoService } = sandbox;

    await ChegadaProducaoService.confirmarChegada({
      entradaId:      ENTRY_ID,
      professionalId: PROFESSIONAL_ID,
      barbershopId:   BARBERSHOP_ID,
      clienteNome:    'João Silva',
    });

    const call = rpcCalls.find(c => c.fn === 'notificar_barbeiro_chegada');
    assert.ok(call, 'deve chamar RPC notificar_barbeiro_chegada');
    assert.equal(call.args.p_professional_id, PROFESSIONAL_ID);
    assert.equal(call.args.p_type,            'client_at_shop');
    assert.ok(call.args.p_title,              'p_title deve ser fornecido');
    assert.equal(call.args.p_data?.tipo_acao, 'client_at_shop');
  });

  test('exibe toast de confirmação de chegada', async () => {
    const { sandbox } = criarSandbox();
    const { ChegadaProducaoService, NotificationService } = sandbox;

    await ChegadaProducaoService.confirmarChegada({
      entradaId:      ENTRY_ID,
      professionalId: PROFESSIONAL_ID,
      barbershopId:   BARBERSHOP_ID,
      clienteNome:    'João Silva',
    });

    assert.equal(NotificationService.mostrarToast.calls.length, 1);
  });

  test('guard: sem entradaId retorna sem chamar nada', async () => {
    const { sandbox } = criarSandbox();
    const { ChegadaProducaoService, QueueRepository, NotificationService } = sandbox;

    await ChegadaProducaoService.confirmarChegada({
      entradaId:      null,
      professionalId: PROFESSIONAL_ID,
      barbershopId:   BARBERSHOP_ID,
    });

    assert.equal(QueueRepository.updateClientConfirmed.calls.length, 0);
    assert.equal(NotificationService.mostrarToast.calls.length,      0);
  });
});
