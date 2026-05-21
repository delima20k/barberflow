'use strict';

const { MAX_CHANNELS_PER_CONN } = require('../../../config/realtime');

/**
 * ChannelRouter — Roteamento de mensagens WebSocket para use cases.
 *
 * Responsabilidade única: mapear o campo "type" da mensagem recebida
 * ao use case correto. Zero lógica de negócio aqui.
 *
 * Tipos de mensagem aceitos do cliente:
 *   subscribe   — assinar um canal
 *   unsubscribe — cancelar assinatura
 *   ping        — keepalive
 */
class ChannelRouter {
  #subscribeUseCase;
  #unsubscribeUseCase;
  #connectionRegistry;
  #realtimeMetrics;

  /**
   * @param {object} deps
   * @param {import('../../../application/realtime/SubscribeToRoomUseCase').SubscribeToRoomUseCase}     deps.subscribeToRoomUseCase
   * @param {import('../../../application/realtime/UnsubscribeFromRoomUseCase').UnsubscribeFromRoomUseCase} deps.unsubscribeFromRoomUseCase
   * @param {import('./ConnectionRegistry').ConnectionRegistry} deps.connectionRegistry
   * @param {import('../../../infrastructure/realtime/RealtimeMetrics').RealtimeMetrics} deps.realtimeMetrics
   */
  constructor({
    subscribeToRoomUseCase,
    unsubscribeFromRoomUseCase,
    connectionRegistry,
    realtimeMetrics,
  }) {
    this.#subscribeUseCase    = subscribeToRoomUseCase;
    this.#unsubscribeUseCase  = unsubscribeFromRoomUseCase;
    this.#connectionRegistry  = connectionRegistry;
    this.#realtimeMetrics     = realtimeMetrics;
  }

  /**
   * Roteia uma mensagem recebida de uma conexão WebSocket.
   * @param {string} connectionId
   * @param {object} message — mensagem já parseada do JSON
   * @param {Function} send  — (payload: object) => void
   * @returns {Promise<void>}
   */
  async route(connectionId, message, send) {
    const entry = this.#connectionRegistry.get(connectionId);
    if (!entry) return;

    const { type } = message;

    switch (type) {
      case 'subscribe':
        await this.#handleSubscribe(connectionId, entry, message, send);
        break;

      case 'unsubscribe':
        await this.#handleUnsubscribe(connectionId, entry, message, send);
        break;

      case 'ping':
        send({ type: 'pong' });
        break;

      default:
        send({ type: 'error', code: 400, message: `Tipo de mensagem desconhecido: "${type}"` });
    }
  }

  // ── Private ────────────────────────────────────────────────────

  async #handleSubscribe(connectionId, entry, message, send) {
    const { channel, lastEventId = null } = message;

    if (!channel || typeof channel !== 'string') {
      return send({ type: 'error', code: 400, message: 'channel é obrigatório' });
    }

    if (entry.channels.has(channel)) {
      return send({ type: 'subscribed', channel, ok: true, alreadySubscribed: true });
    }

    if (entry.channels.size >= MAX_CHANNELS_PER_CONN) {
      return send({
        type:    'error',
        code:    429,
        message: `Limite de ${MAX_CHANNELS_PER_CONN} canais por conexão atingido`,
      });
    }

    const result = await this.#subscribeUseCase.execute({
      userId:              entry.userId,
      connectionId,
      channel,
      lastEventTimestamp:  lastEventId,
      onEvent: (event) => {
        const payload = typeof event.toJSON === 'function' ? event.toJSON() : event;
        send({ type: 'event', ...payload });
      },
    });

    if (!result.ok) {
      this.#realtimeMetrics.recordError(channel);
      return send({ type: 'error', code: 403, message: result.error });
    }

    this.#connectionRegistry.addChannel(connectionId, channel);

    // Reentrega de eventos perdidos
    if (result.replayEvents?.length > 0) {
      for (const ev of result.replayEvents) {
        send({ type: 'event', ...ev });
      }
    }

    send({ type: 'subscribed', channel, ok: true });
  }

  async #handleUnsubscribe(connectionId, entry, message, send) {
    const { channel } = message;
    if (!channel || typeof channel !== 'string') {
      return send({ type: 'error', code: 400, message: 'channel é obrigatório' });
    }

    await this.#unsubscribeUseCase.execute({
      userId: entry.userId,
      connectionId,
      channel,
    });

    this.#connectionRegistry.removeChannel(connectionId, channel);
    send({ type: 'unsubscribed', channel, ok: true });
  }
}

module.exports = { ChannelRouter };
