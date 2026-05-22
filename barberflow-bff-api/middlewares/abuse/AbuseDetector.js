'use strict';

const {
  NewAccountHighActivityRule,
  GeoVelocityRule,
  ContentSimilarityRule,
  BotSignatureRule,
} = require('./Specification');

/**
 * AbuseSignal — resultado imutável da avaliação do AbuseDetector.
 */
class AbuseSignal {
  /**
   * @param {string[]} triggeredRules — nomes das regras disparadas
   * @param {number}   riskScore      — score de risco 0-100
   */
  constructor(triggeredRules, riskScore) {
    this.triggeredRules = triggeredRules;
    this.riskScore      = riskScore;
    this.isAbusive      = triggeredRules.length > 0;
  }
}

/**
 * AbuseDetector — avalia especificações compostas por contexto.
 *
 * Regras disponíveis e seus pesos de risco:
 *   bot_signature       → 35 pts
 *   content_similarity  → 25 pts
 *   geo_velocity        → 20 pts
 *   new_account         → 20 pts
 *
 * Retorna AbuseSignal com regras disparadas e score agregado (cap 100).
 */
class AbuseDetector {
  static #RULES = new Map([
    ['new_account',        new NewAccountHighActivityRule()],
    ['geo_velocity',       new GeoVelocityRule()],
    ['content_similarity', new ContentSimilarityRule()],
    ['bot_signature',      new BotSignatureRule()],
  ]);

  static #WEIGHTS = new Map([
    ['bot_signature',       35],
    ['content_similarity',  25],
    ['geo_velocity',        20],
    ['new_account',         20],
  ]);

  /**
   * Avalia regras para o contexto fornecido.
   *
   * @param {object}        ctx        — contexto da requisição (ver AbuseMiddleware#buildCtx)
   * @param {string[]|null} [ruleNames] — subconjunto de regras (null = todas)
   * @returns {Promise<AbuseSignal>}
   */
  static async evaluate(ctx, ruleNames = null) {
    const entries = ruleNames
      ? [...AbuseDetector.#RULES.entries()].filter(([k]) => ruleNames.includes(k))
      : [...AbuseDetector.#RULES.entries()];

    const triggered = [];
    for (const [name, rule] of entries) {
      if (await rule.isSatisfiedBy(ctx)) triggered.push(name);
    }

    const score = triggered.reduce(
      (sum, name) => sum + (AbuseDetector.#WEIGHTS.get(name) ?? 10),
      0,
    );

    return new AbuseSignal(triggered, Math.min(100, score));
  }

  /** Retorna lista de todos os nomes de regras disponíveis. */
  static ruleNames() { return [...AbuseDetector.#RULES.keys()]; }
}

module.exports = { AbuseDetector, AbuseSignal };
