'use strict';

const { JobHandler } = require('../shared/JobHandler');
const { JOB_TYPES }  = require('../../config/queues');

/**
 * AnalyticsHandler — Persiste eventos de analytics de forma assíncrona.
 *
 * Eventos de analytics (page views, conversões, funil) são de baixa
 * criticidade: tolerantes à perda (WriteBehind). O handler persiste
 * em batch quando possível, minimizando writes no banco.
 *
 * Payload esperado:
 *   event         — nome do evento ('page_view', 'queue_joined', 'booking_created', etc.)
 *   userId        — UUID do usuário (opcional para eventos anônimos)
 *   barbershopId  — UUID da barbearia relacionada (opcional)
 *   properties    — objeto livre com propriedades do evento
 *   sessionId     — ID da sessão do usuário
 *   occurredAt    — ISO 8601 timestamp do evento (precisão do cliente)
 */
class AnalyticsHandler extends JobHandler {
  #analyticsRepository;

  /**
   * @param {{
   *   analyticsRepository: { track(event: object): Promise<void> }
   * }} deps
   */
  constructor({ analyticsRepository }) {
    super();
    if (!analyticsRepository) throw new TypeError('AnalyticsHandler: analyticsRepository é obrigatório');
    this.#analyticsRepository = analyticsRepository;
  }

  get jobType() { return JOB_TYPES.TRACK_ANALYTICS; }

  async handle(job) {
    const { event, userId, barbershopId, properties, sessionId, occurredAt } = job.payload;

    if (!event) throw new Error('AnalyticsHandler: event ausente');

    await this.#analyticsRepository.track({
      event,
      userId:       userId        ?? null,
      barbershopId: barbershopId  ?? null,
      sessionId:    sessionId     ?? null,
      properties:   properties    ?? {},
      occurredAt:   occurredAt    ?? new Date().toISOString(),
      receivedAt:   new Date().toISOString(),
    });
  }
}

module.exports = { AnalyticsHandler };
