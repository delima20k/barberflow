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
  static PAGE_SIZE = 20;
  static MAX_PAGE_SIZE = 50;

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

  async listarPagina({ page = 1, pageSize = StoryAudioCatalogReader.PAGE_SIZE, genre = 'Todos', q = '' } = {}) {
    const catalogo = await this.ler();
    const filtrados = StoryAudioCatalogReader.filtrar(catalogo.tracks, { genre, q });
    const tamanho = StoryAudioCatalogReader.#pageSize(pageSize);
    const pagina = StoryAudioCatalogReader.#page(page);
    const inicio = (pagina - 1) * tamanho;
    return {
      generatedAt: catalogo.generatedAt ?? null,
      count: filtrados.length,
      genres: Array.isArray(catalogo.genres) && catalogo.genres.length ? catalogo.genres : ['Todos'],
      tracks: filtrados.slice(inicio, inicio + tamanho),
      page: pagina,
      pageSize: tamanho,
      totalPages: Math.max(1, Math.ceil(filtrados.length / tamanho)),
      hasMore: inicio + tamanho < filtrados.length,
    };
  }

  invalidar() { this.#cache = null; }

  static filtrar(tracks, { genre = 'Todos', q = '' } = {}) {
    const arr = Array.isArray(tracks) ? tracks : [];
    const genero = String(genre || 'Todos');
    const termo = String(q || '').trim().toLowerCase();
    return arr.filter((track) => {
      if (genero !== 'Todos' && track.genre !== genero) return false;
      if (!termo) return true;
      const alvo = `${track.music_name ?? ''} ${track.artist ?? ''}`.toLowerCase();
      return alvo.includes(termo);
    });
  }

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

  static #page(n) {
    const value = Number(n);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
  }

  static #pageSize(n) {
    const value = Number(n);
    if (!Number.isFinite(value) || value <= 0) return StoryAudioCatalogReader.PAGE_SIZE;
    return Math.min(StoryAudioCatalogReader.MAX_PAGE_SIZE, Math.floor(value));
  }
}

module.exports = { StoryAudioCatalogReader };
