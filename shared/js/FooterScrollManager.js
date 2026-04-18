'use strict';

// =============================================================
// FooterScrollManager.js — Visibilidade inteligente do footer
// Compartilhado entre app cliente e app profissional
//
// Responsabilidades:
//   - Ocultar footer ao rolar ≥ 30% da viewport
//   - Exibir dica animada (gota) quando footer oculto
//   - Reavaliar estado ao trocar de tela (MutationObserver)
//   - Reiniciar ciclo da dica ao voltar para o início
//
// Uso:
//   FooterScrollManager.init();           // chamar no DOMContentLoaded
//   FooterScrollManager.abrirPorBotao();  // botão gota (onclick no HTML)
// =============================================================

class FooterScrollManager {

  // ── Constantes ────────────────────────────────────────────
  static #THRESHOLD_PC   = 0.30;   // 30% da viewport para ocultar footer
  static #COOLDOWN_MS    = 3000;   // cooldown após abrir pelo botão
  static #DICA_INTERVALO = 3000;   // espera entre dicas (ms)
  static #DICA_DURACAO   = 2500;   // tempo de exibição de cada dica (ms)
  static #DICA_MAX       = 3;      // máximo de dicas por sessão na home

  // ── Estado ────────────────────────────────────────────────
  static #footers    = [];
  static #btn        = null;
  static #dicaEl     = null;
  static #oculto     = false;
  static #cooldown   = false;
  static #timer      = null;
  static #dicaCount  = 0;
  static #timerDica  = null;

  // ── Inicialização ─────────────────────────────────────────

  /**
   * Inicializa o gerenciador. Deve ser chamado uma vez no DOMContentLoaded.
   */
  static init() {
    this.#footers = ['footer-nav', 'footer-nav-offline']
      .map(id => document.getElementById(id))
      .filter(Boolean);
    this.#btn    = document.getElementById('btn-abrir-footer');
    this.#dicaEl = document.getElementById('footer-dica');

    // Escuta scroll em TODAS as telas — ignora inativas via #ehTelaAtiva
    document.querySelectorAll('.tela').forEach(tela => {
      tela.addEventListener('scroll', () => this.#avaliar(tela), { passive: true });
    });

    // MutationObserver: quando o Router troca .ativa, reavalia o footer imediatamente
    document.querySelectorAll('.tela').forEach(tela => {
      new MutationObserver(() => this.#aoMudarTela())
        .observe(tela, { attributes: true, attributeFilter: ['class'] });
    });

    // Reinicia contador da dica ao clicar em "início" no footer
    document.querySelectorAll('.nav-btn[data-tela="inicio"]').forEach(btn => {
      btn.addEventListener('click', () => this.#resetarDica());
    });
  }

  // ── Público ───────────────────────────────────────────────

  /**
   * Botão gota: reabre footer com cooldown para evitar oscilação imediata.
   */
  static abrirPorBotao() {
    this.#exibir();
    this.#cooldown = true;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => { this.#cooldown = false; }, this.#COOLDOWN_MS);
  }

  // ── Privados ──────────────────────────────────────────────

  /** Retorna a tela ativa no momento (home se nenhuma tela tem .ativa). */
  static #ehTelaAtiva(tela) {
    const ativa = document.querySelector('.tela.ativa');
    return ativa ? ativa === tela : tela.id === 'tela-inicio';
  }

  /** Chamado pelo MutationObserver ao mudar classe em qualquer .tela. */
  static #aoMudarTela() {
    const ativa    = document.querySelector('.tela.ativa');
    const telaTopo = ativa ?? document.getElementById('tela-inicio');
    if (!telaTopo) return;
    this.#avaliar(telaTopo);
    if (!ativa) this.#resetarDica(); // voltou para o início → reseta dica
  }

  /** Avalia posição de scroll e decide estado do footer. */
  static #avaliar(tela) {
    if (!this.#ehTelaAtiva(tela)) return;
    if (this.#cooldown) return;
    const limiar = window.innerHeight * this.#THRESHOLD_PC;
    if (tela.scrollTop > limiar && !this.#oculto) {
      this.#ocultar();
    } else if (tela.scrollTop <= limiar && this.#oculto) {
      this.#exibir();
    }
  }

  static #ocultar() {
    this.#oculto = true;
    this.#footers.forEach(f => f.classList.add('oculto'));
    this.#btn?.classList.add('visivel');
    this.#agendarDica();
  }

  static #exibir() {
    this.#oculto = false;
    this.#footers.forEach(f => f.classList.remove('oculto'));
    this.#btn?.classList.remove('visivel');
    this.#pararDica();
  }

  // ── Ciclo de dica ─────────────────────────────────────────

  static #agendarDica() {
    if (!this.#oculto || this.#dicaCount >= this.#DICA_MAX || !this.#dicaEl) return;
    clearTimeout(this.#timerDica);
    this.#timerDica = setTimeout(() => this.#ciclarDica(), this.#DICA_INTERVALO);
  }

  static #ciclarDica() {
    if (!this.#oculto || this.#dicaCount >= this.#DICA_MAX || !this.#dicaEl) return;

    this.#dicaEl.classList.remove('animando', 'visivel');
    void this.#dicaEl.offsetWidth; // reflow para reiniciar animação CSS
    this.#dicaEl.classList.add('visivel', 'animando');
    this.#dicaEl.setAttribute('aria-hidden', 'false');
    this.#dicaCount++;

    this.#timerDica = setTimeout(() => {
      this.#dicaEl.classList.remove('visivel', 'animando');
      this.#dicaEl.setAttribute('aria-hidden', 'true');
      this.#agendarDica();
    }, this.#DICA_DURACAO);
  }

  static #pararDica() {
    clearTimeout(this.#timerDica);
    if (!this.#dicaEl) return;
    this.#dicaEl.classList.remove('visivel', 'animando');
    this.#dicaEl.setAttribute('aria-hidden', 'true');
  }

  static #resetarDica() {
    this.#dicaCount = 0;
    this.#pararDica();
  }
}
