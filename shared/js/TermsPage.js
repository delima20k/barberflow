'use strict';

// =============================================================
// TermsPage.js — Página informativa de termos legais.
// Camada: shared / UI
//
// Exibe um overlay full-screen com:
//   • Lei LGPD (Lei 13.709/2018) e direitos do titular
//   • Segurança de dados e controle de acesso
//   • Direitos autorais de conteúdo
//   • Placeholder para direitos autorais musicais (stories)
//
// Acessado via link no rodapé do menu lateral (#btn-ver-termos).
// Disponível nos dois apps (cliente e profissional).
// =============================================================

class TermsPage {

  static #OVERLAY_ID    = 'termos-info-overlay';
  static #BTN_ABRIR_ID  = 'btn-ver-termos';
  static #BTN_FECHAR_ID = 'termos-info-fechar';

  /** Inicializa listeners. Chamado no DOMContentLoaded. */
  static init() {
    document.getElementById(TermsPage.#BTN_ABRIR_ID)
      ?.addEventListener('click', () => TermsPage.abrir());

    document.getElementById(TermsPage.#BTN_FECHAR_ID)
      ?.addEventListener('click', () => TermsPage.fechar());

    // Fecha ao clicar fora do card (no backdrop)
    document.getElementById(TermsPage.#OVERLAY_ID)
      ?.addEventListener('click', e => {
        if (e.target.id === TermsPage.#OVERLAY_ID) TermsPage.fechar();
      });

    // Fecha com tecla Escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') TermsPage.fechar();
    });
  }

  /** Abre o overlay de termos. */
  static abrir() {
    const el = document.getElementById(TermsPage.#OVERLAY_ID);
    if (!el) return;
    el.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
    document.getElementById(TermsPage.#BTN_FECHAR_ID)?.focus();
  }

  /** Fecha o overlay de termos. */
  static fechar() {
    const el = document.getElementById(TermsPage.#OVERLAY_ID);
    if (!el) return;
    el.setAttribute('hidden', '');
    document.body.style.overflow = '';
  }
}

document.addEventListener('DOMContentLoaded', () => TermsPage.init());
