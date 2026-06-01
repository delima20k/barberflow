'use strict';

const { IPubSubService }    = require('../../domain/realtime/ports/IPubSubService');
const { RealtimeEvent }     = require('../../domain/realtime/RealtimeEvent');
const { REDIS_CHANNEL_PREFIX } = require('../../config/realtime');

/**
 * RedisPubSubAdapter — Implementação de IPubSubService via ioredis.
 *
 * Usa duas conexões dedicadas (obrigatório no ioredis):
 *   #pub — para publicar mensagens (não pode ser usada para subscribe)
 *   #sub — para assinar canais e receber mensagens
 *
 * Padrão de chave Redis: "bf:realtime:{channel}"
 */
class RedisPubSubAdapter extends IPubSubService {
  /** @type {import('ioredis').Redis} */
  #pub;

  /** @type {import('ioredis').Redis} */
  #sub;

  /** @type {Map<string, Set<(event: object) => void>>} channel → callbacks */
  #callbacks = new Map();

  /** @type {boolean} */
  #connected = false;

  /**
   * @param {object} opts
   * @param {import('ioredis').Redis} opts.redisClient — conexão original
   * (o adapter criará duplicatas para pub e sub)
   */
  constructor({ redisClient }) {
    super();
    // Duplicar: cada instância Redis criada via .duplicate() herda a config
    // mas mantém seu próprio estado de subscribe.
    this.#pub = redisClient.duplicate();
    this.#sub = redisClient.duplicate();

    this.#sub.on('message', (redisChannel, message) => {
      this.#handleMessage(redisChannel, message);
    });

    this.#connected = true;
  }

  // ── IPubSubService ──────────────────────────────────────────────

  /**
   * Assina o canal lógico, registrando callback local.
   * Faz SUBSCRIBE no Redis apenas na primeira assinatura do canal.
   * @param {string} channel
   * @param {(event: object) => void} callback
   * @returns {Promise<void>}
   */
  async subscribe(channel, callback) {
    if (!this.#callbacks.has(channel)) {
      this.#callbacks.set(channel, new Set());
      await this.#sub.subscribe(this.#redisKey(channel));
    }
    this.#callbacks.get(channel).add(callback);
  }

  /**
   * Remove todos os callbacks do canal e faz UNSUBSCRIBE no Redis.
   * @param {string} channel
   * @returns {Promise<void>}
   */
  async unsubscribe(channel) {
    if (!this.#callbacks.has(channel)) return;
    this.#callbacks.delete(channel);
    await this.#sub.unsubscribe(this.#redisKey(channel));
  }

  /**
   * Publica um evento no canal via Redis PUBLISH.
   * @param {string} channel
   * @param {object} event — objeto serializável
   * @returns {Promise<void>}
   */
  async publish(channel, event) {
    const payload = typeof event.toJSON === 'function' ? event.toJSON() : event;
    await this.#pub.publish(this.#redisKey(channel), JSON.stringify(payload));
  }

  /**
   * Encerra as duas conexões Redis.
   * @returns {Promise<void>}
   */
  async disconnect() {
    this.#connected = false;
    this.#callbacks.clear();
    await Promise.all([
      this.#pub.quit(),
      this.#sub.quit(),
    ]);
  }

  // ── Private ────────────────────────────────────────────────────

  /**
   * @param {string} channel
   * @returns {string}
   */
  #redisKey(channel) {
    return `${REDIS_CHANNEL_PREFIX}${channel}`;
  }

  /**
   * Recebe mensagem bruta do Redis e despacha para callbacks registrados.
   * @param {string} redisChannel — chave Redis (com prefixo)
   * @param {string} message      — JSON serializado
   */
  #handleMessage(redisChannel, message) {
    if (!this.#connected) return;

    const channel = redisChannel.slice(REDIS_CHANNEL_PREFIX.length);
    const callbacks = this.#callbacks.get(channel);
    if (!callbacks || callbacks.size === 0) return;

    let parsed;
    try {
      parsed = JSON.parse(message);
    } catch {
      return; // mensagem malformada — descartar silenciosamente
    }

    const result = RealtimeEvent.fromJSON(parsed);
    if (result.isFailure) return;

    const event = result.getValue();
    for (const cb of callbacks) {
      try { cb(event); } catch { /* callback não deve quebrar o loop */ }
    }
  }
}

module.exports = { RedisPubSubAdapter };
