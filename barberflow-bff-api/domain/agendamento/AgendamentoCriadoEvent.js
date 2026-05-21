'use strict';

const { DomainEvent } = require('../shared/DomainEvent');

/**
 * AgendamentoCriadoEvent — Evento disparado quando um novo agendamento é criado.
 *
 * Ouvintes possíveis (application layer):
 *  - Enviar notificação push ao profissional
 *  - Registrar auditoria
 *  - Atualizar cache de disponibilidade
 */
class AgendamentoCriadoEvent extends DomainEvent {
  /**
   * @param {string} agendamentoId
   * @param {string} clienteId
   * @param {string} profissionalId
   * @param {Date}   scheduledAt
   */
  constructor(agendamentoId, clienteId, profissionalId, scheduledAt) {
    super('AgendamentoCriado', agendamentoId);
    this.clienteId      = clienteId;
    this.profissionalId = profissionalId;
    this.scheduledAt    = scheduledAt instanceof Date ? scheduledAt.toISOString() : scheduledAt;
    Object.freeze(this);
  }
}

module.exports = { AgendamentoCriadoEvent };
