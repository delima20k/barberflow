'use strict';

// =============================================================
// ClienteLandingGate.js — Gate de entrada do App Cliente
//
// Responsabilidades:
//   - Exibir overlay de entrada para usuários não autenticados
//   - Oferecer "Explorar" (preview livre) ou "Entrar / Cadastrar"
//   - Persistir escolha na sessionStorage para evitar re-exibição
//
// Uso:
//   ClienteLandingGate.init()        → chamado pelo AppBootstrap
//   ClienteLandingGate.irParaHome()  → botão "Explorar"
//   ClienteLandingGate.irParaLogin() → botão "Entrar / Cadastrar"
// =============================================================

class ClienteLandingGate {

  static #EL_ID       = 'cliente-landing-gate';
  static #PREVIEW_KEY = 'bf_cliente_preview';
  static #SPLASH_KEY  = 'bf_cliente_splash';

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO
  // ═══════════════════════════════════════════════════════════

  static init() {
    if (sessionStorage.getItem(ClienteLandingGate.#PREVIEW_KEY) === '1') return;
    if (ClienteLandingGate.#temSessaoAtiva()) return;

    const primeiroAcesso = !sessionStorage.getItem(ClienteLandingGate.#SPLASH_KEY);
    if (primeiroAcesso && typeof SplashService !== 'undefined') {
      sessionStorage.setItem(ClienteLandingGate.#SPLASH_KEY, '1');
      SplashService.exibir('CLIENTE', () => ClienteLandingGate.#mostrar());
    } else {
      ClienteLandingGate.#mostrar();
    }
  }

  static irParaHome() {
    sessionStorage.setItem(ClienteLandingGate.#PREVIEW_KEY, '1');
    ClienteLandingGate.#fechar();
  }

  static irParaLogin() {
    ClienteLandingGate.#fechar(() => {
      if (typeof App !== 'undefined') App.nav('login');
    });
  }

  static limparPreview() {
    sessionStorage.removeItem(ClienteLandingGate.#PREVIEW_KEY);
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO
  // ═══════════════════════════════════════════════════════════

  static #mostrar() {
    const el = document.getElementById(ClienteLandingGate.#EL_ID);
    if (!el) return;
    el.style.display = 'flex';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.classList.add('gate-ativo');
        const polo = el.querySelector('#clg-polo');
        if (polo && typeof BarberPole !== 'undefined') new BarberPole(polo);
      });
    });
  }

  static #fechar(onFim) {
    const el = document.getElementById(ClienteLandingGate.#EL_ID);
    if (!el) { onFim?.(); return; }
    el.classList.remove('gate-ativo');
    el.classList.add('gate-saindo');
    setTimeout(() => {
      el.style.display = 'none';
      el.classList.remove('gate-saindo');
      onFim?.();
    }, 340);
  }

  static #temSessaoAtiva() {
    try {
      return Object.keys(localStorage).some(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
    } catch {
      return false;
    }
  }
}
