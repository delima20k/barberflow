'use strict';

// =============================================================
// HomePage.js — Página inicial do app cliente.
// Responsabilidade: bind de interações dos stories (like e abertura
// de vídeo) via event delegation. Os widgets de dados (NearbyBarbershops,
// MapPanel, etc.) são inicializados pelo AppBootstrap — não aqui.
//
// Dependências: BarbershopService.js, StoryViewer.js
// =============================================================

// Gerencia a tela inicial: likes de stories, abertura de vídeo e avatar upload.
class HomePage {

  #telaEl = null;  // referência a #tela-inicio

  constructor() {}

  /**
   * Registra listeners por event delegation na tela de início.
   * Chame uma vez após instanciar (DOM já está disponível).
   */
  bind() {
    this.#telaEl = document.getElementById('tela-inicio');
    if (!this.#telaEl) return;

    this.#telaEl.addEventListener('click', (e) => {
      // Story: like
      const likeBtn = e.target.closest('[data-action="like"]');
      if (likeBtn) {
        e.preventDefault();
        BarbershopService.toggleLike(likeBtn);
        return;
      }

      // Story: abrir vídeo
      const storyWrap = e.target.closest('[data-action="story-open"]');
      if (storyWrap) {
        e.preventDefault();
        if (typeof StoryViewer !== 'undefined') StoryViewer.abrir(storyWrap);
        return;
      }
    });
  }
}
