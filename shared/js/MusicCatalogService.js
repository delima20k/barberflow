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
  static CACHE_KEY = 'catalog';
  static PAGE_CACHE_PREFIX = 'catalog:page';
  static PUBLIC_CATALOG_PATH = '/api/v1/media/stories/audio/catalog';

  #api;
  #pageSize;
  #cache;
  #catalogo = null;     // catálogo em uso (válido ou stale)
  #carregando = null;   // Promise em voo (evita fetch duplicado)

  constructor({ api = (typeof BffApiService !== 'undefined' ? BffApiService : null), pageSize = MusicCatalogService.PAGE_SIZE, cache = null } = {}) {
    this.#api = api;
    this.#pageSize = Number(pageSize) > 0 ? Number(pageSize) : MusicCatalogService.PAGE_SIZE;
    this.#cache = cache
      ?? ((typeof MusicCacheService !== 'undefined') ? new MusicCacheService() : null);
  }

  /**
   * Carrega o catálogo (lazy). Usa cache (TTL 30min); em falha de rede
   * devolve o último valor mesmo expirado (offline parcial).
   * Reentrante: chamadas simultâneas compartilham a Promise.
   */
  async carregar(force = false) {
    if (!force) {
      const cacheado = this.#cache?.get(MusicCatalogService.CACHE_KEY);
      if (cacheado) { this.#catalogo = cacheado; return cacheado; }
      if (this.#catalogo) return this.#catalogo;
      if (this.#carregando) return this.#carregando;
    }

    this.#carregando = (async () => {
      try {
        const data = await this.#catalogoRemoto();
        this.#catalogo = MusicCatalogService.normalizar(data);
        this.#cache?.set(MusicCatalogService.CACHE_KEY, this.#catalogo);
      } catch (_) {
        // Offline parcial: usa o último catálogo (stale) se existir.
        const stale = this.#cache?.stale(MusicCatalogService.CACHE_KEY);
        this.#catalogo = stale ?? MusicCatalogService.vazio();
      } finally {
        this.#carregando = null;
      }
      return this.#catalogo;
    })();
    return this.#carregando;
  }

  /** Busca uma pagina sob demanda na BFF, evitando enviar o catalogo inteiro para a UI. */
  async buscarPagina({ genero = 'Todos', termo = '', pagina = 1, pageSize = this.#pageSize, force = false } = {}) {
    const params = {
      page:     MusicCatalogService.#pagina(pagina),
      pageSize: MusicCatalogService.#normalizarPageSize(pageSize),
      genre:    String(genero || 'Todos'),
      q:        String(termo || ''),
    };
    const cacheKey = MusicCatalogService.#pageCacheKey(params);
    if (!force) {
      const cacheado = this.#cache?.get(cacheKey);
      if (cacheado) return cacheado;
    }

    try {
      const data = await this.#catalogoRemoto(params);
      const page = MusicCatalogService.#normalizarPagina(data, params);
      this.#cache?.set(cacheKey, page);
      if (Array.isArray(page.genres) && page.genres.length) {
        this.#catalogo = {
          generatedAt: page.generatedAt,
          count: page.count,
          genres: page.genres,
          tracks: this.#catalogo?.tracks ?? [],
        };
      }
      return page;
    } catch (_) {
      const stale = this.#cache?.stale(cacheKey);
      if (stale) return stale;

      // Compatibilidade/offline parcial: se houver catalogo local/stale, filtra e pagina aqui.
      const catalogo = this.#catalogo ?? this.#cache?.stale(MusicCatalogService.CACHE_KEY);
      if (catalogo?.tracks) {
        return MusicCatalogService.#paginaLocal(catalogo, params);
      }
      return MusicCatalogService.#paginaVazia(params);
    }
  }

  async #catalogoRemoto(params = {}) {
    if (this.#api?.musicas && typeof this.#api.musicas.catalogo === 'function') {
      const resposta = await this.#api.musicas.catalogo(params);
      if (resposta && !resposta.error && resposta.data != null) return resposta.data;
    }
    return MusicCatalogService.#buscarCatalogoPublico(params);
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

  static #normalizarPagina(data, params) {
    if (!data || !Array.isArray(data.tracks)) return MusicCatalogService.#paginaVazia(params);
    if (data.page || data.hasMore !== undefined || data.totalPages) {
      return {
        generatedAt: data.generatedAt ?? null,
        count: Number(data.count) || data.tracks.length,
        genres: Array.isArray(data.genres) && data.genres.length ? data.genres : ['Todos'],
        tracks: data.tracks,
        page: MusicCatalogService.#pagina(data.page ?? params.page),
        pageSize: MusicCatalogService.#normalizarPageSize(data.pageSize ?? params.pageSize),
        totalPages: MusicCatalogService.totalPaginas(Number(data.count) || data.tracks.length, data.pageSize ?? params.pageSize),
        hasMore: data.hasMore === true,
      };
    }
    return MusicCatalogService.#paginaLocal(MusicCatalogService.normalizar(data), params);
  }

  static #paginaLocal(catalogo, params) {
    const filtrados = MusicCatalogService.filtrar(catalogo.tracks, { genero: params.genre, termo: params.q });
    const tracks = MusicCatalogService.pagina(filtrados, params.page, params.pageSize);
    const totalPages = MusicCatalogService.totalPaginas(filtrados.length, params.pageSize);
    return {
      generatedAt: catalogo.generatedAt ?? null,
      count: filtrados.length,
      genres: Array.isArray(catalogo.genres) && catalogo.genres.length ? catalogo.genres : ['Todos'],
      tracks,
      page: params.page,
      pageSize: params.pageSize,
      totalPages,
      hasMore: params.page < totalPages,
    };
  }

  static #paginaVazia(params) {
    return {
      generatedAt: null,
      count: 0,
      genres: ['Todos'],
      tracks: [],
      page: params.page,
      pageSize: params.pageSize,
      totalPages: 1,
      hasMore: false,
    };
  }

  static #pageCacheKey({ page, pageSize, genre, q }) {
    return `${MusicCatalogService.PAGE_CACHE_PREFIX}:${page}:${pageSize}:${genre}:${q}`;
  }

  static async #buscarCatalogoPublico(params) {
    if (typeof fetch !== 'function') throw new Error('fetch indisponivel');
    const url = MusicCatalogService.#publicUrl(params);
    const res = await fetch(url, { headers: {} });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(json?.error ?? `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return json?.dados ?? json;
  }

  static #publicUrl(params) {
    const base = MusicCatalogService.#baseUrl();
    const qs = Object.entries(params || {})
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    return `${base}${MusicCatalogService.PUBLIC_CATALOG_PATH}${qs ? `?${qs}` : ''}`;
  }

  static #baseUrl() {
    if (typeof BffApiService !== 'undefined' && BffApiService.baseUrl) {
      return BffApiService.baseUrl;
    }
    const hostname = (typeof window !== 'undefined' && window.location)
      ? window.location.hostname
      : '';
    return (hostname === 'localhost' || hostname === '127.0.0.1')
      ? 'http://localhost:3002'
      : 'https://bff.berberflow.shop';
  }

  static #pagina(n) {
    const value = Number(n);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
  }

  static #normalizarPageSize(n) {
    const value = Number(n);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : MusicCatalogService.PAGE_SIZE;
  }

  static normalizar(data) {
    if (!data || !Array.isArray(data.tracks)) return MusicCatalogService.vazio();
    return {
      generatedAt: data.generatedAt ?? null,
      count: Number(data.count) || data.tracks.length,
      genres: Array.isArray(data.genres) && data.genres.length ? data.genres : ['Todos'],
      tracks: data.tracks,
    };
  }

  static vazio() {
    return { generatedAt: null, count: 0, genres: ['Todos'], tracks: [] };
  }
}

// UMD — testes via require(); ignorado no browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MusicCatalogService };
}
