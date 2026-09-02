'use strict';

/**
 * IFilaRepository — Port (interface) do repositório da fila.
 * @interface
 */
class IFilaRepository {
  /**
   * @param {string} id
   * @returns {Promise<import('../../shared/Result').Result<import('../FilaEntrada').FilaEntrada|null, string>>}
   */
  async findById(id) { throw new Error(`${this.constructor.name}.findById() não implementado`); } // eslint-disable-line no-unused-vars

  /**
   * @param {string} barbershopId
   * @returns {Promise<import('../../shared/Result').Result<import('../FilaEntrada').FilaEntrada[], string>>}
   */
  async findByBarbershop(barbershopId) { throw new Error(`${this.constructor.name}.findByBarbershop() não implementado`); } // eslint-disable-line no-unused-vars

  /**
   * @param {import('../FilaEntrada').FilaEntrada} entrada
   * @returns {Promise<import('../../shared/Result').Result<void, string>>}
   */
  async save(entrada) { throw new Error(`${this.constructor.name}.save() não implementado`); } // eslint-disable-line no-unused-vars

  /**
   * @param {string} id
   * @returns {Promise<import('../../shared/Result').Result<void, string>>}
   */
  async delete(id) { throw new Error(`${this.constructor.name}.delete() não implementado`); } // eslint-disable-line no-unused-vars

  /**
   * @param {string} barbershopId
   * @returns {Promise<import('../../shared/Result').Result<number, string>>}
   */
  async countAtivos(barbershopId) { throw new Error(`${this.constructor.name}.countAtivos() não implementado`); } // eslint-disable-line no-unused-vars

  /**
   * @param {string} barbershopId
   * @param {string[]} serviceIds
   * @returns {Promise<import('../../shared/Result').Result<boolean, string>>}
   */
  async servicosValidos(barbershopId, serviceIds) { throw new Error(`${this.constructor.name}.servicosValidos() não implementado`); } // eslint-disable-line no-unused-vars

  /**
   * @param {string} queueEntryId
   * @param {string} barbershopId
   * @param {string[]} serviceIds
   * @returns {Promise<import('../../shared/Result').Result<void, string>>}
   */
  async linkServicos(queueEntryId, barbershopId, serviceIds) { throw new Error(`${this.constructor.name}.linkServicos() não implementado`); } // eslint-disable-line no-unused-vars
}

module.exports = { IFilaRepository };
