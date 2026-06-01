'use strict';

const { randomUUID }       = require('crypto');
const { BaseUseCase }      = require('../shared/BaseUseCase');
const { Result }           = require('../../domain/shared/Result');
const { FilaEntrada }      = require('../../domain/fila/FilaEntrada');
const { EntrarNaFilaDto }  = require('./dto/EntrarNaFilaDto');
const { FilaResponseDto }  = require('./dto/FilaResponseDto');

/**
 * EntrarNaFilaUseCase — Insere um cliente na fila de espera de uma barbearia.
 *
 * Responsabilidades:
 *  1. Validar DTO de entrada.
 *  2. Calcular a próxima posição disponível.
 *  3. Criar o agregado FilaEntrada.
 *  4. Persistir via repositório.
 *  5. Publicar eventos de domínio.
 *
 * @extends {BaseUseCase<EntrarNaFilaDtoProps, object>}
 */
class EntrarNaFilaUseCase extends BaseUseCase {
  /** @type {import('../../domain/fila/ports/IFilaRepository').IFilaRepository} */
  #filaRepository;

  /**
   * @param {{ filaRepository: import('../../domain/fila/ports/IFilaRepository').IFilaRepository }} deps
   */
  constructor({ filaRepository }) {
    super();
    this.#filaRepository = filaRepository;
  }

  /**
   * @param {import('./dto/EntrarNaFilaDto').EntrarNaFilaDtoProps} command
   * @returns {Promise<Result<object, string>>}
   */
  async execute(command) {
    // 1. Validar DTO
    const dtoResult = EntrarNaFilaDto.create(command);
    if (dtoResult.isFail()) return dtoResult;
    const dto = dtoResult.getValue();

    // 2. Calcular próxima posição (count + 1)
    const countResult = await this.#filaRepository.countAtivos(dto.barbershopId);
    if (countResult.isFail()) return countResult;
    const posicao = countResult.getValue() + 1;

    // 3. Criar agregado
    const entradaResult = FilaEntrada.create({
      id:             randomUUID(),
      clienteId:      dto.clienteId,
      barbershopId:   dto.barbershopId,
      profissionalId: dto.profissionalId,
      serviceId:      dto.serviceId ?? undefined,
      posicao,
    });
    if (entradaResult.isFail()) return entradaResult;
    const entrada = entradaResult.getValue();

    // 4. Persistir
    const saveResult = await this.#filaRepository.save(entrada);
    if (saveResult.isFail()) return saveResult;

    // 5. Publicar eventos (fire-and-forget)
    entrada.pullDomainEvents();

    return Result.ok(FilaResponseDto.fromDomain(entrada));
  }
}

module.exports = { EntrarNaFilaUseCase };
