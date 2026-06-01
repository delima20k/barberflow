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
  static MENSALISTA_ID = '__mensalista__';

  // ──────────────────────────────────────────────────────────
  // Exibe a modal de seleção de serviços.
  // @param {object}  opts
  // @param {Array<{id:string, name:string, price:number, duration_min:number}>} opts.servicos
  // @param {string}  opts.clienteNome
  // @param {boolean} [opts.clienteMensalista=false]  — se true, exibe card "Plano Mensal" no topo
  // @param {boolean} [opts.incluirMensalista=false]  — se true, inclui Mensalista como opção da lista
  // @param {number}  [opts.mensalistaFee=0]           — valor mensal do plano (ex: 89.9)
  // @param {number}  [opts.mensalistaCortesCount=0]   — cortes já realizados este mês
  // @returns {Promise<string[]|null>}
  //   null      → cancelado
  //   []        → mensalista (card Plano Mensal clicado)
  //   string[]  → IDs dos serviços selecionados
  // ──────────────────────────────────────────────────
  static abrir({ servicos, clienteNome, clienteMensalista = false, incluirMensalista = false, mensalistaFee = 0, mensalistaCortesCount = 0 }) {
    return new Promise(resolve => {
      const listaServicos = Array.isArray(servicos) ? servicos : [];
      const overlay = document.createElement('div');
      overlay.className = 'crtm-overlay';

      // Modo mensalista: exibe "👑 Plano Mensal" como primeiro item checklist + todos os serviços.
      // Mensalidade não entra no cálculo financeiro (preço = 0).
      if (clienteMensalista) {
        overlay.innerHTML = `
          <div class="crtm-card" role="dialog" aria-modal="true" aria-label="Selecionar cortes (mensalista)">
            <div class="crtm-header">
              <p class="crtm-titulo">Mensalista: <strong>${CorteModal.#escapar(clienteNome)}</strong></p>
              <button class="crtm-fechar" aria-label="Fechar">✕</button>
            </div>
            <ul class="crtm-lista" role="group" aria-label="Plano mensal e serviços"></ul>
            <div class="crtm-footer">
              <p class="crtm-total">Total: <strong class="crtm-total-val">R$ 0,00</strong></p>
              <button class="crtm-btn crtm-btn--confirmar" disabled>Confirmar</button>
              <button class="crtm-btn crtm-btn--cancelar">Cancelar</button>
            </div>
          </div>`;

        const listaEl      = overlay.querySelector('.crtm-lista');
        const confirmarBtn = overlay.querySelector('.crtm-btn--confirmar');
        const totalVal     = overlay.querySelector('.crtm-total-val');

        listaEl.appendChild(CorteModal.#criarItemMensalista({ mensalistaFee, mensalistaCortesCount }));
        listaServicos.forEach(s => listaEl.appendChild(CorteModal.#criarItem(s)));

        const atualizar = () => {
          CorteModal.#sincronizarCortesComPlanoMensal(overlay);
          const selecionados = CorteModal.#getSelecionados(overlay);
          const total = selecionados
            .filter(s => s.id !== CorteModal.MENSALISTA_ID)
            .reduce((acc, s) => acc + (s.price ?? 0), 0);
          totalVal.textContent = CorteModal.#formatarPreco(total);
          confirmarBtn.disabled = selecionados.length === 0;
        };

        listaEl.addEventListener('change', atualizar);

        confirmarBtn.addEventListener('click', () => {
          _fechar(CorteModal.#criarResultado(overlay));
        });

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
        return;
      }

      // Modo normal: lista de serviços avulsos
      overlay.innerHTML = `
        <div class="crtm-card" role="dialog" aria-modal="true" aria-label="Selecionar cortes">
          <div class="crtm-header">
            <p class="crtm-titulo">Cortes para <strong>${CorteModal.#escapar(clienteNome)}</strong></p>
            <button class="crtm-fechar" aria-label="Fechar">✕</button>
          </div>
          <ul class="crtm-lista" role="group" aria-label="Serviços disponíveis">
            ${listaServicos.length || incluirMensalista ? '' : '<li class="crtm-vazio">Nenhum serviço cadastrado.</li>'}
          </ul>
          <div class="crtm-footer">
            <p class="crtm-total">Total: <strong class="crtm-total-val">R$ 0,00</strong></p>
            <button class="crtm-btn crtm-btn--confirmar" disabled>Confirmar</button>
            <button class="crtm-btn crtm-btn--cancelar">Cancelar</button>
          </div>
        </div>`;

      const listaEl      = overlay.querySelector('.crtm-lista');
      const confirmarBtn = overlay.querySelector('.crtm-btn--confirmar');
      const totalVal     = overlay.querySelector('.crtm-total-val');

      [
        ...(incluirMensalista ? [CorteModal.#criarMensalistaItem()] : []),
        ...listaServicos.map(s => CorteModal.#criarItem(s)),
      ].forEach(el => listaEl.appendChild(el));

      const atualizar = () => {
        CorteModal.#sincronizarCortesComPlanoMensal(overlay);
        const selecionados = CorteModal.#getSelecionados(overlay);
        const total = selecionados
          .filter(s => s.id !== CorteModal.MENSALISTA_ID)
          .reduce((acc, s) => acc + (s.price ?? 0), 0);
        totalVal.textContent = CorteModal.#formatarPreco(total);
        confirmarBtn.disabled = selecionados.length === 0;
      };

      listaEl.addEventListener('change', atualizar);

      confirmarBtn.addEventListener('click', () => {
        const ids = CorteModal.#criarResultado(overlay);
        _fechar(ids.length ? ids : null);
      });

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
    chk.dataset.serviceNome  = servico.name ?? '';
    li.dataset.serviceId     = servico.id;
    li.dataset.serviceNome   = servico.name ?? '';

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

  static #criarMensalistaItem() {
    return CorteModal.#criarItem({
      id:           CorteModal.MENSALISTA_ID,
      name:         'Mensalista',
      price:        0,
      duration_min: null,
    });
  }

  /**
   * Cria o item visual "👑 Plano Mensal" para o modo mensalista.
   * Checkbox com dataset.servicePreco = '0' — nunca entra no cálculo financeiro.
   * @param {{mensalistaFee?:number, mensalistaCortesCount?:number}} opts
   * @returns {HTMLLIElement}
   */
  static #criarItemMensalista({ mensalistaFee = 0, mensalistaCortesCount = 0 } = {}) {
    const li = document.createElement('li');
    li.className = 'crtm-item crtm-item--mensalista';

    const id = `crtm-svc-${CorteModal.MENSALISTA_ID}`;

    const chk = document.createElement('input');
    chk.type              = 'checkbox';
    chk.id                = id;
    chk.className         = 'crtm-checkbox';
    chk.dataset.serviceId    = CorteModal.MENSALISTA_ID;
    chk.dataset.servicePreco = '0';
    chk.dataset.serviceNome  = 'Plano Mensal';
    li.dataset.serviceId     = CorteModal.MENSALISTA_ID;
    li.dataset.serviceNome   = 'Plano Mensal';

    const label = document.createElement('label');
    label.htmlFor   = id;
    label.className = 'crtm-label';

    const nomeEl       = document.createElement('span');
    nomeEl.className   = 'crtm-svc-nome';
    nomeEl.textContent = '👑 Plano Mensal';

    const metaEl   = document.createElement('span');
    metaEl.className = 'crtm-svc-meta';
    const partes   = [];
    if (mensalistaFee > 0)
      partes.push(CorteModal.#formatarPreco(mensalistaFee) + '/mês');
    if (mensalistaCortesCount > 0)
      partes.push(`${mensalistaCortesCount} corte${mensalistaCortesCount !== 1 ? 's' : ''} este mês`);
    metaEl.textContent = partes.join(' · ');

    label.appendChild(nomeEl);
    label.appendChild(metaEl);

    const thumb = document.createElement('div');
    thumb.className = 'crtm-img crtm-img--vazio crtm-img--mensalista';

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
   * Oculta e desmarca serviços de corte quando o Plano Mensal está ativo.
   * O corte já está incluído na mensalidade; extras seguem selecionáveis.
   * @param {HTMLElement} overlay
   */
  static #sincronizarCortesComPlanoMensal(overlay) {
    const planoSelecionado = CorteModal.#isPlanoMensalSelecionado(overlay);
    const itens = Array.from(overlay.querySelectorAll('.crtm-item'));
    itens.forEach(item => {
      if (item.dataset.serviceId === CorteModal.MENSALISTA_ID) return;
      if (!CorteModal.#isServicoCorte(item.dataset.serviceNome)) {
        item.hidden = false;
        item.setAttribute?.('aria-hidden', 'false');
        return;
      }

      item.hidden = planoSelecionado;
      item.setAttribute?.('aria-hidden', planoSelecionado ? 'true' : 'false');
      if (planoSelecionado) {
        const chk = item.querySelector('.crtm-checkbox');
        if (chk) chk.checked = false;
      }
    });
  }

  /**
   * Cria o resultado público sem o ID sentinela; mantém metadado não enumerável
   * para o runtime saber que deve tratar o corte como mensalidade.
   * @param {HTMLElement} overlay
   * @returns {string[]}
   */
  static #criarResultado(overlay) {
    const selecionados = CorteModal.#getSelecionados(overlay);
    const ids = selecionados
      .map(s => s.id)
      .filter(id => id !== CorteModal.MENSALISTA_ID);
    Object.defineProperty(ids, 'planoMensalidadeSelecionado', {
      value:        selecionados.some(s => s.id === CorteModal.MENSALISTA_ID),
      enumerable:   false,
      configurable: true,
    });
    return ids;
  }

  /**
   * @param {HTMLElement} overlay
   * @returns {boolean}
   */
  static #isPlanoMensalSelecionado(overlay) {
    return Array.from(overlay.querySelectorAll('.crtm-checkbox:checked'))
      .some(chk => chk.dataset.serviceId === CorteModal.MENSALISTA_ID);
  }

  /**
   * @param {string} nome
   * @returns {boolean}
   */
  static #isServicoCorte(nome) {
    return CorteModal.#normalizarTexto(nome).includes('corte');
  }

  /**
   * @param {string} texto
   * @returns {string}
   */
  static #normalizarTexto(texto) {
    return String(texto ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
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
