'use strict';

const { BaseValueObject } = require('../shared/BaseValueObject');
const { Result }          = require('../shared/Result');

/**
 * @typedef {'waiting'|'called'|'in_service'|'done'|'absent'|'cancelled'} FilaStatusValue
 * @typedef {'yes'|'arriving'|'no_waiting'|'absent'} ConfirmacaoValue
 */

/** @type {FilaStatusValue[]} */
const STATUS_VALIDOS = ['waiting', 'called', 'in_service', 'done', 'absent', 'cancelled'];

/**
 * Transições permitidas.
 * @type {Record<FilaStatusValue, FilaStatusValue[]>}
 */
const TRANSICOES = {
  waiting:    ['called', 'cancelled'],
  called:     ['in_service', 'absent', 'cancelled'],
  in_service: ['done', 'cancelled'],
  done:       [],
  absent:     [],
  cancelled:  [],
};

/**
 * FilaStatus — Value Object da máquina de estados da fila de espera.
 */
class FilaStatus extends BaseValueObject {
  /** @param {{ value: FilaStatusValue }} props */
  constructor(props) { super(props); }

  /**
   * @param {FilaStatusValue} value
   * @returns {Result<FilaStatus, string>}
   */
  static create(value) {
    const vo = new FilaStatus({ value });
    return vo._validate();
  }

  /** @returns {FilaStatus} */
  static initial() { return new FilaStatus({ value: 'waiting' }); }

  /** @returns {Result<FilaStatus, string>} */
  _validate() {
    if (!STATUS_VALIDOS.includes(this._props.value)) {
      return Result.fail(`FilaStatus inválido: "${this._props.value}". Esperado: ${STATUS_VALIDOS.join(', ')}`);
    }
    return Result.ok(this);
  }

  /** @returns {FilaStatusValue} */
  get value() { return this._props.value; }

  /**
   * @param {FilaStatusValue} proximo
   * @returns {Result<FilaStatus, string>}
   */
  transicionarPara(proximo) {
    const permitidos = TRANSICOES[this._props.value] ?? [];
    if (!permitidos.includes(proximo)) {
      return Result.fail(
        `FilaStatus: transição inválida ${this._props.value} → ${proximo}. ` +
        `Permitidas: ${permitidos.join(', ') || 'nenhuma'}`,
      );
    }
    return FilaStatus.create(proximo);
  }

  /** @returns {boolean} */
  isWaiting()   { return this._props.value === 'waiting'; }
  /** @returns {boolean} */
  isTerminal()  { return ['done', 'absent', 'cancelled'].includes(this._props.value); }
  /** @returns {string} */
  toString()    { return this._props.value; }
}

module.exports = { FilaStatus, STATUS_VALIDOS, TRANSICOES };
