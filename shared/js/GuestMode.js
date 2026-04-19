'use strict';

// =============================================================
// GuestMode.js — Modo visitante: bloqueia visualmente botões
//                de ação que exigem autenticação.
//
// Responsabilidades:
//   - Adicionar .bloqueado nos [data-action] protegidos quando
//     o usuário não estiver logado
//   - Remover .bloqueado quando o usuário fizer login
//   - Reagir automaticamente via AppState.onAuth()
//   - Setar aria-disabled para acessibilidade
//
// Ações bloqueadas para visitantes:
//   agendar | mensagem | pagar | like | barbershop-favorite | pagamento
//
// Integração:
//   new GuestMode();  ← chamado pelo Router no constructor
//
// Dependências: AppState.js (carregado antes)
// =============================================================

class GuestMode {

  /** Seletor de todos os botões de ação protegidos */
  static #SELETOR = [
    '[data-action="agendar"]',
    '[data-action="mensagem"]',
    '[data-action="pagar"]',
    '[data-action="pagamento"]',
    '[data-action="like"]',
    '[data-action="barbershop-favorite"]',
  ].join(',');

  /** @type {MutationObserver|null} */
  #observer = null;

  constructor() {
    // Aplica o estado inicial sincronamente
    this.#sincronizar();

    // Reage a mudanças de login/logout
    if (typeof AppState !== 'undefined') {
      AppState.onAuth(logado => this.#sincronizar(logado));
    }

    // MutationObserver: aplica .bloqueado em botões adicionados dinamicamente
    // (cards carregados via fetch, widgets montados via JS, etc.)
    this.#observer = new MutationObserver(mutations => {
      const temNovosNos = mutations.some(m => m.addedNodes.length > 0);
      if (temNovosNos) this.#sincronizar();
    });
    this.#observer.observe(document.body, { childList: true, subtree: true });
  }

  // ── Privados ──────────────────────────────────────────────

  /**
   * Lê o estado atual de login e aplica/remove .bloqueado em todos os
   * botões de ação protegidos presentes no DOM neste momento.
   * @param {boolean} [logado] — se omitido, lê de AppState
   * @private
   */
  #sincronizar(logado) {
    const estaLogado = logado !== undefined
      ? logado === true
      : (typeof AppState !== 'undefined' ? AppState.get('isLogado') === true : false);

    const botoes = document.querySelectorAll(GuestMode.#SELETOR);
    botoes.forEach(btn => {
      if (estaLogado) {
        btn.classList.remove('bloqueado');
        btn.removeAttribute('aria-disabled');
        btn.removeAttribute('title');
      } else {
        btn.classList.add('bloqueado');
        btn.setAttribute('aria-disabled', 'true');
        btn.setAttribute('title', 'Faça login para usar esta função');
      }
    });
  }

  // ── API pública ───────────────────────────────────────────

  /**
   * Força uma ressincronização manual (useful após renderização dinâmica ou
   * chamado pelo Router._atualizarUI a cada navegação).
   * @returns {void}
   */
  atualizar() {
    this.#sincronizar();
  }

  /**
   * Para o MutationObserver (libera memória quando o app não precisa mais).
   * @returns {void}
   */
  destruir() {
    this.#observer?.disconnect();
    this.#observer = null;
  }
}
