'use strict';

const { BaseValueObject } = require('../shared/BaseValueObject');
const { Result }          = require('../shared/Result');

/**
 * @typedef {'pending'|'confirmed'|'in_progress'|'done'|'cancelled'|'no_show'} StatusValue
 */

/** @type {StatusValue[]} */
const VALORES_VALIDOS = ['pending', 'confirmed', 'in_progress', 'done', 'cancelled', 'no_show'];

/**
 * Transições permitidas da máquina de estados.
 * @type {Record<StatusValue, StatusValue[]>}
 */
const TRANSICOES = {
  pending:     ['confirmed', 'cancelled'],
  confirmed:   ['in_progress', 'cancelled', 'no_show'],
  in_progress: ['done', 'cancelled'],
  done:        [],
  cancelled:   [],
  no_show:     [],
};

/**
 * AgendamentoStatus — Value Object da máquina de estados do agendamento.
 *
 * Contém toda a lógica de transição — nenhum service externo decide o próximo estado.
 */
class AgendamentoStatus extends BaseValueObject {
  /** @param {{ value: StatusValue }} props */
  constructor(props) {
    super(props);
  }

  // ── Factory ────────────────────────────────────────────────────

  /**
   * @param {StatusValue} value
   * @returns {Result<AgendamentoStatus, string>}
   */
  static create(value) {
    const vo = new AgendamentoStatus({ value });
    return vo._validate();
  }

  /** @returns {AgendamentoStatus} Status inicial de todo agendamento novo */
  static initial() {
    return new AgendamentoStatus({ value: 'pending' });
  }

  // ── Validação ──────────────────────────────────────────────────

  /** @returns {Result<AgendamentoStatus, string>} */
  _validate() {
    if (!VALORES_VALIDOS.includes(this._props.value)) {
      return Result.fail(`AgendamentoStatus inválido: "${this._props.value}". Esperado: ${VALORES_VALIDOS.join(', ')}`);
    }
    return Result.ok(this);
  }

  // ── Comportamento ──────────────────────────────────────────────

  /** @returns {StatusValue} */
  get value() { return this._props.value; }

  /**
   * Verifica se a transição para o próximo status é permitida.
   * @param {StatusValue} proximo
   * @returns {boolean}
   */
  podeTransicionarPara(proximo) {
    return TRANSICOES[this._props.value]?.includes(proximo) ?? false;
  }

  /**
   * Retorna o próximo status ou Result.fail se a transição for inválida.
   * @param {StatusValue} proximo
   * @returns {Result<AgendamentoStatus, string>}
   */
  transicionarPara(proximo) {
    if (!this.podeTransicionarPara(proximo)) {
      return Result.fail(
        `Transição inválida: ${this._props.value} → ${proximo}. ` +
        `Permitidas: ${(TRANSICOES[this._props.value] ?? []).join(', ') || 'nenhuma'}`,
      );
    }
    return AgendamentoStatus.create(proximo);
  }

  /** @returns {boolean} */
  isPending()    { return this._props.value === 'pending'; }
  /** @returns {boolean} */
  isConfirmed()  { return this._props.value === 'confirmed'; }
  /** @returns {boolean} */
  isDone()       { return this._props.value === 'done'; }
  /** @returns {boolean} */
  isCancelled()  { return this._props.value === 'cancelled'; }
  /** @returns {boolean} */
  isTerminal()   { return this._props.value === 'done' || this._props.value === 'cancelled' || this._props.value === 'no_show'; }

  /** @returns {string} */
  toString()     { return this._props.value; }
}

module.exports = { AgendamentoStatus, VALORES_VALIDOS, TRANSICOES };
