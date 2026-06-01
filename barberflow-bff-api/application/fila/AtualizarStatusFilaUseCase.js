'use strict';

const { BaseUseCase }     = require('../shared/BaseUseCase');
const { Result }          = require('../../domain/shared/Result');
const { FilaResponseDto } = require('./dto/FilaResponseDto');

/**
 * AtualizarStatusFilaUseCase — Avança ou cancela o status de uma entrada na fila.
 * @extends {BaseUseCase<{id: string, novoStatus: string, operadorId: string}, object>}
 */
class AtualizarStatusFilaUseCase extends BaseUseCase {
  /** @type {import('../../domain/fila/ports/IFilaRepository').IFilaRepository} */
  #filaRepository;

  /** @param {{ filaRepository: import('../../domain/fila/ports/IFilaRepository').IFilaRepository }} deps */
  constructor({ filaRepository }) {
    super();
    this.#filaRepository = filaRepository;
  }

  /**
   * @param {{ id: string, novoStatus: string, operadorId: string }} command
   * @returns {Promise<Result<object, string>>}
   */
  async execute({ id, novoStatus, operadorId }) {
    if (!id)         return Result.fail('id é obrigatório');
    if (!novoStatus) return Result.fail('novoStatus é obrigatório');
    if (!operadorId) return Result.fail('operadorId é obrigatório');

    const findResult = await this.#filaRepository.findById(id);
    if (findResult.isFail()) return findResult;

    const entrada = findResult.getValue();
    if (!entrada) return Result.fail('Entrada na fila não encontrada');

    // Apenas o cliente da entrada ou o profissional associado podem alterar
    const pertence = entrada.clienteId === operadorId || entrada.profissionalId === operadorId;
    if (!pertence) return Result.fail('Sem permissão para alterar esta entrada na fila');

    const transicaoResult = entrada.atualizarStatus(novoStatus);
    if (transicaoResult.isFail()) return transicaoResult;

    const saveResult = await this.#filaRepository.save(entrada);
    if (saveResult.isFail()) return saveResult;

    return Result.ok(FilaResponseDto.fromDomain(entrada));
  }
}

module.exports = { AtualizarStatusFilaUseCase };
