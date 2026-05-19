'use strict';

// =============================================================
// LazyMediaLoader.js — Carregamento preguiçoso de mídia com IntersectionObserver.
//
// RESPONSABILIDADE:
//   Interceptar elementos de mídia que ainda não foram carregados
//   e substituir a URL quando o elemento entra no viewport.
//   Implementa a cascata de fontes: IndexedDB → P2P WebRTC → URL direta.
//
// ATRIBUTOS HTML:
//   data-lazy-src       — URL do recurso (img e video)
//   data-lazy-poster    — poster do video (carregado antes do vídeo)
//   data-lazy-mime      — MIME type (para cache correto, ex: 'image/webp')
//   data-lazy-media-id  — ID do arquivo em cache (para IndexedDB + P2P)
//
// EXEMPLOS:
//   <img data-lazy-src="/media/abc.webp" data-lazy-media-id="abc" data-lazy-mime="image/webp">
//   <video data-lazy-src="/media/xyz.mp4" data-lazy-poster="/media/xyz-poster.webp"
//          data-lazy-media-id="xyz" data-lazy-mime="video/mp4"></video>
//
// CASCATA DE FONTES (por ordem de prioridade / velocidade):
//   1. IndexedDB (MediaCacheService) — zero latência, local
//   2. WebRTC P2P (WebRTCPeerService) — peers locais na rede
//   3. URL direta (R2 / Supabase Storage) — CDN, sempre disponível como fallback
//
// DESIGN:
//   - Um único IntersectionObserver para toda a página (performance)
//   - Lazy + cascade por elemento — independente entre si
//   - Para de observar após carregar (evita duplicações)
//   - Suporta raiz customizável (útil para scroll containers)
//
// USO:
//   LazyMediaLoader.iniciar();           // monta o observer para todo o document
//   LazyMediaLoader.iniciar(meuScroll);  // limita ao scroll container
//   LazyMediaLoader.parar();             // remove o observer (limpeza SPA)
//
// Dependências opcionais (globais de browser):
//   MediaCacheService  — temCache(), obter()
//   WebRTCPeerService  — suportado(), receber()
// =============================================================

class LazyMediaLoader {

  /** @type {IntersectionObserver|null} */
  static #observer = null;

  /** @type {WeakSet<Element>} — evita processar o mesmo elemento duas vezes */
  static #processando = new WeakSet();

  // ══════════════════════════════════════════════════════════════
  // Público
  // ══════════════════════════════════════════════════════════════

  /**
   * Inicia o IntersectionObserver e observa todos os elementos
   * com `[data-lazy-src]` presentes no DOM (incluindo futuras inserções
   * via `observar(el)`).
   *
   * @param {Element|null} [raiz] — elemento raiz do scroll; null = viewport
   */
  static iniciar(raiz = null) {
    if (LazyMediaLoader.#observer) return; // já ativo

    LazyMediaLoader.#observer = new IntersectionObserver(
      (entradas) => {
        entradas.forEach(({ isIntersecting, target }) => {
          if (isIntersecting) LazyMediaLoader.#carregar(target);
        });
      },
      {
        root:       raiz ?? null,
        rootMargin: '200px',  // pré-carregar 200px antes de entrar no viewport
        threshold:  0,
      }
    );

    // Observar elementos já presentes no DOM
    document.querySelectorAll('[data-lazy-src]')
      .forEach(el => LazyMediaLoader.#observer.observe(el));
  }

  /**
   * Para de observar e libera recursos.
   * Chamar ao destruir a página/componente em SPAs.
   */
  static parar() {
    LazyMediaLoader.#observer?.disconnect();
    LazyMediaLoader.#observer = null;
  }

  /**
   * Registra um elemento para lazy loading (útil quando criado dinamicamente).
   * Requer que `iniciar()` tenha sido chamado antes.
   * @param {Element} el
   */
  static observar(el) {
    if (!el || !LazyMediaLoader.#observer) return;
    if (!el.hasAttribute('data-lazy-src')) return;
    LazyMediaLoader.#observer.observe(el);
  }

  // ══════════════════════════════════════════════════════════════
  // Privados
  // ══════════════════════════════════════════════════════════════

  /**
   * Inicia a cascata de carregamento para o elemento informado.
   * Para de observar imediatamente para evitar chamadas duplicadas.
   * @param {Element} el
   */
  static async #carregar(el) {
    if (LazyMediaLoader.#processando.has(el)) return;
    LazyMediaLoader.#processando.add(el);
    LazyMediaLoader.#observer?.unobserve(el);

    const src     = el.dataset.lazySrc;
    const mediaId = el.dataset.lazyMediaId;
    const mime    = el.dataset.lazyMime ?? '';

    if (!src) return;

    // ── Cascata de fontes ──────────────────────────────────────
    const buffer = await LazyMediaLoader.#obterBuffer(mediaId, mime);

    if (buffer) {
      // IndexedDB ou P2P: criar Blob URL local
      const blobUrl = URL.createObjectURL(new Blob([buffer], { type: mime || 'application/octet-stream' }));
      LazyMediaLoader.#aplicar(el, blobUrl, mime);
    } else {
      // Fallback: URL direta (CDN)
      LazyMediaLoader.#aplicar(el, src, mime);
    }
  }

  /**
   * Tenta obter o buffer de mídia via IndexedDB ou P2P (nesta ordem).
   * Retorna null se nenhuma fonte local estiver disponível.
   *
   * @param {string|undefined} mediaId
   * @param {string} mime
   * @returns {Promise<ArrayBuffer|null>}
   */
  static async #obterBuffer(mediaId, mime) {
    if (!mediaId) return null;

    // 1. IndexedDB (mais rápido — local, síncrono na checagem)
    if (typeof MediaCacheService !== 'undefined') {
      if (MediaCacheService.temCache(mediaId)) {
        const buf = await MediaCacheService.obter(mediaId);
        if (buf) return buf;
      }
    }

    // 2. P2P WebRTC (peers na rede local)
    if (typeof WebRTCPeerService !== 'undefined' && WebRTCPeerService.suportado()) {
      const buf = await WebRTCPeerService.receber(mediaId, { mimeType: mime }).catch(() => null);
      if (buf) return buf;
    }

    return null;
  }

  /**
   * Aplica a fonte carregada ao elemento HTML correto.
   * Trata img e video de forma diferente.
   * @param {Element} el
   * @param {string} src
   * @param {string} mime
   */
  static #aplicar(el, src, mime) {
    const tag = el.tagName.toLowerCase();

    if (tag === 'img') {
      el.src = src;
      return;
    }

    if (tag === 'video') {
      // Poster primeiro (melhor UX — aparece imediatamente enquanto o vídeo carrega)
      if (el.dataset.lazyPoster) el.poster = el.dataset.lazyPoster;

      const source = document.createElement('source');
      source.src  = src;
      if (mime) source.type = mime;
      el.appendChild(source);
      el.load();
      return;
    }

    // Fallback genérico: qualquer elemento com background-image ou src
    if ('src' in el) el.src = src;
  }
}
