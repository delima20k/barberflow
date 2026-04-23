'use strict';

// =============================================================
// GuardaIten.js — Gaveta animada que esconde/revela elementos
//
// Comportamento:
//  • Exibe uma barra (traço) dourada/marrom no rodapé de uma seção.
//  • Lado esquerdo: texto de estado (aberto/fechado).
//  • Lado direito: botão toggle (+Abrir / −Fechar ↑).
//  • Ao ABRIR: barra cresce da direita para a esquerda,
//    texto esquerdo desaparece letra a letra,
//    conteúdo desce de dentro da barra.
//  • Ao FECHAR: conteúdo sobe, barra encolhe, texto esquerdo retorna.
//
// Uso:
//   new GuardaIten(document.getElementById('meu-wrapper'), {
//     txtEsqFechado:  'Mostrar Botões',
//     txtEsqAberto:   'Fechar Botões',
//     txtDirFechado:  '+Abrir',
//     txtDirAberto:   '−Fechar',
//     elementoOculto: document.querySelector('.minha-div'),
//   });
//
// HTML esperado no wrapper:
//   <div class="gi-wrapper" id="meu-wrapper">
//     <div class="gi-header">
//       <span class="gi-txt-esq"></span>
//       <div  class="gi-barra"></div>
//       <button class="gi-toggle" type="button"></button>
//     </div>
//     <div class="gi-conteudo">
//       <!-- elemento oculto injetado aqui -->
//     </div>
//   </div>
// =============================================================

class GuardaIten {

  // ── Configuração padrão ──────────────────────────────────
  static DEFAULTS = {
    txtEsqFechado:  'Mostrar',
    txtEsqAberto:   'Fechar',
    txtDirFechado:  '+Abrir',
    txtDirAberto:   '−Fechar',
    elementoOculto: null,
    durBarra:       520,   // ms — crescimento da barra
    durConteudo:    340,   // ms — slide do conteúdo
    durLetra:       28,    // ms por letra (apagar/restaurar)
  };

  #wrapper       = null;
  #txtEsqEl      = null;
  #barraEl       = null;
  #toggleEl      = null;
  #setaEl        = null;
  #conteudoEl    = null;
  #aberto        = false;
  #animando      = false;
  #cfg           = {};

  /**
   * @param {HTMLElement} wrapper — elemento com class="gi-wrapper"
   * @param {object}      opts    — configurações (ver DEFAULTS)
   */
  constructor(wrapper, opts = {}) {
    if (!wrapper) return;
    this.#cfg = { ...GuardaIten.DEFAULTS, ...opts };

    this.#wrapper   = wrapper;
    this.#txtEsqEl  = wrapper.querySelector('.gi-txt-esq');
    this.#barraEl   = wrapper.querySelector('.gi-barra');
    this.#toggleEl  = wrapper.querySelector('.gi-toggle');
    this.#setaEl    = wrapper.querySelector('.gi-seta');
    this.#conteudoEl = wrapper.querySelector('.gi-conteudo');

    this.#init();
  }

  // ── Inicialização ────────────────────────────────────────

  #init() {
    // Estado inicial: fechado
    this.#setState(false, /* imediato */ true);

    // Mover elementoOculto para o conteúdo
    const el = this.#cfg.elementoOculto;
    if (el && this.#conteudoEl && el.parentElement !== this.#conteudoEl) {
      this.#conteudoEl.appendChild(el);
    }

    this.#toggleEl?.addEventListener('click', () => this.alternar());
  }

  // ── API pública ──────────────────────────────────────────

  /** Abre ou fecha a gaveta. */
  alternar() {
    if (this.#animando) return;
    this.#aberto ? this.fechar() : this.abrir();
  }

  /** Abre a gaveta com animação. */
  abrir() {
    if (this.#aberto || this.#animando) return;
    this.#animando = true;

    const { durBarra, durConteudo, durLetra } = this.#cfg;

    // 1) Barra cresce (direita → esquerda)
    this.#barraEl?.classList.add('gi-barra--aberta');

    // 2) Texto esquerdo desaparece letra a letra (da direita para a esquerda)
    this.#apagarTexto(this.#txtEsqEl, durLetra);

    // 3) Após barra expandir, revelar conteúdo
    setTimeout(() => {
      if (this.#conteudoEl) {
        this.#conteudoEl.classList.add('gi-conteudo--aberto');
      }
      // 4) Após conteúdo aparecer, atualizar textos
      setTimeout(() => {
        this.#setState(true);
        this.#animando = false;
      }, durConteudo);
    }, durBarra);
  }

  /** Fecha a gaveta com animação. */
  fechar() {
    if (!this.#aberto || this.#animando) return;
    this.#animando = true;

    const { durBarra, durConteudo, durLetra } = this.#cfg;

    // 1) Esconder conteúdo
    if (this.#conteudoEl) {
      this.#conteudoEl.classList.remove('gi-conteudo--aberto');
    }

    // 2) Após conteúdo subir, barra encolhe
    setTimeout(() => {
      this.#barraEl?.classList.remove('gi-barra--aberta');

      // 3) Restaurar texto esquerdo letra a letra
      setTimeout(() => {
        this.#restaurarTexto(this.#txtEsqEl, this.#cfg.txtEsqFechado, durLetra);
        this.#setState(false);
        this.#animando = false;
      }, durBarra * 0.3);
    }, durConteudo);
  }

  // ── Internos ─────────────────────────────────────────────

  /** Define estado visual imediato (sem animação). */
  #setState(aberto, imediato = false) {
    this.#aberto = aberto;

    if (this.#toggleEl) {
      this.#toggleEl.textContent = aberto
        ? this.#cfg.txtDirAberto
        : this.#cfg.txtDirFechado;
    }
    if (this.#setaEl) {
      this.#setaEl.hidden = !aberto;
    }
    if (aberto && this.#txtEsqEl) {
      this.#txtEsqEl.textContent = this.#cfg.txtEsqAberto;
    } else if (!aberto && imediato && this.#txtEsqEl) {
      this.#txtEsqEl.textContent = this.#cfg.txtEsqFechado;
    }
  }

  /** Apaga o texto de um elemento letra a letra (da direita para a esquerda). */
  #apagarTexto(el, durLetra) {
    if (!el) return;
    const original = el.textContent;
    let len = original.length;
    const apagar = () => {
      if (len <= 0) { el.textContent = ''; return; }
      len--;
      el.textContent = original.slice(0, len);
      setTimeout(apagar, durLetra);
    };
    setTimeout(apagar, durLetra);
  }

  /** Restaura o texto de um elemento letra a letra. */
  #restaurarTexto(el, texto, durLetra) {
    if (!el) return;
    el.textContent = '';
    let i = 0;
    const digitar = () => {
      if (i > texto.length) return;
      el.textContent = texto.slice(0, i);
      i++;
      setTimeout(digitar, durLetra);
    };
    digitar();
  }
}
