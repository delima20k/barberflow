'use strict';

// =============================================================
// ProfissionalStartupSplash.js - Splash de abertura do App Profissional
//
// Reutiliza as classes de transicao do cliente: .cs-ativo / .cs-saindo
// Dependencias: BarberPole (shared/js/BarberPole.js)
// =============================================================

class ProfissionalStartupSplash {

  static #SESSION_KEY = 'bf_pro_splash_shown';
  static #DURATION_MS = 2500;
  static #FADE_MS     = 450;

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
    const poloContainer = overlay.querySelector('#ps-polo');
    let pole = null;
    if (typeof BarberPole !== 'undefined' && poloContainer) {
      pole = new BarberPole(poloContainer);
    }
    setTimeout(
      () => ProfissionalStartupSplash.#fechar(overlay, pole),
      ProfissionalStartupSplash.#DURATION_MS
    );
  }

  static #fechar(overlay, pole) {
    overlay.classList.add('cs-saindo');
    setTimeout(() => {
      pole?.destruir();
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
        <p class="ps-nome">BarberFlow Pro</p>
        <div class="ps-polo-wrap"><div id="ps-polo"></div></div>
        <p class="ps-boas-vindas">Bem-vindo ao BarberFlow Profissional</p>
      </div>
    `;
    return overlay;
  }
}
