'use strict';

const { Result } = require('../../../domain/shared/Result');

/**
 * @typedef {object} EntrarNaFilaDtoProps
 * @property {string}  clienteId
 * @property {string}  barbershopId
 * @property {string}  profissionalId
 * @property {string}  [serviceId]
 * @property {string}  [notes]
 */

class EntrarNaFilaDto {
  /** @type {string}      */ clienteId;
  /** @type {string}      */ barbershopId;
  /** @type {string}      */ profissionalId;
  /** @type {string|null} */ serviceId;
  /** @type {string|null} */ notes;

  /** @param {EntrarNaFilaDtoProps} props */
  constructor(props) {
    this.clienteId      = props.clienteId;
    this.barbershopId   = props.barbershopId;
    this.profissionalId = props.profissionalId;
    this.serviceId      = props.serviceId ?? null;
    this.notes          = props.notes ?? null;
    Object.freeze(this);
  }

  /**
   * @param {EntrarNaFilaDtoProps} props
   * @returns {Result<EntrarNaFilaDto, string>}
   */
  static create(props) {
    if (!props || typeof props !== 'object') return Result.fail('EntrarNaFilaDto: props inválido');

    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const campo of ['clienteId', 'barbershopId', 'profissionalId']) {
      if (!props[campo] || !uuidRe.test(props[campo])) {
        return Result.fail(`EntrarNaFilaDto: ${campo} deve ser um UUID válido`);
      }
    }

    if (props.serviceId && !uuidRe.test(props.serviceId)) {
      return Result.fail('EntrarNaFilaDto: serviceId deve ser um UUID válido');
    }

    return Result.ok(new EntrarNaFilaDto(props));
  }
}

module.exports = { EntrarNaFilaDto };
