'use strict';

// =============================================================
// HomePage.js — Página inicial do app cliente.
// Responsabilidade: bind de interações dos stories e dos cards
// destaque (like, dislike, favorite) via event delegation.
// Os widgets de dados (NearbyBarbershops, MapPanel, etc.) são
// inicializados pelo AppBootstrap — não aqui.
//
// Dependências: BarbershopService.js, StoryViewer.js
// =============================================================

// Gerencia a tela inicial: stories, cards destaque e interações de barbearias.
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
      // ── Stories ─────────────────────────────────────────

      // Story: like
      const likeBtn = e.target.closest('[data-action="like"]');
      if (likeBtn) {
        e.preventDefault();
        const _r = typeof App !== 'undefined' ? App : null;
        if (typeof AuthGuard !== 'undefined' && !AuthGuard.permitirAcao('like', _r)) return;
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

      // ── Cards destaque (barbearias) ──────────────────────

      // Curtida positiva
      const barbLike = e.target.closest('[data-action="barbershop-like"]');
      if (barbLike) {
        e.preventDefault();
        e.stopPropagation();
        BarbershopService.toggleBarbershopLike(barbLike);
        return;
      }

      // Feedback negativo (descurtida)
      const barbDislike = e.target.closest('[data-action="barbershop-dislike"]');
      if (barbDislike) {
        e.preventDefault();
        e.stopPropagation();
        BarbershopService.toggleBarbershopDislike(barbDislike);
        return;
      }

      // Favoritar
      const barbFav = e.target.closest('[data-action="barbershop-favorite"]');
      if (barbFav) {
        e.preventDefault();
        e.stopPropagation();
        const _r = typeof App !== 'undefined' ? App : null;
        if (typeof AuthGuard !== 'undefined' && !AuthGuard.permitirAcao('barbershop-favorite', _r)) return;
        BarbershopService.toggleBarbershopFavorite(barbFav);
        return;
      }
    });
  }
}
