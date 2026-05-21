'use strict';

const { randomUUID } = require('node:crypto');

/**
 * ConnectionRegistry — Registro em memória das conexões WebSocket ativas.
 *
 * Cada entrada rastreia: ws, userId, channels e timestamp de criação.
 * Uma connectionId é gerada por conexão e imutável durante o ciclo de vida.
 */
class ConnectionRegistry {
  /**
   * @type {Map<string, {
   *   ws:           import('ws').WebSocket,
   *   userId:       string,
   *   channels:     Set<string>,
   *   connectedAt:  Date,
   *   msgCount:     number,
   *   windowStart:  number
   * }>}
   */
  #connections = new Map();

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Registra nova conexão e retorna o connectionId gerado.
   * @param {import('ws').WebSocket} ws
   * @param {string} userId
   * @returns {string} connectionId (UUID)
   */
  register(ws, userId) {
    const connectionId = randomUUID();
    this.#connections.set(connectionId, {
      ws,
      userId,
      channels:    new Set(),
      connectedAt: new Date(),
      msgCount:    0,
      windowStart: Date.now(),
    });
    return connectionId;
  }

  /**
   * Remove uma conexão do registro.
   * @param {string} connectionId
   */
  unregister(connectionId) {
    this.#connections.delete(connectionId);
  }

  /**
   * Retorna os dados da conexão, ou undefined se não existir.
   * @param {string} connectionId
   * @returns {object|undefined}
   */
  get(connectionId) {
    return this.#connections.get(connectionId);
  }

  /**
   * Retorna todos os connectionIds subscritos ao canal.
   * @param {string} channel
   * @returns {string[]}
   */
  getByChannel(channel) {
    const ids = [];
    for (const [id, entry] of this.#connections) {
      if (entry.channels.has(channel)) ids.push(id);
    }
    return ids;
  }

  /**
   * Retorna todos os connectionIds do userId.
   * @param {string} userId
   * @returns {string[]}
   */
  getByUser(userId) {
    const ids = [];
    for (const [id, entry] of this.#connections) {
      if (entry.userId === userId) ids.push(id);
    }
    return ids;
  }

  /**
   * Adiciona canal à lista de inscrições da conexão.
   * @param {string} connectionId
   * @param {string} channel
   */
  addChannel(connectionId, channel) {
    this.#connections.get(connectionId)?.channels.add(channel);
  }

  /**
   * Remove canal da lista de inscrições da conexão.
   * @param {string} connectionId
   * @param {string} channel
   */
  removeChannel(connectionId, channel) {
    this.#connections.get(connectionId)?.channels.delete(channel);
  }

  /**
   * Número de conexões ativas.
   * @returns {number}
   */
  get size() {
    return this.#connections.size;
  }

  /**
   * Verifica e aplica rate limit por conexão (sliding window 1s).
   * Retorna true se a mensagem está dentro do limite.
   * @param {string} connectionId
   * @param {number} limitPerSec
   * @returns {boolean}
   */
  checkRateLimit(connectionId, limitPerSec) {
    const entry = this.#connections.get(connectionId);
    if (!entry) return false;

    const now = Date.now();
    if (now - entry.windowStart >= 1000) {
      entry.msgCount    = 0;
      entry.windowStart = now;
    }
    entry.msgCount++;
    return entry.msgCount <= limitPerSec;
  }
}

module.exports = { ConnectionRegistry };
