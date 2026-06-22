'use strict';

const { StoryAudioR2Pather } = require('./StoryAudioR2Pather');

/**
 * StoryAudioCatalogReader — lê o catálogo de áudios (stories/audio/catalog.json)
 * do R2 com cache em memória (TTL) para não bater no R2 a cada request.
 * Nunca lança: em erro/ausência devolve catálogo vazio (modal degrada bem).
 *
 * Camada: application
 */
class StoryAudioCatalogReader {
  static VAZIO = Object.freeze({ generatedAt: null, count: 0, genres: ['Todos'], tracks: [] });
  static DEFAULT_TTL_MS = 5 * 60 * 1000;

  #r2;
  #ttlMs;
  #now;
  #cache = null; // { value, expiresAt }

  /**
   * @param {object} deps
   * @param {object|null} deps.r2Gateway — com downloadSource(path) → Buffer
   * @param {number} [deps.ttlMs]
   * @param {() => number} [deps.now]
   */
  constructor({ r2Gateway = null, ttlMs = StoryAudioCatalogReader.DEFAULT_TTL_MS, now = () => Date.now() } = {}) {
    this.#r2 = r2Gateway;
    this.#ttlMs = Number(ttlMs) > 0 ? Number(ttlMs) : StoryAudioCatalogReader.DEFAULT_TTL_MS;
    this.#now = now;
  }

  /** @returns {Promise<object>} catálogo (cacheado); nunca lança. */
  async ler() {
    const agora = this.#now();
    if (this.#cache && this.#cache.expiresAt > agora) return this.#cache.value;

    const value = await this.#carregar();
    this.#cache = { value, expiresAt: agora + this.#ttlMs };
    return value;
  }

  invalidar() { this.#cache = null; }

  async #carregar() {
    if (!this.#r2?.downloadSource) return StoryAudioCatalogReader.VAZIO;
    try {
      const buf = await this.#r2.downloadSource(StoryAudioR2Pather.catalogKey());
      const parsed = JSON.parse(Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf));
      if (!parsed || !Array.isArray(parsed.tracks)) return StoryAudioCatalogReader.VAZIO;
      return parsed;
    } catch (_) {
      return StoryAudioCatalogReader.VAZIO; // não existe ainda / R2 indisponível
    }
  }
}

module.exports = { StoryAudioCatalogReader };
