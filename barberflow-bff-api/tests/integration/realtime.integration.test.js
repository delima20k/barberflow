'use strict';

/**
 * Teste de integração da camada realtime.
 *
 * Valida que um evento publicado via PublishToChannelUseCase numa "instância A"
 * chega ao cliente conectado via SubscribeToRoomUseCase na "instância B".
 *
 * Em produção, o pub/sub é Redis (RedisPubSubAdapter); aqui usamos
 * InMemoryPubSubStub compartilhado para simular o barramento sem infra externa.
 */

const { describe, it, before } = require('node:test');
const assert                    = require('node:assert/strict');

const { RoomManager }              = require('../../domain/realtime/RoomManager');
const { PresenceService }          = require('../../domain/realtime/PresenceService');
const { RealtimeMetrics }          = require('../../infrastructure/realtime/RealtimeMetrics');
const { InMemoryPubSubStub }       = require('../../infrastructure/realtime/InMemoryPubSubStub');
const { EventReplayBuffer }        = require('../../infrastructure/realtime/EventReplayBuffer');
const { SubscribeToRoomUseCase }   = require('../../application/realtime/SubscribeToRoomUseCase');
const { PublishToChannelUseCase }  = require('../../application/realtime/PublishToChannelUseCase');
const { EVENT_TYPES }              = require('../../config/realtime');

// ── Helpers ───────────────────────────────────────────────────────

/** Retorna um EventReplayBuffer stub que não usa Redis. */
function noopReplayBuffer() {
  return {
    supportsReplay: () => false,
    append:         async () => {},
    since:          async () => [],
    purge:          async () => {},
  };
}

/**
 * Cria uma "instância BFF" com os serviços realtime necessários.
 * O pubSubService é compartilhado entre instâncias para simular Redis.
 */
function criarInstancia({ pubSubService }) {
  const roomManager     = new RoomManager({ maxConnPerChannel: 100 });
  const presenceService = new PresenceService();
  const realtimeMetrics = new RealtimeMetrics();
  const eventReplay     = noopReplayBuffer();

  const subscribeUseCase = new SubscribeToRoomUseCase({
    roomManager,
    presenceService,
    pubSubService,
    eventReplayBuffer: eventReplay,
  });

  const publishUseCase = new PublishToChannelUseCase({
    pubSubService,
    eventReplayBuffer: eventReplay,
    realtimeMetrics,
  });

  return { subscribeUseCase, publishUseCase, roomManager, realtimeMetrics };
}

// ── Testes ────────────────────────────────────────────────────────

describe('Realtime — integração multi-instância', () => {
  let pubSubShared;
  let instanciaA;
  let instanciaB;

  before(() => {
    // Pub/sub compartilhado simula Redis: publicar em A → receber em B
    pubSubShared = new InMemoryPubSubStub();
    instanciaA   = criarInstancia({ pubSubService: pubSubShared });
    instanciaB   = criarInstancia({ pubSubService: pubSubShared });
  });

  it('evento publicado na instância A chega ao subscriber da instância B', async () => {
    const channel      = 'fila.shopABC';
    const receivedEvts = [];

    // Cliente conectado à instância B assina o canal
    const subResult = await instanciaB.subscribeUseCase.execute({
      userId:       'user-barbeiro',
      connectionId: 'conn-B-001',
      channel,
      onEvent:      (ev) => receivedEvts.push(ev),
    });
    assert.equal(subResult.ok, true);

    // Instância A publica um evento
    const pubResult = await instanciaA.publishUseCase.execute({
      channel,
      type:    EVENT_TYPES.FILA_ENTRADA_CRIADA,
      payload: { entradaId: 'entrada-001', clienteId: 'cli-1', posicao: 1 },
    });
    assert.equal(pubResult.ok, true);

    // Aguarda microtask queue (pub/sub stub é síncrono internamente)
    await new Promise((r) => setImmediate(r));

    assert.equal(receivedEvts.length, 1);
    assert.equal(receivedEvts[0].type, EVENT_TYPES.FILA_ENTRADA_CRIADA);
    assert.equal(receivedEvts[0].channel, channel);
    assert.equal(receivedEvts[0].payload.entradaId, 'entrada-001');
  });

  it('subscriber só recebe eventos do canal assinado', async () => {
    const channelFila    = 'fila.shopXYZ';
    const channelStatus  = 'barbershop.status.shopXYZ';
    const filaEvts       = [];
    const statusEvts     = [];

    await instanciaB.subscribeUseCase.execute({
      userId:       'user-cliente',
      connectionId: 'conn-B-002',
      channel:      channelFila,
      onEvent:      (ev) => filaEvts.push(ev),
    });

    await instanciaB.subscribeUseCase.execute({
      userId:       'user-cliente',
      connectionId: 'conn-B-002',
      channel:      channelStatus,
      onEvent:      (ev) => statusEvts.push(ev),
    });

    // Publica em channelFila
    await instanciaA.publishUseCase.execute({
      channel:  channelFila,
      type:     EVENT_TYPES.FILA_ENTRADA_ATUALIZADA,
      payload:  { entradaId: 'e-2', status: 'waiting' },
    });

    await new Promise((r) => setImmediate(r));

    assert.equal(filaEvts.length, 1);
    assert.equal(statusEvts.length, 0);
  });

  it('PublishToChannelUseCase rejeita type com formato inválido', async () => {
    const result = await instanciaA.publishUseCase.execute({
      channel: 'fila.test',
      type:    'tipo-invalido',
      payload: {},
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /inválido/);
  });

  it('SubscribeToRoomUseCase rejeita canal desconhecido', async () => {
    const result = await instanciaB.subscribeUseCase.execute({
      userId:       'user-x',
      connectionId: 'conn-x',
      channel:      'canal.desconhecido',
      onEvent:      () => {},
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /inválido/);
  });

  it('SubscribeToRoomUseCase rejeita userId sem permissão no canal notificacoes', async () => {
    const result = await instanciaB.subscribeUseCase.execute({
      userId:       'user-intruso',
      connectionId: 'conn-intruso',
      channel:      'notificacoes.outro-usuario',
      onEvent:      () => {},
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /autorizado/);
  });

  it('métricas registram mensagem publicada', async () => {
    const { realtimeMetrics } = instanciaA;
    const before = realtimeMetrics.snapshot().totalMessages;

    await instanciaA.publishUseCase.execute({
      channel: 'fila.metricas',
      type:    EVENT_TYPES.FILA_ENTRADA_REMOVIDA,
      payload: { entradaId: 'e-3' },
    });

    const after = instanciaA.realtimeMetrics.snapshot().totalMessages;
    assert.equal(after, before + 1);
  });
});
