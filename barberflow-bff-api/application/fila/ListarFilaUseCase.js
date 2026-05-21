'use strict';

const { BaseUseCase }    = require('../shared/BaseUseCase');
const { Result }         = require('../../domain/shared/Result');
const { FilaResponseDto } = require('./dto/FilaResponseDto');

/**
 * ListarFilaUseCase — Retorna a fila ativa de uma barbearia.
 * Use case de LEITURA pura — adequado para o CachedUseCaseDecorator.
 * @extends {BaseUseCase<{barbershopId: string}, object>}
 */
class ListarFilaUseCase extends BaseUseCase {
  /** @type {import('../../domain/fila/ports/IFilaRepository').IFilaRepository} */
  #filaRepository;

  /** @param {{ filaRepository: import('../../domain/fila/ports/IFilaRepository').IFilaRepository }} deps */
  constructor({ filaRepository }) {
    super();
    this.#filaRepository = filaRepository;
  }

  /**
   * @param {{ barbershopId: string }} command
   * @returns {Promise<Result<object, string>>}
   */
  async execute({ barbershopId }) {
    if (!barbershopId) return Result.fail('barbershopId é obrigatório');

    const result = await this.#filaRepository.findByBarbershop(barbershopId);
    if (result.isFail()) return result;

    return Result.ok(FilaResponseDto.listFromDomain(result.getValue()));
  }
}

module.exports = { ListarFilaUseCase };
