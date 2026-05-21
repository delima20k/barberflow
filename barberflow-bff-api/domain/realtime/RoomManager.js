'use strict';

/**
 * RoomManager — Gerencia a associação entre canais e conexões ativas.
 *
 * Opera em memória (Map) dentro de uma única instância do processo.
 * Para sincronização entre instâncias usa-se Redis Pub/Sub (RedisPubSubAdapter).
 *
 * Cada "room" corresponde a um canal: "fila.abc123", "notificacoes.userId", etc.
 */
class RoomManager {
  /** @type {Map<string, Set<string>>} channelId → Set<connectionId> */
  #rooms = new Map();

  /** @type {number} */
  #maxConnPerChannel;

  /**
   * @param {object} [opts]
   * @param {number} [opts.maxConnPerChannel=1000]
   */
  constructor({ maxConnPerChannel = 1000 } = {}) {
    this.#maxConnPerChannel = maxConnPerChannel;
  }

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Adiciona connectionId ao canal. Idempotente se já membro.
   * @param {string} channel
   * @param {string} connectionId
   * @returns {{ ok: boolean, error?: string }}
   */
  join(channel, connectionId) {
    if (!this.#rooms.has(channel)) this.#rooms.set(channel, new Set());
    const room = this.#rooms.get(channel);

    if (room.has(connectionId)) return { ok: true };

    if (room.size >= this.#maxConnPerChannel) {
      return {
        ok:    false,
        error: `Canal "${channel}" atingiu o limite de ${this.#maxConnPerChannel} conexões`,
      };
    }

    room.add(connectionId);
    return { ok: true };
  }

  /**
   * Remove connectionId do canal.
   * Se a sala ficar vazia, remove a entrada do Map.
   * @param {string} channel
   * @param {string} connectionId
   */
  leave(channel, connectionId) {
    const room = this.#rooms.get(channel);
    if (!room) return;
    room.delete(connectionId);
    if (room.size === 0) this.#rooms.delete(channel);
  }

  /**
   * Remove connectionId de todos os canais em que estiver.
   * Útil ao desconectar um cliente.
   * @param {string} connectionId
   * @returns {string[]} lista de canais afetados
   */
  leaveAll(connectionId) {
    const affected = [];
    for (const [channel, room] of this.#rooms) {
      if (room.has(connectionId)) {
        room.delete(connectionId);
        affected.push(channel);
        if (room.size === 0) this.#rooms.delete(channel);
      }
    }
    return affected;
  }

  /**
   * Retorna cópia imutável dos connectionIds no canal.
   * @param {string} channel
   * @returns {ReadonlySet<string>}
   */
  getMembers(channel) {
    return Object.freeze(new Set(this.#rooms.get(channel) ?? []));
  }

  /**
   * @param {string} channel
   * @param {string} connectionId
   * @returns {boolean}
   */
  isMember(channel, connectionId) {
    return this.#rooms.get(channel)?.has(connectionId) ?? false;
  }

  /**
   * Número de conexões no canal.
   * @param {string} channel
   * @returns {number}
   */
  roomSize(channel) {
    return this.#rooms.get(channel)?.size ?? 0;
  }

  /**
   * Número de canais ativos nesta instância.
   * @returns {number}
   */
  get roomCount() {
    return this.#rooms.size;
  }

  /**
   * Snapshot de todos os canais ativos com suas contagens.
   * Usado por métricas e health check.
   * @returns {Record<string, number>}
   */
  snapshot() {
    const out = {};
    for (const [channel, room] of this.#rooms) {
      out[channel] = room.size;
    }
    return out;
  }
}

module.exports = { RoomManager };
