'use strict';

// =============================================================
// FinancasPage.js — Tela "Finanças" do app profissional.
//
// Disponível para barbeiro autônomo (pro_type='barbeiro') e
// barbeiro com barbearia (pro_type='barbearia').
//
// Estado atual: stub — estrutura preparada para receber
//   relatórios de ganhos, comissões e extrato financeiro.
//
// Dependências: AuthService, AppState, LoggerService
// =============================================================

class FinancasPage {

  #telaEl    = null;
  #contentEl = null;

  constructor() {}

  /** Chame uma vez após o DOM estar disponível. */
  bind() {
    this.#telaEl    = document.getElementById('tela-financas');
    this.#contentEl = document.getElementById('financas-content');
    if (!this.#telaEl) return;

    new MutationObserver(() => {
      const ativa = this.#telaEl.classList.contains('ativa') ||
                    this.#telaEl.classList.contains('entrando-lento');
      if (ativa) this.#aoEntrar();
    }).observe(this.#telaEl, { attributes: true, attributeFilter: ['class'] });
  }

  // ═══════════════════════════════════════════════════════════
  // ENTRADA NA TELA
  // ═══════════════════════════════════════════════════════════

  #aoEntrar() {
    // Ponto de expansão: chamar módulos de relatório, extrato, etc.
    // Ex: this.#carregarResumo();
  }
}
