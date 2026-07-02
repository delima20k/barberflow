'use strict';

// =============================================================
// ClienteStartupSplash.js — Splash de abertura do App Cliente
//
// Responsabilidades:
//   - Exibir splash fullscreen na abertura do PWA cliente
//   - Layout: fundo imgFundoSplash, logo cliente, nome do app,
//     animação BarberPole e texto de boas-vindas
//   - Mostrar toda vez que o app é aberto (session-scoped):
//     sessionStorage impede re-exibição em navegação interna
//   - Auto-fecha em 2.5s com fade-out e libera BarberPole da memória
//
// Dependências: BarberPole (shared/js/BarberPole.js)
// =============================================================

class ClienteStartupSplash {

  static #SESSION_KEY = 'bf_splash_shown';
  static #DURATION_MS = 3400;
  static #FADE_MS     = 300;

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO
  // ═══════════════════════════════════════════════════════════

  /**
   * Inicializa o splash.
   * Não exibe se já foi mostrado nesta sessão (navegação interna).
   */
  static init() {
    const overlayInicial = document.getElementById('cliente-startup-splash');
    if (sessionStorage.getItem(ClienteStartupSplash.#SESSION_KEY) && !overlayInicial) return;
    sessionStorage.setItem(ClienteStartupSplash.#SESSION_KEY, '1');
    ClienteStartupSplash.#exibir(overlayInicial);
  }

  /**
   * Limpa o flag de sessão (útil em testes ou após logout forçado).
   */
  static limparSessao() {
    sessionStorage.removeItem(ClienteStartupSplash.#SESSION_KEY);
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO
  // ═══════════════════════════════════════════════════════════

  static #exibir(overlayInicial = null) {
    const overlay = overlayInicial || ClienteStartupSplash.#montarOverlay();
    if (!overlayInicial) document.body.appendChild(overlay);

    // Força reflow antes de animar entrada
    requestAnimationFrame(() => {
      requestAnimationFrame(() => overlay.classList.add('cs-ativo'));
    });

    ClienteStartupSplash.#concluirTagline(overlay);
    setTimeout(() => ClienteStartupSplash.#fechar(overlay), ClienteStartupSplash.#DURATION_MS);
  }

  static #fechar(overlay) {
    overlay.classList.add('cs-saindo');

    setTimeout(() => {
      overlay.remove();
    }, ClienteStartupSplash.#FADE_MS);
  }

  static #concluirTagline(overlay) {
    const tagline = overlay.querySelector('.cs-tagline');
    if (!tagline) return;

    let concluida = false;
    const concluir = () => {
      if (concluida) return;
      concluida = true;
      tagline.classList.add('cs-tagline-concluida');
    };

    tagline.addEventListener('animationend', (event) => {
      if (event.animationName === 'csTyping' || event.animationName === 'splashTypingCliente') {
        concluir();
      }
    });

    setTimeout(concluir, 2900);
  }

  static #montarOverlay() {
    const overlay = document.createElement('div');
    overlay.id        = 'cliente-startup-splash';
    overlay.className = 'cs-overlay';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-label', 'Carregando BarberFlow');

    overlay.innerHTML = `
      <div class="cs-conteudo">
        <img
          class="cs-logo-icon"
          src="/shared/img/Logo01.png"
          alt=""
          aria-hidden="true"
          onerror="this.style.display='none'"
        >
        <img
          class="cs-logo-name"
          src="/shared/img/LogoNomeBarberFlow.png"
          alt="BarberFlow"
          onerror="this.style.display='none'"
        >
        <p class="cs-tagline">BarberFlow — Seu próximo corte, ao alcance de um toque.</p>
      </div>
    `;

    return overlay;
  }
}
