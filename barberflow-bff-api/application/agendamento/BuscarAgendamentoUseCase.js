'use strict';

const { BaseUseCase }            = require('../shared/BaseUseCase');
const { Result }                 = require('../../domain/shared/Result');
const { AgendamentoResponseDto } = require('./dto/AgendamentoResponseDto');

/**
 * BuscarAgendamentoUseCase — Retorna um agendamento por ID.
 * Use case de LEITURA pura — adequado para o CachedUseCaseDecorator.
 * @extends {BaseUseCase<{id: string, userId: string}, object>}
 */
class BuscarAgendamentoUseCase extends BaseUseCase {
  /** @type {import('../../domain/agendamento/ports/IAgendamentoRepository').IAgendamentoRepository} */
  #agendamentoRepository;

  /** @param {{ agendamentoRepository: import('../../domain/agendamento/ports/IAgendamentoRepository').IAgendamentoRepository }} deps */
  constructor({ agendamentoRepository }) {
    super();
    this.#agendamentoRepository = agendamentoRepository;
  }

  /**
   * @param {{ id: string, userId: string }} command
   * @returns {Promise<Result<object, string>>}
   */
  async execute({ id, userId }) {
    if (!id)     return Result.fail('id é obrigatório');
    if (!userId) return Result.fail('userId é obrigatório');

    const findResult = await this.#agendamentoRepository.findById(id);
    if (findResult.isFail()) return findResult;

    const agendamento = findResult.getValue();
    if (!agendamento) return Result.fail('Agendamento não encontrado');

    const pertence = agendamento.clienteId === userId || agendamento.profissionalId === userId;
    if (!pertence) return Result.fail('Sem permissão para visualizar este agendamento');

    return Result.ok(AgendamentoResponseDto.fromDomain(agendamento));
  }
}

module.exports = { BuscarAgendamentoUseCase };
