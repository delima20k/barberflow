'use strict';
/**
 * tests/queue-position-presenter.test.js
 *
 * Testa QueuePositionPresenter: ouve barberflow:fila-posicao-atualizada e
 * abre FluxoDeFila com o payload correto para cada posição.
 *
 * Cenários cobertos:
 *   iniciar — registra listener de barberflow:fila-posicao-atualizada
 *   parar   — remove listener e reseta todo estado interno
 *   iniciar() duplo — atualiza nomeBarbearia sem duplicar listener
 *   ao receber evento — chama QueueModalPayloadBuilder com posição e nomeBarbearia
 *   ao receber evento — chama FluxoDeFila.abrir com o config retornado
 *   anti-flood — segundo evento enquanto modal aberto é ignorado
 *   posição inválida (<=0 ou null) — não abre modal
 *   parar() sem ter iniciado — seguro (não lança erro)
 */

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

const UUID_SHOP = 'b0000000-0000-4000-8000-000000000001';

// ─── Factory da sandbox VM ───────────────────────────────────────────────────

function criarSandbox() {
  const listeners          = new Map();
  const acoesModal         = [];     // histórico de chamadas a FluxoDeFila.abrir()
  const acoesPayloadBuilder = [];    // histórico de chamadas a QueueModalPayloadBuilder

  // Resolve as Promises de FluxoDeFila.abrir() imediatamente com 'ok'
  // para que #onPosicaoAtualizada conclua durante os testes síncronos.
  const fluxoDeFilaMock = {
    abrir: fn(async (_config) => {
      acoesModal.push(_config);
      return 'ok';
    }),
    escapar: (str) => String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;'),
  };

  const configFake = { titulo: 'teste', corpo: 'corpo', acoes: [] };
  const payloadBuilderMock = {
    montarPayloadPosicao: fn((_pos, _opts) => {
      acoesPayloadBuilder.push({ pos: _pos, opts: _opts });
      return configFake;
    }),
  };

  const documentMock = {
    _listeners: listeners,
    addEventListener: fn((tipo, cb) => {
      if (!listeners.has(tipo)) listeners.set(tipo, []);
      listeners.get(tipo).push(cb);
    }),
    removeEventListener: fn((tipo, cb) => {
      const lista = listeners.get(tipo) ?? [];
      const idx   = lista.indexOf(cb);
      if (idx !== -1) lista.splice(idx, 1);
    }),
    dispatchEvent: fn(() => {}),
  };

  const sandbox = vm.createContext({
    console,
    document:                    documentMock,
    FluxoDeFila:                 fluxoDeFilaMock,
    QueueModalPayloadBuilder:    payloadBuilderMock,
    LoggerService:               { info: fn(), warn: fn(), error: fn() },
    CustomEvent: class CustomEvent {
      constructor(type, opts) { this.type = type; this.detail = opts?.detail ?? {}; }
    },
  });

  carregar(sandbox, 'shared/js/QueuePositionPresenter.js');

  /** Dispara o evento barberflow:fila-posicao-atualizada na sandbox. */
  function dispararPosicaoAtualizada({ position, isNext = false, barbershopId = UUID_SHOP } = {}) {
    const cbs = listeners.get('barberflow:fila-posicao-atualizada') ?? [];
    const evt = { detail: { position, isNext, barbershopId } };
    for (const cb of cbs) cb(evt);
  }

  return { sandbox, documentMock, acoesModal, acoesPayloadBuilder, dispararPosicaoAtualizada };
}

// ─── Suite: ciclo de vida ────────────────────────────────────────────────────

suite('QueuePositionPresenter — ciclo de vida', () => {

  test('iniciar registra listener de barberflow:fila-posicao-atualizada', () => {
    const { sandbox, documentMock } = criarSandbox();
    const { QueuePositionPresenter } = sandbox;

    QueuePositionPresenter.iniciar();

    const chamadas = documentMock.addEventListener.calls.filter(
      ([tipo]) => tipo === 'barberflow:fila-posicao-atualizada',
    );
    assert.equal(chamadas.length, 1, 'deve registrar exatamente um listener');
  });

  test('parar remove listener e não lança erro', () => {
    const { sandbox, documentMock } = criarSandbox();
    const { QueuePositionPresenter } = sandbox;

    QueuePositionPresenter.iniciar();
    QueuePositionPresenter.parar();

    const rms = documentMock.removeEventListener.calls.filter(
      ([tipo]) => tipo === 'barberflow:fila-posicao-atualizada',
    );
    assert.equal(rms.length, 1, 'deve remover exatamente um listener');
  });

  test('parar() sem ter iniciado é seguro (não lança)', () => {
    const { sandbox } = criarSandbox();
    const { QueuePositionPresenter } = sandbox;
    assert.doesNotThrow(() => QueuePositionPresenter.parar());
  });

  test('iniciar() duplo atualiza nomeBarbearia sem duplicar listener', () => {
    const { sandbox, documentMock, acoesPayloadBuilder, dispararPosicaoAtualizada } = criarSandbox();
    const { QueuePositionPresenter } = sandbox;

    QueuePositionPresenter.iniciar('Barbearia A');
    QueuePositionPresenter.iniciar('Barbearia B'); // deve só atualizar o nome, não registrar de novo

    const chamadas = documentMock.addEventListener.calls.filter(
      ([tipo]) => tipo === 'barberflow:fila-posicao-atualizada',
    );
    assert.equal(chamadas.length, 1, 'listener não deve ser duplicado');

    dispararPosicaoAtualizada({ position: 2 });

    // Aguarda microtask da Promise de FluxoDeFila.abrir()
    return new Promise(resolve => setTimeout(resolve, 0)).then(() => {
      assert.equal(acoesPayloadBuilder.length, 1);
      assert.equal(acoesPayloadBuilder[0].opts?.nomeBarbearia, 'Barbearia B',
        'nome atualizado na segunda chamada deve ser usado');
    });
  });

});

// ─── Suite: abertura de modal ────────────────────────────────────────────────

suite('QueuePositionPresenter — abertura de modal', () => {

  test('ao receber evento: chama QueueModalPayloadBuilder.montarPayloadPosicao com posição e nome', () => {
    const { sandbox, acoesPayloadBuilder, dispararPosicaoAtualizada } = criarSandbox();
    const { QueuePositionPresenter } = sandbox;

    QueuePositionPresenter.iniciar('Barbearia Top');
    dispararPosicaoAtualizada({ position: 3 });

    return new Promise(resolve => setTimeout(resolve, 0)).then(() => {
      assert.equal(acoesPayloadBuilder.length, 1);
      assert.equal(acoesPayloadBuilder[0].pos, 3);
      assert.equal(acoesPayloadBuilder[0].opts?.nomeBarbearia, 'Barbearia Top');
    });
  });

  test('ao receber evento: chama FluxoDeFila.abrir com o config retornado pelo builder', () => {
    const { sandbox, acoesModal, dispararPosicaoAtualizada } = criarSandbox();
    const { QueuePositionPresenter } = sandbox;

    QueuePositionPresenter.iniciar();
    dispararPosicaoAtualizada({ position: 2 });

    return new Promise(resolve => setTimeout(resolve, 0)).then(() => {
      assert.equal(acoesModal.length, 1, 'FluxoDeFila.abrir deve ter sido chamado uma vez');
      assert.equal(acoesModal[0].titulo, 'teste', 'deve usar o config retornado pelo builder');
    });
  });

  test('anti-flood: segundo evento enquanto modal está aberto é ignorado', () => {
    const { sandbox, acoesModal, dispararPosicaoAtualizada } = criarSandbox();
    const { QueuePositionPresenter } = sandbox;

    // FluxoDeFila.abrir nunca resolve neste teste — simula modal travado
    let resolverAbrir;
    sandbox.FluxoDeFila.abrir = fn(() => new Promise(r => { resolverAbrir = r; }));

    QueuePositionPresenter.iniciar();
    dispararPosicaoAtualizada({ position: 2 }); // abre modal
    dispararPosicaoAtualizada({ position: 1 }); // deve ser ignorado (modal ainda aberto)

    assert.equal(sandbox.FluxoDeFila.abrir.calls.length, 1,
      'segundo evento deve ser ignorado enquanto modal está aberto');

    // Libera a Promise para não vazar handles
    if (resolverAbrir) resolverAbrir('ok');
  });

  test('posição inválida (0) não abre modal', () => {
    const { sandbox, acoesModal, dispararPosicaoAtualizada } = criarSandbox();
    const { QueuePositionPresenter } = sandbox;

    QueuePositionPresenter.iniciar();
    dispararPosicaoAtualizada({ position: 0 });

    return new Promise(resolve => setTimeout(resolve, 0)).then(() => {
      assert.equal(acoesModal.length, 0, 'posição 0 não deve abrir modal');
    });
  });

  test('posição null não abre modal', () => {
    const { sandbox, acoesModal, dispararPosicaoAtualizada } = criarSandbox();
    const { QueuePositionPresenter } = sandbox;

    QueuePositionPresenter.iniciar();
    dispararPosicaoAtualizada({ position: null });

    return new Promise(resolve => setTimeout(resolve, 0)).then(() => {
      assert.equal(acoesModal.length, 0, 'posição null não deve abrir modal');
    });
  });

});
