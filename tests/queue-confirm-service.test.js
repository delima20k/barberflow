'use strict';
/**
 * tests/queue-confirm-service.test.js
 *
 * Testa QueueConfirmService lado-cliente:
 *   - iniciar('client') registra canal Realtime em queue_entries
 *   - quando Realtime dispara in_service → delega a CadeiraConfirmacaoService
 *   - não processa a mesma entrada duas vezes
 *   - ignora status diferente de in_service
 *   - clienteNaoSentado() é no-op (não insere diretamente no banco)
 *   - parar() remove o canal e limpa estado
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const vm     = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

const ENTRY_ID = 'aaaa0000-0000-4000-8000-000000000001';
const USER_ID  = 'bbbb0000-0000-4000-8000-000000000002';

// ── Sandbox factory ──────────────────────────────────────────────────────────

function criarSandbox() {
  // Captura o callback registrado pelo .on() do canal Realtime
  let realtimeCallback = null;

  const channelMock = {};
  channelMock.on = fn().mockImplementation((_event, _filter, cb) => {
    realtimeCallback = cb;
    return channelMock;
  });
  channelMock.subscribe = fn().mockReturnValue(channelMock);

  const iniciarFluxoCalls = [];

  const sandbox = vm.createContext({
    console,
    document: {
      getElementById:    fn().mockReturnValue(null),
      addEventListener:  fn(),
      removeEventListener: fn(),
    },
    window:   {},

    SupabaseService: {
      client: {
        channel:       fn().mockReturnValue(channelMock),
        removeChannel: fn(),
        from: fn().mockReturnValue({
          select: fn().mockReturnThis(),
          eq:     fn().mockReturnThis(),
          single: fn().mockResolvedValue({ data: null, error: null }),
          insert: fn().mockResolvedValue({ data: null, error: null }),
        }),
      },
    },

    // Mock de CadeiraConfirmacaoService — captura chamadas a iniciarFluxo
    CadeiraConfirmacaoService: {
      iniciarFluxo: fn().mockImplementation((id, nome) => {
        iniciarFluxoCalls.push({ id, nome });
        return Promise.resolve();
      }),
    },

    NotificationService: {
      criar:        fn(),
      mostrarToast: fn(),
      TIPOS:        { AGENDAMENTO: 'agendamento', SISTEMA: 'sistema' },
    },

    Audio:        fn().mockReturnValue({ play: fn().mockResolvedValue(undefined), volume: 0 }),
    AudioContext: fn().mockReturnValue({}),
  });

  carregar(sandbox, 'shared/js/QueueConfirmService.js');
  sandbox.QueueConfirmService.parar();

  return {
    sandbox,
    iniciarFluxoCalls,
    getRealtimeCallback: () => realtimeCallback,
  };
}

// ── Testes ───────────────────────────────────────────────────────────────────

describe('QueueConfirmService — iniciar("client")', () => {

  test('cria canal Realtime em queue_entries para o userId', () => {
    const { sandbox } = criarSandbox();
    sandbox.QueueConfirmService.iniciar(USER_ID, 'client');

    const channelCalls = sandbox.SupabaseService.client.channel.calls;
    assert.equal(channelCalls.length, 1);
    assert.ok(
      String(channelCalls[0][0]).includes(USER_ID),
      'nome do canal deve conter o userId',
    );
  });

  test('registra callback para postgres_changes UPDATE em queue_entries', () => {
    const { sandbox, getRealtimeCallback } = criarSandbox();
    sandbox.QueueConfirmService.iniciar(USER_ID, 'client');

    assert.ok(
      getRealtimeCallback() !== null,
      'callback Realtime deve ter sido registrado',
    );
  });
});

describe('QueueConfirmService — delegação ao CadeiraConfirmacaoService', () => {

  test('delega a iniciarFluxo quando status muda para in_service', async () => {
    const { sandbox, iniciarFluxoCalls, getRealtimeCallback } = criarSandbox();
    sandbox.QueueConfirmService.iniciar(USER_ID, 'client');

    const cb = getRealtimeCallback();
    cb({ new: { id: ENTRY_ID, status: 'in_service', client: { full_name: 'Carlos' } } });
    await new Promise(r => setImmediate(r));

    assert.equal(iniciarFluxoCalls.length, 1, 'iniciarFluxo deve ser chamado 1x');
    assert.equal(iniciarFluxoCalls[0].id, ENTRY_ID);
  });

  test('usa full_name do client como nomeCliente', async () => {
    const { sandbox, iniciarFluxoCalls, getRealtimeCallback } = criarSandbox();
    sandbox.QueueConfirmService.iniciar(USER_ID, 'client');

    const cb = getRealtimeCallback();
    cb({ new: { id: ENTRY_ID, status: 'in_service', client: { full_name: 'Ana Lima' } } });
    await new Promise(r => setImmediate(r));

    assert.equal(iniciarFluxoCalls[0].nome, 'Ana Lima');
  });

  test('ignora status waiting — não delega', async () => {
    const { sandbox, iniciarFluxoCalls, getRealtimeCallback } = criarSandbox();
    sandbox.QueueConfirmService.iniciar(USER_ID, 'client');

    const cb = getRealtimeCallback();
    cb({ new: { id: ENTRY_ID, status: 'waiting' } });
    await new Promise(r => setImmediate(r));

    assert.equal(iniciarFluxoCalls.length, 0);
  });

  test('ignora status done — não delega', async () => {
    const { sandbox, iniciarFluxoCalls, getRealtimeCallback } = criarSandbox();
    sandbox.QueueConfirmService.iniciar(USER_ID, 'client');

    const cb = getRealtimeCallback();
    cb({ new: { id: ENTRY_ID, status: 'done' } });
    await new Promise(r => setImmediate(r));

    assert.equal(iniciarFluxoCalls.length, 0);
  });

  test('não processa a mesma entrada duas vezes', async () => {
    const { sandbox, iniciarFluxoCalls, getRealtimeCallback } = criarSandbox();
    sandbox.QueueConfirmService.iniciar(USER_ID, 'client');

    const cb = getRealtimeCallback();
    cb({ new: { id: ENTRY_ID, status: 'in_service' } });
    cb({ new: { id: ENTRY_ID, status: 'in_service' } }); // duplicado
    await new Promise(r => setImmediate(r));

    assert.equal(iniciarFluxoCalls.length, 1, 'deve processar entrada apenas uma vez');
  });
});

describe('QueueConfirmService — clienteNaoSentado() é no-op', () => {

  test('não insere diretamente na tabela notifications', async () => {
    const { sandbox } = criarSandbox();
    sandbox.QueueConfirmService.iniciar(USER_ID, 'client');

    await sandbox.QueueConfirmService.clienteNaoSentado();

    const insertCalls = sandbox.SupabaseService.client.from.calls.filter(
      ([tabela]) => tabela === 'notifications',
    );
    assert.equal(insertCalls.length, 0, 'não deve inserir diretamente (usa RPC via CadeiraConfirmacaoService)');
  });

  test('não lança exceção ao ser chamado', async () => {
    const { sandbox } = criarSandbox();
    await assert.doesNotReject(
      () => Promise.resolve(sandbox.QueueConfirmService.clienteNaoSentado()),
    );
  });
});

describe('QueueConfirmService — parar()', () => {

  test('remove o canal Realtime ao parar', () => {
    const { sandbox } = criarSandbox();
    sandbox.QueueConfirmService.iniciar(USER_ID, 'client');
    sandbox.QueueConfirmService.parar();

    assert.equal(
      sandbox.SupabaseService.client.removeChannel.calls.length,
      1,
      'removeChannel deve ser chamado ao parar',
    );
  });
});
