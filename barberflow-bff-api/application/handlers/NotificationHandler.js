'use strict';

const { JobHandler } = require('../shared/JobHandler');
const { JOB_TYPES }  = require('../../config/queues');

/**
 * NotificationHandler processa notificacoes do contexto canonico e mantem
 * compatibilidade com payloads legados de push para barbeiro.
 */
class NotificationHandler extends JobHandler {
  #pushService;
  #notificationService;
  #channelMap;

  constructor({ pushService = null, notificationService = null, channelMap = null }) {
    super();
    if (!pushService && !notificationService) {
      throw new TypeError('NotificationHandler: pushService ou notificationService e obrigatorio');
    }
    this.#pushService = pushService;
    this.#notificationService = notificationService;
    this.#channelMap = channelMap ?? {};
  }

  get jobType() { return JOB_TYPES.SEND_NOTIFICATION; }

  async handle(job) {
    if (job.payload?.notificationId && this.#notificationService) {
      await this.#notificationService.deliver({
        notificationId: job.payload.notificationId,
        channels: job.payload.channels,
        channelMap: this.#channelMap,
      });
      return;
    }

    const { professionalId, entradaId, barbershopId, type, clienteNome } = job.payload;
    if (!professionalId) throw new Error('NotificationHandler: professionalId ausente');
    if (!type) throw new Error('NotificationHandler: type ausente');
    if (!this.#pushService) throw new Error('NotificationHandler: pushService ausente para payload legado');

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
