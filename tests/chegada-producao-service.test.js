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
 *   - 'aqui' → CadeiraService.sentar → pular → updateClientConfirmed('yes') → notif client_at_shop → toast
 *   - 'caminho' → CadeiraService.sentar → pular → updateClientConfirmed('arriving') → notif client_not_seated → toast
 *   - pular() chamado imediatamente após sentar (antes do await updateClientConfirmed)
 *   - sentar() rejeita → toast de erro, retorna null, sem notificação
 *   - guard: sem barbershopId → retorna null sem abrir modal
 *   - guard: sem professionalId → retorna null sem abrir modal
 */

const { suite, test } = require('node:test');
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

    // ApiService chainable — insert retorna Promise diretamente
    ApiService: {
      from: fn().mockImplementation((tabela) => ({
        insert: fn().mockImplementation((dados) => {
          insertCalls.push({ tabela, dados });
          return Promise.resolve({ data: null, error: null });
        }),
      })),
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

  return { sandbox, insertCalls, pularCalls };
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

suite('ChegadaProducaoService — guards', () => {

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

suite('ChegadaProducaoService — configuração da modal', () => {

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

suite('ChegadaProducaoService — dismiss (null)', () => {

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

suite('ChegadaProducaoService — resposta "aqui"', () => {

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
  });

  test('chama CadeiraConfirmacaoService.pular com id da entrada', async () => {
    const { sandbox, pularCalls } = criarSandbox({ fluxoResposta: 'aqui' });
    const { ChegadaProducaoService } = sandbox;

    await ChegadaProducaoService.iniciarFluxo(ARGS_BASE);

    assert.equal(pularCalls.length, 1);
    assert.equal(pularCalls[0], ENTRY_ID);
  });

  test('chama updateClientConfirmed com "yes"', async () => {
    const { sandbox } = criarSandbox({ fluxoResposta: 'aqui' });
    const { ChegadaProducaoService, QueueRepository } = sandbox;

    await ChegadaProducaoService.iniciarFluxo(ARGS_BASE);

    assert.equal(QueueRepository.updateClientConfirmed.calls.length, 1);
    const [id, valor] = QueueRepository.updateClientConfirmed.calls[0];
    assert.equal(id,    ENTRY_ID);
    assert.equal(valor, 'yes');
  });

  test('insere notificação client_at_shop com tipo_acao correto', async () => {
    const { sandbox, insertCalls } = criarSandbox({ fluxoResposta: 'aqui' });
    const { ChegadaProducaoService } = sandbox;

    await ChegadaProducaoService.iniciarFluxo(ARGS_BASE);

    const notif = insertCalls.find(c => c.tabela === 'notifications');
    assert.ok(notif, 'deve inserir em notifications');
    assert.equal(notif.dados.user_id, PROFESSIONAL_ID);
    assert.equal(notif.dados.type,    'client_at_shop');
    assert.equal(notif.dados.dados?.tipo_acao, 'client_at_shop');
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

suite('ChegadaProducaoService — resposta "caminho"', () => {

  test('chama CadeiraService.sentar com tipo producao', async () => {
    const { sandbox } = criarSandbox({ fluxoResposta: 'caminho' });
    const { ChegadaProducaoService, CadeiraService } = sandbox;

    await ChegadaProducaoService.iniciarFluxo(ARGS_BASE);

    assert.equal(CadeiraService.sentar.calls.length, 1);
    const args = CadeiraService.sentar.calls[0][0];
    assert.equal(args.tipo, 'producao');
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
    const { sandbox, insertCalls } = criarSandbox({ fluxoResposta: 'caminho' });
    const { ChegadaProducaoService } = sandbox;

    await ChegadaProducaoService.iniciarFluxo(ARGS_BASE);

    const notif = insertCalls.find(c => c.tabela === 'notifications');
    assert.ok(notif, 'deve inserir em notifications');
    assert.equal(notif.dados.user_id, PROFESSIONAL_ID);
    assert.equal(notif.dados.type,    'client_not_seated');
    // MinhaBarbeariaPage.#onClienteAusente verifica dados.client_not_seated === true
    assert.equal(notif.dados.dados?.client_not_seated, true);
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

suite('ChegadaProducaoService — erro em sentar()', () => {

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
