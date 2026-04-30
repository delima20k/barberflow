'use strict';

// =============================================================
// BarbeariaStatusSync.js — Sincronização em tempo real de status
//
// Responsabilidade única: escutar o evento 'barberflow:statusAtualizado'
// e atualizar todos os badges de status nos cards renderizados no DOM,
// sem re-fetch ao servidor.
//
// Problema resolvido: o evento pode ser disparado enquanto os cards de
// outras telas ainda não existem no DOM (SPA). A solução guarda os
// updates em memória e usa MutationObserver para aplicar nos cards
// assim que eles forem inseridos em qualquer momento futuro.
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
  static #updates      = new Map(); // barbershopId → { isOpen, closeReason }

  static #SELETOR_CARD  = '[data-barbershop-id]';
  static #SELETOR_BADGE = '.dc-badge';

  // ── Inicializa o listener + MutationObserver (idempotente) ─

  static init() {
    if (BarbeariaStatusSync.#inicializado) return;
    BarbeariaStatusSync.#inicializado = true;

    document.addEventListener(
      'barberflow:statusAtualizado',
      e => BarbeariaStatusSync.#onStatusAtualizado(e),
    );

    // Observa adição de novos nós no DOM — aplica updates pendentes
    new MutationObserver(mutations => {
      if (!BarbeariaStatusSync.#updates.size) return;
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          BarbeariaStatusSync.#patchSubtree(node);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  // ── Recebe o evento, persiste e aplica nos cards presentes ─

  static #onStatusAtualizado(e) {
    const { barbershopId, isOpen, closeReason } = e.detail ?? {};
    if (!barbershopId) return;

    const id = String(barbershopId);
    BarbeariaStatusSync.#updates.set(id, {
      isOpen:      !!isOpen,
      closeReason: closeReason ?? null,
    });

    // Aplica imediatamente nos cards que já estão no DOM
    const cards = document.querySelectorAll(
      `${BarbeariaStatusSync.#SELETOR_CARD}[data-barbershop-id="${CSS.escape(id)}"]`,
    );
    for (const card of cards) {
      BarbeariaStatusSync.#patchBadge(card, BarbeariaStatusSync.#updates.get(id));
    }
  }

  // ── Varre subárvore recém-inserida, corrige cards com update pendente ─

  static #patchSubtree(root) {
    // O próprio nó pode ser um card
    if (root.matches?.(BarbeariaStatusSync.#SELETOR_CARD)) {
      const upd = BarbeariaStatusSync.#updates.get(String(root.dataset.barbershopId));
      if (upd) BarbeariaStatusSync.#patchBadge(root, upd);
    }
    // Descendentes
    const cards = root.querySelectorAll?.(BarbeariaStatusSync.#SELETOR_CARD) ?? [];
    for (const card of cards) {
      const upd = BarbeariaStatusSync.#updates.get(String(card.dataset.barbershopId));
      if (upd) BarbeariaStatusSync.#patchBadge(card, upd);
    }
  }

  // ── Aplica label + classe no badge de um card ─────────────

  static #patchBadge(card, { isOpen, closeReason }) {
    const badge = card.querySelector(BarbeariaStatusSync.#SELETOR_BADGE);
    if (!badge) return;

    const sfm = typeof StatusFechamentoModal !== 'undefined' ? StatusFechamentoModal : null;
    const cr  = closeReason ?? null;

    badge.className   = `dc-badge ${sfm
      ? sfm.classBadge(isOpen, cr).replace('bp-badge', 'dc-badge')
      : (isOpen ? 'dc-badge--open' : 'dc-badge--closed')}`;
    badge.textContent = sfm
      ? sfm.labelStatus(isOpen, cr)
      : (isOpen ? 'Aberto' : 'Fechado');
  }
}

BarbeariaStatusSync.init();
