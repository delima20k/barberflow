'use strict';

const { ChannelPolicy }  = require('../../domain/realtime/ChannelPolicy');
const { RealtimeEvent }  = require('../../domain/realtime/RealtimeEvent');
const { EVENT_TYPES }    = require('../../config/realtime');

/**
 * SubscribeToRoomUseCase — Orquestra a assinatura de um cliente a um canal.
 *
 * Fluxo:
 *   1. Valida o canal via ChannelPolicy
 *   2. Adiciona ao RoomManager
 *   3. Registra presença via PresenceService (emite evento presence.joined se novo)
 *   4. Assina o pub/sub Redis para receber mensagens de outras instâncias
 *   5. Retorna lastEventId atual do buffer de replay (se suportado)
 *
 * @example
 * const { ok, lastEventId } = await useCase.execute({
 *   userId, connectionId, channel, lastEventTimestamp
 * });
 */
class SubscribeToRoomUseCase {
  #roomManager;
  #presenceService;
  #pubSubService;
  #eventReplayBuffer;
  #pubSubChannels; // Map<channel, handler> — rastreia assinaturas abertas

  /**
   * @param {object} deps
   * @param {import('../../domain/realtime/RoomManager').RoomManager} deps.roomManager
   * @param {import('../../domain/realtime/PresenceService').PresenceService} deps.presenceService
   * @param {import('../../domain/realtime/ports/IPubSubService').IPubSubService} deps.pubSubService
   * @param {import('../../infrastructure/realtime/EventReplayBuffer').EventReplayBuffer} deps.eventReplayBuffer
   */
  constructor({ roomManager, presenceService, pubSubService, eventReplayBuffer }) {
    this.#roomManager       = roomManager;
    this.#presenceService   = presenceService;
    this.#pubSubService     = pubSubService;
    this.#eventReplayBuffer = eventReplayBuffer;
    this.#pubSubChannels    = new Map();
  }

  /**
   * @param {object} cmd
   * @param {string}   cmd.userId
   * @param {string}   cmd.connectionId
   * @param {string}   cmd.channel
   * @param {Function} cmd.onEvent            — callback: (event: RealtimeEvent) => void
   * @param {string|null} [cmd.lastEventTimestamp] — ISO ou ms; para replay
   * @returns {Promise<{ ok: boolean, error?: string, replayEvents?: object[] }>}
   */
  async execute({ userId, connectionId, channel, onEvent, lastEventTimestamp = null }) {
    // 1. Validar canal
    if (!ChannelPolicy.isValidChannel(channel)) {
      return { ok: false, error: `Canal inválido: "${channel}"` };
    }
    if (!ChannelPolicy.canSubscribe(userId, channel)) {
      return { ok: false, error: 'Não autorizado a assinar este canal' };
    }

    // 2. Adicionar ao RoomManager
    const joinResult = this.#roomManager.join(channel, connectionId);
    if (!joinResult.ok) return { ok: false, error: joinResult.error };

    // 3. Registrar presença
    const isNewPresence = this.#presenceService.track(channel, userId, connectionId);

    // 4. Publicar evento de presença se for o primeiro join do usuário neste canal
    if (isNewPresence) {
      const evResult = RealtimeEvent.create({
        channel,
        type:    EVENT_TYPES.PRESENCE_USUARIO_ENTROU,
        payload: { userId },
      });
      if (evResult.isOk()) {
        await this.#pubSubService.publish(channel, evResult.getValue());
      }
    }

    // 5. Assinar pub/sub Redis se ainda não há handler para este canal
    if (!this.#pubSubChannels.has(channel)) {
      this.#pubSubChannels.set(channel, true);
      await this.#pubSubService.subscribe(channel, onEvent);
    }

    // 6. Replay de eventos perdidos
    let replayEvents = [];
    if (this.#eventReplayBuffer.supportsReplay(channel) && lastEventTimestamp != null) {
      replayEvents = await this.#eventReplayBuffer.since(channel, lastEventTimestamp);
    }

    return { ok: true, replayEvents };
  }
}

module.exports = { SubscribeToRoomUseCase };
