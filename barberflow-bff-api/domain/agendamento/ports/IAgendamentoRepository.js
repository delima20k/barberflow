'use strict';

/**
 * IAgendamentoRepository — Port (interface) do repositório de agendamentos.
 *
 * A camada domain define o CONTRATO.
 * A camada infrastructure fornece a implementação (Supabase, etc.).
 *
 * Regras:
 *  - Nenhum import de infraestrutura aqui.
 *  - Métodos retornam Result<T, string> — nunca lançam por regra de negócio.
 *  - Métodos de infra (rede, DB) podem lançar AppError.
 *
 * @interface
 */
class IAgendamentoRepository {
  /**
   * @param {string} id
   * @returns {Promise<import('../../shared/Result').Result<import('../Agendamento').Agendamento|null, string>>}
   */
  async findById(id) { throw new Error(`${this.constructor.name}.findById() não implementado`); } // eslint-disable-line no-unused-vars

  /**
   * @param {string} clienteId
   * @param {{ cursor?: string, limit?: number }} [opts]
   * @returns {Promise<import('../../shared/Result').Result<{ items: import('../Agendamento').Agendamento[], nextCursor: string|null }, string>>}
   */
  async findByCliente(clienteId, opts) { throw new Error(`${this.constructor.name}.findByCliente() não implementado`); } // eslint-disable-line no-unused-vars

  /**
   * @param {import('../Agendamento').Agendamento} agendamento
   * @returns {Promise<import('../../shared/Result').Result<void, string>>}
   */
  async save(agendamento) { throw new Error(`${this.constructor.name}.save() não implementado`); } // eslint-disable-line no-unused-vars

  /**
   * @param {string}  profissionalId
   * @param {Date}    inicio
   * @param {Date}    fim
   * @returns {Promise<import('../../shared/Result').Result<import('../Agendamento').Agendamento[], string>>}
   */
  async findConflitos(profissionalId, inicio, fim) { throw new Error(`${this.constructor.name}.findConflitos() não implementado`); } // eslint-disable-line no-unused-vars
}

module.exports = { IAgendamentoRepository };
