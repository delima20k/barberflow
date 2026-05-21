'use strict';

/**
 * BaseUseCase — Contrato abstrato para todos os casos de uso.
 *
 * Regras:
 *  - Um use case = uma única responsabilidade de negócio.
 *  - Sempre retorna Promise<Result<T, string>>.
 *  - Não conhece HTTP (sem req/res).
 *  - Recebe dependências por injeção no construtor (facilita testes).
 *
 * @template TCommand  Tipo do comando/parâmetro de entrada
 * @template TResult   Tipo do valor retornado em caso de sucesso
 */
class BaseUseCase {
  /**
   * Executa o caso de uso.
   * @abstract
   * @param {TCommand} command
   * @returns {Promise<import('../../domain/shared/Result').Result<TResult, string>>}
   */
  async execute(command) { // eslint-disable-line no-unused-vars
    throw new Error(`${this.constructor.name}.execute() não implementado`);
  }
}

module.exports = { BaseUseCase };
