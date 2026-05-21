'use strict';

const { BaseUseCase }            = require('../shared/BaseUseCase');
const { Result }                 = require('../../domain/shared/Result');
const { AgendamentoResponseDto } = require('./dto/AgendamentoResponseDto');

/**
 * AtualizarStatusAgendamentoUseCase
 * @extends {BaseUseCase<{id: string, novoStatus: string, userId: string}, object>}
 */
class AtualizarStatusAgendamentoUseCase extends BaseUseCase {
  /** @type {import('../../domain/agendamento/ports/IAgendamentoRepository').IAgendamentoRepository} */
  #agendamentoRepository;

  /** @param {{ agendamentoRepository: import('../../domain/agendamento/ports/IAgendamentoRepository').IAgendamentoRepository }} deps */
  constructor({ agendamentoRepository }) {
    super();
    this.#agendamentoRepository = agendamentoRepository;
  }

  /**
   * @param {{ id: string, novoStatus: string, userId: string }} command
   * @returns {Promise<Result<object, string>>}
   */
  async execute({ id, novoStatus, userId }) {
    if (!id)        return Result.fail('id é obrigatório');
    if (!novoStatus) return Result.fail('novoStatus é obrigatório');
    if (!userId)    return Result.fail('userId é obrigatório');

    const findResult = await this.#agendamentoRepository.findById(id);
    if (findResult.isFail()) return findResult;

    const agendamento = findResult.getValue();
    if (!agendamento) return Result.fail('Agendamento não encontrado');

    // Verificar ownership: apenas cliente ou profissional podem alterar
    const pertence = agendamento.clienteId === userId || agendamento.profissionalId === userId;
    if (!pertence) return Result.fail('Sem permissão para alterar este agendamento');

    const transicaoResult = agendamento.atualizarStatus(novoStatus);
    if (transicaoResult.isFail()) return transicaoResult;

    const saveResult = await this.#agendamentoRepository.save(agendamento);
    if (saveResult.isFail()) return saveResult;

    return Result.ok(AgendamentoResponseDto.fromDomain(agendamento));
  }
}

module.exports = { AtualizarStatusAgendamentoUseCase };
