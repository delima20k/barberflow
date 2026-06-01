'use strict';

/**
 * ReputationScore — pontuação de reputação por usuário com decaimento temporal.
 *
 * Score 0 (péssimo) → 100 (excelente). Novos usuários começam em `initial` (50).
 * Infrações reduzem o score; ações legítimas aumentam.
 * A cada `decayIntervalMs`, o score sobe `decayAmount` pontos (esquece infrações antigas).
 */
class ReputationScore {
  #scores = new Map(); // userId → { score: number, updatedAt: number }
  #initial;
  #max;
  #min;
  #decayIntervalMs;
  #decayAmount;
  #timer = null;

  /**
   * @param {object} [opts]
   * @param {number} [opts.initial=50]
   * @param {number} [opts.max=100]
   * @param {number} [opts.min=0]
   * @param {number} [opts.decayIntervalMs=3600000] — 1h padrão
   * @param {number} [opts.decayAmount=5]           — pontos recuperados por intervalo
   */
  constructor({ initial = 50, max = 100, min = 0, decayIntervalMs = 60 * 60_000, decayAmount = 5 } = {}) {
    this.#initial          = initial;
    this.#max              = max;
    this.#min              = min;
    this.#decayIntervalMs  = decayIntervalMs;
    this.#decayAmount      = decayAmount;
  }

  /**
   * Retorna o score atual, aplicando decaimento temporal pendente de forma lazy.
   * @param {string} userId
   * @returns {number} score 0-max
   */
  getScore(userId) {
    const entry = this.#scores.get(userId);
    if (!entry) return this.#initial;

    const elapsed   = Date.now() - entry.updatedAt;
    const intervals = Math.floor(elapsed / this.#decayIntervalMs);
    if (intervals > 0) {
      entry.score     = Math.min(this.#max, entry.score + intervals * this.#decayAmount);
      entry.updatedAt = entry.updatedAt + intervals * this.#decayIntervalMs;
    }
    return entry.score;
  }

  /**
   * Aplica delta ao score (negativo = penalidade, positivo = recompensa).
   * @param {string} userId
   * @param {number} delta
   * @returns {number} novo score
   */
  adjust(userId, delta) {
    const current = this.getScore(userId);
    const next    = Math.max(this.#min, Math.min(this.#max, current + delta));
    this.#scores.set(userId, { score: next, updatedAt: Date.now() });
    return next;
  }

  penalize(userId, points = 10) { return this.adjust(userId, -Math.abs(points)); }
  reward(userId, points = 2)    { return this.adjust(userId, +Math.abs(points)); }

  /**
   * Inicia decaimento periódico em background.
   * @returns {this}
   */
  startDecay() {
    if (this.#timer) return this;
    this.#timer = setInterval(() => {
      const now = Date.now();
      for (const [id, entry] of this.#scores) {
        const intervals = Math.floor((now - entry.updatedAt) / this.#decayIntervalMs);
        if (intervals > 0) {
          entry.score     = Math.min(this.#max, entry.score + intervals * this.#decayAmount);
          entry.updatedAt = now;
          // Remove entradas que voltaram ao máximo (GC)
          if (entry.score >= this.#max) this.#scores.delete(id);
        }
      }
    }, this.#decayIntervalMs);
    this.#timer.unref?.(); // não impede processo de encerrar
    return this;
  }

  /** @returns {this} */
  stopDecay() {
    clearInterval(this.#timer);
    this.#timer = null;
    return this;
  }

  /** Para testes: limpa todos os scores. */
  clear() { this.#scores.clear(); }
}

module.exports = { ReputationScore };
