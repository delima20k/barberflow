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
  static #DURATION_MS = 2500;
  static #FADE_MS     = 450;

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO
  // ═══════════════════════════════════════════════════════════

  /**
   * Inicializa o splash.
   * Não exibe se já foi mostrado nesta sessão (navegação interna).
   */
  static init() {
    if (sessionStorage.getItem(ClienteStartupSplash.#SESSION_KEY)) return;
    sessionStorage.setItem(ClienteStartupSplash.#SESSION_KEY, '1');
    ClienteStartupSplash.#exibir();
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

  static #exibir() {
    const overlay = ClienteStartupSplash.#montarOverlay();
    document.body.appendChild(overlay);

    // Força reflow antes de animar entrada
    requestAnimationFrame(() => {
      requestAnimationFrame(() => overlay.classList.add('cs-ativo'));
    });

    const poloContainer = overlay.querySelector('#cs-polo');
    let pole = null;

    if (typeof BarberPole !== 'undefined' && poloContainer) {
      pole = new BarberPole(poloContainer);
    }

    setTimeout(() => ClienteStartupSplash.#fechar(overlay, pole), ClienteStartupSplash.#DURATION_MS);
  }

  static #fechar(overlay, pole) {
    overlay.classList.add('cs-saindo');

    setTimeout(() => {
      pole?.destruir();
      overlay.remove();
    }, ClienteStartupSplash.#FADE_MS);
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
          class="cs-logo"
          src="assets/img/logoCliente.png"
          alt="BarberFlow Cliente"
          onerror="this.style.display='none'"
        >
        <p class="cs-nome">BarberFlow</p>
        <div class="cs-polo-wrap"><div id="cs-polo"></div></div>
        <p class="cs-boas-vindas">Bem-vindo ao BarberFlow Cliente</p>
      </div>
    `;

    return overlay;
  }
}
