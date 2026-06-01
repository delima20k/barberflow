'use strict';

const { RealtimeEvent } = require('../../domain/realtime/RealtimeEvent');
const { EVENT_TYPES }   = require('../../config/realtime');

/**
 * UnsubscribeFromRoomUseCase — Remove uma conexão de um canal.
 *
 * Fluxo:
 *   1. Remove connectionId do RoomManager
 *   2. Atualiza PresenceService; se o usuário ficou sem conexões no canal,
 *      publica evento presence.usuario_saiu
 */
class UnsubscribeFromRoomUseCase {
  #roomManager;
  #presenceService;
  #pubSubService;

  /**
   * @param {object} deps
   * @param {import('../../domain/realtime/RoomManager').RoomManager} deps.roomManager
   * @param {import('../../domain/realtime/PresenceService').PresenceService} deps.presenceService
   * @param {import('../../domain/realtime/ports/IPubSubService').IPubSubService} deps.pubSubService
   */
  constructor({ roomManager, presenceService, pubSubService }) {
    this.#roomManager     = roomManager;
    this.#presenceService = presenceService;
    this.#pubSubService   = pubSubService;
  }

  /**
   * @param {object} cmd
   * @param {string} cmd.userId
   * @param {string} cmd.connectionId
   * @param {string} cmd.channel
   * @returns {Promise<void>}
   */
  async execute({ userId, connectionId, channel }) {
    this.#roomManager.leave(channel, connectionId);

    const isGone = this.#presenceService.untrack(channel, userId, connectionId);
    if (isGone) {
      const evResult = RealtimeEvent.create({
        channel,
        type:    EVENT_TYPES.PRESENCE_USUARIO_SAIU,
        payload: { userId },
      });
      if (evResult.isOk()) {
        await this.#pubSubService.publish(channel, evResult.getValue());
      }
    }
  }
}

module.exports = { UnsubscribeFromRoomUseCase };
