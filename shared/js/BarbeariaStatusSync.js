'use strict';

// =============================================================
// BarbeariaStatusSync.js — Sincronização em tempo real de status
//
// Responsabilidade única: escutar o evento 'barberflow:statusAtualizado'
// e atualizar todos os badges de status nos cards renderizados no DOM,
// sem re-fetch ao servidor.
//
// Evento esperado:
//   CustomEvent('barberflow:statusAtualizado', {
//     detail: { barbershopId: string, isOpen: boolean, closeReason: string|null }
//   })
//
// Dependências: StatusFechamentoModal.js (carregado antes)
// =============================================================

class BarbeariaStatusSync {

  static #inicializado = false;

  // ── Seletor dos cards no DOM ──────────────────────────────
  static #SELETOR_CARD  = '[data-barbershop-id]';
  static #SELETOR_BADGE = '.dc-badge';

  // ── Inicializa o listener (idempotente) ───────────────────

  static init() {
    if (BarbeariaStatusSync.#inicializado) return;
    BarbeariaStatusSync.#inicializado = true;
    document.addEventListener(
      'barberflow:statusAtualizado',
      e => BarbeariaStatusSync.#onStatusAtualizado(e),
    );
  }

  // ── Handler privado ───────────────────────────────────────

  static #onStatusAtualizado(e) {
    const { barbershopId, isOpen, closeReason } = e.detail ?? {};
    if (!barbershopId) return;

    const cards = document.querySelectorAll(
      `${BarbeariaStatusSync.#SELETOR_CARD}[data-barbershop-id="${CSS.escape(String(barbershopId))}"]`,
    );

    if (!cards.length) return;

    const sfm = typeof StatusFechamentoModal !== 'undefined' ? StatusFechamentoModal : null;
    const cr  = closeReason ?? null;

    const novaClasse = sfm
      ? sfm.classBadge(isOpen, cr).replace('bp-badge', 'dc-badge')
      : (isOpen ? 'dc-badge--open' : 'dc-badge--closed');

    const novoTexto = sfm
      ? sfm.labelStatus(isOpen, cr)
      : (isOpen ? 'Aberto' : 'Fechado');

    cards.forEach(card => {
      const badge = card.querySelector(BarbeariaStatusSync.#SELETOR_BADGE);
      if (!badge) return;
      badge.className   = `dc-badge ${novaClasse}`;
      badge.textContent = novoTexto;
    });
  }
}

BarbeariaStatusSync.init();
