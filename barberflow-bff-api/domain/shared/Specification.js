'use strict';

/**
 * Specification — Padrão de especificação composável para regras de filtro/negócio.
 *
 * Uso:
 *   const spec = new BarbeariaAtivaSpec().and(new BarbeariaComVagaSpec());
 *   const valida = spec.isSatisfiedBy(barbearia);
 *
 * Composição:
 *   spec.and(other)  → AND de duas especificações
 *   spec.or(other)   → OR de duas especificações
 *   spec.not()       → Negação da especificação
 *
 * @abstract
 * @template T Tipo do candidato a ser avaliado
 */
class Specification {
  /**
   * Avalia se o candidato satisfaz a especificação.
   * @abstract
   * @param {T} candidate
   * @returns {boolean}
   */
  isSatisfiedBy(candidate) { // eslint-disable-line no-unused-vars
    throw new Error(`${this.constructor.name}.isSatisfiedBy() não implementado`);
  }

  /**
   * @param {Specification<T>} other
   * @returns {AndSpecification<T>}
   */
  and(other) { return new AndSpecification(this, other); }

  /**
   * @param {Specification<T>} other
   * @returns {OrSpecification<T>}
   */
  or(other)  { return new OrSpecification(this, other); }

  /**
   * @returns {NotSpecification<T>}
   */
  not()      { return new NotSpecification(this); }
}

// ── Especificações compostas ───────────────────────────────────────

/**
 * @template T
 * @extends {Specification<T>}
 */
class AndSpecification extends Specification {
  /** @type {Specification<T>} */ #left;
  /** @type {Specification<T>} */ #right;

  /**
   * @param {Specification<T>} left
   * @param {Specification<T>} right
   */
  constructor(left, right) {
    super();
    this.#left  = left;
    this.#right = right;
  }

  /** @param {T} candidate @returns {boolean} */
  isSatisfiedBy(candidate) {
    return this.#left.isSatisfiedBy(candidate) && this.#right.isSatisfiedBy(candidate);
  }
}

/**
 * @template T
 * @extends {Specification<T>}
 */
class OrSpecification extends Specification {
  /** @type {Specification<T>} */ #left;
  /** @type {Specification<T>} */ #right;

  /**
   * @param {Specification<T>} left
   * @param {Specification<T>} right
   */
  constructor(left, right) {
    super();
    this.#left  = left;
    this.#right = right;
  }

  /** @param {T} candidate @returns {boolean} */
  isSatisfiedBy(candidate) {
    return this.#left.isSatisfiedBy(candidate) || this.#right.isSatisfiedBy(candidate);
  }
}

/**
 * @template T
 * @extends {Specification<T>}
 */
class NotSpecification extends Specification {
  /** @type {Specification<T>} */ #inner;

  /** @param {Specification<T>} inner */
  constructor(inner) {
    super();
    this.#inner = inner;
  }

  /** @param {T} candidate @returns {boolean} */
  isSatisfiedBy(candidate) {
    return !this.#inner.isSatisfiedBy(candidate);
  }
}

module.exports = { Specification, AndSpecification, OrSpecification, NotSpecification };
