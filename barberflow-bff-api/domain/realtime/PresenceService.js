'use strict';

/**
 * PresenceService — Rastreia presença de usuários por canal dentro de um processo.
 *
 * Um usuário pode ter múltiplas conexões simultâneas; o serviço contabiliza
 * conexões por usuário e emite join/leave apenas quando o contador vai de 0→1
 * ou de 1→0.
 *
 * Estrutura interna:
 *   #channels: Map<channel, Map<userId, Set<connectionId>>>
 */
class PresenceService {
  /** @type {Map<string, Map<string, Set<string>>>} */
  #channels = new Map();

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Registra connectionId do userId no canal.
   * Retorna true se foi o primeiro join do userId nesse canal (presence.joined).
   * @param {string} channel
   * @param {string} userId
   * @param {string} connectionId
   * @returns {boolean} isNewPresence
   */
  track(channel, userId, connectionId) {
    if (!this.#channels.has(channel)) this.#channels.set(channel, new Map());
    const channelMap = this.#channels.get(channel);

    const isNew = !channelMap.has(userId) || channelMap.get(userId).size === 0;
    if (!channelMap.has(userId)) channelMap.set(userId, new Set());
    channelMap.get(userId).add(connectionId);

    return isNew;
  }

  /**
   * Remove connectionId do userId no canal.
   * Retorna true se foi a última conexão do userId nesse canal (presence.left).
   * @param {string} channel
   * @param {string} userId
   * @param {string} connectionId
   * @returns {boolean} isGone
   */
  untrack(channel, userId, connectionId) {
    const channelMap = this.#channels.get(channel);
    if (!channelMap) return false;

    const connSet = channelMap.get(userId);
    if (!connSet) return false;

    connSet.delete(connectionId);

    if (connSet.size === 0) {
      channelMap.delete(userId);
      if (channelMap.size === 0) this.#channels.delete(channel);
      return true;
    }
    return false;
  }

  /**
   * Remove connectionId de todos os canais onde userId está presente.
   * Útil no evento de disconnect da conexão.
   * @param {string} userId
   * @param {string} connectionId
   * @returns {string[]} canais onde userId ficou com 0 conexões (presence.left)
   */
  untrackAll(userId, connectionId) {
    const departed = [];
    for (const [channel, channelMap] of this.#channels) {
      const connSet = channelMap.get(userId);
      if (!connSet) continue;
      connSet.delete(connectionId);
      if (connSet.size === 0) {
        channelMap.delete(userId);
        departed.push(channel);
        if (channelMap.size === 0) this.#channels.delete(channel);
      }
    }
    return departed;
  }

  /**
   * Retorna o conjunto de userIds presentes no canal (com ao menos 1 conexão).
   * @param {string} channel
   * @returns {ReadonlySet<string>}
   */
  getPresence(channel) {
    const channelMap = this.#channels.get(channel);
    if (!channelMap) return Object.freeze(new Set());
    return Object.freeze(new Set(channelMap.keys()));
  }

  /**
   * @param {string} channel
   * @param {string} userId
   * @returns {boolean}
   */
  isPresent(channel, userId) {
    const connSet = this.#channels.get(channel)?.get(userId);
    return !!(connSet && connSet.size > 0);
  }

  /**
   * Número de usuários únicos presentes no canal.
   * @param {string} channel
   * @returns {number}
   */
  presenceCount(channel) {
    return this.#channels.get(channel)?.size ?? 0;
  }

  /**
   * Snapshot de todos os canais com presença ativa.
   * @returns {Record<string, string[]>} canal → [userId, ...]
   */
  snapshot() {
    const out = {};
    for (const [channel, channelMap] of this.#channels) {
      out[channel] = [...channelMap.keys()];
    }
    return out;
  }
}

module.exports = { PresenceService };
