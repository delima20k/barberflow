'use strict';

const { logger } = require('../logger');

/**
 * AbuseEvent — evento imutável de ação anti-abuso (event sourcing leve).
 */
class AbuseEvent {
  constructor({ userId, ip, endpoint, action, reason, triggeredRules, riskScore, timestamp }) {
    this.userId         = userId ?? null;
    this.ip             = ip ?? null;
    this.endpoint       = endpoint;
    this.action         = action;
    this.reason         = reason;
    this.triggeredRules = triggeredRules ?? [];
    this.riskScore      = riskScore ?? 0;
    this.timestamp      = timestamp ?? Date.now();
    Object.freeze(this);
  }
}

/**
 * AbuseEventLog — registro de eventos de abuso para observabilidade e auditoria.
 *
 * Cada decisão não-allow é registrada via pino (logger) e armazenada em
 * ringbuffer em memória (até 1000 eventos) para consulta em testes e admin.
 *
 * Em produção, o logger pino pode ser configurado para enviar para Datadog,
 * Logtail, etc. — sem necessidade de alterar esta classe.
 */
class AbuseEventLog {
  static #events     = [];
  static #maxInMemory = 1000;

  /**
   * Registra um evento de abuso de forma não-bloqueante.
   * @param {object} eventData
   */
  static record(eventData) {
    const event = new AbuseEvent(eventData);
    // Microtask: não atrasa a resposta HTTP
    Promise.resolve().then(() => {
      logger.warn({ abuseEvent: event }, '[Abuse] action taken');
      if (AbuseEventLog.#events.length >= AbuseEventLog.#maxInMemory) {
        AbuseEventLog.#events.shift(); // ringbuffer — remove o mais antigo
      }
      AbuseEventLog.#events.push(event);
    });
  }

  /** Retorna cópia dos eventos em memória (para testes e dashboard). */
  static snapshot() { return [...AbuseEventLog.#events]; }

  /** Para testes: limpa o histórico. */
  static clear() { AbuseEventLog.#events = []; }
}

module.exports = { AbuseEventLog, AbuseEvent };
