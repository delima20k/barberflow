'use strict';

// =============================================================
// BarbeariaStatusSync.js — Sincronização em tempo real de status
//
// Propaga mudanças de status de barbearia (is_open / close_reason)
// para todos os badges presentes no DOM — cards da home, destaques
// e barbearias (dc-badge) e página de detalhe (bp-badge) — sem
// re-fetch ao servidor.
//
// Canais de comunicação (em ordem de alcance):
//   1. CustomEvent 'barberflow:statusAtualizado'
//      → mesmo documento (ação direta na aba corrente)
//   2. BroadcastChannel 'barberflow-status'
//      → mesma origem, abas/documentos distintos no mesmo navegador
//   3. Supabase Realtime (postgres_changes em barbershops)
//      → qualquer dispositivo / navegador na mesma rede Supabase
//
// Dependências: StatusFechamentoModal.js, SupabaseService.js
// =============================================================

class BarbeariaStatusSync {

  static #inicializado  = false;
  static #updates       = new Map(); // barbershopId → { isOpen, closeReason }
  static #bcChannel     = null;      // BroadcastChannel (canal 2)
  static #realtimeCanal = null;      // Supabase RealtimeChannel (canal 3)

  static #SELETOR_CARD  = '[data-barbershop-id]';
  static #SELETOR_BADGE = '.dc-badge';

  // ── Inicializa todos os canais (idempotente) ───────────────

  static init() {
    if (BarbeariaStatusSync.#inicializado) return;
    BarbeariaStatusSync.#inicializado = true;

    // Canal 1 — CustomEvent no mesmo documento
    document.addEventListener(
      'barberflow:statusAtualizado',
      e => BarbeariaStatusSync.#onEventLocal(e),
    );

    // Canal 2 — BroadcastChannel: outras abas/documentos na mesma origem
    if (typeof BroadcastChannel !== 'undefined') {
      BarbeariaStatusSync.#bcChannel = new BroadcastChannel('barberflow-status');
      BarbeariaStatusSync.#bcChannel.onmessage =
        e => BarbeariaStatusSync.#aplicarUpdate(e.data);
    }

    // Canal 3 — Supabase Realtime: qualquer dispositivo
    BarbeariaStatusSync.#assinarRealtime();

    // MutationObserver — aplica updates em nós inseridos após o evento
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

  // ── Canal 1: CustomEvent (mesmo documento) ────────────────

  static #onEventLocal(e) {
    const data = e.detail ?? {};
    BarbeariaStatusSync.#aplicarUpdate(data);
    // Propaga para outras abas/documentos na mesma origem (canal 2)
    BarbeariaStatusSync.#bcChannel?.postMessage(data);
  }

  // ── Canal 3: Supabase Realtime ────────────────────────────

  static #assinarRealtime() {
    try {
      BarbeariaStatusSync.#realtimeCanal = SupabaseService
        .channel('barberflow-barbershops-status')
        .on('postgres_changes', {
          event:  'UPDATE',
          schema: 'public',
          table:  'barbershops',
        }, payload => {
          const { id, is_open, close_reason } = payload.new ?? {};
          if (!id) return;
          BarbeariaStatusSync.#aplicarUpdate({
            barbershopId: id,
            isOpen:       !!is_open,
            closeReason:  close_reason ?? null,
          });
        })
        .subscribe();
    } catch (_) {
      // SupabaseService indisponível — funciona via CustomEvent + BroadcastChannel
    }
  }

  // ── Core: persiste + atualiza todos os badges no DOM ──────

  static #aplicarUpdate({ barbershopId, isOpen, closeReason }) {
    if (!barbershopId) return;

    const id  = String(barbershopId);
    const upd = { isOpen: !!isOpen, closeReason: closeReason ?? null };
    BarbeariaStatusSync.#updates.set(id, upd);

    // Cards com dc-badge (home / destaques / barbearias)
    const cards = document.querySelectorAll(
      `${BarbeariaStatusSync.#SELETOR_CARD}[data-barbershop-id="${CSS.escape(id)}"]`,
    );
    for (const card of cards) BarbeariaStatusSync.#patchBadge(card, upd);

    // Badges da página de detalhe bp-badge (BarbeariaPage)
    BarbeariaStatusSync.#patchBarbeariaPage(id, upd);
  }

  // ── Atualiza badges #bp-badge / #bp-capa-status ───────────
  // Lê data-barbershop-id do botão de favoritar dentro de #tela-barbearia
  // para identificar qual barbearia está ativa na tela de detalhe.

  static #patchBarbeariaPage(id, upd) {
    const tela = document.getElementById('tela-barbearia');
    if (!tela) return;

    // O favBtn é o único [data-barbershop-id] dentro da tela de detalhe
    const indicador = tela.querySelector(BarbeariaStatusSync.#SELETOR_CARD);
    if (!indicador || indicador.dataset.barbershopId !== id) return;

    const sfm        = typeof StatusFechamentoModal !== 'undefined' ? StatusFechamentoModal : null;
    const cr         = upd.closeReason ?? null;
    const badgeClass = sfm
      ? sfm.classBadge(upd.isOpen, cr)
      : (upd.isOpen ? 'bp-badge--open' : 'bp-badge--closed');
    const badgeLabel = sfm
      ? sfm.labelStatus(upd.isOpen, cr)
      : (upd.isOpen ? 'Aberta' : 'Fechada');

    const badge      = document.getElementById('bp-badge');
    const capaStatus = document.getElementById('bp-capa-status');

    if (badge) {
      badge.textContent = badgeLabel;
      badge.className   = `bp-badge ${badgeClass}`;
    }
    if (capaStatus) {
      capaStatus.textContent = badgeLabel;
      capaStatus.className   = `bp-capa-status bp-badge ${badgeClass}`;
      capaStatus.hidden      = false;
    }
  }

  // ── MutationObserver: corrige cards inseridos com update pendente ─

  static #patchSubtree(root) {
    if (root.matches?.(BarbeariaStatusSync.#SELETOR_CARD)) {
      const upd = BarbeariaStatusSync.#updates.get(String(root.dataset.barbershopId));
      if (upd) BarbeariaStatusSync.#patchBadge(root, upd);
    }
    const cards = root.querySelectorAll?.(BarbeariaStatusSync.#SELETOR_CARD) ?? [];
    for (const card of cards) {
      const upd = BarbeariaStatusSync.#updates.get(String(card.dataset.barbershopId));
      if (upd) BarbeariaStatusSync.#patchBadge(card, upd);
    }
  }

  // ── Aplica label + classe no dc-badge de um card ──────────

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
