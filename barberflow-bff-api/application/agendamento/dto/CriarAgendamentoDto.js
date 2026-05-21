'use strict';

const { Result } = require('../../../domain/shared/Result');

/**
 * @typedef {object} CriarAgendamentoDtoProps
 * @property {string}         clienteId
 * @property {string}         profissionalId
 * @property {string}         barbershopId
 * @property {string}         serviceId
 * @property {Date|string}    scheduledAt
 * @property {string}         [notes]
 */

/**
 * CriarAgendamentoDto — DTO de entrada para criar um agendamento.
 * Valida e sanitiza os dados antes de chegarem ao domínio.
 */
class CriarAgendamentoDto {
  /** @type {string}      */ clienteId;
  /** @type {string}      */ profissionalId;
  /** @type {string}      */ barbershopId;
  /** @type {string}      */ serviceId;
  /** @type {Date}        */ scheduledAt;
  /** @type {string|null} */ notes;

  /** @param {CriarAgendamentoDtoProps} props */
  constructor(props) {
    this.clienteId      = props.clienteId;
    this.profissionalId = props.profissionalId;
    this.barbershopId   = props.barbershopId;
    this.serviceId      = props.serviceId;
    this.scheduledAt    = props.scheduledAt instanceof Date ? props.scheduledAt : new Date(props.scheduledAt);
    this.notes          = props.notes ?? null;
    Object.freeze(this);
  }

  /**
   * Cria e valida o DTO.
   * @param {CriarAgendamentoDtoProps} props
   * @returns {Result<CriarAgendamentoDto, string>}
   */
  static create(props) {
    if (!props || typeof props !== 'object') return Result.fail('CriarAgendamentoDto: props inválido');

    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const campo of ['clienteId', 'profissionalId', 'barbershopId', 'serviceId']) {
      if (!props[campo] || !uuidRe.test(props[campo])) {
        return Result.fail(`CriarAgendamentoDto: ${campo} deve ser um UUID válido`);
      }
    }

    const data = props.scheduledAt instanceof Date ? props.scheduledAt : new Date(props.scheduledAt);
    if (isNaN(data.getTime())) {
      return Result.fail('CriarAgendamentoDto: scheduledAt inválido');
    }

    return Result.ok(new CriarAgendamentoDto(props));
  }
}

module.exports = { CriarAgendamentoDto };
