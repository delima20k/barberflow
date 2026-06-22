'use strict';

// =============================================================
// MusicCatalogService.js — catálogo de áudios de story (cliente).
//
// Carrega o catálogo (JSON no R2, servido pela BFF) UMA vez e cacheia
// em memória. Filtro por gênero/termo e paginação (20) são puros e
// testáveis — fatiam a lista, sem materializar tudo na tela.
//
// Depende de: BffApiService (injetável p/ teste).
// =============================================================

class MusicCatalogService {
  static PAGE_SIZE = 20;

  #api;
  #pageSize;
  #catalogo = null;     // catálogo carregado { genres, tracks, ... }
  #carregando = null;   // Promise em voo (evita fetch duplicado)

  constructor({ api = (typeof BffApiService !== 'undefined' ? BffApiService : null), pageSize = MusicCatalogService.PAGE_SIZE } = {}) {
    this.#api = api;
    this.#pageSize = Number(pageSize) > 0 ? Number(pageSize) : MusicCatalogService.PAGE_SIZE;
  }

  /** Carrega (e cacheia) o catálogo. Reentrante: chamadas simultâneas compartilham a Promise. */
  async carregar(force = false) {
    if (this.#catalogo && !force) return this.#catalogo;
    if (this.#carregando && !force) return this.#carregando;

    this.#carregando = (async () => {
      try {
        const { data } = await this.#api.musicas.catalogo();
        this.#catalogo = MusicCatalogService.#normalizar(data);
      } catch (_) {
        this.#catalogo = MusicCatalogService.#vazio();
      } finally {
        this.#carregando = null;
      }
      return this.#catalogo;
    })();
    return this.#carregando;
  }

  get carregado() { return !!this.#catalogo; }
  get tracks()    { return this.#catalogo ? this.#catalogo.tracks : []; }
  generos()       { return this.#catalogo ? this.#catalogo.genres : ['Todos']; }
  get pageSize()  { return this.#pageSize; }

  /** Filtra os tracks já carregados. */
  filtrar({ genero = 'Todos', termo = '' } = {}) {
    return MusicCatalogService.filtrar(this.tracks, { genero, termo });
  }

  /** Página `n` (1-based) de uma lista. */
  pagina(lista, n = 1, tam = this.#pageSize) {
    return MusicCatalogService.pagina(lista, n, tam);
  }

  // ── Puros (testáveis sem rede/DOM) ─────────────────────────

  static filtrar(tracks, { genero = 'Todos', termo = '' } = {}) {
    const arr = Array.isArray(tracks) ? tracks : [];
    const g = String(genero || 'Todos');
    const t = String(termo || '').trim().toLowerCase();
    return arr.filter((track) => {
      if (g !== 'Todos' && track.genre !== g) return false;
      if (!t) return true;
      const alvo = `${track.music_name ?? ''} ${track.artist ?? ''}`.toLowerCase();
      return alvo.includes(t);
    });
  }

  /** Retorna uma FATIA (não cópia integral) da página n (1-based). */
  static pagina(lista, n = 1, tam = MusicCatalogService.PAGE_SIZE) {
    const arr = Array.isArray(lista) ? lista : [];
    const tamanho = Number(tam) > 0 ? Number(tam) : MusicCatalogService.PAGE_SIZE;
    const pag = Number(n) > 0 ? Math.floor(Number(n)) : 1;
    const inicio = (pag - 1) * tamanho;
    return arr.slice(inicio, inicio + tamanho);
  }

  static totalPaginas(total, tam = MusicCatalogService.PAGE_SIZE) {
    const tamanho = Number(tam) > 0 ? Number(tam) : MusicCatalogService.PAGE_SIZE;
    return Math.max(1, Math.ceil((Number(total) || 0) / tamanho));
  }

  static #normalizar(data) {
    if (!data || !Array.isArray(data.tracks)) return MusicCatalogService.#vazio();
    return {
      generatedAt: data.generatedAt ?? null,
      count: Number(data.count) || data.tracks.length,
      genres: Array.isArray(data.genres) && data.genres.length ? data.genres : ['Todos'],
      tracks: data.tracks,
    };
  }

  static #vazio() {
    return { generatedAt: null, count: 0, genres: ['Todos'], tracks: [] };
  }
}

// UMD — testes via require(); ignorado no browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MusicCatalogService };
}
