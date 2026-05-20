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

            <!-- Seção: Adicionar -->
            <section class="mslm-secao">
              <p class="mslm-secao-label">Adicionar mensalista</p>
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
              <ul class="mslm-lista-disponiveis" aria-label="Clientes disponíveis"></ul>
              <p class="mslm-busca-msg" aria-live="polite"></p>
            </section>
          </div>

          <div class="mslm-footer">
            <button class="mslm-btn mslm-btn--fechar">Fechar</button>
          </div>
        </div>`;

      const listaAtivosEl   = overlay.querySelector('.mslm-lista-ativos');
      const listaDisponEl   = overlay.querySelector('.mslm-lista-disponiveis');
      const buscaInput      = overlay.querySelector('.mslm-busca-input');
      const buscaMsg        = overlay.querySelector('.mslm-busca-msg');
      const btnBuscar       = overlay.querySelector('.mslm-btn-buscar');

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

      // Busca de disponíveis
      const executarBusca = async () => {
        const q = buscaInput.value.trim();
        listaDisponEl.innerHTML = '';
        buscaMsg.textContent    = 'Buscando...';
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
            await MensalistaModal.#carregarAtivos(barbershopId, listaAtivosEl);
          });
          listaDisponEl.appendChild(li);
        });
      };

      btnBuscar.addEventListener('click', executarBusca);
      buscaInput.addEventListener('keydown', e => { if (e.key === 'Enter') executarBusca(); });

      // Carrega ativos e exibe
      MensalistaModal.#carregarAtivos(barbershopId, listaAtivosEl);

      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('mslm-overlay--visivel'));
    });
  }

  // ── Privados ────────────────────────────────────────────────

  /**
   * Carrega e renderiza a lista de mensalistas ativos.
   * @param {string}      barbershopId
   * @param {HTMLElement} listaEl
   */
  static async #carregarAtivos(barbershopId, listaEl) {
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
      const nome    = row.client?.full_name ?? 'Cliente';
      const endsAt  = row.ends_at ? MensalistaModal.#formatarData(row.ends_at) : '—';
      const li = MensalistaModal.#criarItemAtivo(nome, endsAt, async () => {
        const btn = li.querySelector('.mslm-btn-remover');
        btn.disabled = true;
        const { error: e } = await BffApiService.mensalistas.remover(row.id);
        if (e) { btn.disabled = false; return; }
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
   * Cria um <li> para um mensalista ativo.
   * @param {string}   nome
   * @param {string}   venceEm
   * @param {Function} onRemover
   * @returns {HTMLLIElement}
   */
  static #criarItemAtivo(nome, venceEm, onRemover) {
    const li = document.createElement('li');
    li.className = 'mslm-item';

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
   * @param {{id:string, full_name:string}} profile
   * @param {Function}                       onAdicionar
   * @returns {HTMLLIElement}
   */
  static #criarItemDisponivel(profile, onAdicionar) {
    const li = document.createElement('li');
    li.className = 'mslm-item';

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
