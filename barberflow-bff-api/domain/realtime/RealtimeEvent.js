'use strict';

const { randomUUID }       = require('node:crypto');
const { BaseValueObject }  = require('../shared/BaseValueObject');
const { Result }           = require('../shared/Result');

/**
 * RealtimeEvent — Value Object imutável que representa um evento transmitido
 * pelo gateway WebSocket.
 *
 * Formato de tipo: "events.v1.<dominio>.<acao>"
 * Exemplos:
 *   events.v1.fila.entrada_criada
 *   events.v1.notificacao.nova
 *   events.v1.presence.usuario_entrou
 *   events.v1.barbershop.status_alterado
 */
class RealtimeEvent extends BaseValueObject {
  static #VERSAO      = 'v1';
  static #TIPO_REGEXP = /^events\.v1\.[a-z_]+\.[a-z_]+$/;

  // ── Factory ────────────────────────────────────────────────────

  /**
   * Cria um RealtimeEvent validado.
   * @param {object} input
   * @param {string} input.channel
   * @param {string} input.type     — ex: "events.v1.fila.entrada_criada"
   * @param {object} [input.payload]
   * @param {string} [input.eventId] — UUID; gerado automaticamente se omitido
   * @returns {Result<RealtimeEvent, string>}
   */
  static create({ channel, type, payload = {}, eventId } = {}) {
    if (!channel || typeof channel !== 'string' || !channel.trim()) {
      return Result.fail('RealtimeEvent: channel é obrigatório');
    }
    if (!type || typeof type !== 'string') {
      return Result.fail('RealtimeEvent: type é obrigatório');
    }
    if (!RealtimeEvent.#TIPO_REGEXP.test(type)) {
      return Result.fail(
        `RealtimeEvent: type inválido — use "events.v1.<dominio>.<acao>". Recebido: "${type}"`,
      );
    }
    if (payload === null || typeof payload !== 'object') {
      return Result.fail('RealtimeEvent: payload deve ser um objeto');
    }

    const ev = new RealtimeEvent({
      eventId:    eventId ?? randomUUID(),
      channel:    channel.trim(),
      version:    RealtimeEvent.#VERSAO,
      type,
      payload:    Object.freeze({ ...payload }),
      occurredAt: new Date(),
    });

    return Result.ok(ev);
  }

  /**
   * Reconstrói um RealtimeEvent a partir de JSON (ex: vindo do Redis).
   * @param {object} raw
   * @returns {Result<RealtimeEvent, string>}
   */
  static fromJSON(raw) {
    if (!raw || typeof raw !== 'object') {
      return Result.fail('RealtimeEvent.fromJSON: entrada inválida');
    }
    return RealtimeEvent.create({
      channel:  raw.channel,
      type:     raw.type,
      payload:  raw.payload ?? {},
      eventId:  raw.eventId,
    });
  }

  // ── Accessors ──────────────────────────────────────────────────

  get eventId()    { return this._props.eventId; }
  get channel()    { return this._props.channel; }
  get version()    { return this._props.version; }
  get type()       { return this._props.type; }
  get payload()    { return this._props.payload; }
  get occurredAt() { return this._props.occurredAt; }

  /**
   * Timestamp em ms para uso como score no Redis sorted set.
   * @returns {number}
   */
  get timestampMs() { return this._props.occurredAt.getTime(); }

  /**
   * Serializa para transmissão ao cliente via WebSocket.
   * @returns {object}
   */
  toJSON() {
    return {
      eventId:    this.eventId,
      channel:    this.channel,
      version:    this.version,
      type:       this.type,
      payload:    this.payload,
      occurredAt: this.occurredAt.toISOString(),
    };
  }

  /** @override */
  _validate() { return Result.ok(this); }

  /** @returns {string} */
  static get versao() { return RealtimeEvent.#VERSAO; }
}

module.exports = { RealtimeEvent };
