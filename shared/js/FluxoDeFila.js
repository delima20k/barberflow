'use strict';

// =============================================================
// FluxoDeFila.js — Motor de modais push reutilizável.
//
// Responsabilidade ÚNICA: criar e gerenciar modais push no body
// do documento com animação de entrada/saída, som opcional e
// resolução de Promise ao clicar em qualquer ação.
//
// Padrão para toda modal push do BarberFlow. Para criar um novo
// tipo de modal, basta instanciar com nova configuração:
//
//   const resp = await FluxoDeFila.abrir({
//     titulo:  'Título',
//     corpo:   'Texto (HTML pré-escapado)',
//     acoes:   [{ label: 'Sim', valor: 'sim', variante: 'primario' }],
//     tocarSom: true,
//   });
//   // resp: valor da ação clicada, ou null se fecharBtn=true e ✕ clicado
//
// Uso por instância:
//   const modal = new FluxoDeFila({ ... });
//   const resp  = await modal.abrir();
//
// Variantes de botão: 'primario' | 'secundario' | 'perigo' | 'neutro'
//
// ATENÇÃO SEGURANÇA: o campo `corpo` é inserido como innerHTML.
// O chamador DEVE escapar todo conteúdo dinâmico antes de passar.
// Use FluxoDeFila.escapar() para escapar partes dinâmicas.
//
// Dependências: QueuePoller (opcional — som)
// =============================================================

class FluxoDeFila {

  // ── Estado da instância ─────────────────────────────────────
  #config;

  /**
   * @param {object}       config
   * @param {string}       [config.id]             — id do overlay (evita duplicatas)
   * @param {string}       [config.icone='💈']     — emoji ou URL de imagem
   * @param {boolean}      [config.iconeImagem]    — true quando icone é URL de imagem
   * @param {object}       [config.iconesDuplos]   — { app: urlStr, barbearia: urlStr|null }
   *                                                  substitui fdf-icone por layout duplo
   * @param {string}       config.titulo
   * @param {string}       config.corpo            — HTML pré-escapado; pode conter <strong>
   * @param {Array}        config.acoes            — [{label, valor, variante}]
   * @param {boolean}      [config.fecharBtn]      — exibe botão ✕ (resolve null)
   * @param {boolean}      [config.tocarSom=false] — toca chime ao abrir
   */
  constructor(config) {
    this.#config = config;
  }

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO — instância
  // ═══════════════════════════════════════════════════════════

  /** @returns {Promise<string|null>} */
  abrir() {
    return FluxoDeFila.#criar(this.#config);
  }

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO — estático
  // ═══════════════════════════════════════════════════════════

  /** @returns {Promise<string|null>} */
  static abrir(config) {
    return FluxoDeFila.#criar(config);
  }

  /**
   * Escapa uma string para uso seguro como texto em HTML.
   * Utilitário para callers construírem o campo `corpo`.
   * @param {string} str
   * @returns {string}
   */
  static escapar(str) {
    return FluxoDeFila.#escapar(str);
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO
  // ═══════════════════════════════════════════════════════════

  static #criar(config) {
    return new Promise(resolve => {
      const {
        id,
        icone        = '/shared/img/Logo01.png',
        iconeImagem  = true,
        iconesDuplos = null,
        titulo       = '',
        corpo        = '',
        acoes        = [],
        fecharBtn    = false,
        tocarSom     = false,
      } = config;

      // Remove overlay duplicado com mesmo id
      if (id) {
        const existente = document.getElementById(id);
        if (existente) {
          if (typeof existente._fdfResolve === 'function') existente._fdfResolve(null);
          existente.remove();
        }
      }

      if (tocarSom) FluxoDeFila.#som();

      // ── Estrutura DOM ───────────────────────────────────────
      const overlay = document.createElement('div');
      overlay.className = 'fdf-overlay';
      if (id) overlay.id = id;
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', titulo);

      const card = document.createElement('div');
      card.className = 'fdf-card';

      // Botão ✕ (opcional)
      if (fecharBtn) {
        const btnFechar = document.createElement('button');
        btnFechar.className = 'fdf-fechar';
        btnFechar.setAttribute('aria-label', 'Fechar');
        btnFechar.textContent = '✕';
        btnFechar.addEventListener('click', () => fechar(null));
        card.appendChild(btnFechar);
      }

      // Ícone — duplo ou simples
      const iconeEl = document.createElement('div');
      iconeEl.setAttribute('aria-hidden', 'true');

      // Só renderiza <img> quando `icone` é de fato uma URL/caminho de imagem.
      // Se for um emoji (ex.: '🏠', '💈'), renderiza como TEXTO — senão o
      // navegador tentava carregar <img src="🏠"> e batia GET /🏠 → 404 em loop.
      if (iconesDuplos) {
        iconeEl.className = 'fdf-icone-duplo';
        iconeEl.innerHTML = FluxoDeFila.#buildIconesDuplos(iconesDuplos);
      } else if (iconeImagem && FluxoDeFila.#ehImagem(icone)) {
        iconeEl.className = 'fdf-icone';
        const img = document.createElement('img');
        img.className = 'fdf-icone-img';
        img.setAttribute('src', FluxoDeFila.#escaparAttr(icone));
        img.setAttribute('alt', '');
        img.setAttribute('onerror', "this.parentElement.textContent='💈'");
        iconeEl.appendChild(img);
      } else {
        iconeEl.className = 'fdf-icone';
        iconeEl.textContent = icone;
      }

      // Título
      const tituloEl = document.createElement('p');
      tituloEl.className = 'fdf-titulo';
      tituloEl.textContent = titulo;

      // Corpo — HTML pré-escapado pelo chamador
      const corpoEl = document.createElement('p');
      corpoEl.className = 'fdf-corpo';
      corpoEl.innerHTML = corpo;

      // Ações
      const acoesEl = document.createElement('div');
      acoesEl.className = 'fdf-acoes';

      const fechar = (valor) => {
        document.removeEventListener('keydown', onKey);
        overlay.classList.add('fdf-overlay--saindo');
        setTimeout(() => overlay.remove(), 220);
        resolve(valor);
      };

      // Referência para remoção de duplicatas futuras
      overlay._fdfResolve = fechar;

      acoes.forEach(({ label, valor, variante = 'primario' }) => {
        const btn = document.createElement('button');
        btn.className = `fdf-btn fdf-btn--${variante}`;
        btn.setAttribute('data-fdf-valor', String(valor ?? ''));
        btn.textContent = label;
        btn.addEventListener('click', () => fechar(valor));
        acoesEl.appendChild(btn);
      });

      card.appendChild(iconeEl);
      card.appendChild(tituloEl);
      card.appendChild(corpoEl);
      card.appendChild(acoesEl);
      overlay.appendChild(card);

      const onKey = (e) => {
        if (e.key === 'Escape' && fecharBtn) fechar(null);
      };
      document.addEventListener('keydown', onKey);

      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('fdf-overlay--visivel'));
    });
  }

  static #som() {
    if (typeof QueuePoller !== 'undefined' && typeof QueuePoller.tocarSom === 'function') {
      try { QueuePoller.tocarSom(); } catch (_) {}
    }
  }

  static #escapar(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * `icone` é uma URL/caminho de imagem? (senão é emoji/texto e não deve virar
   * <img>). Cobre http(s), data:, blob:, caminho absoluto e extensões de imagem.
   * @param {*} v
   * @returns {boolean}
   */
  static #ehImagem(v) {
    return typeof v === 'string'
      && (/^(https?:\/\/|data:|blob:|\/)/.test(v)
          || /\.(png|jpe?g|svg|webp|gif|avif)(\?|$)/i.test(v));
  }

  static #escaparAttr(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Gera o HTML interno do layout de ícone duplo (app + barbearia).
   * @param {{ app: string, barbearia: string|null }} param
   * @returns {string}
   */
  static #buildIconesDuplos({ app, barbearia }) {
    const appSrc  = FluxoDeFila.#escaparAttr(app);
    const barbSrc = barbearia ? FluxoDeFila.#escaparAttr(barbearia) : null;

    const barbEl = barbSrc
      ? `<img class="fdf-icone-duplo__img fdf-icone-duplo__img--barbearia" src="${barbSrc}" alt="" onerror="this.style.display='none';this.nextElementSibling.hidden=false">`
        + `<span class="fdf-icone-duplo__emoji" aria-hidden="true" hidden>💈</span>`
      : `<span class="fdf-icone-duplo__emoji" aria-hidden="true">💈</span>`;

    return `<img class="fdf-icone-duplo__img fdf-icone-duplo__img--app" src="${appSrc}" alt="">`
      + `<span class="fdf-icone-duplo__seta" aria-hidden="true"><span>&#8594;</span><span>&#8592;</span></span>`
      + barbEl;
  }
}
