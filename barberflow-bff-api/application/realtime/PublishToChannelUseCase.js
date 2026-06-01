'use strict';

const { RealtimeEvent } = require('../../domain/realtime/RealtimeEvent');

/**
 * PublishToChannelUseCase — Publica um evento em um canal via Redis Pub/Sub.
 *
 * Usado internamente por rotas REST, workers ou outros use cases.
 * Também persiste o evento no EventReplayBuffer (se o canal suportar).
 *
 * Clientes WebSocket não publicam diretamente — apenas o servidor publica.
 */
class PublishToChannelUseCase {
  #pubSubService;
  #eventReplayBuffer;
  #realtimeMetrics;

  /**
   * @param {object} deps
   * @param {import('../../domain/realtime/ports/IPubSubService').IPubSubService} deps.pubSubService
   * @param {import('../../infrastructure/realtime/EventReplayBuffer').EventReplayBuffer} deps.eventReplayBuffer
   * @param {import('../../infrastructure/realtime/RealtimeMetrics').RealtimeMetrics} deps.realtimeMetrics
   */
  constructor({ pubSubService, eventReplayBuffer, realtimeMetrics }) {
    this.#pubSubService     = pubSubService;
    this.#eventReplayBuffer = eventReplayBuffer;
    this.#realtimeMetrics   = realtimeMetrics;
  }

  /**
   * @param {object} cmd
   * @param {string} cmd.channel
   * @param {string} cmd.type    — ex: "events.v1.fila.entrada_criada"
   * @param {object} [cmd.payload]
   * @returns {Promise<{ ok: boolean, error?: string, eventId?: string }>}
   */
  async execute({ channel, type, payload = {} }) {
    const result = RealtimeEvent.create({ channel, type, payload });
    if (result.isFail()) {
      return { ok: false, error: result.getError() };
    }

    const event = result.getValue();
    const start = Date.now();

    await this.#pubSubService.publish(channel, event);

    this.#realtimeMetrics.recordMessage();
    this.#realtimeMetrics.recordFanoutLatency(Date.now() - start);

    // Persiste no buffer de replay (não-bloqueante; erro não propagado)
    this.#eventReplayBuffer.append(event).catch(() => {});

    return { ok: true, eventId: event.eventId };
  }
}

module.exports = { PublishToChannelUseCase };
