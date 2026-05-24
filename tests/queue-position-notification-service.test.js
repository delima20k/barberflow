'use strict';
/**
 * tests/queue-position-notification-service.test.js
 *
 * Testa QueuePositionNotificationService: intercepta barberflow:notificacao-nova
 * e despacha barberflow:fila-posicao-atualizada para notificações queue_update.
 *
 * Cenários cobertos:
 *   iniciar — registra listener de barberflow:notificacao-nova
 *   ao receber notif queue_update — despacha barberflow:fila-posicao-atualizada
 *   ao receber notif tipo diferente — ignora
 *   deduplicação — mesma notif.id não dispara evento duas vezes
 *   isNext=true quando data.is_next=true
 *   parar — remove listener e limpa estado
 */

const { describe, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

const UUID_SHOP  = 'b0000000-0000-4000-8000-000000000001';
const UUID_NOTIF = 'n0000000-0000-4000-8000-000000000001';

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

  carregar(sandbox, 'shared/js/QueuePositionNotificationService.js');

  function dispararNotificacaoNova(notif) {
    const cbs = listeners.get('barberflow:notificacao-nova') ?? [];
    const evt = { detail: { notif } };
    for (const cb of cbs) cb(evt);
  }

  return { sandbox, documentMock, eventosDispachados, dispararNotificacaoNova };
}

function notifQueueUpdate({ id = UUID_NOTIF, position = 2, isNext = false } = {}) {
  return {
    id,
    type: 'queue_update',
    data: { position, is_next: isNext, barbershop_id: UUID_SHOP },
  };
}

// ─── describe ───────────────────────────────────────────────────────────────────

describe('QueuePositionNotificationService — inicialização', () => {
  test('iniciar registra listener de barberflow:notificacao-nova', () => {
    const { sandbox, documentMock } = criarSandbox();
    const { QueuePositionNotificationService } = sandbox;
    QueuePositionNotificationService.iniciar();
    const chamadas = documentMock.addEventListener.calls.filter(
      ([tipo]) => tipo === 'barberflow:notificacao-nova'
    );
    assert.equal(chamadas.length, 1);
  });

  test('parar remove listener', () => {
    const { sandbox, documentMock } = criarSandbox();
    const { QueuePositionNotificationService } = sandbox;
    QueuePositionNotificationService.iniciar();
    QueuePositionNotificationService.parar();
    const rms = documentMock.removeEventListener.calls.filter(
      ([tipo]) => tipo === 'barberflow:notificacao-nova'
    );
    assert.equal(rms.length, 1);
  });
});

describe('QueuePositionNotificationService — roteamento de notificações', () => {
  test('despacha barberflow:fila-posicao-atualizada para queue_update', () => {
    const { sandbox, eventosDispachados, dispararNotificacaoNova } = criarSandbox();
    const { QueuePositionNotificationService } = sandbox;
    QueuePositionNotificationService.iniciar();

    dispararNotificacaoNova(notifQueueUpdate({ position: 3 }));

    const evt = eventosDispachados.find(e => e.type === 'barberflow:fila-posicao-atualizada');
    assert.ok(evt, 'deve despachar o evento');
    assert.equal(evt.detail.position, 3);
    assert.equal(evt.detail.barbershopId, UUID_SHOP);
  });

  test('ignora notificação de tipo diferente', () => {
    const { sandbox, eventosDispachados, dispararNotificacaoNova } = criarSandbox();
    const { QueuePositionNotificationService } = sandbox;
    QueuePositionNotificationService.iniciar();

    dispararNotificacaoNova({ id: 'n2', type: 'agendamento', data: {} });
    const evt = eventosDispachados.find(e => e.type === 'barberflow:fila-posicao-atualizada');
    assert.equal(evt, undefined, 'não deve processar tipos diferentes');
  });

  test('deduplicação — mesma notif.id não dispara evento duas vezes', () => {
    const { sandbox, eventosDispachados, dispararNotificacaoNova } = criarSandbox();
    const { QueuePositionNotificationService } = sandbox;
    QueuePositionNotificationService.iniciar();

    const notif = notifQueueUpdate({ id: UUID_NOTIF, position: 2 });
    dispararNotificacaoNova(notif);
    dispararNotificacaoNova(notif); // duplicata

    const evts = eventosDispachados.filter(e => e.type === 'barberflow:fila-posicao-atualizada');
    assert.equal(evts.length, 1, 'deve despachar apenas uma vez para o mesmo notif.id');
  });

  test('isNext=true quando data.is_next=true', () => {
    const { sandbox, eventosDispachados, dispararNotificacaoNova } = criarSandbox();
    const { QueuePositionNotificationService } = sandbox;
    QueuePositionNotificationService.iniciar();

    dispararNotificacaoNova(notifQueueUpdate({ position: 1, isNext: true }));
    const evt = eventosDispachados.find(e => e.type === 'barberflow:fila-posicao-atualizada');
    assert.ok(evt, 'deve despachar');
    assert.equal(evt.detail.isNext, true);
  });

  test('parar limpa estado de deduplicação (reprocessa após reiniciar)', () => {
    const { sandbox, eventosDispachados, dispararNotificacaoNova } = criarSandbox();
    const { QueuePositionNotificationService } = sandbox;

    QueuePositionNotificationService.iniciar();
    dispararNotificacaoNova(notifQueueUpdate({ id: UUID_NOTIF }));
    QueuePositionNotificationService.parar();
    eventosDispachados.length = 0;

    QueuePositionNotificationService.iniciar();
    dispararNotificacaoNova(notifQueueUpdate({ id: UUID_NOTIF })); // mesmo id — mas estado foi limpo
    const evt = eventosDispachados.find(e => e.type === 'barberflow:fila-posicao-atualizada');
    assert.ok(evt, 'deve reprocessar após reinicialização');
  });
});
