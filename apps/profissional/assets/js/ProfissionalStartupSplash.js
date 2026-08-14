'use strict';

// =============================================================
// ProfissionalStartupSplash.js - Splash de abertura do App Profissional
//
// Reutiliza as classes de transicao do cliente: .cs-ativo / .cs-saindo
// =============================================================

class ProfissionalStartupSplash {

  static #SESSION_KEY = 'bf_pro_splash_shown';
  static #DURATION_MS = 3300;
  static #FADE_MS     = 300;

  // Publico

  static init() {
    const overlayInicial = document.getElementById('profissional-startup-splash');
    if (sessionStorage.getItem(ProfissionalStartupSplash.#SESSION_KEY) && !overlayInicial) {
      // Sem splash nesta navegacao — nada a esperar, libera a atualizacao do SW.
      ProfissionalStartupSplash.#liberarAtualizacaoPwa();
      return;
    }
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
    ProfissionalStartupSplash.#concluirTagline(overlay);
    setTimeout(
      () => ProfissionalStartupSplash.#fechar(overlay),
      ProfissionalStartupSplash.#DURATION_MS
    );
  }

  static #fechar(overlay) {
    overlay.classList.add('cs-saindo');
    setTimeout(() => {
      overlay.remove();
      // Splash concluida: a troca de Service Worker (e o reload que ela dispara)
      // ja pode acontecer sem reiniciar a animacao no meio.
      ProfissionalStartupSplash.#liberarAtualizacaoPwa();
    }, ProfissionalStartupSplash.#FADE_MS);
  }

  /** Avisa o PwaUpdateManager que o boot terminou. Silencioso se ausente. */
  static #liberarAtualizacaoPwa() {
    if (typeof PwaUpdateManager !== 'undefined') PwaUpdateManager.liberarBoot?.();
  }

  static #concluirTagline(overlay) {
    const tagline = overlay.querySelector('.ps-tagline');
    if (!tagline) return;

    let concluida = false;
    const concluir = () => {
      if (concluida) return;
      concluida = true;
      tagline.classList.add('ps-tagline-concluida');
    };

    tagline.addEventListener('animationend', (event) => {
      if (event.animationName === 'psTyping' || event.animationName === 'splashTypingPro') {
        concluir();
      }
    });

    setTimeout(concluir, 2600);
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
        <p class="ps-tagline">BarberFlow Profissional — Seu talento, nossa paixão.</p>
      </div>
    `;
    return overlay;
  }
}
