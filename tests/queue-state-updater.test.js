'use strict';
/**
 * tests/queue-state-updater.test.js
 *
 * Testa QueueStateUpdater: rastreia mudança de posição do cliente na fila.
 *
 * Cenários cobertos:
 *   iniciar — registra listener de barberflow:fila-atualizada
 *   posicaoAtual — retorna null antes de qualquer evento
 *   ao receber fila — despacha barberflow:fila-posicao-atualizada se posição mudou
 *   ao receber fila — não despacha se posição não mudou (anti-flood)
 *   ao receber fila — isNext=true quando posicao===1
 *   ao receber fila — cliente não está na fila → não despacha
 *   parar — remove listener e reseta estado
 */

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

const UUID_CLI    = 'c0000000-0000-4000-8000-000000000001';
const UUID_CLI_B  = 'c1111111-0000-4000-8000-000000000002';
const UUID_SHOP   = 'b0000000-0000-4000-8000-000000000001';
const UUID_ENTRY  = 'e0000000-0000-4000-8000-000000000001';

// ─── Factory da sandbox VM ───────────────────────────────────────────────────

function criarSandbox() {
  const listeners = new Map();
  const eventosDispachados = [];

  const documentMock = {
    addEventListener: fn((tipo, cb) => {
      if (!listeners.has(tipo)) listeners.set(tipo, []);
      listeners.get(tipo).push(cb);
    }),
    removeEventListener: fn((tipo, cb) => {
      const lista = listeners.get(tipo) ?? [];
      const idx   = lista.indexOf(cb);
      if (idx !== -1) lista.splice(idx, 1);
    }),
    dispatchEvent: fn((e) => eventosDispachados.push(e)),
  };

  const sandbox = vm.createContext({
    console,
    document: documentMock,
    CustomEvent: class CustomEvent {
      constructor(type, opts) { this.type = type; this.detail = opts?.detail ?? {}; }
    },
    LoggerService: { info: fn(), warn: fn(), error: fn() },
  });

  carregar(sandbox, 'shared/js/QueueStateUpdater.js');

  // Helper para simular evento barberflow:fila-atualizada
  function dispararFilaAtualizada(fila, barbershopId = UUID_SHOP) {
    const cbs = listeners.get('barberflow:fila-atualizada') ?? [];
    const evt = { detail: { fila, barbershopId } };
    for (const cb of cbs) cb(evt);
  }

  return { sandbox, documentMock, eventosDispachados, dispararFilaAtualizada };
}

function entradaWaiting(clientId, position, entradaId = UUID_ENTRY) {
  return { id: entradaId, status: 'waiting', position, client: { id: clientId } };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

suite('QueueStateUpdater — inicialização', () => {
  test('posicaoAtual retorna null antes de qualquer evento', () => {
    const { sandbox } = criarSandbox();
    const { QueueStateUpdater } = sandbox;
    assert.equal(QueueStateUpdater.posicaoAtual(), null);
  });

  test('iniciar registra listener de barberflow:fila-atualizada', () => {
    const { sandbox, documentMock } = criarSandbox();
    const { QueueStateUpdater } = sandbox;
    QueueStateUpdater.iniciar(UUID_CLI);
    const chamadas = documentMock.addEventListener.calls.filter(
      ([tipo]) => tipo === 'barberflow:fila-atualizada'
    );
    assert.equal(chamadas.length, 1);
  });

  test('parar remove listener e reseta posicaoAtual para null', () => {
    const { sandbox, documentMock, dispararFilaAtualizada } = criarSandbox();
    const { QueueStateUpdater } = sandbox;
    QueueStateUpdater.iniciar(UUID_CLI);
    dispararFilaAtualizada([entradaWaiting(UUID_CLI, 2)]);
    assert.notEqual(QueueStateUpdater.posicaoAtual(), null);
    QueueStateUpdater.parar();
    assert.equal(QueueStateUpdater.posicaoAtual(), null);
    const rms = documentMock.removeEventListener.calls.filter(
      ([tipo]) => tipo === 'barberflow:fila-atualizada'
    );
    assert.equal(rms.length, 1);
  });
});

suite('QueueStateUpdater — detecção de mudança de posição', () => {
  test('despacha barberflow:fila-posicao-atualizada quando posição muda', () => {
    const { sandbox, eventosDispachados, dispararFilaAtualizada } = criarSandbox();
    const { QueueStateUpdater } = sandbox;
    QueueStateUpdater.iniciar(UUID_CLI);

    dispararFilaAtualizada([entradaWaiting(UUID_CLI, 2)]);

    const evt = eventosDispachados.find(e => e.type === 'barberflow:fila-posicao-atualizada');
    assert.ok(evt, 'deve despachar o evento');
    assert.equal(evt.detail.position, 1); // rank entre waiting — único = posição 1
    assert.equal(evt.detail.barbershopId, UUID_SHOP);
  });

  test('não despacha quando posição não muda (anti-flood)', () => {
    const { sandbox, eventosDispachados, dispararFilaAtualizada } = criarSandbox();
    const { QueueStateUpdater } = sandbox;
    QueueStateUpdater.iniciar(UUID_CLI);

    const fila = [entradaWaiting(UUID_CLI, 1)];
    dispararFilaAtualizada(fila);
    const antes = eventosDispachados.filter(e => e.type === 'barberflow:fila-posicao-atualizada').length;
    dispararFilaAtualizada(fila); // mesma fila — mesma posição
    const depois = eventosDispachados.filter(e => e.type === 'barberflow:fila-posicao-atualizada').length;
    assert.equal(depois, antes, 'não deve despachar evento duplicado');
  });

  test('isNext=true quando cliente é o primeiro na fila', () => {
    const { sandbox, eventosDispachados, dispararFilaAtualizada } = criarSandbox();
    const { QueueStateUpdater } = sandbox;
    QueueStateUpdater.iniciar(UUID_CLI);

    // Fila: CLI_B na posição 1 vai sair, CLI fica sozinho
    dispararFilaAtualizada([
      entradaWaiting(UUID_CLI_B, 1, 'e-b'),
      entradaWaiting(UUID_CLI,   2, UUID_ENTRY),
    ]);
    eventosDispachados.length = 0; // limpa

    // CLI avança para posição 1
    dispararFilaAtualizada([entradaWaiting(UUID_CLI, 1)]);
    const evt = eventosDispachados.find(e => e.type === 'barberflow:fila-posicao-atualizada');
    assert.ok(evt, 'deve despachar');
    assert.equal(evt.detail.isNext, true);
    assert.equal(evt.detail.position, 1);
  });

  test('não despacha quando clientId não está na fila', () => {
    const { sandbox, eventosDispachados, dispararFilaAtualizada } = criarSandbox();
    const { QueueStateUpdater } = sandbox;
    QueueStateUpdater.iniciar(UUID_CLI);

    // Fila sem o CLI
    dispararFilaAtualizada([entradaWaiting(UUID_CLI_B, 1, 'e-b')]);
    const evt = eventosDispachados.find(e => e.type === 'barberflow:fila-posicao-atualizada');
    assert.equal(evt, undefined, 'não deve despachar para cliente ausente');
  });

  test('posicaoAtual atualiza corretamente após evento', () => {
    const { sandbox, dispararFilaAtualizada } = criarSandbox();
    const { QueueStateUpdater } = sandbox;
    QueueStateUpdater.iniciar(UUID_CLI);

    dispararFilaAtualizada([
      entradaWaiting(UUID_CLI_B, 1, 'e-b'),
      entradaWaiting(UUID_CLI,   2, UUID_ENTRY),
    ]);
    assert.equal(QueueStateUpdater.posicaoAtual(), 2);
  });
});
