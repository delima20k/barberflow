'use strict';

// =============================================================
// HeaderScrollBehavior.js — Ocultar/exibir header ao rolar
// Compartilhado entre app cliente e app profissional
//
// Comportamento:
//   - Ao rolar uma tela registrada para BAIXO: quando o topo de
//     seu .stories-scroll tocar o header, o header sobe (oculta).
//   - Ao rolar para CIMA: o header desce de volta.
//
// Uso:
//   HeaderScrollBehavior.init();   // chamar no AppBootstrap
// =============================================================

class HeaderScrollBehavior {

  // ── Configuração ──────────────────────────────────────────
  static #THRESHOLD_PX = 0;   // dispara exatamente ao tocar o header

  // ── Estado global (header é único) ────────────────────────
  static #header = null;
  static #oculto = false;

  // ── Telas registradas: Map<telaEl, { storiesEl, ultimoScroll }> ──
  static #telas = new Map();

  // ── API pública ───────────────────────────────────────────

  /**
   * Inicializa o comportamento.
   * Registra automaticamente as telas conhecidas se existirem no DOM.
   */
  static init() {
    HeaderScrollBehavior.#header = document.getElementById('app-header');
    if (!HeaderScrollBehavior.#header) return;

    // tela-inicio com .stories-scroll (primeiro filho, não o mb-)
    HeaderScrollBehavior.#tentarRegistrar(
      'tela-inicio',
      '#tela-inicio .stories-scroll:not(.mb-stories-scroll)'
    );

    // tela-minha-barbearia com .mb-stories-scroll
    HeaderScrollBehavior.#tentarRegistrar(
      'tela-minha-barbearia',
      '.mb-stories-scroll'
    );

    HeaderScrollBehavior.#bindNavEvent();
  }

  // ── Privados ──────────────────────────────────────────────

  static #tentarRegistrar(telaId, storiesSelector) {
    const tela = document.getElementById(telaId);
    if (!tela) return;

    const storiesEl    = document.querySelector(storiesSelector) ?? null;
    const ultimoScroll = tela.scrollTop;
    HeaderScrollBehavior.#telas.set(tela, { storiesEl, ultimoScroll });

    tela.addEventListener('scroll', () => HeaderScrollBehavior.#aoRolar(tela), { passive: true });
  }

  static #bindNavEvent() {
    document.addEventListener('barberflow:tela-entrando', () => HeaderScrollBehavior.#exibir());
  }

  static #aoRolar(tela) {
    const estado      = HeaderScrollBehavior.#telas.get(tela);
    const scrollAtual = tela.scrollTop;
    const baixo       = scrollAtual > estado.ultimoScroll;
    estado.ultimoScroll = scrollAtual;

    if (baixo) {
      HeaderScrollBehavior.#verificarOcultar(estado.storiesEl);
    } else {
      HeaderScrollBehavior.#exibir();
    }
  }

  static #verificarOcultar(storiesEl) {
    if (HeaderScrollBehavior.#oculto) return;
    if (!storiesEl) {
      HeaderScrollBehavior.#ocultar();
      return;
    }
    const headerBaixo = HeaderScrollBehavior.#header.getBoundingClientRect().bottom;
    const storiesTop  = storiesEl.getBoundingClientRect().top;
    if (storiesTop - headerBaixo <= HeaderScrollBehavior.#THRESHOLD_PX) {
      HeaderScrollBehavior.#ocultar();
    }
  }

  static #ocultar() {
    HeaderScrollBehavior.#oculto = true;
    HeaderScrollBehavior.#header.classList.add('header--oculto');
  }

  static #exibir() {
    if (!HeaderScrollBehavior.#oculto) return;
    HeaderScrollBehavior.#oculto = false;
    HeaderScrollBehavior.#header.classList.remove('header--oculto');
  }
}
