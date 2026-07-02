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
    const overlayInicial = document.getElementById('profissional-startup-splash');
    if (sessionStorage.getItem(ProfissionalStartupSplash.#SESSION_KEY) && !overlayInicial) return;
    sessionStorage.setItem(ProfissionalStartupSplash.#SESSION_KEY, '1');
    ProfissionalStartupSplash.#exibir(overlayInicial);
  }

  static limparSessao() {
    sessionStorage.removeItem(ProfissionalStartupSplash.#SESSION_KEY);
  }

  // Privado

  static #exibir(overlayInicial = null) {
    const overlay = overlayInicial || ProfissionalStartupSplash.#montarOverlay();
    if (!overlayInicial) document.body.appendChild(overlay);
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
          class="ps-logo-icon"
          src="/shared/img/Logo01.png"
          alt=""
          aria-hidden="true"
          onerror="this.style.display='none'"
        >
        <img
          class="ps-logo-name"
          src="/shared/img/LogoNomeBarberFlow.png"
          alt="BarberFlow"
          onerror="this.style.display='none'"
        >
      </div>
    `;
    return overlay;
  }
}
