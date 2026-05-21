'use strict';

class FilaResponseDto {
  /**
   * @param {import('../../../domain/fila/FilaEntrada').FilaEntrada} entrada
   * @returns {object}
   */
  static fromDomain(entrada) {
    return {
      id:             entrada.id,
      clienteId:      entrada.clienteId,
      barbershopId:   entrada.barbershopId,
      profissionalId: entrada.profissionalId,
      serviceId:      entrada.serviceId,
      posicao:        entrada.posicao,
      status:         entrada.status.value,
      confirmacao:    entrada.clienteConfirmado,
      createdAt:      entrada.createdAt.toISOString(),
      updatedAt:      entrada.updatedAt.toISOString(),
    };
  }

  /**
   * @param {import('../../../domain/fila/FilaEntrada').FilaEntrada[]} entradas
   * @param {string|null} nextCursor
   * @returns {{ items: object[], nextCursor: string|null }}
   */
  static listFromDomain(entradas, nextCursor = null) {
    return {
      items:      entradas.map(FilaResponseDto.fromDomain),
      nextCursor,
    };
  }
}

module.exports = { FilaResponseDto };
