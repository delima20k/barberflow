'use strict';

// =============================================================
// StoriesCarousel — Garante exatamente 3 cards visíveis,
// sem peek lateral, com scroll 1-a-1 (POO)
//
// Responsabilidades:
//   - Envolve cada .stories-scroll num .stories-carousel-wrap
//     com overflow:hidden para clipar o 4º card
//   - Calcula largura pixel-exata de cada .story-card com base
//     na largura real do wrapper
//   - Monitora redimensionamentos via ResizeObserver
// =============================================================

class StoriesCarousel {

  /** Atributo que marca o wrapper já criado (idempotência). */
  static #MARCA = 'data-sc-wrap';

  /** Map<container, ResizeObserver> */
  static #obs = new Map();

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO
  // ═══════════════════════════════════════════════════════════

  /**
   * Inicializa o carrossel em todos os .stories-scroll do root.
   * @param {Document|HTMLElement} root
   */
  static aplicar(root = document) {
    root.querySelectorAll('.stories-scroll').forEach(c => StoriesCarousel.#inicializar(c));
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO
  // ═══════════════════════════════════════════════════════════

  /**
   * Envolve o container em um div.stories-carousel-wrap (idempotente).
   * O wrapper recebe overflow:hidden para clipar qualquer card fora da
   * área visível sem afetar o scroll do container filho.
   * @param {HTMLElement} container — o .stories-scroll
   * @returns {HTMLElement} o wrapper
   */
  static #envolverContainer(container) {
    const pai = container.parentElement;
    if (pai?.hasAttribute(StoriesCarousel.#MARCA)) return pai;

    const wrap = document.createElement('div');
    wrap.className = 'stories-carousel-wrap';
    wrap.setAttribute(StoriesCarousel.#MARCA, '1');
    pai.insertBefore(wrap, container);
    wrap.appendChild(container);
    return wrap;
  }

  /**
   * Lê o gap atual do container via CSS computado e calcula a
   * largura pixel-exata para que exatamente 3 cards preencham o wrapper.
   * @param {HTMLElement} container
   */
  static #calibrarCards(container) {
    const wrap = container.parentElement;
    const wrapW = wrap ? wrap.clientWidth : container.clientWidth;
    if (!wrapW) return;

    const gap   = parseFloat(getComputedStyle(container).columnGap) || 10;
    const cardW = (wrapW - gap * 2) / 3;

    container.querySelectorAll('.story-card').forEach(card => {
      card.style.width    = `${cardW}px`;
      card.style.minWidth = `${cardW}px`;
      card.style.maxWidth = `${cardW}px`;
    });
  }

  /**
   * Registra um ResizeObserver no wrapper para recalibrar quando a
   * viewport mudar (rotação, zoom, mudança de janela).
   * @param {HTMLElement} container
   */
  static #monitorar(container) {
    if (StoriesCarousel.#obs.has(container)) return;
    if (typeof ResizeObserver === 'undefined') return;

    const wrap = container.parentElement;
    const ro   = new ResizeObserver(() => StoriesCarousel.#calibrarCards(container));
    if (wrap) ro.observe(wrap);
    StoriesCarousel.#obs.set(container, ro);
  }

  /**
   * Pipeline completo para um único container.
   * @param {HTMLElement} container
   */
  static #inicializar(container) {
    StoriesCarousel.#envolverContainer(container);
    StoriesCarousel.#calibrarCards(container);
    StoriesCarousel.#monitorar(container);
  }
}

//
// Responsabilidades:
//   - Detecta containers .stories-scroll com .story-card dentro
//   - Garante que cada .story-video-wrap está vinculado ao StoryViewer
//     via dataset, sem duplicar listeners (idempotente)
//   - Mantém compatibilidade: converte .h-scroll legado para .stories-scroll
//
// Uso:
//   StoriesLayout.aplicar()         — chamado automaticamente no DOMContentLoaded
//   StoriesLayout.aplicar(root)     — re-inicializa dentro de um sub-DOM
// =============================================================

class StoriesLayout {

  // Atributo de marca para evitar bind duplo em re-inicializações
  static #MARCA = 'data-sv-bound';

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO
  // ═══════════════════════════════════════════════════════════

  /**
   * Inicializa todos os containers de stories no root fornecido.
   * @param {Document|HTMLElement} root
   */
  static aplicar(root = document) {
    StoriesLayout.#migrarLegado(root);
    StoriesLayout.#bindViewers(root);
    StoriesLayout.#bindLoadingState(root);
    StoriesCarousel.aplicar(root);
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO
  // ═══════════════════════════════════════════════════════════

  /**
   * Migração legada: converte .h-scroll que contém .story-card
   * para .stories-scroll (novo padrão CSS).
   * Mantém os cards no DOM — remove apenas as classes antigas.
   * @param {Document|HTMLElement} root
   */
  static #migrarLegado(root) {
    root.querySelectorAll('.h-scroll').forEach(container => {
      if (!container.querySelector('.story-card')) return;
      container.classList.remove('h-scroll');
      container.classList.add('stories-scroll');
      container.removeAttribute('style'); // limpa inline style legado
    });
  }

  /**
   * Vincula StoryViewer.abrir() a cada .story-video-wrap ainda não marcado.
   * Idempotente — pode ser chamado múltiplas vezes sem duplicar eventos.
   * @param {Document|HTMLElement} root
   */
  static #bindViewers(root) {
    // Bind no .story-card inteiro: qualquer toque dentro do card abre o viewer
    root.querySelectorAll(`.stories-scroll .story-card:not([${StoriesLayout.#MARCA}])`)
      .forEach(card => {
        card.setAttribute(StoriesLayout.#MARCA, '1');
        // StoryViewer.abrir usa .closest('.story-card') internamente,
        // passando o card diretamente funciona pois closest inclui o próprio elemento
        card.addEventListener('click', () => StoryViewer.abrir(card));
      });
  }

  /**
   * Estado visual de carregamento para shimmer dos stories.
   * Nao altera funcionalidade: apenas adiciona/remove classe CSS.
   * @param {Document|HTMLElement} root
   */
  static #bindLoadingState(root) {
    root.querySelectorAll('.stories-scroll .story-video-wrap').forEach(wrap => {
      const video = wrap.querySelector('.story-video');
      if (!video) return;

      const marcarPronto = () => wrap.classList.add('is-loaded');

      if (video.readyState >= 2) {
        marcarPronto();
      } else {
        wrap.classList.remove('is-loaded');
        video.addEventListener('loadeddata', marcarPronto, { once: true });
        video.addEventListener('error', marcarPronto, { once: true });
      }
    });
  }
}

// Auto-inicializa quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => StoriesLayout.aplicar());

