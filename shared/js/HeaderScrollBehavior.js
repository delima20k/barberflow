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
  static #header      = null;
  static #oculto      = false;
  static #inicializado = false;

  // ── Telas registradas: Map<telaEl, { storiesEl, ultimoScroll }> ──
  static #telas = new Map();

  // ── API pública ───────────────────────────────────────────

  /**
   * Inicializa o comportamento.
   * Registra automaticamente as telas conhecidas se existirem no DOM.
   */
  static init() {
    if (HeaderScrollBehavior.#inicializado) return;
    HeaderScrollBehavior.#inicializado = true;

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
    document.addEventListener('barberflow:tela-entrando', (e) =>
      HeaderScrollBehavior.#exibir(e.detail?.dur ?? 350)
    );
  }

  static #aoRolar(tela) {
    const estado = HeaderScrollBehavior.#telas.get(tela);
    if (!estado) return;
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
    const header = HeaderScrollBehavior.#header;
    const anims  = header.getAnimations();

    if (anims.length) {
      // WAAPI de reveal em curso — lê posição visual atual, cancela e esconde
      // com WAAPI próprio (inline style quebraria a cascata CSS)
      const m       = new DOMMatrix(getComputedStyle(header).transform);
      const headerH = header.offsetHeight || 1;
      const curPct  = (m.m42 / headerH) * 100;
      anims.forEach(a => a.cancel());
      header.classList.add('header--oculto');
      const a = header.animate(
        [
          { transform: `translateY(${curPct.toFixed(1)}%)` },
          { transform: 'translateY(-110%)' },
        ],
        { duration: 250, easing: 'cubic-bezier(0.4,0,0.2,1)', fill: 'forwards' }
      );
      a.onfinish = () => a.cancel();
    } else {
      // Estado de repouso — transição CSS cuida tudo
      header.classList.add('header--oculto');
    }
  }

  static #exibir(dur = 350) {
    if (!HeaderScrollBehavior.#oculto) return;
    HeaderScrollBehavior.#oculto = false;

    const header = HeaderScrollBehavior.#header;
    header.getAnimations().forEach(a => a.cancel());
    header.classList.remove('header--oculto');

    if (dur < 16) return;  // distância residual insignificante

    const anim = header.animate(
      [{ transform: 'translateY(-110%)' }, { transform: 'translateY(0)' }],
      { duration: dur, easing: 'cubic-bezier(0.4,0,0.2,1)', fill: 'forwards' }
    );
    anim.onfinish = () => anim.cancel();
  }
}
