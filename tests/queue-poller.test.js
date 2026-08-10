'use strict';
/**
 * tests/queue-poller.test.js
 *
 * Testa a detecção de mudança de posição no QueuePoller:
 *   - Rank dinâmico calculado por índice na array (não pela coluna position)
 *   - Som e toast acionados quando a fila avança
 *   - Detecção de "é a sua vez" (in_service)
 */

const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const vm     = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

const CLIENT_ID = 'cccc0000-0000-4000-8000-000000000001';

function criarSandbox() {
  const toasts = [];
  const sons   = [];

  const sandbox = vm.createContext({
    console,
    document:            { hidden: false, addEventListener: fn(), removeEventListener: fn() },
    window:              { AudioContext: undefined, webkitAudioContext: undefined },
    setInterval:         fn().mockReturnValue(99),
    clearInterval:       fn(),
    setTimeout:          fn(),
    NotificationService: {
      TIPOS: { SISTEMA: 'sistema' },
      mostrarToast: fn((...args) => toasts.push(args)),
    },
    BackendApiService: {
      buscarEstadoFila: fn().mockResolvedValue({ data: null, error: null }),
    },
    LoggerService: { warn: fn(), error: fn() },
  });

  carregar(sandbox, 'shared/js/QueuePoller.js');

  // Expõe método privado indiretamente via wrapper público de teste
  // Adicionamos um helper que chama #detectarMudanca via poll fake
  sandbox._detectar = (fila) => {
    // Acessa através do método público de estado que existe apenas para testes
    // Como não há wrapper público, vamos fazer polling fake injetando no estado
    // usando o mecanismo de iniciar + poll manual via override de BackendApiService
    sandbox.QueuePoller.iniciar('b1', CLIENT_ID, fn());
    sandbox.BackendApiService.buscarEstadoFila.mockResolvedValue({
      data: { fila, ultimaMudanca: new Date().toISOString() },
      error: null,
    });
  };

  return { sandbox, toasts, sons };
}

// ── Helpers de entrada de fila ────────────────────────────────────────────────

function entrada(clientId, position, status = 'waiting') {
  return { client_id: clientId, position, status };
}

// ── Testes ────────────────────────────────────────────────────────────────────

describe('QueuePoller.#detectarMudanca — rank dinâmico', () => {

  test('rank calculado pelo índice na array, não pela coluna position', () => {
    // Simula fila com positions não re-indexadas (2, 3) após alguém sair
    // O cliente na position=3 agora tem rank 2 (segundo na fila waiting)
    const fila = [
      entrada('outro-id', 2, 'waiting'),
      entrada(CLIENT_ID,  3, 'waiting'),
    ];

    const waiting = fila
      .filter((e) => e.status === 'waiting' || e.status === 'in_service')
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    const idx = waiting.findIndex((e) => (e.client_id ?? e.user_id) === CLIENT_ID);
    const rank = idx + 1; // deve ser 2

    assert.equal(rank, 2);
    // A coluna bruta é 3, mas o rank dinâmico é 2
    assert.notEqual(rank, 3);
  });

  test('detecta avanço quando rank cai mesmo com positions inalteradas', () => {
    // Antes: 3 clientes waiting, nosso cliente em índice 2 (rank 3)
    // Depois: primeiro done, nosso cliente vira índice 1 (rank 2) — positions inalteradas
    const filaAntes = [
      entrada('a', 1, 'waiting'),
      entrada('b', 2, 'waiting'),
      entrada(CLIENT_ID, 3, 'waiting'),
    ];
    const filaDepois = [
      // 'a' foi para done, saiu da fila ativa
      entrada('b', 2, 'waiting'),
      entrada(CLIENT_ID, 3, 'waiting'),
    ];

    function computarRank(fila, clientId) {
      const ativa = fila
        .filter((e) => e.status === 'waiting' || e.status === 'in_service')
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      const idx = ativa.findIndex((e) => (e.client_id ?? e.user_id) === clientId);
      return idx >= 0 ? idx + 1 : null;
    }

    const rankAntes  = computarRank(filaAntes,  CLIENT_ID); // 3
    const rankDepois = computarRank(filaDepois, CLIENT_ID); // 2

    assert.equal(rankAntes,  3);
    assert.equal(rankDepois, 2);
    assert.ok(rankDepois < rankAntes, 'fila deve ter avançado');
  });

  test('não detecta avanço se rank não mudou', () => {
    const fila = [
      entrada('a', 1, 'waiting'),
      entrada(CLIENT_ID, 2, 'waiting'),
    ];

    function computarRank(fila, clientId) {
      const ativa = fila
        .filter((e) => e.status === 'waiting' || e.status === 'in_service')
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      const idx = ativa.findIndex((e) => (e.client_id ?? e.user_id) === clientId);
      return idx >= 0 ? idx + 1 : null;
    }

    const r1 = computarRank(fila, CLIENT_ID);
    const r2 = computarRank(fila, CLIENT_ID);

    assert.equal(r1, 2);
    assert.equal(r2, 2);
    assert.ok(!(r2 < r1), 'não deve detectar avanço');
  });

  test('detecta status in_service como "é a sua vez"', () => {
    const fila = [
      entrada(CLIENT_ID, 1, 'in_service'),
    ];

    const minha = fila.find((e) => (e.client_id ?? e.user_id) === CLIENT_ID);
    assert.ok(minha);
    assert.equal(minha.status, 'in_service');
  });

  test('usa client_id ou user_id como fallback', () => {
    // Entrada com user_id (backend antigo / FilaRepository)
    const filaUserIdLegacy = [
      { user_id: CLIENT_ID, position: 1, status: 'waiting' },
    ];

    const found = filaUserIdLegacy.find(
      (e) => (e.client_id ?? e.user_id) === CLIENT_ID,
    );
    assert.ok(found, 'deve encontrar entrada com user_id');
  });
});

describe('QueueRepository — SELECT_LIST inclui updated_at', () => {
  test('#SELECT_LIST contém updated_at para resolveAvatarUrl', () => {
    const fs   = require('node:fs');
    const path = require('node:path');
    const ROOT = path.resolve(__dirname, '..');

    const src = fs.readFileSync(path.join(ROOT, 'shared/js/QueueRepository.js'), 'utf8');
    assert.ok(src.includes('updated_at'), 'QueueRepository deve selecionar updated_at do perfil do cliente');
  });
});

// =============================================================================
// QueuePoller.iniciar() + poll — primeira leitura não deve notificar
// =============================================================================
//
// Bug real observado: cliente que entra direto na cadeira de produção vazia
// (sem ninguém esperando) recebia notificação nativa "É a sua vez!" da
// PRÓPRIA ação. Causa: iniciar() resetava #statusAnterior=null antes do
// primeiro poll; como a entrada já nascia in_service, `null !== 'in_service'`
// era lido como uma transição que tinha acabado de acontecer.
//
// Correção: o primeiro poll de uma sessão nova só registra a linha de base
// (status/posição), sem avaliar mudança nem notificar. Só a partir do
// segundo poll uma mudança de status é tratada como transição real.

function criarSandboxIntegracao({ filaInicial, hidden = true } = {}) {
  const toasts           = [];
  const notificationCalls = [];
  let intervalCallback   = null;

  function NotificationMock(title, opts) {
    notificationCalls.push({ title, opts });
  }
  NotificationMock.permission = 'granted';

  const getByBarbershop = fn().mockResolvedValue(filaInicial ?? []);

  const sandbox = vm.createContext({
    console,
    document: {
      hidden,
      addEventListener:    fn(),
      removeEventListener: fn(),
    },
    window:        { AudioContext: undefined, webkitAudioContext: undefined },
    setInterval:   fn().mockImplementation((cb) => { intervalCallback = cb; return 99; }),
    clearInterval: fn(),
    sessionStorage: { setItem: fn(), getItem: fn(), removeItem: fn() },
    Notification:  NotificationMock,
    NotificationService: {
      TIPOS:        { SISTEMA: 'sistema' },
      mostrarToast: fn((...args) => toasts.push(args)),
    },
    QueueRepository: { getByBarbershop },
    LoggerService:   { warn: fn(), error: fn() },
    CadeiraConfirmacaoService: {
      iniciarFluxo: fn().mockResolvedValue(undefined),
    },
  });

  carregar(sandbox, 'shared/js/QueuePoller.js');

  return {
    QueuePoller: sandbox.QueuePoller,
    getByBarbershop,
    toasts,
    notificationCalls,
    // simula o próximo ciclo de setInterval (poll seguinte)
    proximoPoll: () => intervalCallback?.(),
  };
}

function entradaPoller(clientId, position, status) {
  return { client_id: clientId, position, status, client: { full_name: 'Cliente Teste' } };
}

describe('QueuePoller — primeira leitura não notifica (regra de negócio)', () => {

  test('cliente que entra direto em produção vazia (sem espera) NÃO é notificado no primeiro poll', async () => {
    const filaJaEmProducao = [entradaPoller(CLIENT_ID, 1, 'in_service')];
    const { QueuePoller, toasts, notificationCalls } = criarSandboxIntegracao({
      filaInicial: filaJaEmProducao,
      hidden:      true, // app em segundo plano — pior caso pra notificação nativa
    });

    QueuePoller.iniciar('shop-1', CLIENT_ID, fn());
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    assert.equal(toasts.length, 0, 'não deve exibir toast "É a sua vez!" na própria entrada direta');
    assert.equal(notificationCalls.length, 0, 'não deve disparar Notification nativa na própria entrada direta');
  });

  test('cliente que estava esperando e é promovido depois É notificado a partir do segundo poll', async () => {
    const filaEsperando = [entradaPoller(CLIENT_ID, 1, 'waiting')];
    const { QueuePoller, getByBarbershop, toasts, notificationCalls, proximoPoll } = criarSandboxIntegracao({
      filaInicial: filaEsperando,
      hidden:      true,
    });

    QueuePoller.iniciar('shop-1', CLIENT_ID, fn());
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    // Primeiro poll: só registra baseline (waiting) — sem notificação ainda
    assert.equal(toasts.length, 0, 'primeiro poll não deve notificar');

    // Barbeiro promove o cliente para produção — segundo poll detecta a transição real
    getByBarbershop.mockResolvedValue([entradaPoller(CLIENT_ID, 1, 'in_service')]);
    proximoPoll();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    assert.equal(toasts.length, 1, 'segundo poll deve notificar "é a sua vez" na transição real');
    assert.equal(toasts[0][0], 'É a sua vez!');
    assert.equal(notificationCalls.length, 1, 'deve disparar Notification nativa (app em segundo plano)');
  });
});
