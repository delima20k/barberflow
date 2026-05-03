'use strict';

// =============================================================
// ClienteSeletorModal.js — Modal de seleção de cliente.
//
// Responsabilidade ÚNICA: exibir favoritos da barbearia/barbeiro
// e permitir busca global de qualquer usuário (client ou professional)
// por nome, retornando o selecionado via Promise.
//
// Uso:
//   const cliente = await ClienteSeletorModal.abrir(favoritos, { excluirIds });
//   // cliente: { id, full_name, avatar_path } | null (cancelado)
//
// Dependências: SupabaseService.js (resolveAvatarUrl), ApiService.js
// =============================================================

class ClienteSeletorModal {

  // Debounce da busca (ms)
  static #DEBOUNCE_MS = 350;

  // ──────────────────────────────────────────────────────────
  // Exibe a modal.
  // @param {Array<{id,full_name,avatar_path}>} favoritos  — lista inicial
  // @param {object} [opts]
  // @param {Set<string>} [opts.excluirIds]  — IDs a excluir dos resultados
  // ──────────────────────────────────────────────────────────
  static abrir(favoritos, opts = {}) {
    const { excluirIds = new Set() } = opts;

    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'csm-overlay';

      overlay.innerHTML = `
        <div class="csm-card" role="dialog" aria-modal="true" aria-label="Selecionar cliente">
          <div class="csm-header">
            <p class="csm-titulo">Selecionar cliente</p>
            <button class="csm-fechar" aria-label="Fechar">✕</button>
          </div>
          <input class="csm-busca" type="search" placeholder="Buscar por nome ou e-mail…" autocomplete="off" />
          <p class="csm-secao-label" id="csm-label">Favoritos da barbearia</p>
          <ul class="csm-lista" role="listbox" aria-label="Clientes"></ul>
        </div>`;

      const listaEl  = overlay.querySelector('.csm-lista');
      const buscaEl  = overlay.querySelector('.csm-busca');
      const labelEl  = overlay.querySelector('#csm-label');

      // ── Renderiza lista de itens ───────────────────────────
      const renderLista = (itens, vazio = 'Nenhum resultado.') => {
        listaEl.innerHTML = '';
        if (!itens.length) {
          const li = document.createElement('li');
          li.className   = 'csm-vazio';
          li.textContent = vazio;
          listaEl.appendChild(li);
          return;
        }
        itens
          .filter(c => !excluirIds.has(c.id))
          .forEach(c => listaEl.appendChild(ClienteSeletorModal.#criarItem(c)));
      };

      // Exibe favoritos na abertura
      renderLista(favoritos, 'Nenhum favorito ainda. Use a busca acima.');

      // Eventos de seleção (delegação)
      listaEl.addEventListener('click', e => {
        const item = e.target.closest('[data-cliente-id]');
        if (!item) return;
        _fechar({
          id:          item.dataset.clienteId,
          full_name:   item.dataset.clienteNome,
          avatar_path: item.dataset.clienteAvatar || null,
        });
      });

      // ── Busca async com debounce ───────────────────────────
      let _timer = null;
      buscaEl.addEventListener('input', () => {
        clearTimeout(_timer);
        const termo = buscaEl.value.trim();

        if (!termo) {
          labelEl.textContent = 'Favoritos da barbearia';
          renderLista(favoritos, 'Nenhum favorito ainda. Use a busca acima.');
          return;
        }

        labelEl.textContent = 'Buscando…';
        _timer = setTimeout(() => ClienteSeletorModal.#buscar(termo, excluirIds)
          .then(resultados => {
            labelEl.textContent = resultados.length
              ? `${resultados.length} resultado${resultados.length > 1 ? 's' : ''}`
              : 'Nenhum resultado';
            renderLista(resultados);
          })
          .catch(() => {
            labelEl.textContent = 'Erro na busca';
            listaEl.innerHTML = '<li class="csm-vazio">Erro ao buscar. Tente novamente.</li>';
          }),
        ClienteSeletorModal.#DEBOUNCE_MS);
      });

      // Fechar
      overlay.querySelector('.csm-fechar').addEventListener('click', () => _fechar(null));
      overlay.addEventListener('click', e => { if (e.target === overlay) _fechar(null); });
      const onKey = e => { if (e.key === 'Escape') _fechar(null); };
      document.addEventListener('keydown', onKey);

      function _fechar(resultado) {
        clearTimeout(_timer);
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
   * Busca usuários no Supabase por nome OU email.
   * Tenta `or(full_name.ilike + email.ilike)` primeiro; se a coluna email
   * ainda não existir no banco (migration pendente), cai silenciosamente para
   * busca apenas por full_name — sem erro visível ao usuário.
   * Não filtra por role nem por is_active: campos podem estar nulos em cadastros novos.
   * @param {string} termo
   * @param {Set}    excluirIds
   * @returns {Promise<{id,full_name,avatar_path,updated_at}[]>}
   */
  static async #buscar(termo, excluirIds) {
    const t = termo.replace(/'/g, "''");

    let resultado;
    try {
      const { data, error } = await ApiService.from('profiles')
        .select('id, full_name, avatar_path, updated_at')
        .or(`full_name.ilike.%${t}%,email.ilike.%${t}%`)
        .limit(20);
      if (error) throw error;
      resultado = data ?? [];
    } catch (_) {
      // Fallback: coluna email ausente — busca só por nome
      const { data, error } = await ApiService.from('profiles')
        .select('id, full_name, avatar_path, updated_at')
        .ilike('full_name', `%${t}%`)
        .limit(20);
      if (error) throw error;
      resultado = data ?? [];
    }

    return resultado
      .filter(p => !excluirIds.has(p.id))
      .map(p => ({
        id:          p.id,
        full_name:   p.full_name   ?? 'Usuário',
        avatar_path: p.avatar_path ?? null,
        updated_at:  p.updated_at  ?? null,
      }));
  }

  /**
   * Cria um <li> representando um usuário na lista.
   * @param {{id,full_name,avatar_path,updated_at}} cliente
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
   * Inicial maiúscula para placeholder de avatar sem foto.
   * @param {string} nome
   * @returns {string}
   */
  static #inicial(nome) {
    return (nome ?? '').trim().charAt(0).toUpperCase() || '?';
  }
}
