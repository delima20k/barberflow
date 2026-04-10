'use strict';

// =============================================================
// LogoutScreen.js — Controla a tela de confirmação de saída
//
// Responsabilidades (POO):
//   1. Executa o logout via AuthService
//   2. Anima o footer logado saindo pela DIREITA
//   3. Faz a tela-sair sair pela DIREITA
//   4. Mostra o footer deslogado entrando pela ESQUERDA junto com a home
//
// Integração:
//   - App.confirmarSaida() / Pro.confirmarSaida() — chamado pelo botão da tela
//   - Definido em Router.js como método público
// =============================================================

class LogoutScreen {

  // Duração base das animações em ms
  static #DUR_FOOTER = 380;
  static #DUR_TELA   = 480;
  static #EASE       = 'cubic-bezier(0.4,0,0.2,1)';

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO
  // ═══════════════════════════════════════════════════════════

  /**
   * Pipeline completo do logout:
   *   tela-sair → sai DIREITA
   *   footer logado → sai DIREITA  (simultâneo)
   *   AuthService.logout()          (ao fim da animação)
   *   footer deslogado → entra ESQUERDA
   *
   * @param {Router} router — instância App ou Pro
   */
  static async executar(router) {
    const telaSair      = document.getElementById('tela-sair');
    const footerLogado  = document.getElementById('footer-nav');
    const footerOffline = document.getElementById('footer-nav-offline');

    // ── Fase 1: ativa o estado visual "saindo" no ícone ────────────────────
    LogoutScreen._ativarIconeSaindo();

    // ── Fase 2: tela-sair + footer logado saem pela DIREITA ────────────────
    await Promise.all([
      LogoutScreen._animarSaindoDireita(telaSair,     LogoutScreen.#DUR_TELA),
      LogoutScreen._animarSaindoDireita(footerLogado, LogoutScreen.#DUR_FOOTER),
    ]);

    // ── Fase 3: executa o logout real ─────────────────────────────────────
    await AuthService.logout();

    // ── Fase 4: reseta Router para home deslogado ──────────────────────────
    router._logado     = false;
    router._telaAtual  = 'inicio';
    router._historico  = [];

    // ── Fase 5: garante que home está visível por baixo ────────────────────
    document.querySelectorAll('.tela').forEach(t => {
      t.classList.remove('ativa', 'entrando-lento', 'saindo', 'saindo-direita');
      t.style.display       = '';
      t.style.pointerEvents = '';
      t.style.transform     = '';
    });

    // ── Fase 6: atualiza nav buttons ──────────────────────────────────────
    document.querySelectorAll('.nav-btn').forEach(btn =>
      btn.classList.toggle('ativo', btn.dataset.tela === 'inicio')
    );
    document.querySelectorAll('.menu-nav-item[data-tela]').forEach(item =>
      item.classList.toggle('ativo', item.dataset.tela === 'inicio')
    );
    AuthService._renderizarMenu(false);

    // ── Fase 7: footer deslogado entra pela ESQUERDA ───────────────────────
    LogoutScreen._mostrarFooterOffline(footerOffline);
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO
  // ═══════════════════════════════════════════════════════════

  /** Pisca o ícone central sinalizando que o logout está em andamento */
  static _ativarIconeSaindo() {
    const icone = document.querySelector('.sair-icone-btn');
    if (!icone) return;
    icone.disabled = true;
    icone.classList.add('saindo-confirm');
  }

  /**
   * Anima um elemento saindo pela DIREITA (translateX → +100%).
   * Retorna Promise que resolve quando a animação termina.
   * @param {HTMLElement|null} el
   * @param {number} dur — duração em ms
   */
  static _animarSaindoDireita(el, dur) {
    return new Promise(resolve => {
      if (!el || el.style.display === 'none') { resolve(); return; }

      el.getAnimations().forEach(a => a.cancel());
      el.style.pointerEvents = 'none';

      const a = el.animate(
        [
          { transform: 'translateX(0%)'   },
          { transform: 'translateX(100%)' }
        ],
        { duration: dur, easing: LogoutScreen.#EASE, fill: 'both' }
      );

      a.onfinish = () => {
        a.cancel();
        el.style.display       = 'none';
        el.style.pointerEvents = '';
        el.style.transform     = '';
        resolve();
      };
    });
  }

  /**
   * Mostra o footer deslogado entrando pela ESQUERDA (-100% → 0%).
   * @param {HTMLElement|null} el
   */
  static _mostrarFooterOffline(el) {
    if (!el) return;

    // Prepara fora da tela à esquerda
    el.style.display   = 'flex';
    el.style.transform = 'translateX(-100%)';
    void el.offsetWidth; // força reflow

    const a = el.animate(
      [
        { transform: 'translateX(-100%)' },
        { transform: 'translateX(0%)'    }
      ],
      { duration: LogoutScreen.#DUR_FOOTER, easing: LogoutScreen.#EASE, fill: 'both' }
    );

    a.onfinish = () => {
      a.cancel();
      el.style.transform = '';
    };
  }
}
