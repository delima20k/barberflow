'use strict';

// =============================================================
// MensalistaModal.js — Modal de gestão de mensalistas.
//
// Responsabilidade ÚNICA: exibir e gerenciar mensalistas ativos
// de uma barbearia (listar, adicionar, remover).
//
// Uso:
//   await MensalistaModal.abrir({ barbershopId });
//
// Dependências: BffApiService
// =============================================================

class MensalistaModal {

  /**
   * Abre o modal de gestão de mensalistas.
   * @param {object} opts
   * @param {string} opts.barbershopId
   * @returns {Promise<void>}
   */
  static abrir({ barbershopId }) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'mslm-overlay';

      overlay.innerHTML = `
        <div class="mslm-card" role="dialog" aria-modal="true" aria-label="Gestão de mensalistas">
          <div class="mslm-header">
            <h2 class="mslm-titulo">👑 Mensalistas</h2>
            <button class="mslm-fechar" aria-label="Fechar">✕</button>
          </div>

          <div class="mslm-body">
            <!-- Seção: Mensalistas Ativos -->
            <section class="mslm-secao">
              <p class="mslm-secao-label">Ativos</p>
              <ul class="mslm-lista-ativos" aria-label="Mensalistas ativos"></ul>
            </section>

            <!-- Seção: Favoritos elegíveis (lista automática) -->
            <section class="mslm-secao">
              <p class="mslm-secao-label">Favoritos elegíveis</p>
              <ul class="mslm-lista-elegiveis" aria-label="Favoritos elegíveis"></ul>
              <p class="mslm-elegiveis-msg" aria-live="polite"></p>
            </section>

            <!-- Seção: Busca manual (textual) -->
            <section class="mslm-secao">
              <p class="mslm-secao-label">Buscar outro cliente</p>
              <div class="mslm-busca-row">
                <input
                  class="mslm-busca-input"
                  type="search"
                  placeholder="Buscar por nome..."
                  aria-label="Buscar cliente"
                  autocomplete="off"
                />
                <button class="mslm-btn-buscar" aria-label="Buscar">🔍</button>
              </div>
              <ul class="mslm-lista-disponiveis" aria-label="Clientes encontrados"></ul>
              <p class="mslm-busca-msg" aria-live="polite"></p>
            </section>
          </div>

          <div class="mslm-footer">
            <button class="mslm-btn mslm-btn--fechar">Fechar</button>
          </div>
        </div>`;

      const listaAtivosEl    = overlay.querySelector('.mslm-lista-ativos');
      const listaElegiveisEl = overlay.querySelector('.mslm-lista-elegiveis');
      const elegiveisMsg     = overlay.querySelector('.mslm-elegiveis-msg');
      const listaDisponEl    = overlay.querySelector('.mslm-lista-disponiveis');
      const buscaInput       = overlay.querySelector('.mslm-busca-input');
      const buscaMsg         = overlay.querySelector('.mslm-busca-msg');
      const btnBuscar        = overlay.querySelector('.mslm-btn-buscar');

      // Fecha e resolve
      function _fechar() {
        document.removeEventListener('keydown', onKey);
        overlay.classList.add('mslm-overlay--saindo');
        setTimeout(() => overlay.remove(), 220);
        resolve();
      }

      const onKey = e => { if (e.key === 'Escape') _fechar(); };
      document.addEventListener('keydown', onKey);
      overlay.addEventListener('click', e => { if (e.target === overlay) _fechar(); });
      overlay.querySelector('.mslm-fechar').addEventListener('click', _fechar);
      overlay.querySelector('.mslm-btn--fechar').addEventListener('click', _fechar);

      // Recarrega ativos + elegíveis (chamado após mutação)
      const recarregarTudo = async () => {
        await Promise.all([
          MensalistaModal.#carregarAtivos(barbershopId, listaAtivosEl, () => recarregarTudo()),
          MensalistaModal.#carregarElegiveis(barbershopId, listaElegiveisEl, elegiveisMsg, async (perfil, btn) => {
            btn.disabled = true;
            const { error } = await BffApiService.mensalistas.adicionar(barbershopId, perfil.id);
            if (error) {
              btn.disabled = false;
              elegiveisMsg.textContent = `Erro ao adicionar: ${error.message}`;
              return;
            }
            await recarregarTudo();
          }),
        ]);
      };

      // Busca textual manual — só responde com termo não vazio
      const executarBusca = async () => {
        const q = buscaInput.value.trim();
        listaDisponEl.innerHTML = '';
        if (!q) {
          buscaMsg.textContent = 'Digite um nome para buscar.';
          return;
        }
        buscaMsg.textContent = 'Buscando...';
        const { data, error } = await BffApiService.mensalistas.buscarClientesDisponiveis(barbershopId, q);
        if (error) {
          buscaMsg.textContent = `Erro: ${error.message}`;
          return;
        }
        const lista = data ?? [];
        buscaMsg.textContent = lista.length ? '' : 'Nenhum cliente encontrado.';
        lista.forEach(p => {
          const li = MensalistaModal.#criarItemDisponivel(p, async () => {
            li.querySelector('.mslm-btn-adicionar').disabled = true;
            const { error: e } = await BffApiService.mensalistas.adicionar(barbershopId, p.id);
            if (e) {
              li.querySelector('.mslm-btn-adicionar').disabled = false;
              buscaMsg.textContent = `Erro ao adicionar: ${e.message}`;
              return;
            }
            li.remove();
            await recarregarTudo();
          });
          listaDisponEl.appendChild(li);
        });
      };

      btnBuscar.addEventListener('click', executarBusca);
      buscaInput.addEventListener('keydown', e => { if (e.key === 'Enter') executarBusca(); });

      // Carrega ativos + elegíveis automaticamente ao abrir
      recarregarTudo();

      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('mslm-overlay--visivel'));
    });
  }

  // ── Privados ────────────────────────────────────────────────

  /**
   * Carrega e renderiza a lista de mensalistas ativos.
   * @param {string}        barbershopId
   * @param {HTMLElement}   listaEl
   * @param {Function|null} [onAfterRemove] — chamado após remover (para re-render global)
   */
  static async #carregarAtivos(barbershopId, listaEl, onAfterRemove = null) {
    listaEl.innerHTML = '<li class="mslm-loading">Carregando...</li>';
    const { data, error } = await BffApiService.mensalistas.listar(barbershopId);
    listaEl.innerHTML = '';

    if (error) {
      const li = document.createElement('li');
      li.className   = 'mslm-vazio';
      li.textContent = `Erro ao carregar: ${error.message}`;
      listaEl.appendChild(li);
      return;
    }

    const lista = data ?? [];
    if (!lista.length) {
      const li = document.createElement('li');
      li.className   = 'mslm-vazio';
      li.textContent = 'Nenhum mensalista ativo.';
      listaEl.appendChild(li);
      return;
    }

    lista.forEach(row => {
      const nome       = row.client?.full_name   ?? 'Cliente';
      const avatarPath = row.client?.avatar_path ?? null;
      const endsAt     = row.ends_at ? MensalistaModal.#formatarData(row.ends_at) : '—';
      const li = MensalistaModal.#criarItemAtivo(nome, avatarPath, endsAt, async () => {
        const btn = li.querySelector('.mslm-btn-remover');
        btn.disabled = true;
        const { error: e } = await BffApiService.mensalistas.remover(row.id);
        if (e) { btn.disabled = false; return; }
        // Re-render global garante que o cliente removido volte aos elegíveis
        if (typeof onAfterRemove === 'function') {
          await onAfterRemove();
          return;
        }
        li.remove();
        if (!listaEl.children.length) {
          const vazio = document.createElement('li');
          vazio.className   = 'mslm-vazio';
          vazio.textContent = 'Nenhum mensalista ativo.';
          listaEl.appendChild(vazio);
        }
      });
      listaEl.appendChild(li);
    });
  }

  /**
   * Carrega e renderiza a lista automática de favoritos elegíveis.
   * Origem: BFF → RPC get_clientes_favoritos_barbearia, já com
   * mensalistas ativos excluídos.
   *
   * @param {string}      barbershopId
   * @param {HTMLElement} listaEl
   * @param {HTMLElement} msgEl
   * @param {(perfil:object, btn:HTMLButtonElement) => Promise<void>} onAdicionar
   */
  static async #carregarElegiveis(barbershopId, listaEl, msgEl, onAdicionar) {
    listaEl.innerHTML = '<li class="mslm-loading">Carregando...</li>';
    msgEl.textContent = '';
    const { data, error } = await BffApiService.mensalistas.favoritosElegiveis(barbershopId);
    listaEl.innerHTML = '';

    if (error) {
      msgEl.textContent = `Erro ao carregar favoritos: ${error.message}`;
      return;
    }

    const lista = data ?? [];
    if (!lista.length) {
      const li = document.createElement('li');
      li.className   = 'mslm-vazio';
      li.textContent = 'Nenhum favorito elegível. Use a busca abaixo.';
      listaEl.appendChild(li);
      return;
    }

    lista.forEach(perfil => {
      const li = MensalistaModal.#criarItemDisponivel(perfil, async () => {
        const btn = li.querySelector('.mslm-btn-adicionar');
        await onAdicionar(perfil, btn);
      });
      listaEl.appendChild(li);
    });
  }

  /**
   * Cria um <li> para um mensalista ativo.
   * @param {string}      nome
   * @param {string|null} avatarPath
   * @param {string}      venceEm
   * @param {Function}    onRemover
   * @returns {HTMLLIElement}
   */
  static #criarItemAtivo(nome, avatarPath, venceEm, onRemover) {
    const li = document.createElement('li');
    li.className = 'mslm-item';

    if (avatarPath) {
      const img = document.createElement('img');
      img.className = 'mslm-avatar';
      img.src = avatarPath;
      img.alt = '';
      img.setAttribute('aria-hidden', 'true');
      li.appendChild(img);
    }

    const nomeEl = document.createElement('span');
    nomeEl.className   = 'mslm-item-nome';
    nomeEl.textContent = nome;

    const metaEl = document.createElement('span');
    metaEl.className   = 'mslm-item-meta';
    metaEl.textContent = `Vence: ${venceEm}`;

    const btn = document.createElement('button');
    btn.className   = 'mslm-btn-remover';
    btn.textContent = 'Remover';
    btn.setAttribute('aria-label', `Remover ${nome} dos mensalistas`);
    btn.addEventListener('click', onRemover);

    li.appendChild(nomeEl);
    li.appendChild(metaEl);
    li.appendChild(btn);
    return li;
  }

  /**
   * Cria um <li> para um perfil disponível para ser mensalista.
   * @param {{id:string, full_name:string, avatar_path:string|null}} profile
   * @param {Function} onAdicionar
   * @returns {HTMLLIElement}
   */
  static #criarItemDisponivel(profile, onAdicionar) {
    const li = document.createElement('li');
    li.className = 'mslm-item';

    if (profile.avatar_path) {
      const img = document.createElement('img');
      img.className = 'mslm-avatar';
      img.src = profile.avatar_path;
      img.alt = '';
      img.setAttribute('aria-hidden', 'true');
      li.appendChild(img);
    }

    const nomeEl = document.createElement('span');
    nomeEl.className   = 'mslm-item-nome';
    nomeEl.textContent = profile.full_name ?? 'Cliente';

    const btn = document.createElement('button');
    btn.className   = 'mslm-btn-adicionar';
    btn.textContent = 'Adicionar';
    btn.setAttribute('aria-label', `Adicionar ${profile.full_name ?? 'cliente'} como mensalista`);
    btn.addEventListener('click', onAdicionar);

    li.appendChild(nomeEl);
    li.appendChild(btn);
    return li;
  }

  /**
   * Formata ISO date string em dd/mm/aaaa.
   * @param {string} isoStr
   * @returns {string}
   */
  static #formatarData(isoStr) {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('pt-BR');
    } catch {
      return isoStr;
    }
  }
}
