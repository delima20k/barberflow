'use strict';

// =============================================================
// ClienteSeletorModal.js — Modal de seleção de cliente.
//
// Responsabilidade ÚNICA: exibir lista de clientes conhecidos
// e retornar o cliente selecionado via Promise.
//
// Uso:
//   const cliente = await ClienteSeletorModal.abrir(clientes);
//   // cliente: { id, full_name, avatar_path } | null (cancelado)
//
// Dependências: SupabaseService.js (resolveAvatarUrl)
// =============================================================

class ClienteSeletorModal {

  // ──────────────────────────────────────────────────────────
  // Exibe a modal com a lista de clientes.
  // @param {Array<{id:string, full_name:string, avatar_path:string|null}>} clientes
  // @returns {Promise<{id,full_name,avatar_path}|null>}
  // ──────────────────────────────────────────────────────────
  static abrir(clientes) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'csm-overlay';

      overlay.innerHTML = `
        <div class="csm-card" role="dialog" aria-modal="true" aria-label="Selecionar cliente">
          <div class="csm-header">
            <p class="csm-titulo">Selecionar cliente</p>
            <button class="csm-fechar" aria-label="Fechar">✕</button>
          </div>
          <input class="csm-busca" type="text" placeholder="Buscar por nome…" autocomplete="off" />
          <ul class="csm-lista" role="listbox" aria-label="Clientes disponíveis">
            ${clientes.length
              ? ''
              : '<li class="csm-vazio">Nenhum cliente atendido ainda.</li>'
            }
          </ul>
        </div>`;

      const listaEl  = overlay.querySelector('.csm-lista');
      const buscaEl  = overlay.querySelector('.csm-busca');

      // Constrói os itens
      const todosItens = clientes.map(c => ClienteSeletorModal.#criarItem(c));
      todosItens.forEach(el => listaEl.appendChild(el));

      // Eventos de seleção
      listaEl.addEventListener('click', e => {
        const item = e.target.closest('[data-cliente-id]');
        if (!item) return;
        const id     = item.dataset.clienteId;
        const nome   = item.dataset.clienteNome;
        const avatar = item.dataset.clienteAvatar || null;
        _fechar({ id, full_name: nome, avatar_path: avatar });
      });

      // Filtro de busca
      buscaEl.addEventListener('input', () => {
        const termo = buscaEl.value.trim().toLowerCase();
        todosItens.forEach(el => {
          const nome = el.dataset.clienteNome?.toLowerCase() ?? '';
          el.hidden = termo.length > 0 && !nome.includes(termo);
        });
      });

      // Fechar
      overlay.querySelector('.csm-fechar').addEventListener('click', () => _fechar(null));
      overlay.addEventListener('click', e => { if (e.target === overlay) _fechar(null); });
      const onKey = e => { if (e.key === 'Escape') _fechar(null); };
      document.addEventListener('keydown', onKey);

      function _fechar(resultado) {
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

  // ── Privados ────────────────────────────────────────────────

  /**
   * Cria um <li> representando um cliente na lista.
   * @param {{id:string, full_name:string, avatar_path:string|null}} cliente
   * @returns {HTMLLIElement}
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
        ? SupabaseService.resolveAvatarUrl(cliente.avatar_path, null) || ''
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

    // Acessibilidade — teclado
    li.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        li.click();
      }
    });

    return li;
  }

  /**
   * Retorna a inicial maiúscula do nome para o placeholder de avatar.
   * @param {string} nome
   * @returns {string}
   */
  static #inicial(nome) {
    return (nome ?? '').trim().charAt(0).toUpperCase() || '?';
  }
}
