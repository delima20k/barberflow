'use strict';

const { Result } = require('./Result');

/**
 * BaseValueObject — Objeto de valor imutável definido pelas suas propriedades.
 *
 * Regras:
 *  - Igualdade por VALOR (não por referência).
 *  - Imutável após criação.
 *  - Subclasses definem _validate() que retorna Result<void, string>.
 *  - Subclasses usam o factory estático `create()` que chama `_validate()`.
 *
 * @example
 * class Email extends BaseValueObject {
 *   constructor(props) { super(props); }
 *   static create(value) {
 *     const vo = new Email({ value });
 *     return vo._validate();
 *   }
 *   _validate() {
 *     if (!/.+@.+/.test(this._props.value)) return Result.fail('Email inválido');
 *     return Result.ok(this);
 *   }
 * }
 */
class BaseValueObject {
  /**
   * @protected
   * @type {Record<string, *>}
   */
  _props;

  /**
   * @param {Record<string, *>} props
   */
  constructor(props) {
    if (props === null || typeof props !== 'object') {
      throw new TypeError('BaseValueObject: props deve ser um objeto');
    }
    this._props = Object.freeze({ ...props });
  }

  // ── Igualdade ──────────────────────────────────────────────────

  /**
   * Igualdade estrutural — compara todas as props recursivamente.
   * @param {BaseValueObject|null|undefined} other
   * @returns {boolean}
   */
  equals(other) {
    if (!(other instanceof this.constructor)) return false;
    return JSON.stringify(this._props) === JSON.stringify(other._props);
  }

  // ── Contrato ───────────────────────────────────────────────────

  /**
   * Valida as propriedades do value object.
   * Deve retornar Result.ok(this) em caso de sucesso ou Result.fail(mensagem) em caso de erro.
   * @abstract
   * @returns {Result<this, string>}
   */
  _validate() {
    throw new Error(`${this.constructor.name}._validate() não implementado`);
  }

  // ── Serialização ───────────────────────────────────────────────

  /** @returns {Record<string, *>} */
  toJSON() {
    return { ...this._props };
  }

  /** @returns {string} */
  toString() {
    return `${this.constructor.name}(${JSON.stringify(this._props)})`;
  }
}

module.exports = { BaseValueObject };
