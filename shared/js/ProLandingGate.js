'use strict';

// =============================================================
// ProLandingGate.js — Gate de entrada do App Profissional
//
// Responsabilidades:
//   - Exibir overlay de entrada para usuários não autenticados
//   - Oferecer "Entrar na Home Pro" (preview livre) ou "Cadastrar"
//   - Persistir escolha na sessionStorage para evitar re-exibição
//   - Redirecionar para o fluxo de planos ao cadastrar
//
// Uso:
//   ProLandingGate.init()  → chamado no DOMContentLoaded
//   ProLandingGate.irParaPreview()   → botão "Home Pro"
//   ProLandingGate.irParaCadastro()  → botão "Cadastrar"
// =============================================================

class ProLandingGate {

  static #EL_ID       = 'landing-gate';
  static #PREVIEW_KEY = 'bf_preview'; // sessionStorage key
  static #SPLASH_KEY  = 'bf_splash';  // sessionStorage key — splash já exibido

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO
  // ═══════════════════════════════════════════════════════════

  /**
   * Inicializa o gate.
   * Pula exibição se o usuário já está logado OU preview já ativo.
   */
  static init() {
    // Se preview já escolhido nesta sessão → não exibe
    if (sessionStorage.getItem(ProLandingGate.#PREVIEW_KEY) === '1') return;

    // Se já há sessão Supabase ativa → não exibe
    if (ProLandingGate.#temSessaoAtiva()) return;

    // Primeiro acesso na sessão → exibe splash antes do gate
    const primeiroAcesso = !sessionStorage.getItem(ProLandingGate.#SPLASH_KEY);
    if (primeiroAcesso && typeof SplashService !== 'undefined') {
      sessionStorage.setItem(ProLandingGate.#SPLASH_KEY, '1');
      SplashService.exibir('PROFISSIONAL', () => ProLandingGate.#mostrar());
    } else {
      ProLandingGate.#mostrar();
    }
  }

  /**
   * Usuário escolheu explorar sem cadastro.
   * Salva flag de preview e fecha o gate.
   */
  static irParaPreview() {
    sessionStorage.setItem(ProLandingGate.#PREVIEW_KEY, '1');
    ProLandingGate.#fechar();
  }

  /**
   * Usuário quer se cadastrar.
   * Fecha o gate e redireciona para a seleção de tipo de usuário.
   */
  static irParaCadastro() {
    ProLandingGate.#fechar(() => {
      // Pro é a instância global definida em app.js
      if (typeof Pro !== 'undefined') Pro.push('planos-pro');
    });
  }

  /**
   * Limpa o flag de preview (útil após logout).
   */
  static limparPreview() {
    sessionStorage.removeItem(ProLandingGate.#PREVIEW_KEY);
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO
  // ═══════════════════════════════════════════════════════════

  static #mostrar() {
    const el = document.getElementById(ProLandingGate.#EL_ID);
    if (!el) return;
    el.style.display = 'flex';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.classList.add('gate-ativo');
        // Inicializa BarberPole dentro do card
        const polo = el.querySelector('#lg-polo');
        if (polo && typeof BarberPole !== 'undefined') new BarberPole(polo);
      });
    });
  }

  static #fechar(onFim) {
    const el = document.getElementById(ProLandingGate.#EL_ID);
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
    // Verifica cache leve de sessão sem chamada de rede
    try {
      const keys = Object.keys(localStorage);
      return keys.some(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
    } catch {
      return false;
    }
  }
}
