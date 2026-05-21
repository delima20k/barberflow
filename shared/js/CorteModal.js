'use strict';

// =============================================================
// CorteModal.js — Modal de seleção dos serviços do corte.
//
// Responsabilidade ÚNICA: exibir checkboxes dos serviços
// configurados na barbearia e retornar os IDs selecionados.
//
// Uso:
//   const ids = await CorteModal.abrir({ servicos, clienteNome });
//   // ids: string[] | null (cancelado)
//
// Dependências: nenhuma
// =============================================================

class CorteModal {

  // ──────────────────────────────────────────────────────────
  // Exibe a modal de seleção de serviços.
  // @param {object}  opts
  // @param {Array<{id:string, name:string, price:number, duration_min:number}>} opts.servicos
  // @param {string}  opts.clienteNome
  // @param {boolean} [opts.clienteMensalista=false]  — se true, exibe card "Plano Mensal" no topo
  // @param {number}  [opts.mensalistaFee=0]           — valor mensal do plano (ex: 89.9)
  // @param {number}  [opts.mensalistaCortesCount=0]   — cortes já realizados este mês
  // @returns {Promise<string[]|null>}
  //   null      → cancelado
  //   []        → mensalista (card Plano Mensal clicado)
  //   string[]  → IDs dos serviços selecionados
  // ──────────────────────────────────────────────────
  static abrir({ servicos, clienteNome, clienteMensalista = false, mensalistaFee = 0, mensalistaCortesCount = 0 }) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'crtm-overlay';

      overlay.innerHTML = `
        <div class="crtm-card" role="dialog" aria-modal="true" aria-label="Selecionar cortes">
          <div class="crtm-header">
            <p class="crtm-titulo">Cortes para <strong>${CorteModal.#escapar(clienteNome)}</strong></p>
            <button class="crtm-fechar" aria-label="Fechar">✕</button>
          </div>
          <ul class="crtm-lista" role="group" aria-label="Serviços disponíveis">
            ${servicos.length
              ? ''
              : '<li class="crtm-vazio">Nenhum serviço cadastrado.</li>'
            }
          </ul>
          <div class="crtm-footer">
            <p class="crtm-total">Total: <strong class="crtm-total-val">R$ 0,00</strong></p>
            <button class="crtm-btn crtm-btn--confirmar" disabled>Confirmar</button>
            <button class="crtm-btn crtm-btn--cancelar">Cancelar</button>
          </div>
        </div>`;

      const listaEl     = overlay.querySelector('.crtm-lista');
      const confirmarBtn = overlay.querySelector('.crtm-btn--confirmar');
      const totalVal    = overlay.querySelector('.crtm-total-val');

      // Card Plano Mensal (topo da lista) — apenas para mensalistas ativos
      if (clienteMensalista) {
        const feeStr = mensalistaFee > 0
          ? mensalistaFee.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + '/mês'
          : 'sem cobrança adicional';
        const cortesStr = `${mensalistaCortesCount} corte${mensalistaCortesCount !== 1 ? 's' : ''} este mês`;

        const card = document.createElement('li');
        card.className = 'crtm-plano-mensal';
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', 'Usar plano mensal');
        card.innerHTML = `
          <span class="crtm-plano-mensal-icone">👑</span>
          <span class="crtm-plano-mensal-info">
            <span class="crtm-plano-mensal-titulo">Plano Mensal — ${CorteModal.#escapar(feeStr)}</span>
            <span class="crtm-plano-mensal-cortes">${CorteModal.#escapar(cortesStr)}</span>
          </span>`;
        card.addEventListener('click', () => _fechar([]));
        card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') _fechar([]); });
        listaEl.insertBefore(card, listaEl.firstChild);
      }

      // Cria itens de serviço
      const itens = servicos.map(s => CorteModal.#criarItem(s));
      itens.forEach(el => listaEl.appendChild(el));

      // Atualiza total e estado do botão ao mudar seleção
      const atualizar = () => {
        const selecionados = CorteModal.#getSelecionados(overlay);
        const total = selecionados.reduce((acc, s) => acc + (s.price ?? 0), 0);
        totalVal.textContent = CorteModal.#formatarPreco(total);
        confirmarBtn.disabled = selecionados.length === 0;
      };

      listaEl.addEventListener('change', atualizar);

      // Confirmar
      confirmarBtn.addEventListener('click', () => {
        const ids = CorteModal.#getSelecionados(overlay).map(s => s.id);
        _fechar(ids.length ? ids : null);
      });

      // Cancelar e fechamento externo
      overlay.querySelector('.crtm-btn--cancelar').addEventListener('click', () => _fechar(null));
      overlay.querySelector('.crtm-fechar').addEventListener('click',         () => _fechar(null));
      overlay.addEventListener('click', e => { if (e.target === overlay) _fechar(null); });
      const onKey = e => { if (e.key === 'Escape') _fechar(null); };
      document.addEventListener('keydown', onKey);

      function _fechar(resultado) {
        document.removeEventListener('keydown', onKey);
        overlay.classList.add('crtm-overlay--saindo');
        setTimeout(() => overlay.remove(), 220);
        resolve(resultado);
      }

      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('crtm-overlay--visivel'));
    });
  }

  // ── Privados ────────────────────────────────────────────────

  /**
   * Cria um <li> com checkbox para um serviço.
   * @param {{id:string, name:string, price:number, duration_min:number}} servico
   * @returns {HTMLLIElement}
   */
  static #criarItem(servico) {
    const li = document.createElement('li');
    li.className = 'crtm-item';

    const id = `crtm-svc-${servico.id}`;

    const chk = document.createElement('input');
    chk.type             = 'checkbox';
    chk.id               = id;
    chk.className        = 'crtm-checkbox';
    chk.dataset.serviceId    = servico.id;
    chk.dataset.servicePreco = String(servico.price ?? 0);

    const label = document.createElement('label');
    label.htmlFor = id;
    label.className = 'crtm-label';

    const nomeEl       = document.createElement('span');
    nomeEl.className   = 'crtm-svc-nome';
    nomeEl.textContent = servico.name;

    const metaEl       = document.createElement('span');
    metaEl.className   = 'crtm-svc-meta';
    const partes = [];
    if (servico.price != null)        partes.push(CorteModal.#formatarPreco(servico.price));
    if (servico.duration_min != null) partes.push(`${servico.duration_min} min`);
    metaEl.textContent = partes.join(' · ');

    label.appendChild(nomeEl);
    label.appendChild(metaEl);

    const thumb = document.createElement('div');
    thumb.className = 'crtm-img';
    if (servico.image_path) {
      const img = document.createElement('img');
      img.src     = servico.image_path;
      img.alt     = servico.name ?? '';
      img.loading = 'lazy';
      img.addEventListener('error', () => { thumb.classList.add('crtm-img--vazio'); img.remove(); });
      thumb.appendChild(img);
    } else {
      thumb.classList.add('crtm-img--vazio');
    }

    li.appendChild(chk);
    li.appendChild(thumb);
    li.appendChild(label);
    return li;
  }

  /**
   * Retorna os dados dos serviços marcados.
   * @param {HTMLElement} overlay
   * @returns {{id:string, price:number}[]}
   */
  static #getSelecionados(overlay) {
    return Array.from(overlay.querySelectorAll('.crtm-checkbox:checked'))
      .map(chk => ({
        id:    chk.dataset.serviceId,
        price: parseFloat(chk.dataset.servicePreco) || 0,
      }));
  }

  /**
   * Formata número como moeda BRL.
   * @param {number} valor
   * @returns {string}
   */
  static #formatarPreco(valor) {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  /**
   * Escapa texto para inserção segura em innerHTML.
   * @param {string} str
   * @returns {string}
   */
  static #escapar(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
