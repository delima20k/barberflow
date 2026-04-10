'use strict';

// =============================================================
// StoriesLayout.js — Inicializador dos containers de Stories (POO)
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
    root.querySelectorAll(`.stories-scroll .story-video-wrap:not([${StoriesLayout.#MARCA}])`)
      .forEach(wrap => {
        wrap.setAttribute(StoriesLayout.#MARCA, '1');
        wrap.addEventListener('click', () => StoryViewer.abrir(wrap));
      });
  }
}

// Auto-inicializa quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => StoriesLayout.aplicar());

