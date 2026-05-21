'use strict';

/**
 * ReplayEventsUseCase — Reenvia eventos perdidos a partir de um lastEventTimestamp.
 *
 * Chamado pelo WebSocketGateway quando um cliente se reconecta com lastEventId.
 * Retorna lista de eventos ordenados cronologicamente para reentrega.
 */
class ReplayEventsUseCase {
  #eventReplayBuffer;

  /**
   * @param {object} deps
   * @param {import('../../infrastructure/realtime/EventReplayBuffer').EventReplayBuffer} deps.eventReplayBuffer
   */
  constructor({ eventReplayBuffer }) {
    this.#eventReplayBuffer = eventReplayBuffer;
  }

  /**
   * @param {object} cmd
   * @param {string}       cmd.channel
   * @param {string|number|null} cmd.lastEventTimestamp — ISO string ou ms; null = últimos N eventos
   * @returns {Promise<{ ok: boolean, events: object[], error?: string }>}
   */
  async execute({ channel, lastEventTimestamp = null }) {
    if (!channel || typeof channel !== 'string') {
      return { ok: false, events: [], error: 'channel é obrigatório' };
    }

    if (!this.#eventReplayBuffer.supportsReplay(channel)) {
      return { ok: true, events: [] };
    }

    const events = await this.#eventReplayBuffer.since(channel, lastEventTimestamp);
    return { ok: true, events };
  }
}

module.exports = { ReplayEventsUseCase };
