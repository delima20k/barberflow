'use strict';
/**
 * tests/fila-presenca-service.test.js
 *
 * Testa FilaPresencaService: fluxo de confirmação de presença física do
 * cliente imediatamente após entrar na fila (status=waiting).
 *
 * Cenários cobertos:
 *   - chama QueueModalPayloadBuilder.montarPayloadPresencaFisica
 *   - chama FluxoDeFila.abrir com o config retornado pelo builder
 *   - SIM → updateClientConfirmed('yes') + notificação 'client_at_shop' + toast
 *   - NÃO → updateClientConfirmed('arriving') + toast "5 min" + timer agendado
 *   - timer dispara → _dispararGrace → notifica barbeiro 'client_arriving_late'
 *   - parar() → cancela todos os timers pendentes
 *   - guard: entradaId já processado → no-op (FluxoDeFila.abrir chamado 1x)
 *   - parar() sem ter iniciado → seguro (não lança erro)
 */

const { suite, test, beforeEach } = require('node:test');
const assert                       = require('node:assert/strict');
const vm                           = require('node:vm');
const { fn, carregar }             = require('./_helpers.js');

const ENTRY_ID        = 'aaaa0000-0000-4000-8000-000000000001';
const PROFESSIONAL_ID = 'bbbb0000-0000-4000-8000-000000000002';
const SHOP_ID         = 'cccc0000-0000-4000-8000-000000000003';

const SHOP_DATA = { id: SHOP_ID, name: 'Barbearia Teste' };

// ─── Factory da sandbox VM ────────────────────────────────────────────────────

function criarSandbox({ fluxoResposta = 'sim', updateRetorno = null } = {}) {
  let nextTimerId = 100;
  const timers        = new Map();   // id → callback
  const clearedTimers = [];
  const insertCalls   = [];

  const configFake = {
    icone:  '🏠',
    titulo: 'Você já está na barbearia?',
    corpo:  'Teste, confirme sua presença.',
    acoes:  [
      { label: '✅ Sim, já estou!',  valor: 'sim', variante: 'primario'   },
      { label: '🚶 Estou chegando', valor: 'nao', variante: 'secundario' },
    ],
  };

  const sandbox = vm.createContext({
    console,

    FluxoDeFila: {
      abrir:   fn().mockResolvedValue(fluxoResposta),
      escapar: (str) => String(str ?? ''),
    },

    QueueModalPayloadBuilder: {
      montarPayloadPresencaFisica: fn().mockReturnValue(configFake),
    },

    QueueRepository: {
      updateClientConfirmed: fn().mockResolvedValue(updateRetorno ?? { id: ENTRY_ID, client_confirmed: 'yes' }),
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
      getPerfil: fn().mockReturnValue({ id: 'ffff0000-0000-4000-8000-000000000099', full_name: 'Cliente Teste', role: 'client' }),
    },

    NotificationService: {
      mostrarToast: fn(),
      TIPOS: { AGENDAMENTO: 'agendamento', SISTEMA: 'sistema' },
    },

    LoggerService: {
      warn:  fn(),
      error: fn(),
    },

    InputValidator: {
      uuid: (v) => {
        const ok = typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
        return ok ? { ok: true } : { ok: false, msg: `UUID inválido: ${v}` };
      },
    },

    setTimeout: fn().mockImplementation((cb) => {
      const id = ++nextTimerId;
      timers.set(id, cb);
      return id;
    }),

    clearTimeout: fn().mockImplementation((id) => {
      clearedTimers.push(id);
      timers.delete(id);
    }),
  });

  carregar(sandbox, 'shared/js/FilaPresencaService.js');

  // Garante estado limpo a cada teste
  sandbox.FilaPresencaService.parar();

  return { sandbox, timers, clearedTimers, insertCalls, configFake };
}

// ─── Testes ───────────────────────────────────────────────────────────────────

suite('FilaPresencaService — construção do payload', () => {

  test('chama QueueModalPayloadBuilder.montarPayloadPresencaFisica', async () => {
    const { sandbox } = criarSandbox();
    const { FilaPresencaService, QueueModalPayloadBuilder } = sandbox;

    await FilaPresencaService.iniciarFluxo(ENTRY_ID, SHOP_DATA, PROFESSIONAL_ID);

    assert.equal(QueueModalPayloadBuilder.montarPayloadPresencaFisica.calls.length, 1);
  });

  test('passa nomeBarbearia e clienteNome ao builder', async () => {
    const { sandbox } = criarSandbox();
    const { FilaPresencaService, QueueModalPayloadBuilder } = sandbox;

    await FilaPresencaService.iniciarFluxo(ENTRY_ID, SHOP_DATA, PROFESSIONAL_ID);

    const [args] = QueueModalPayloadBuilder.montarPayloadPresencaFisica.calls;
    assert.equal(args[0].nomeBarbearia, 'Barbearia Teste');
    assert.equal(args[0].clienteNome,   'Cliente Teste');
  });

  test('abre FluxoDeFila com o config retornado pelo builder', async () => {
    const { sandbox, configFake } = criarSandbox();
    const { FilaPresencaService, FluxoDeFila } = sandbox;

    await FilaPresencaService.iniciarFluxo(ENTRY_ID, SHOP_DATA, PROFESSIONAL_ID);

    assert.equal(FluxoDeFila.abrir.calls.length, 1);
    assert.deepEqual(FluxoDeFila.abrir.calls[0][0], configFake);
  });
});

suite('FilaPresencaService — resposta "sim"', () => {

  test('chama updateClientConfirmed com "yes"', async () => {
    const { sandbox } = criarSandbox({ fluxoResposta: 'sim' });
    const { FilaPresencaService, QueueRepository } = sandbox;

    await FilaPresencaService.iniciarFluxo(ENTRY_ID, SHOP_DATA, PROFESSIONAL_ID);

    assert.equal(QueueRepository.updateClientConfirmed.calls.length, 1);
    const [id, valor] = QueueRepository.updateClientConfirmed.calls[0];
    assert.equal(id,    ENTRY_ID);
    assert.equal(valor, 'yes');
  });

  test('insere notificação do tipo "client_at_shop" para o barbeiro', async () => {
    const { sandbox, insertCalls } = criarSandbox({ fluxoResposta: 'sim' });
    const { FilaPresencaService } = sandbox;

    await FilaPresencaService.iniciarFluxo(ENTRY_ID, SHOP_DATA, PROFESSIONAL_ID);

    const notif = insertCalls.find(c => c.tabela === 'notifications');
    assert.ok(notif, 'deve inserir em notifications');
    assert.equal(notif.dados.user_id, PROFESSIONAL_ID);
    assert.equal(notif.dados.type, 'client_at_shop');
  });

  test('exibe toast de confirmação', async () => {
    const { sandbox } = criarSandbox({ fluxoResposta: 'sim' });
    const { FilaPresencaService, NotificationService } = sandbox;

    await FilaPresencaService.iniciarFluxo(ENTRY_ID, SHOP_DATA, PROFESSIONAL_ID);

    assert.equal(NotificationService.mostrarToast.calls.length, 1);
  });

  test('não agenda timer após "sim"', async () => {
    const { sandbox } = criarSandbox({ fluxoResposta: 'sim' });
    const { FilaPresencaService } = sandbox;

    await FilaPresencaService.iniciarFluxo(ENTRY_ID, SHOP_DATA, PROFESSIONAL_ID);

    assert.equal(sandbox.setTimeout.calls.length, 0, 'não deve agendar timer');
  });
});

suite('FilaPresencaService — resposta "nao"', () => {

  test('chama updateClientConfirmed com "arriving"', async () => {
    const { sandbox } = criarSandbox({ fluxoResposta: 'nao' });
    const { FilaPresencaService, QueueRepository } = sandbox;

    await FilaPresencaService.iniciarFluxo(ENTRY_ID, SHOP_DATA, PROFESSIONAL_ID);

    assert.equal(QueueRepository.updateClientConfirmed.calls.length, 1);
    const [id, valor] = QueueRepository.updateClientConfirmed.calls[0];
    assert.equal(id,    ENTRY_ID);
    assert.equal(valor, 'arriving');
  });

  test('exibe toast com mensagem de "5 min"', async () => {
    const { sandbox } = criarSandbox({ fluxoResposta: 'nao' });
    const { FilaPresencaService, NotificationService } = sandbox;

    await FilaPresencaService.iniciarFluxo(ENTRY_ID, SHOP_DATA, PROFESSIONAL_ID);

    assert.equal(NotificationService.mostrarToast.calls.length, 1);
    const toastArgs = NotificationService.mostrarToast.calls[0];
    // O corpo deve mencionar "5 min" ou o título deve indicar prazo
    const toastText = toastArgs.join(' ');
    assert.ok(
      toastText.includes('5') || toastText.toLowerCase().includes('chegando'),
      `toast deve mencionar 5 min ou "chegando": "${toastText}"`
    );
  });

  test('agenda timer de grace period', async () => {
    const { sandbox } = criarSandbox({ fluxoResposta: 'nao' });
    const { FilaPresencaService } = sandbox;

    await FilaPresencaService.iniciarFluxo(ENTRY_ID, SHOP_DATA, PROFESSIONAL_ID);

    assert.equal(sandbox.setTimeout.calls.length, 1, 'deve agendar um timer');
  });

  test('timer disparado → _dispararGrace → notifica barbeiro "client_arriving_late"', async () => {
    const { sandbox, timers, insertCalls } = criarSandbox({ fluxoResposta: 'nao' });
    const { FilaPresencaService } = sandbox;

    await FilaPresencaService.iniciarFluxo(ENTRY_ID, SHOP_DATA, PROFESSIONAL_ID);

    // Simula disparo do timer
    assert.equal(timers.size, 1, 'deve haver um timer pendente');
    const [, cb] = [...timers.entries()][0];
    await cb(); // dispara manualmente

    const notif = insertCalls.find(c =>
      c.tabela === 'notifications' && c.dados.type === 'client_arriving_late'
    );
    assert.ok(notif, 'deve inserir notificação "client_arriving_late"');
    assert.equal(notif.dados.user_id, PROFESSIONAL_ID);
  });

  test('_dispararGrace cancela timer antes de notificar', async () => {
    const { sandbox, clearedTimers } = criarSandbox({ fluxoResposta: 'nao' });
    const { FilaPresencaService } = sandbox;

    await FilaPresencaService.iniciarFluxo(ENTRY_ID, SHOP_DATA, PROFESSIONAL_ID);

    FilaPresencaService._dispararGrace(ENTRY_ID, PROFESSIONAL_ID, SHOP_ID);

    assert.ok(clearedTimers.length > 0, 'clearTimeout deve ter sido chamado');
  });
});

suite('FilaPresencaService — guard de duplicação', () => {

  test('ignora segunda chamada com mesmo entradaId (FluxoDeFila.abrir 1x)', async () => {
    const { sandbox } = criarSandbox();
    const { FilaPresencaService, FluxoDeFila } = sandbox;

    await FilaPresencaService.iniciarFluxo(ENTRY_ID, SHOP_DATA, PROFESSIONAL_ID);
    await FilaPresencaService.iniciarFluxo(ENTRY_ID, SHOP_DATA, PROFESSIONAL_ID);

    assert.equal(FluxoDeFila.abrir.calls.length, 1, 'modal deve abrir apenas uma vez');
  });

  test('processa normalmente entradaId diferente', async () => {
    const ENTRY_ID2 = 'dddd0000-0000-4000-8000-000000000004';
    const { sandbox } = criarSandbox();
    const { FilaPresencaService, FluxoDeFila } = sandbox;

    await FilaPresencaService.iniciarFluxo(ENTRY_ID,  SHOP_DATA, PROFESSIONAL_ID);
    await FilaPresencaService.iniciarFluxo(ENTRY_ID2, SHOP_DATA, PROFESSIONAL_ID);

    assert.equal(FluxoDeFila.abrir.calls.length, 2);
  });
});

suite('FilaPresencaService — parar()', () => {

  test('cancela timer pendente ao parar', async () => {
    const { sandbox, clearedTimers } = criarSandbox({ fluxoResposta: 'nao' });
    const { FilaPresencaService } = sandbox;

    await FilaPresencaService.iniciarFluxo(ENTRY_ID, SHOP_DATA, PROFESSIONAL_ID);
    FilaPresencaService.parar();

    assert.ok(clearedTimers.length > 0, 'deve cancelar o timer com clearTimeout');
  });

  test('parar() sem ter iniciado não lança erro', () => {
    const { sandbox } = criarSandbox();
    const { FilaPresencaService } = sandbox;

    assert.doesNotThrow(() => FilaPresencaService.parar());
  });

  test('após parar, permite reiniciar com mesmo entradaId', async () => {
    const { sandbox } = criarSandbox();
    const { FilaPresencaService, FluxoDeFila } = sandbox;

    await FilaPresencaService.iniciarFluxo(ENTRY_ID, SHOP_DATA, PROFESSIONAL_ID);
    FilaPresencaService.parar();
    await FilaPresencaService.iniciarFluxo(ENTRY_ID, SHOP_DATA, PROFESSIONAL_ID);

    assert.equal(FluxoDeFila.abrir.calls.length, 2, 'deve abrir modal após reset');
  });
});

suite('FilaPresencaService — edge cases', () => {

  test('entradaId null → retorna sem abrir modal', async () => {
    const { sandbox } = criarSandbox();
    const { FilaPresencaService, FluxoDeFila } = sandbox;

    await FilaPresencaService.iniciarFluxo(null, SHOP_DATA, PROFESSIONAL_ID);

    assert.equal(FluxoDeFila.abrir.calls.length, 0);
  });

  test('shopData null → não lança erro', async () => {
    const { sandbox } = criarSandbox();
    const { FilaPresencaService } = sandbox;

    await assert.doesNotReject(() =>
      FilaPresencaService.iniciarFluxo(ENTRY_ID, null, PROFESSIONAL_ID)
    );
  });

  test('resposta null (modal fechado) → não chama updateClientConfirmed', async () => {
    const { sandbox } = criarSandbox({ fluxoResposta: null });
    const { FilaPresencaService, QueueRepository } = sandbox;

    await FilaPresencaService.iniciarFluxo(ENTRY_ID, SHOP_DATA, PROFESSIONAL_ID);

    assert.equal(QueueRepository.updateClientConfirmed.calls.length, 0);
  });
});
