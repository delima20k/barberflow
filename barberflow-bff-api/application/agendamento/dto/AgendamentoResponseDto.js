'use strict';

/**
 * AgendamentoResponseDto — DTO de saída padronizado para um agendamento.
 * Desacopla a representação HTTP da entidade de domínio.
 */
class AgendamentoResponseDto {
  /**
   * @param {import('../../../domain/agendamento/Agendamento').Agendamento} agendamento
   * @returns {object}
   */
  static fromDomain(agendamento) {
    return {
      id:             agendamento.id,
      clienteId:      agendamento.clienteId,
      profissionalId: agendamento.profissionalId,
      barbershopId:   agendamento.barbershopId,
      serviceId:      agendamento.serviceId,
      scheduledAt:    agendamento.scheduledAt.toISOString(),
      status:         agendamento.status.value,
      notes:          agendamento.notes,
      createdAt:      agendamento.createdAt.toISOString(),
      updatedAt:      agendamento.updatedAt.toISOString(),
    };
  }

  /**
   * @param {import('../../../domain/agendamento/Agendamento').Agendamento[]} agendamentos
   * @param {string|null} nextCursor
   * @returns {{ items: object[], nextCursor: string|null }}
   */
  static listFromDomain(agendamentos, nextCursor = null) {
    return {
      items:      agendamentos.map(AgendamentoResponseDto.fromDomain),
      nextCursor,
    };
  }
}

module.exports = { AgendamentoResponseDto };
