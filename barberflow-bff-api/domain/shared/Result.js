'use strict';

/**
 * Result<T, E> — Either/Result monad para fluxo de erros do domínio.
 *
 * Regra: NUNCA lançar exceptions para regras de negócio.
 * Use Result.ok(valor) para sucesso e Result.fail(erro) para falha esperada.
 * Exceptions ficam reservadas para falhas de infraestrutura (DB, rede).
 *
 * @template T Tipo do valor em caso de sucesso
 * @template E Tipo do erro em caso de falha (string | DomainError | object)
 */
class Result {
  /** @type {boolean} */ #ok;
  /** @type {T|null}  */ #value;
  /** @type {E|null}  */ #error;

  /**
   * @param {boolean} ok
   * @param {T|null}  value
   * @param {E|null}  error
   */
  constructor(ok, value, error) {
    this.#ok    = ok;
    this.#value = value;
    this.#error = error;
    Object.freeze(this);
  }

  // ── Factories ──────────────────────────────────────────────────

  /**
   * Cria um Result de sucesso.
   * @template T
   * @param {T} [value]
   * @returns {Result<T, never>}
   */
  static ok(value = undefined) {
    return new Result(true, value ?? null, null);
  }

  /**
   * Cria um Result de falha.
   * @template E
   * @param {E} error
   * @returns {Result<never, E>}
   */
  static fail(error) {
    if (error === null || error === undefined) {
      throw new TypeError('Result.fail: error não pode ser null/undefined');
    }
    return new Result(false, null, error);
  }

  /**
   * Combina múltiplos Results — retorna o primeiro falho ou ok(values[]).
   * @param {Result[]} results
   * @returns {Result}
   */
  static combine(results) {
    for (const r of results) {
      if (r.isFail()) return r;
    }
    return Result.ok(results.map(r => r.getValue()));
  }

  // ── Interrogação ───────────────────────────────────────────────

  /** @returns {boolean} */
  isOk()   { return this.#ok; }

  /** @returns {boolean} */
  isFail() { return !this.#ok; }

  // ── Extração ───────────────────────────────────────────────────

  /**
   * Retorna o valor (lança se for falha).
   * @returns {T}
   */
  getValue() {
    if (!this.#ok) {
      throw new Error(`Result.getValue() chamado em Result de falha: ${String(this.#error)}`);
    }
    return this.#value;
  }

  /**
   * Retorna o erro (lança se for sucesso).
   * @returns {E}
   */
  getError() {
    if (this.#ok) {
      throw new Error('Result.getError() chamado em Result de sucesso');
    }
    return this.#error;
  }

  /**
   * Retorna o valor ou um default se for falha.
   * @param {T} defaultValue
   * @returns {T}
   */
  getOrElse(defaultValue) {
    return this.#ok ? this.#value : defaultValue;
  }

  // ── Transformação ──────────────────────────────────────────────

  /**
   * Aplica fn ao valor se ok; propaga o erro caso contrário.
   * @template U
   * @param {function(T): U} fn
   * @returns {Result<U, E>}
   */
  map(fn) {
    if (!this.#ok) return this;
    return Result.ok(fn(this.#value));
  }

  /**
   * Aplica fn que retorna Result (monadic bind).
   * @template U
   * @param {function(T): Result<U, E>} fn
   * @returns {Result<U, E>}
   */
  flatMap(fn) {
    if (!this.#ok) return this;
    return fn(this.#value);
  }

  /**
   * Executa ok(value) ou fail(error) baseado no estado.
   * @param {{ ok: function(T): *, fail: function(E): * }} branches
   * @returns {*}
   */
  match({ ok, fail }) {
    return this.#ok ? ok(this.#value) : fail(this.#error);
  }

  /** @returns {string} */
  toString() {
    return this.#ok
      ? `Result.ok(${JSON.stringify(this.#value)})`
      : `Result.fail(${JSON.stringify(this.#error)})`;
  }
}

module.exports = { Result };
