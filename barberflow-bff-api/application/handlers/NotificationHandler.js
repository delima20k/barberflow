'use strict';

const { JobHandler } = require('../shared/JobHandler');
const { JOB_TYPES }  = require('../../config/queues');

/**
 * NotificationHandler — Envia Web Push notifications de forma assíncrona.
 *
 * Migração: substitui a chamada síncrona a PushService.enviarAoBarbeiro()
 * dentro de NotificacoesController. O controller agora enfileira este job
 * e retorna 202 Accepted imediatamente.
 *
 * Payload esperado:
 *   professionalId — UUID do barbeiro destinatário
 *   entradaId      — UUID da entrada na fila
 *   barbershopId   — UUID da barbearia
 *   type           — tipo da notificação ('client_arrived', 'new_booking', etc.)
 *   clienteNome    — nome do cliente (exibido no push)
 */
class NotificationHandler extends JobHandler {
  #pushService;

  /**
   * @param {{
   *   pushService: { enviarAoBarbeiro(opts: object): Promise<{ enviados: number, invalidas: number }> }
   * }} deps
   */
  constructor({ pushService }) {
    super();
    if (!pushService) throw new TypeError('NotificationHandler: pushService é obrigatório');
    this.#pushService = pushService;
  }

  get jobType() { return JOB_TYPES.SEND_NOTIFICATION; }

  async handle(job) {
    const { professionalId, entradaId, barbershopId, type, clienteNome } = job.payload;

    if (!professionalId) throw new Error('NotificationHandler: professionalId ausente');
    if (!type)           throw new Error('NotificationHandler: type ausente');

    await this.#pushService.enviarAoBarbeiro({
      professionalId,
      entradaId,
      barbershopId,
      type,
      clienteNome,
    });
  }
}

module.exports = { NotificationHandler };
