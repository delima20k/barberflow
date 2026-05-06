'use strict';
/**
 * tests/cadeira-confirmacao-service.test.js
 *
 * Testa CadeiraConfirmacaoService:
 *   - Guard de entrada já processada
 *   - Resposta "sim" → RPC confirmado=true, entry em #processadas
 *   - Resposta "nao" 1ª vez → RPC grace_used=false, timer agendado
 *   - Resposta "nao" 2ª vez (grace usado) → RPC grace_used=true
 *   - parar(entradaId) cancela timer específico
 *   - parar() sem args limpa todos os timers
 */

const { suite, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const vm     = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

const ENTRY_ID  = 'aaaa0000-0000-4000-8000-000000000001';
const ENTRY_ID2 = 'bbbb0000-0000-4000-8000-000000000002';

// ── Sandbox factory ──────────────────────────────────────────────────────────

function criarSandbox({ modalResposta = 'sim', rpcRetorno = { data: null, error: null } } = {}) {
  let setTimeoutId = 100;
  const timers     = new Map(); // id → callback (para simular disparo manual)
  const clearedTimers = [];

  const sandbox = vm.createContext({
    console,
    document: { hidden: false },
    window:   {},

    // Mock do modal de confirmação
    ConfirmacaoCorteModal: {
      abrir: fn().mockResolvedValue(modalResposta),
    },

    // Mock do ApiService (RPC)
    ApiService: {
      rpc: fn().mockImplementation(() => Promise.resolve(rpcRetorno)),
    },

    // Mock do QueuePoller (som)
    QueuePoller: {
      tocarSom: fn(),
    },

    // Mock do LoggerService
    LoggerService: {
      warn:  fn(),
      error: fn(),
    },

    // setTimeout controlável (retorna id incremental, armazena callback)
    setTimeout: fn().mockImplementation((cb) => {
      const id = ++setTimeoutId;
      timers.set(id, cb);
      return id;
    }),

    clearTimeout: fn().mockImplementation((id) => {
      clearedTimers.push(id);
      timers.delete(id);
    }),

    requestAnimationFrame: fn().mockImplementation(cb => cb()),
  });

  carregar(sandbox, 'shared/js/CadeiraConfirmacaoService.js');

  // Limpa estado estático entre testes
  sandbox.CadeiraConfirmacaoService.parar();

  return { sandbox, timers, clearedTimers };
}

// ── Testes ───────────────────────────────────────────────────────────────────

suite('CadeiraConfirmacaoService — guard de duplicação', () => {

  test('não reabre modal para entrada já processada (sim)', async () => {
    const { sandbox } = criarSandbox({ modalResposta: 'sim' });
    const { CadeiraConfirmacaoService, ConfirmacaoCorteModal } = sandbox;

    await CadeiraConfirmacaoService.iniciarFluxo(ENTRY_ID, 'João');
    await CadeiraConfirmacaoService.iniciarFluxo(ENTRY_ID, 'João'); // segunda vez

    // Modal deve ter sido aberto apenas uma vez
    assert.equal(ConfirmacaoCorteModal.abrir.calls.length, 1);
  });

  test('abre modal normalmente para entrada diferente', async () => {
    const { sandbox } = criarSandbox({ modalResposta: 'sim' });
    const { CadeiraConfirmacaoService, ConfirmacaoCorteModal } = sandbox;

    await CadeiraConfirmacaoService.iniciarFluxo(ENTRY_ID,  'João');
    await CadeiraConfirmacaoService.iniciarFluxo(ENTRY_ID2, 'Maria');

    assert.equal(ConfirmacaoCorteModal.abrir.calls.length, 2);
  });
});

suite('CadeiraConfirmacaoService — resposta "sim"', () => {

  test('toca som ao iniciar fluxo', async () => {
    const { sandbox } = criarSandbox({ modalResposta: 'sim' });
    const { CadeiraConfirmacaoService, QueuePoller } = sandbox;

    await CadeiraConfirmacaoService.iniciarFluxo(ENTRY_ID, 'João');

    assert.equal(QueuePoller.tocarSom.calls.length, 1);
  });

  test('chama RPC com p_confirmado=true e p_grace_used=false', async () => {
    const { sandbox } = criarSandbox({ modalResposta: 'sim' });
    const { CadeiraConfirmacaoService, ApiService } = sandbox;

    await CadeiraConfirmacaoService.iniciarFluxo(ENTRY_ID, 'João');

    assert.equal(ApiService.rpc.calls.length, 1);
    const [nomeRpc, params] = ApiService.rpc.calls[0];
    assert.equal(nomeRpc, 'confirmar_presenca_cliente');
    assert.equal(params.p_entry_id,   ENTRY_ID);
    assert.equal(params.p_confirmado,  true);
    assert.equal(params.p_grace_used,  false);
  });

  test('não agenda timer após "sim"', async () => {
    const { sandbox } = criarSandbox({ modalResposta: 'sim' });
    const { CadeiraConfirmacaoService } = sandbox;

    await CadeiraConfirmacaoService.iniciarFluxo(ENTRY_ID, 'João');

    // setTimeout não deve ter sido chamado para grade period
    // (pode ser chamado por requestAnimationFrame internamente — verificamos apenas
    //  que nenhum timer de 5 minutos foi registrado para este entry)
    assert.equal(
      sandbox.CadeiraConfirmacaoService.temTimer(ENTRY_ID),
      false,
      'não deve ter timer ativo após confirmação'
    );
  });
});

suite('CadeiraConfirmacaoService — resposta "nao" (1ª vez)', () => {

  test('chama RPC com p_confirmado=false e p_grace_used=false', async () => {
    const { sandbox } = criarSandbox({ modalResposta: 'nao' });
    const { CadeiraConfirmacaoService, ApiService } = sandbox;

    await CadeiraConfirmacaoService.iniciarFluxo(ENTRY_ID, 'João');

    assert.equal(ApiService.rpc.calls.length, 1);
    const [nomeRpc, params] = ApiService.rpc.calls[0];
    assert.equal(nomeRpc, 'confirmar_presenca_cliente');
    assert.equal(params.p_confirmado,  false);
    assert.equal(params.p_grace_used,  false);
  });

  test('agenda timer de 5 minutos após primeiro "nao"', async () => {
    const { sandbox } = criarSandbox({ modalResposta: 'nao' });
    const { CadeiraConfirmacaoService } = sandbox;

    await CadeiraConfirmacaoService.iniciarFluxo(ENTRY_ID, 'João');

    assert.equal(
      sandbox.CadeiraConfirmacaoService.temTimer(ENTRY_ID),
      true,
      'deve ter timer ativo após primeiro não'
    );

    // Verifica duração: deve ser 5 min = 300_000ms
    const [, ms] = sandbox.setTimeout.calls.find(([, ms]) => ms === 300_000) ?? [];
    assert.equal(ms, 300_000, 'timer deve ser de 300 000 ms (5 min)');
  });

  test('não reabre modal para a mesma entrada no período de grace', async () => {
    const { sandbox } = criarSandbox({ modalResposta: 'nao' });
    const { CadeiraConfirmacaoService, ConfirmacaoCorteModal } = sandbox;

    await CadeiraConfirmacaoService.iniciarFluxo(ENTRY_ID, 'João');
    await CadeiraConfirmacaoService.iniciarFluxo(ENTRY_ID, 'João'); // segunda chamada manual (não via timer)

    // Modal aberto apenas 1 vez (entrada já está em #graceAtivo → não reprocessa)
    assert.equal(ConfirmacaoCorteModal.abrir.calls.length, 1);
  });
});

suite('CadeiraConfirmacaoService — resposta "nao" (2ª vez, grace expirado)', () => {

  test('chama RPC com p_grace_used=true na segunda recusa', async () => {
    const { sandbox, timers } = criarSandbox({ modalResposta: 'nao' });
    const { CadeiraConfirmacaoService, ApiService } = sandbox;

    // Primeiro "nao": grace agendado
    await CadeiraConfirmacaoService.iniciarFluxo(ENTRY_ID, 'João');
    assert.equal(ApiService.rpc.calls.length, 1);

    // Simula disparo do timer de 5 min
    // O timer chama iniciarFluxo novamente com graceUsado=true interno
    // Para o teste, re-chamamos o fluxo simulando que o timer disparou
    // e o serviço sabe que o grace foi usado (via flag interno)
    CadeiraConfirmacaoService._dispararGrace(ENTRY_ID, 'João');
    await new Promise(r => setImmediate(r)); // drena microtasks

    // Segunda chamada ao RPC deve ter p_grace_used=true
    assert.equal(ApiService.rpc.calls.length, 2);
    const [, params2] = ApiService.rpc.calls[1];
    assert.equal(params2.p_confirmado,  false);
    assert.equal(params2.p_grace_used,  true);
  });

  test('limpa timer após grace disparado', async () => {
    const { sandbox } = criarSandbox({ modalResposta: 'nao' });
    const { CadeiraConfirmacaoService } = sandbox;

    await CadeiraConfirmacaoService.iniciarFluxo(ENTRY_ID, 'João');
    CadeiraConfirmacaoService._dispararGrace(ENTRY_ID, 'João');
    await new Promise(r => setImmediate(r));

    assert.equal(
      CadeiraConfirmacaoService.temTimer(ENTRY_ID),
      false,
      'timer deve ser removido após disparo do grace'
    );
  });
});

suite('CadeiraConfirmacaoService — parar()', () => {

  test('parar(entradaId) cancela timer específico', async () => {
    const { sandbox, clearedTimers } = criarSandbox({ modalResposta: 'nao' });
    const { CadeiraConfirmacaoService } = sandbox;

    await CadeiraConfirmacaoService.iniciarFluxo(ENTRY_ID, 'João');
    assert.equal(CadeiraConfirmacaoService.temTimer(ENTRY_ID), true);

    CadeiraConfirmacaoService.parar(ENTRY_ID);

    assert.equal(CadeiraConfirmacaoService.temTimer(ENTRY_ID), false);
    assert.equal(clearedTimers.length >= 1, true, 'clearTimeout deve ter sido chamado');
  });

  test('parar() sem args limpa todos os timers', async () => {
    const { sandbox } = criarSandbox({ modalResposta: 'nao' });
    const { CadeiraConfirmacaoService } = sandbox;

    await CadeiraConfirmacaoService.iniciarFluxo(ENTRY_ID,  'João');
    await CadeiraConfirmacaoService.iniciarFluxo(ENTRY_ID2, 'Maria');

    CadeiraConfirmacaoService.parar();

    assert.equal(CadeiraConfirmacaoService.temTimer(ENTRY_ID),  false);
    assert.equal(CadeiraConfirmacaoService.temTimer(ENTRY_ID2), false);
  });

  test('parar() reseta #processadas para permitir novo fluxo', async () => {
    const { sandbox } = criarSandbox({ modalResposta: 'sim' });
    const { CadeiraConfirmacaoService, ConfirmacaoCorteModal } = sandbox;

    await CadeiraConfirmacaoService.iniciarFluxo(ENTRY_ID, 'João');
    assert.equal(ConfirmacaoCorteModal.abrir.calls.length, 1);

    // Após parar, a entrada é "esquecida" — pode ser processada novamente
    // (ex: cliente saiu e entrou novamente na fila)
    CadeiraConfirmacaoService.parar();

    await CadeiraConfirmacaoService.iniciarFluxo(ENTRY_ID, 'João');
    assert.equal(ConfirmacaoCorteModal.abrir.calls.length, 2);
  });
});
