'use strict';
/**
 * tests/queue-realtime-notifier.test.js
 *
 * Testa QueueRealtimeNotifier: gerenciamento de canais Realtime.
 *
 * Cenários cobertos:
 *   iniciar — cria canal e assina via SupabaseService
 *   iniciar — idempotente (segunda chamada não duplica canal)
 *   iniciar — múltiplas barbearias abrem canais distintos
 *   estaAtivo — retorna true após iniciar, false antes e após parar
 *   parar(id) — remove canal específico
 *   parar() sem args — remove todos os canais
 *   callback — ao receber evento Realtime, despacha barberflow:fila-atualizada
 */

const { describe, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

const UUID_SHOP_A = 'b0000000-0000-4000-8000-000000000001';
const UUID_SHOP_B = 'b1111111-0000-4000-8000-000000000002';

// ─── Factory da sandbox VM ───────────────────────────────────────────────────

function criarSandbox({ filaRetorno = [] } = {}) {
  // Simula Supabase channel fluent API
  let _callbackRealtime = null;
  const canalMock = {
    on:        fn().mockReturnThis(),
    subscribe: fn().mockReturnThis(),
    _dispararEvento: (payload) => {
      // Invoca o callback registrado em .on()
      if (_callbackRealtime) _callbackRealtime(payload);
    },
  };
  canalMock.on.mockImplementation((_evt, _filter, cb) => {
    _callbackRealtime = cb;
    return canalMock;
  });

  const supabaseClientMock = {
    channel:       fn().mockReturnValue(canalMock),
    removeChannel: fn(),
  };

  const eventos = [];
  const documentMock = {
    addEventListener:    fn(),
    removeEventListener: fn(),
    dispatchEvent:       fn((e) => eventos.push(e)),
  };

  const sandbox = vm.createContext({
    console,
    document: documentMock,
    CustomEvent: class CustomEvent {
      constructor(type, opts) { this.type = type; this.detail = opts?.detail ?? {}; }
    },
    SupabaseService: { client: supabaseClientMock },
    QueueRepository: {
      getByBarbershop: fn().mockResolvedValue(filaRetorno),
    },
    LoggerService: { info: fn(), warn: fn(), error: fn() },
  });

  carregar(sandbox, 'shared/js/QueueRealtimeNotifier.js');

  return { sandbox, canalMock, supabaseClientMock, eventos };
}

// ─── describe ───────────────────────────────────────────────────────────────────

describe('QueueRealtimeNotifier — ciclo de vida', () => {
  test('iniciar — cria canal via SupabaseService.client.channel()', () => {
    const { sandbox, supabaseClientMock } = criarSandbox();
    const { QueueRealtimeNotifier } = sandbox;
    QueueRealtimeNotifier.iniciar(UUID_SHOP_A);
    assert.equal(supabaseClientMock.channel.calls.length, 1);
    assert.ok(supabaseClientMock.channel.calls[0][0].includes(UUID_SHOP_A));
  });

  test('iniciar — idempotente (não duplica canal)', () => {
    const { sandbox, supabaseClientMock } = criarSandbox();
    const { QueueRealtimeNotifier } = sandbox;
    QueueRealtimeNotifier.iniciar(UUID_SHOP_A);
    QueueRealtimeNotifier.iniciar(UUID_SHOP_A);
    assert.equal(supabaseClientMock.channel.calls.length, 1);
  });

  test('iniciar — múltiplas barbearias criam canais distintos', () => {
    const { sandbox, supabaseClientMock } = criarSandbox();
    const { QueueRealtimeNotifier } = sandbox;
    QueueRealtimeNotifier.iniciar(UUID_SHOP_A);
    QueueRealtimeNotifier.iniciar(UUID_SHOP_B);
    assert.equal(supabaseClientMock.channel.calls.length, 2);
  });

  test('estaAtivo — true após iniciar, false antes', () => {
    const { sandbox } = criarSandbox();
    const { QueueRealtimeNotifier } = sandbox;
    assert.equal(QueueRealtimeNotifier.estaAtivo(UUID_SHOP_A), false);
    QueueRealtimeNotifier.iniciar(UUID_SHOP_A);
    assert.equal(QueueRealtimeNotifier.estaAtivo(UUID_SHOP_A), true);
  });

  test('parar(id) — remove canal específico', () => {
    const { sandbox, supabaseClientMock } = criarSandbox();
    const { QueueRealtimeNotifier } = sandbox;
    QueueRealtimeNotifier.iniciar(UUID_SHOP_A);
    QueueRealtimeNotifier.iniciar(UUID_SHOP_B);
    QueueRealtimeNotifier.parar(UUID_SHOP_A);
    assert.equal(QueueRealtimeNotifier.estaAtivo(UUID_SHOP_A), false);
    assert.equal(QueueRealtimeNotifier.estaAtivo(UUID_SHOP_B), true);
    assert.equal(supabaseClientMock.removeChannel.calls.length, 1);
  });

  test('parar() sem args — remove todos os canais', () => {
    const { sandbox, supabaseClientMock } = criarSandbox();
    const { QueueRealtimeNotifier } = sandbox;
    QueueRealtimeNotifier.iniciar(UUID_SHOP_A);
    QueueRealtimeNotifier.iniciar(UUID_SHOP_B);
    QueueRealtimeNotifier.parar();
    assert.equal(QueueRealtimeNotifier.estaAtivo(UUID_SHOP_A), false);
    assert.equal(QueueRealtimeNotifier.estaAtivo(UUID_SHOP_B), false);
    assert.equal(supabaseClientMock.removeChannel.calls.length, 2);
  });
});

describe('QueueRealtimeNotifier — evento barberflow:fila-atualizada', () => {
  test('ao receber update Realtime, despacha barberflow:fila-atualizada', async () => {
    const fila = [{ id: 'e1', status: 'waiting', position: 1 }];
    const { sandbox, canalMock, eventos } = criarSandbox({ filaRetorno: fila });
    const { QueueRealtimeNotifier } = sandbox;

    QueueRealtimeNotifier.iniciar(UUID_SHOP_A);

    // Simula evento Realtime chegando
    canalMock._dispararEvento({ new: { barbershop_id: UUID_SHOP_A } });

    // Aguarda o re-fetch assíncrono (getByBarbershop é Promise)
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));

    const evt = eventos.find(e => e.type === 'barberflow:fila-atualizada');
    assert.ok(evt, 'evento barberflow:fila-atualizada deve ter sido despachado');
    assert.equal(evt.detail.barbershopId, UUID_SHOP_A);
    assert.deepEqual(evt.detail.fila, fila);
  });
});
