'use strict';

// =============================================================
// ProfissionalStartupSplash.js - Splash de abertura do App Profissional
//
// Reutiliza as classes de transicao do cliente: .cs-ativo / .cs-saindo
// =============================================================

class ProfissionalStartupSplash {

  static #SESSION_KEY = 'bf_pro_splash_shown';
  static #DURATION_MS = 1300;
  static #FADE_MS     = 300;

  // Publico

  static init() {
    if (sessionStorage.getItem(ProfissionalStartupSplash.#SESSION_KEY)) return;
    sessionStorage.setItem(ProfissionalStartupSplash.#SESSION_KEY, '1');
    ProfissionalStartupSplash.#exibir();
  }

  static limparSessao() {
    sessionStorage.removeItem(ProfissionalStartupSplash.#SESSION_KEY);
  }

  // Privado

  static #exibir() {
    const overlay = ProfissionalStartupSplash.#montarOverlay();
    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => overlay.classList.add('cs-ativo'));
    });
    setTimeout(
      () => ProfissionalStartupSplash.#fechar(overlay),
      ProfissionalStartupSplash.#DURATION_MS
    );
  }

  static #fechar(overlay) {
    overlay.classList.add('cs-saindo');
    setTimeout(() => {
      overlay.remove();
    }, ProfissionalStartupSplash.#FADE_MS);
  }

  static #montarOverlay() {
    const overlay = document.createElement('div');
    overlay.id        = 'profissional-startup-splash';
    overlay.className = 'ps-overlay';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-label', 'Carregando BarberFlow Pro');
    overlay.innerHTML = `
      <div class="ps-conteudo">
        <img
          class="ps-logo"
          src="/shared/img/icon-512-pro.png"
          alt="BarberFlow Pro"
          onerror="this.style.display='none'"
        >
      </div>
    `;
    return overlay;
  }
}
