'use strict';

const {
  REDIS_REPLAY_PREFIX,
  REPLAY_TTL_SECONDS,
  REPLAY_MAX_EVENTS,
  CHANNELS_WITH_REPLAY,
} = require('../../config/realtime');

/**
 * EventReplayBuffer — Buffer de replay de eventos por canal via Redis sorted set.
 *
 * Usado para reconexão com last-event-id: o cliente envia o timestamp ISO do
 * último evento recebido e o servidor reentrega os eventos posteriores.
 *
 * Estrutura Redis:
 *   Chave:  bf:replay:{channel}            (sorted set)
 *   Score:  timestamp em ms (occurredAt)
 *   Value:  JSON serializado do evento
 *   TTL:    REPLAY_TTL_SECONDS (padrão 5 min)
 *   Limite: REPLAY_MAX_EVENTS por canal
 *
 * Apenas canais em CHANNELS_WITH_REPLAY usam este buffer.
 */
class EventReplayBuffer {
  /** @type {import('ioredis').Redis} */
  #redis;

  /**
   * @param {object} opts
   * @param {import('ioredis').Redis} opts.redisClient
   */
  constructor({ redisClient }) {
    this.#redis = redisClient;
  }

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Verifica se o canal suporta replay.
   * @param {string} channel
   * @returns {boolean}
   */
  supportsReplay(channel) {
    if (!channel || typeof channel !== 'string') return false;
    return CHANNELS_WITH_REPLAY.has(channel.split('.')[0]);
  }

  /**
   * Adiciona um evento ao buffer do canal.
   * Mantém no máximo REPLAY_MAX_EVENTS e renova TTL.
   * @param {object} event — RealtimeEvent ou plain object com occurredAt e toJSON()
   * @returns {Promise<void>}
   */
  async append(event) {
    const channel = event.channel;
    if (!this.supportsReplay(channel)) return;

    const key       = this.#redisKey(channel);
    const score     = event.timestampMs ?? new Date(event.occurredAt).getTime();
    const value     = JSON.stringify(typeof event.toJSON === 'function' ? event.toJSON() : event);
    const pipeline  = this.#redis.pipeline();

    pipeline.zadd(key, score, value);
    // Remove os mais antigos se exceder o limite
    pipeline.zremrangebyrank(key, 0, -(REPLAY_MAX_EVENTS + 1));
    pipeline.expire(key, REPLAY_TTL_SECONDS);

    await pipeline.exec();
  }

  /**
   * Retorna eventos posteriores a lastEventTimestamp (ISO string ou ms).
   * Retorna lista vazia se canal não suporta replay ou buffer inexistente.
   * @param {string} channel
   * @param {string|number|null} lastEventTimestamp — ISO string ou ms; null = últimos N eventos
   * @returns {Promise<object[]>}
   */
  async since(channel, lastEventTimestamp) {
    if (!this.supportsReplay(channel)) return [];

    const key = this.#redisKey(channel);

    let minScore;
    if (lastEventTimestamp == null) {
      // Sem cursor: retorna os REPLAY_MAX_EVENTS mais recentes
      const raw = await this.#redis.zrange(key, -REPLAY_MAX_EVENTS, -1);
      return this.#parseAll(raw);
    }

    const ts = typeof lastEventTimestamp === 'number'
      ? lastEventTimestamp
      : new Date(lastEventTimestamp).getTime();

    minScore = ts + 1; // exclusivo: apenas eventos APÓS o último

    const raw = await this.#redis.zrangebyscore(key, minScore, '+inf');
    return this.#parseAll(raw);
  }

  /**
   * Remove todas as entradas do canal no buffer.
   * @param {string} channel
   * @returns {Promise<void>}
   */
  async purge(channel) {
    await this.#redis.del(this.#redisKey(channel));
  }

  // ── Private ────────────────────────────────────────────────────

  /**
   * @param {string} channel
   * @returns {string}
   */
  #redisKey(channel) {
    return `${REDIS_REPLAY_PREFIX}${channel}`;
  }

  /**
   * Desserializa lista de strings JSON em objetos.
   * Descarta entradas malformadas silenciosamente.
   * @param {string[]} raw
   * @returns {object[]}
   */
  #parseAll(raw) {
    const out = [];
    for (const item of raw) {
      try { out.push(JSON.parse(item)); } catch { /* descartar */ }
    }
    return out;
  }
}

module.exports = { EventReplayBuffer };
