'use strict';

/**
 * QueuePresenceNudgeTask — envia o lembrete recorrente "voce ja esta na
 * barbearia?" para clientes em 1o lugar na fila de espera que ainda nao
 * confirmaram presenca, respeitando o intervalo de 10 minutos.
 *
 * Executado a cada minuto pelo SchedulerService; a cadencia real de 10 min
 * por cliente e controlada por QueuePresenceRepository (last_presence_prompt_at),
 * nao pelo cron da task.
 *
 * Tag unica por disparo (timestamp) para garantir que cada lembrete alerte
 * de novo o usuario, mesmo que o anterior ainda esteja fixado na bandeja
 * (requireInteraction) sem resposta.
 *
 * Camada: application/scheduler
 */
class QueuePresenceNudgeTask {
  #repository;
  #pushService;

  constructor({ queuePresenceRepository, pushService } = {}) {
    if (!queuePresenceRepository) {
      throw new TypeError('QueuePresenceNudgeTask requer queuePresenceRepository.');
    }
    if (!pushService) {
      throw new TypeError('QueuePresenceNudgeTask requer pushService.');
    }
    this.#repository  = queuePresenceRepository;
    this.#pushService = pushService;
  }

  async execute() {
    const candidatos = await this.#repository.listarCandidatosParaLembrete();
    if (!candidatos.length) return;

    let enviados = 0;
    let falhas   = 0;

    for (const candidato of candidatos) {
      const nome     = candidato.clientName?.trim();
      const saudacao = nome ? `Olá ${nome}` : 'Olá';

      try {
        await this.#pushService.enviarParaUsuario({
          userId: candidato.clientId,
          title:  'Você já está na barbearia?',
          body:   `${saudacao}, você já está na barbearia?`,
          icon:   '/shared/img/icon-192-cliente.png',
          badge:  '/shared/img/icon-192-cliente.png',
          priority: 'high',
          data: {
            pushType:     'presence_check',
            entradaId:    candidato.entryId,
            barbershopId: candidato.barbershopId,
            tag:          `bf-presence-check-${candidato.entryId}-${Date.now()}`,
          },
        });
        await this.#repository.marcarLembreteEnviado(candidato.entryId);
        enviados++;
      } catch (err) {
        falhas++;
        /* eslint-disable-next-line no-console */
        console.error('[QueuePresenceNudgeTask] falha ao notificar entryId=%s: %s', candidato.entryId, err?.message);
      }
    }

    /* eslint-disable-next-line no-console */
    console.info(`[QueuePresenceNudgeTask] candidatos=${candidatos.length} enviados=${enviados} falhas=${falhas}`);
  }
}

module.exports = { QueuePresenceNudgeTask };
