'use strict';

// =============================================================
// ClienteSeletorModal.js — Modal de seleção de cliente.
//
// Responsabilidade ÚNICA: exibir favoritos da barbearia/barbeiro
// (carregados internamente via API) e permitir busca global por
// nome/email com paginação offset-based, retornando o selecionado
// via Promise.
//
// Uso:
//   const cliente = await ClienteSeletorModal.abrir({
//     barbershopId,
//     professionalId,
//     excluirIds,      // Set<string> opcional — IDs a omitir
//   });
//   // cliente: { id, full_name, avatar_path } | null (cancelado)
//
// Dependências:
//   CadeiraService.js    — getClientesFavoritos()
//   BackendApiService.js — searchUsers()
//   SupabaseService.js   — resolveAvatarUrl() (opcional)
// =============================================================

class ClienteSeletorModal {

  // ── Constantes ────────────────────────────────────────────
  static #DEBOUNCE_MS   = 350;
  static #PAGE_SIZE     = 20;
  static #MIN_TERM_LEN  = 2;

  // ── Estado estático por sessão de modal aberta ────────────
  // Apenas uma modal pode estar aberta de cada vez.
  static #abortCtrl        = null;   // AbortController da busca em andamento
  static #favoritosCache   = [];     // favoritos carregados na abertura
  static #offset           = 0;     // offset da página atual de busca
  static #totalResultados  = 0;     // total retornado pelo backend (para paginação)
  static #listaEl          = null;  // referência ao <ul> corrente
  static #labelEl          = null;  // referência ao <p> de label corrente
  static #excluirIds       = null;  // Set<string> corrente
  static #termoCorrente    = '';    // termo em uso (para append na próx. página)
  static #barbershopId     = '';
  static #professionalId   = '';

  // ─────────────────────────────────────────────────────────
  // PUBLIC: abrir()
  //
  // @param {object} opts
  // @param {string}      opts.barbershopId
  // @param {string}      opts.professionalId
  // @param {Set<string>} [opts.excluirIds=new Set()]
  // @returns {Promise<{id,full_name,avatar_path}|null>}
  // ─────────────────────────────────────────────────────────
  static abrir({ barbershopId, professionalId, excluirIds = new Set() } = {}) {
    // Validação de entrada — falha rápida antes de qualquer chamada de rede
    ClienteSeletorModal.#validarUuid(barbershopId,   'barbershopId');
    ClienteSeletorModal.#validarUuid(professionalId, 'professionalId');

    // Inicializa estado da sessão
    ClienteSeletorModal.#favoritosCache  = [];
    ClienteSeletorModal.#offset          = 0;
    ClienteSeletorModal.#totalResultados = 0;
    ClienteSeletorModal.#excluirIds      = excluirIds;
    ClienteSeletorModal.#termoCorrente   = '';
    ClienteSeletorModal.#barbershopId    = barbershopId;
    ClienteSeletorModal.#professionalId  = professionalId;

    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'csm-overlay';

      overlay.innerHTML = `
        <div class="csm-card" role="dialog" aria-modal="true" aria-label="Selecionar cliente">
          <div class="csm-header">
            <p class="csm-titulo">Selecionar cliente</p>
            <button class="csm-fechar" aria-label="Fechar">✕</button>
          </div>
          <input class="csm-busca" type="search"
                 placeholder="Buscar por nome ou e-mail…"
                 autocomplete="off" minlength="2" />
          <p class="csm-secao-label" id="csm-label">Carregando favoritos…</p>
          <ul class="csm-lista" role="listbox" aria-label="Clientes"></ul>
        </div>`;

      const listaEl  = overlay.querySelector('.csm-lista');
      const buscaEl  = overlay.querySelector('.csm-busca');
      const labelEl  = overlay.querySelector('#csm-label');

      // Guarda referências no estado estático para uso em buscarParaTeste()
      ClienteSeletorModal.#listaEl = listaEl;
      ClienteSeletorModal.#labelEl = labelEl;

      // ── Skeleton de loading inicial ────────────────────────
      ClienteSeletorModal.#renderLoading(listaEl);

      // ── Carrega favoritos via API ─────────────────────────
      CadeiraService.getClientesFavoritos(barbershopId, professionalId)
        .then(lista => {
          const filtrados = (lista ?? []).filter(c => !excluirIds.has(c.id));
          ClienteSeletorModal.#favoritosCache = filtrados;
          labelEl.textContent = 'Favoritos da barbearia';
          ClienteSeletorModal.#renderLista(listaEl, filtrados, 'Nenhum favorito ainda. Use a busca acima.', false);
        })
        .catch(() => {
          labelEl.textContent = 'Favoritos';
          ClienteSeletorModal.#renderVazio(listaEl, 'Não foi possível carregar favoritos. Use a busca acima.');
        });

      // ── Delegação de clique na lista (itens + "Ver mais") ──
      listaEl.addEventListener('click', e => {
        // Clicar em "Ver mais"
        const verMaisBtn = e.target.closest('.csm-ver-mais-btn');
        if (verMaisBtn) {
          ClienteSeletorModal.#carregarMais(listaEl, labelEl, excluirIds);
          return;
        }
        // Clicar em item de cliente
        const item = e.target.closest('[data-cliente-id]');
        if (!item) return;
        _fechar({
          id:          item.dataset.clienteId,
          full_name:   item.dataset.clienteNome,
          avatar_path: item.dataset.clienteAvatar || null,
        });
      });

      // ── Busca com debounce ────────────────────────────────
      let _timer = null;
      buscaEl.addEventListener('input', () => {
        clearTimeout(_timer);
        const termo = buscaEl.value.trim();

        if (termo.length < ClienteSeletorModal.#MIN_TERM_LEN) {
          // Input curto → cancela busca pendente e restaura favoritos
          ClienteSeletorModal.#abortCtrl?.abort();
          ClienteSeletorModal.#abortCtrl = null;
          ClienteSeletorModal.#termoCorrente = '';
          labelEl.textContent = 'Favoritos da barbearia';
          ClienteSeletorModal.#renderLista(listaEl, ClienteSeletorModal.#favoritosCache, 'Nenhum favorito ainda. Use a busca acima.', false);
          return;
        }

        // Novo termo → reseta paginação
        ClienteSeletorModal.#offset          = 0;
        ClienteSeletorModal.#totalResultados = 0;
        ClienteSeletorModal.#termoCorrente   = termo;
        labelEl.textContent = 'Buscando…';

        _timer = setTimeout(() => {
          ClienteSeletorModal.#executarBusca(termo, excluirIds, 0, listaEl, labelEl, false);
        }, ClienteSeletorModal.#DEBOUNCE_MS);
      });

      // ── Fechar ────────────────────────────────────────────
      overlay.querySelector('.csm-fechar').addEventListener('click', () => _fechar(null));
      overlay.addEventListener('click', e => { if (e.target === overlay) _fechar(null); });
      const onKey = e => { if (e.key === 'Escape') _fechar(null); };
      document.addEventListener('keydown', onKey);

      function _fechar(resultado) {
        clearTimeout(_timer);
        ClienteSeletorModal.#abortCtrl?.abort();
        ClienteSeletorModal.#abortCtrl = null;
        ClienteSeletorModal.#listaEl   = null;
        ClienteSeletorModal.#labelEl   = null;
        document.removeEventListener('keydown', onKey);
        overlay.classList.add('csm-overlay--saindo');
        setTimeout(() => overlay.remove(), 220);
        resolve(resultado);
      }

      document.body.appendChild(overlay);
      requestAnimationFrame(() => {
        overlay.classList.add('csm-overlay--visivel');
        buscaEl.focus();
      });
    });
  }

  // ─────────────────────────────────────────────────────────
  // PUBLIC (apenas testes): buscarParaTeste()
  //
  // Expõe a lógica de busca paginada para testes unitários sem DOM
  // completo. Em produção o fluxo normal é via debounce no input.
  //
  // @param {string}      termo
  // @param {Set<string>} excluirIds
  // @param {number}      offset
  // @param {string}      barbershopId
  // @param {string}      professionalId
  // @returns {Promise<void>}
  // ─────────────────────────────────────────────────────────
  static async buscarParaTeste(termo, excluirIds, offset, barbershopId, professionalId) {
    ClienteSeletorModal.#barbershopId   = barbershopId   ?? ClienteSeletorModal.#barbershopId;
    ClienteSeletorModal.#professionalId = professionalId ?? ClienteSeletorModal.#professionalId;
    ClienteSeletorModal.#excluirIds     = excluirIds     ?? ClienteSeletorModal.#excluirIds ?? new Set();
    ClienteSeletorModal.#termoCorrente  = termo;

    const listaEl = ClienteSeletorModal.#listaEl;
    const labelEl = ClienteSeletorModal.#labelEl;

    await ClienteSeletorModal.#executarBusca(termo, excluirIds, offset, listaEl, labelEl, offset > 0);
  }

  // ── Privados ────────────────────────────────────────────────

  /**
   * Dispara a busca, atualiza a lista e gerencia paginação.
   * @param {string}       termo
   * @param {Set<string>}  excluirIds
   * @param {number}       offset
   * @param {Element|null} listaEl
   * @param {Element|null} labelEl
   * @param {boolean}      append — true = adiciona ao final; false = substitui
   */
  static async #executarBusca(termo, excluirIds, offset, listaEl, labelEl, append) {
    // Cancela requisição anterior apenas em nova query (não no "Ver mais")
    if (!append) {
      ClienteSeletorModal.#abortCtrl?.abort();
      ClienteSeletorModal.#abortCtrl = new AbortController();
    }
    const signal = ClienteSeletorModal.#abortCtrl?.signal;

    const { itens, total, erro } = await ClienteSeletorModal.#buscarPaginado(
      termo, excluirIds, offset, signal,
    );

    if (erro) {
      if (erro.name === 'AbortError') return; // cancelado pelo usuário — silencia
      if (labelEl) labelEl.textContent = 'Erro na busca';
      if (listaEl) ClienteSeletorModal.#renderVazio(listaEl, 'Erro ao buscar. Tente novamente.');
      return;
    }

    ClienteSeletorModal.#totalResultados = total;
    ClienteSeletorModal.#offset          = offset;

    const itensMostrados = append
      ? (listaEl ? ClienteSeletorModal.#contarItens(listaEl) : 0) + itens.length
      : itens.length;

    if (labelEl) {
      labelEl.textContent = itensMostrados > 0
        ? `${itensMostrados} resultado${itensMostrados !== 1 ? 's' : ''}`
        : 'Nenhum resultado';
    }

    if (append && listaEl) {
      // Remove botão "Ver mais" anterior antes de adicionar novos itens
      const verMaisAnterior = listaEl.querySelector?.('.csm-ver-mais');
      verMaisAnterior?.remove?.();
      itens.forEach(c => listaEl.appendChild(ClienteSeletorModal.#criarItem(c)));
    } else {
      ClienteSeletorModal.#renderLista(listaEl, itens, 'Nenhum resultado.', false);
    }

    // Adiciona "Ver mais" se há mais resultados além do que já está exibido
    const totalExibidosAgora = listaEl ? ClienteSeletorModal.#contarItens(listaEl) : 0;
    if (totalExibidosAgora < total && listaEl && itens.length > 0) {
      listaEl.appendChild(ClienteSeletorModal.#criarVerMais());
    }
  }

  /**
   * Chama BackendApiService.searchUsers e normaliza o retorno.
   * @returns {Promise<{ itens: Array, total: number, erro: Error|null }>}
   */
  static async #buscarPaginado(termo, excluirIds, offset, signal) {
    const { data, error } = await BackendApiService.searchUsers(termo, {
      barbershopId:   ClienteSeletorModal.#barbershopId,
      professionalId: ClienteSeletorModal.#professionalId,
      limit:          ClienteSeletorModal.#PAGE_SIZE,
      offset,
      signal,
    });

    if (error) return { itens: [], total: 0, erro: error };

    // Backend retorna { dados: [], total: N } ou diretamente o array
    const lista = data?.dados ?? data ?? [];
    const total = typeof data?.total === 'number' ? data.total : lista.length;

    const itens = lista
      .filter(p => !excluirIds.has(p.id))
      .map(p => ({
        id:          p.id,
        full_name:   p.full_name   ?? 'Usuário',
        avatar_path: p.avatar_path ?? null,
        updated_at:  p.updated_at  ?? null,
      }));

    return { itens, total, erro: null };
  }

  /**
   * Conta os itens csm-item dentro da lista (exclui skeletons e ver-mais).
   */
  static #contarItens(listaEl) {
    return listaEl?.querySelectorAll?.('.csm-item')?.length ?? 0;
  }

  /**
   * Renderiza skeleton de loading (3 linhas placeholder).
   */
  static #renderLoading(listaEl) {
    if (!listaEl) return;
    listaEl.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const li = document.createElement('li');
      li.className = 'csm-item-skeleton';
      li.setAttribute('aria-hidden', 'true');
      listaEl.appendChild(li);
    }
  }

  /**
   * Renderiza lista de itens — substitui conteúdo anterior (append=false)
   * ou acrescenta ao final (append=true).
   */
  static #renderLista(listaEl, itens, msgVazio, append) {
    if (!listaEl) return;
    if (!append) listaEl.innerHTML = '';
    if (!itens.length) {
      ClienteSeletorModal.#renderVazio(listaEl, msgVazio);
      return;
    }
    itens.forEach(c => listaEl.appendChild(ClienteSeletorModal.#criarItem(c)));
  }

  /**
   * Renderiza mensagem de estado vazio/erro.
   */
  static #renderVazio(listaEl, msg) {
    if (!listaEl) return;
    const li = document.createElement('li');
    li.className   = 'csm-vazio';
    li.textContent = msg;
    listaEl.appendChild(li);
  }

  /**
   * Cria o item "Ver mais" para paginação.
   */
  static #criarVerMais() {
    const li  = document.createElement('li');
    li.className = 'csm-ver-mais';
    const btn = document.createElement('button');
    btn.className   = 'csm-ver-mais-btn';
    btn.textContent = 'Ver mais';
    btn.type        = 'button';
    li.appendChild(btn);
    return li;
  }

  /**
   * Carrega a próxima página ao clicar em "Ver mais".
   */
  static #carregarMais(listaEl, labelEl, excluirIds) {
    const novoOffset = ClienteSeletorModal.#offset + ClienteSeletorModal.#PAGE_SIZE;
    ClienteSeletorModal.#executarBusca(
      ClienteSeletorModal.#termoCorrente,
      excluirIds,
      novoOffset,
      listaEl,
      labelEl,
      true, // append
    );
  }

  /**
   * Cria um <li> representando um usuário na lista.
   */
  static #criarItem(cliente) {
    const li = document.createElement('li');
    li.className = 'csm-item';
    li.setAttribute('role', 'option');
    li.setAttribute('tabindex', '0');
    li.dataset.clienteId     = cliente.id;
    li.dataset.clienteNome   = cliente.full_name;
    li.dataset.clienteAvatar = cliente.avatar_path ?? '';

    const avatarEl = document.createElement('div');
    avatarEl.className = 'csm-avatar';

    if (cliente.avatar_path) {
      const img   = document.createElement('img');
      img.alt     = cliente.full_name;
      img.loading = 'lazy';
      img.src     = (typeof SupabaseService !== 'undefined')
        ? SupabaseService.resolveAvatarUrl(cliente.avatar_path, cliente.updated_at ?? null) || ''
        : '';
      img.onerror = () => { avatarEl.textContent = ClienteSeletorModal.#inicial(cliente.full_name); };
      avatarEl.appendChild(img);
    } else {
      avatarEl.textContent = ClienteSeletorModal.#inicial(cliente.full_name);
    }

    const nomeEl       = document.createElement('span');
    nomeEl.className   = 'csm-nome';
    nomeEl.textContent = cliente.full_name;

    li.appendChild(avatarEl);
    li.appendChild(nomeEl);

    li.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); li.click(); }
    });

    return li;
  }

  /**
   * Valida que o valor é um UUID válido.
   * @throws {TypeError}
   */
  static #validarUuid(value, campo) {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (typeof value !== 'string' || !UUID_RE.test(value)) {
      throw new TypeError(`[ClienteSeletorModal] ${campo} deve ser um UUID válido. Recebido: "${value}"`);
    }
  }

  /**
   * Inicial maiúscula para placeholder de avatar sem foto.
   */
  static #inicial(nome) {
    return (nome ?? '').trim().charAt(0).toUpperCase() || '?';
  }
}
