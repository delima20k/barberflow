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

    // tela-inicio com .stories-scroll (não o mb-)
    // somentePrimeiroPlano=true porque tela-inicio tem z-index:1 permanente e
    // pode receber eventos de scroll por inércia atrás de outras telas.
    HeaderScrollBehavior.#tentarRegistrar(
      'tela-inicio',
      '#tela-inicio .stories-scroll:not(.mb-stories-scroll)',
      { somentePrimeiroPlano: true }
    );

    HeaderScrollBehavior.#bindNavEvent();
  }

  // ── Privados ──────────────────────────────────────────────

  /**
   * @param {string}  telaId
   * @param {string}  storiesSelector
   * @param {object}  [opts]
   * @param {boolean} [opts.somentePrimeiroPlano=false] — ignora scroll quando outra
   *   tela estiver em primeiro plano (útil para telas com z-index:1 permanente).
   */
  static #tentarRegistrar(telaId, storiesSelector, { somentePrimeiroPlano = false } = {}) {
    const tela = document.getElementById(telaId);
    if (!tela) return;

    const storiesEl    = document.querySelector(storiesSelector);
    const ultimoScroll = tela.scrollTop;
    HeaderScrollBehavior.#telas.set(tela, { storiesEl, ultimoScroll, somentePrimeiroPlano });

    tela.addEventListener('scroll', () => HeaderScrollBehavior.#aoRolar(tela), { passive: true });
  }

  static #bindNavEvent() {
    document.addEventListener('barberflow:tela-entrando', () => {
      // Header sempre revela na velocidade própria (não herda a duração da tela),
      // evitando o gap de 0–64px visível durante animações lentas de carrossel.
      HeaderScrollBehavior.#exibir(200);
      // Atualiza linha de base de scroll de todas as telas registradas para
      // evitar comparação falsa na primeira rolagem após re-entrar em uma
      // tela com posição de scroll preservada.
      for (const [tela, estado] of HeaderScrollBehavior.#telas) {
        estado.ultimoScroll = tela.scrollTop;
      }
    });
  }

  static #aoRolar(tela) {
    const estado = HeaderScrollBehavior.#telas.get(tela);
    if (!estado) return;

    // Telas com somentePrimeiroPlano=true ficam atrás de outras (z-index:1) e
    // podem receber eventos de scroll por inércia. Ignorar nesses casos.
    if (estado.somentePrimeiroPlano &&
        document.querySelector('.tela.ativa, .tela.entrando-lento')) return;

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
    const header = HeaderScrollBehavior.#header;
    if (!header) return;
    // Sincroniza o flag com o estado CSS para cobrir dessincronizações
    // (ex: classe adicionada externamente sem atualizar #oculto).
    const visualmenteOculto = HeaderScrollBehavior.#oculto ||
                              header.classList.contains('header--oculto');
    if (!visualmenteOculto) return;
    HeaderScrollBehavior.#oculto = false;

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
