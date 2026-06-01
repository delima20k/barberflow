'use strict';

// ═════════════════════════════════════════════════════════════════════════════
// Specification.js — Padrão Specification para detecção de abuso.
//
// Hierarquia:
//   Specification (base)
//     ├─ AndSpecification
//     ├─ OrSpecification
//     ├─ NotSpecification
//     ├─ NewAccountHighActivityRule
//     ├─ GeoVelocityRule
//     ├─ ContentSimilarityRule
//     └─ BotSignatureRule
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Specification — contrato base do padrão de especificação composta.
 */
class Specification {
  /**
   * @param {object} ctx — contexto da requisição
   * @returns {Promise<boolean>}
   */
  async isSatisfiedBy(ctx) { throw new Error('isSatisfiedBy() não implementado'); } // eslint-disable-line no-unused-vars

  and(other)  { return new AndSpecification(this, other); }
  or(other)   { return new OrSpecification(this, other); }
  not()       { return new NotSpecification(this); }
}

class AndSpecification extends Specification {
  #left; #right;
  constructor(left, right) { super(); this.#left = left; this.#right = right; }
  async isSatisfiedBy(ctx) {
    return (await this.#left.isSatisfiedBy(ctx)) && (await this.#right.isSatisfiedBy(ctx));
  }
}

class OrSpecification extends Specification {
  #left; #right;
  constructor(left, right) { super(); this.#left = left; this.#right = right; }
  async isSatisfiedBy(ctx) {
    return (await this.#left.isSatisfiedBy(ctx)) || (await this.#right.isSatisfiedBy(ctx));
  }
}

class NotSpecification extends Specification {
  #inner;
  constructor(inner) { super(); this.#inner = inner; }
  async isSatisfiedBy(ctx) { return !(await this.#inner.isSatisfiedBy(ctx)); }
}

// ── Regras concretas ──────────────────────────────────────────────────────────

/**
 * NewAccountHighActivityRule — flageia contas novas com atividade anormalmente alta.
 */
class NewAccountHighActivityRule extends Specification {
  #accountMaxAgeMs;
  #maxRequests;

  /**
   * @param {object} [opts]
   * @param {number} [opts.accountMaxAgeMs=86400000] — conta "nova" se < 24h
   * @param {number} [opts.maxRequests=20]            — threshold de requisições
   */
  constructor({ accountMaxAgeMs = 24 * 60 * 60_000, maxRequests = 20 } = {}) {
    super();
    this.#accountMaxAgeMs = accountMaxAgeMs;
    this.#maxRequests     = maxRequests;
  }

  async isSatisfiedBy({ accountAgeMs, requestCount }) {
    if (accountAgeMs == null || requestCount == null) return false;
    return accountAgeMs < this.#accountMaxAgeMs && requestCount > this.#maxRequests;
  }
}

/**
 * GeoVelocityRule — detecta saltos geográficos fisicamente impossíveis.
 * Usa fórmula de Haversine para distância entre coordenadas.
 */
class GeoVelocityRule extends Specification {
  #maxSpeedKmh;

  /** @param {object} [opts] @param {number} [opts.maxSpeedKmh=900] */
  constructor({ maxSpeedKmh = 900 } = {}) {
    super();
    this.#maxSpeedKmh = maxSpeedKmh;
  }

  async isSatisfiedBy({ lastLocations }) {
    if (!Array.isArray(lastLocations) || lastLocations.length < 2) return false;
    const sorted = [...lastLocations].sort((a, b) => a.ts - b.ts);
    for (let i = 1; i < sorted.length; i++) {
      const prev     = sorted[i - 1];
      const curr     = sorted[i];
      const distKm   = GeoVelocityRule.#haversineKm(prev, curr);
      const elapsedH = (curr.ts - prev.ts) / 3_600_000;
      if (elapsedH > 0 && distKm / elapsedH > this.#maxSpeedKmh) return true;
    }
    return false;
  }

  static #haversineKm({ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 }) {
    const R    = 6371;
    const dLat = GeoVelocityRule.#rad(lat2 - lat1);
    const dLng = GeoVelocityRule.#rad(lng2 - lng1);
    const a    = Math.sin(dLat / 2) ** 2
               + Math.cos(GeoVelocityRule.#rad(lat1))
               * Math.cos(GeoVelocityRule.#rad(lat2))
               * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  static #rad(deg) { return (deg * Math.PI) / 180; }
}

/**
 * ContentSimilarityRule — detecta spam por similaridade de conteúdo (Jaccard index).
 */
class ContentSimilarityRule extends Specification {
  #threshold;
  #maxHistory;

  /**
   * @param {object} [opts]
   * @param {number} [opts.threshold=0.8]  — Jaccard mínimo para flag
   * @param {number} [opts.maxHistory=5]   — últimas N mensagens a comparar
   */
  constructor({ threshold = 0.8, maxHistory = 5 } = {}) {
    super();
    this.#threshold  = threshold;
    this.#maxHistory = maxHistory;
  }

  async isSatisfiedBy({ contentHistory, currentContent }) {
    if (!currentContent || !Array.isArray(contentHistory) || contentHistory.length === 0) return false;
    const recent = contentHistory.slice(-this.#maxHistory);
    return recent.some(past => ContentSimilarityRule.#jaccard(past, currentContent) >= this.#threshold);
  }

  static #tokenize(text) {
    return new Set(String(text).toLowerCase().split(/\s+/).filter(Boolean));
  }

  static #jaccard(a, b) {
    const setA  = ContentSimilarityRule.#tokenize(a);
    const setB  = ContentSimilarityRule.#tokenize(b);
    const inter = [...setA].filter(t => setB.has(t)).length;
    const union = new Set([...setA, ...setB]).size;
    return union === 0 ? 0 : inter / union;
  }
}

/**
 * BotSignatureRule — detecta padrões de bot via User-Agent e regularidade de timing.
 */
class BotSignatureRule extends Specification {
  static #BOT_PATTERNS = [
    /bot|crawl|spider|scrape|headless|phantom|selenium|puppeteer|playwright/i,
    /python-requests|libwww-perl|curl\/|wget\/|go-http-client|java\/|ruby\//i,
  ];

  #minIntervalMs;
  #regularityThreshold;

  /**
   * @param {object} [opts]
   * @param {number} [opts.minIntervalMs=50]           — intervalo mínimo entre reqs (ms)
   * @param {number} [opts.regularityThreshold=0.95]   — stddev/avg < threshold → bot
   */
  constructor({ minIntervalMs = 50, regularityThreshold = 0.95 } = {}) {
    super();
    this.#minIntervalMs       = minIntervalMs;
    this.#regularityThreshold = regularityThreshold;
  }

  async isSatisfiedBy({ userAgent, requestTimestamps }) {
    if (BotSignatureRule.#isKnownBot(userAgent)) return true;
    if (Array.isArray(requestTimestamps) && requestTimestamps.length >= 4) {
      return BotSignatureRule.#isTooRegular(
        requestTimestamps,
        this.#minIntervalMs,
        this.#regularityThreshold,
      );
    }
    return false;
  }

  static #isKnownBot(ua) {
    if (!ua) return false;
    return BotSignatureRule.#BOT_PATTERNS.some(p => p.test(ua));
  }

  static #isTooRegular(timestamps, minInterval, threshold) {
    const sorted    = [...timestamps].sort((a, b) => a - b);
    const intervals = [];
    for (let i = 1; i < sorted.length; i++) intervals.push(sorted[i] - sorted[i - 1]);
    if (intervals.some(d => d < minInterval)) return true;
    const avg    = intervals.reduce((s, v) => s + v, 0) / intervals.length;
    if (avg === 0) return false;
    const stddev = Math.sqrt(intervals.reduce((s, v) => s + (v - avg) ** 2, 0) / intervals.length);
    // Coeficiente de variação: stddev/avg < (1 - threshold) → demasiado regular
    return stddev / avg < (1 - threshold);
  }
}

module.exports = {
  Specification,
  AndSpecification,
  OrSpecification,
  NotSpecification,
  NewAccountHighActivityRule,
  GeoVelocityRule,
  ContentSimilarityRule,
  BotSignatureRule,
};
