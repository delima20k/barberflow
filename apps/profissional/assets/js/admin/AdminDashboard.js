'use strict';

// =============================================================
// AdminDashboard.js — Dashboard de administração do BarberFlow.
//
// Classes (neste arquivo, nesta ordem):
//   AdminToast         — Notificações inline (sem alert/confirm)
//   AdminModal         — Modal genérico reutilizável (form + confirm)
//   AdminTabUsuarios   — Aba de gestão de clientes
//   AdminTabBarbeiros  — Aba de gestão de barbeiros/profissionais
//   AdminTabFinanceiro — Aba de gestão de subscriptions/planos
//   AdminDashboard     — Orquestrador principal (ponto de entrada)
//
// Dependências externas:
//   AdminApiService    — deve ser carregado antes deste arquivo
// =============================================================


// ─────────────────────────────────────────────────────────────
// AdminToast
// ─────────────────────────────────────────────────────────────

class AdminToast {

  static #DURACAO_MS = 3500;

  /** @type {HTMLElement} */
  #container;

  constructor() {
    this.#container = document.getElementById('adm-toast-container');
    if (!this.#container) {
      this.#container = document.createElement('div');
      this.#container.id = 'adm-toast-container';
      document.body.appendChild(this.#container);
    }
  }

  /**
   * @param {string} mensagem
   * @param {'success'|'error'|'info'} tipo
   */
  mostrar(mensagem, tipo = 'info') {
    const toast = document.createElement('div');
    toast.className = `adm-toast adm-toast--${tipo}`;
    toast.textContent = mensagem;

    this.#container.appendChild(toast);

    // Força reflow para ativar animação CSS
    toast.getBoundingClientRect();
    toast.classList.add('adm-toast--visivel');

    setTimeout(() => this.#remover(toast), AdminToast.#DURACAO_MS);
  }

  /** @param {HTMLElement} toast */
  #remover(toast) {
    toast.classList.remove('adm-toast--visivel');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }

  sucesso(msg)   { this.mostrar(msg, 'success'); }
  erro(msg)      { this.mostrar(msg, 'error'); }
  info(msg)      { this.mostrar(msg, 'info'); }
}


// ─────────────────────────────────────────────────────────────
// AdminModal
// ─────────────────────────────────────────────────────────────

class AdminModal {

  /** @type {HTMLElement} */
  #overlay;
  /** @type {HTMLElement} */
  #dialog;
  /** @type {Function|null} */
  #onConfirm = null;

  constructor() {
    this.#overlay = document.getElementById('adm-modal-overlay');
    this.#dialog  = document.getElementById('adm-modal');

    this.#overlay.addEventListener('click', e => {
      if (e.target === this.#overlay) this.fechar();
    });

    document.getElementById('adm-modal-cancelar')
      ?.addEventListener('click', () => this.fechar());
  }

  /**
   * Abre modal com título, corpo HTML e callback ao confirmar.
   * @param {string}   titulo
   * @param {string}   corpoHtml  — HTML sanitizado do conteúdo
   * @param {Function} onConfirm
   * @param {string}   [textoBotaoConfirm='Confirmar']
   * @param {boolean}  [perigo=false]  — estilo destrutivo
   */
  abrir(titulo, corpoHtml, onConfirm, textoBotaoConfirm = 'Confirmar', perigo = false) {
    document.getElementById('adm-modal-titulo').textContent = titulo;
    document.getElementById('adm-modal-corpo').innerHTML = corpoHtml;
    this.#onConfirm = onConfirm;

    const btnConfirm = document.getElementById('adm-modal-confirmar');
    btnConfirm.textContent = textoBotaoConfirm;
    btnConfirm.className   = perigo
      ? 'btn btn--danger'
      : 'btn btn--primary';

    btnConfirm.onclick = () => {
      if (this.#onConfirm) this.#onConfirm(this.#coletarFormulario());
      this.fechar();
    };

    this.#overlay.classList.add('adm-modal-overlay--visivel');
    this.#dialog.classList.add('adm-modal--visivel');

    // Foco no primeiro input para acessibilidade
    setTimeout(() => this.#dialog.querySelector('input,select,textarea')?.focus(), 50);
  }

  fechar() {
    this.#overlay.classList.remove('adm-modal-overlay--visivel');
    this.#dialog.classList.remove('adm-modal--visivel');
    this.#onConfirm = null;
  }

  /** @returns {object} pares name→value dos inputs do modal */
  #coletarFormulario() {
    const resultado = {};
    const corpo = document.getElementById('adm-modal-corpo');
    corpo.querySelectorAll('[name]').forEach(el => {
      const val = el.value?.trim();
      if (val !== '') resultado[el.name] = val;
    });
    return resultado;
  }
}


// ─────────────────────────────────────────────────────────────
// AdminTabUsuarios
// ─────────────────────────────────────────────────────────────

class AdminTabUsuarios {

  /** @type {AdminApiService} */ #api;
  /** @type {AdminToast}      */ #toast;
  /** @type {AdminModal}      */ #modal;

  /** @type {HTMLElement} */ #tela;
  /** @type {HTMLElement} */ #tbodyEl;
  /** @type {HTMLElement} */ #cardsEl;
  /** @type {HTMLElement} */ #filtroRoleEl;
  /** @type {HTMLElement} */ #btnAnterior;
  /** @type {HTMLElement} */ #btnProximo;
  /** @type {HTMLElement} */ #paginaEl;

  #offset = 0;
  static #LIMIT = 20;

  constructor(api, toast, modal) {
    this.#api   = api;
    this.#toast = toast;
    this.#modal = modal;
  }

  init() {
    this.#tela       = document.getElementById('adm-aba-usuarios');
    this.#tbodyEl    = document.getElementById('adm-usuarios-tbody');
    this.#cardsEl    = document.getElementById('adm-cards');
    this.#filtroRoleEl = document.getElementById('adm-filtro-role');
    this.#btnAnterior = document.getElementById('adm-usuarios-anterior');
    this.#btnProximo  = document.getElementById('adm-usuarios-proximo');
    this.#paginaEl    = document.getElementById('adm-usuarios-pagina');

    this.#filtroRoleEl?.addEventListener('change', () => {
      this.#offset = 0;
      this.carregar();
    });
    this.#btnAnterior?.addEventListener('click', () => {
      if (this.#offset > 0) {
        this.#offset -= AdminTabUsuarios.#LIMIT;
        this.carregar();
      }
    });
    this.#btnProximo?.addEventListener('click', () => {
      this.#offset += AdminTabUsuarios.#LIMIT;
      this.carregar();
    });

    document.getElementById('adm-btn-add-usuario')
      ?.addEventListener('click', () => this.#abrirModalCriar());
  }

  async carregarCards() {
    try {
      const totais = await this.#api.getTotais();
      const c = this.#cardsEl?.querySelectorAll('.adm-counter-card__value');
      if (c?.length >= 3) {
        c[0].textContent = totais.clientes      ?? '—';
        c[1].textContent = totais.profissionais ?? '—';
        c[2].textContent = totais.barbearias    ?? '—';
      }
    } catch (e) {
      this.#toast.erro(e.message);
    }
  }

  async carregar() {
    this.#tbodyEl.innerHTML = '<tr><td colspan="6" class="adm-carregando">Carregando…</td></tr>';
    try {
      const role    = this.#filtroRoleEl?.value || undefined;
      const usuarios = await this.#api.listarUsuarios({
        role,
        limit:  AdminTabUsuarios.#LIMIT,
        offset: this.#offset,
      });
      this.#renderizarTabela(usuarios);
      this.#atualizarPaginacao(usuarios.length);
    } catch (e) {
      this.#toast.erro(e.message);
      if (e.status === 401) window.dispatchEvent(new Event('adm:logout'));
    }
  }

  /**
   * Agrupa uma lista de usuários por letra inicial do nome.
   * Retorna Map<string, object[]> ordenado alfabeticamente.
   * @param {object[]} lista
   * @returns {Map<string, object[]>}
   */
  static #agruparPorLetra(lista) {
    const grupos = new Map();
    for (const item of lista) {
      const letra = (item.full_name ?? item.email ?? '?')
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .charAt(0)
        .toUpperCase() || '#';
      if (!grupos.has(letra)) grupos.set(letra, []);
      grupos.get(letra).push(item);
    }
    return new Map([...grupos.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-BR')));
  }

  /** @param {object[]} usuarios */
  #renderizarTabela(usuarios) {
    if (!usuarios.length) {
      this.#tbodyEl.innerHTML = '<tr><td colspan="6" class="adm-vazio">Nenhum usuário encontrado.</td></tr>';
      return;
    }

    const grupos = AdminTabUsuarios.#agruparPorLetra(usuarios);
    const linhas = [];

    grupos.forEach((itens, letra) => {
      linhas.push(`<tr class="adm-tr-letra"><td colspan="6" class="adm-td-letra">${letra}</td></tr>`);
      itens.forEach(u => {
        linhas.push(`
          <tr>
            <td>${this.#escapar(u.full_name ?? '—')}</td>
            <td>${this.#escapar(u.email     ?? '—')}</td>
            <td><span class="adm-badge adm-badge--role">${this.#escapar(u.role ?? '—')}</span></td>
            <td>${this.#escapar(u.pro_type  ?? '—')}</td>
            <td>${this.#formatarData(u.created_at)}</td>
            <td>
              <button class="btn btn--danger btn--sm adm-btn-excluir"
                      data-id="${this.#escapar(u.id)}"
                      data-nome="${this.#escapar(u.full_name ?? u.email)}">
                Excluir
              </button>
            </td>
          </tr>`);
      });
    });

    this.#tbodyEl.innerHTML = linhas.join('');

    this.#tbodyEl.querySelectorAll('.adm-btn-excluir').forEach(btn => {
      btn.addEventListener('click', () => this.#confirmarExcluir(btn.dataset.id, btn.dataset.nome));
    });
  }

  /** @param {number} quantidade */
  #atualizarPaginacao(quantidade) {
    const pagina = Math.floor(this.#offset / AdminTabUsuarios.#LIMIT) + 1;
    if (this.#paginaEl) this.#paginaEl.textContent = `Página ${pagina}`;
    if (this.#btnAnterior) this.#btnAnterior.disabled = this.#offset === 0;
    if (this.#btnProximo)  this.#btnProximo.disabled  = quantidade < AdminTabUsuarios.#LIMIT;
  }

  /** @param {string} id @param {string} nome */
  #confirmarExcluir(id, nome) {
    this.#modal.abrir(
      'Excluir usuário',
      `<p>Tem certeza que deseja excluir <strong>${this.#escapar(nome)}</strong>?<br>Esta ação é irreversível e removerá todos os dados associados.</p>`,
      async () => {
        try {
          await this.#api.excluirUsuario(id);
          this.#toast.sucesso('Usuário excluído.');
          this.carregar();
          this.carregarCards();
        } catch (e) {
          this.#toast.erro(e.message);
        }
      },
      'Excluir',
      true,
    );
  }

  #abrirModalCriar() {
    this.#modal.abrir(
      'Novo usuário',
      `<form id="adm-form-usuario" class="adm-form" autocomplete="off">
        <label>Nome completo<input name="full_name" type="text" required placeholder="João da Silva"></label>
        <label>E-mail<input name="email" type="email" required placeholder="joao@email.com"></label>
        <label>Senha<input name="senha" type="password" required placeholder="mínimo 8 caracteres" minlength="8"></label>
        <label>Perfil
          <select name="role">
            <option value="client">Cliente</option>
            <option value="professional">Profissional</option>
          </select>
        </label>
        <label>Tipo profissional
          <select name="pro_type">
            <option value="">—</option>
            <option value="barbearia">Barbearia</option>
            <option value="barbeiro">Barbeiro</option>
          </select>
        </label>
        <label>Plano
          <select name="plano">
            <option value="trial">Trial</option>
            <option value="basic">Basic</option>
            <option value="premium">Premium</option>
          </select>
        </label>
        <label>Valor (R$)<input name="price" type="number" min="0" step="0.01" placeholder="0.00"></label>
        <label>Válido até<input name="ends_at" type="date"></label>
      </form>`,
      async dados => {
        try {
          await this.#api.criarUsuario(dados);
          this.#toast.sucesso('Usuário criado com sucesso!');
          this.carregar();
          this.carregarCards();
        } catch (e) {
          this.#toast.erro(e.message);
        }
      },
      'Criar',
    );
  }

  // ── Helpers ──────────────────────────────────────────────

  /** Escapa texto para uso em HTML/atributos */
  #escapar(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** @param {string|null} iso */
  #formatarData(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('pt-BR');
  }
}


// ─────────────────────────────────────────────────────────────
// AdminTabBarbeiros
// ─────────────────────────────────────────────────────────────

class AdminTabBarbeiros {

  /** @type {AdminApiService} */ #api;
  /** @type {AdminToast}      */ #toast;
  /** @type {AdminModal}      */ #modal;

  #offset = 0;
  static #LIMIT = 20;

  /** @type {HTMLElement} */ #tbodyEl;
  /** @type {HTMLElement} */ #btnAnterior;
  /** @type {HTMLElement} */ #btnProximo;
  /** @type {HTMLElement} */ #paginaEl;

  constructor(api, toast, modal) {
    this.#api   = api;
    this.#toast = toast;
    this.#modal = modal;
  }

  init() {
    this.#tbodyEl    = document.getElementById('adm-barbeiros-tbody');
    this.#btnAnterior = document.getElementById('adm-barbeiros-anterior');
    this.#btnProximo  = document.getElementById('adm-barbeiros-proximo');
    this.#paginaEl    = document.getElementById('adm-barbeiros-pagina');

    this.#btnAnterior?.addEventListener('click', () => {
      if (this.#offset > 0) {
        this.#offset -= AdminTabBarbeiros.#LIMIT;
        this.carregar();
      }
    });
    this.#btnProximo?.addEventListener('click', () => {
      this.#offset += AdminTabBarbeiros.#LIMIT;
      this.carregar();
    });

    document.getElementById('adm-btn-add-barbeiro')
      ?.addEventListener('click', () => this.#abrirModalCriar());
  }

  async carregar() {
    this.#tbodyEl.innerHTML = '<tr><td colspan="5" class="adm-carregando">Carregando…</td></tr>';
    try {
      const barbeiros = await this.#api.listarUsuarios({
        role:   'professional',
        limit:  AdminTabBarbeiros.#LIMIT,
        offset: this.#offset,
      });
      this.#renderizarTabela(barbeiros);
      this.#atualizarPaginacao(barbeiros.length);
    } catch (e) {
      this.#toast.erro(e.message);
      if (e.status === 401) window.dispatchEvent(new Event('adm:logout'));
    }
  }

  /**
   * Agrupa a lista de barbeiros por letra inicial do nome.
   * @param {object[]} lista
   * @returns {Map<string, object[]>}
   */
  static #agruparPorLetra(lista) {
    const grupos = new Map();
    for (const item of lista) {
      const letra = (item.full_name ?? item.email ?? '?')
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .charAt(0)
        .toUpperCase() || '#';
      if (!grupos.has(letra)) grupos.set(letra, []);
      grupos.get(letra).push(item);
    }
    return new Map([...grupos.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-BR')));
  }

  /** @param {object[]} barbeiros */
  #renderizarTabela(barbeiros) {
    if (!barbeiros.length) {
      this.#tbodyEl.innerHTML = '<tr><td colspan="5" class="adm-vazio">Nenhum barbeiro encontrado.</td></tr>';
      return;
    }

    const grupos = AdminTabBarbeiros.#agruparPorLetra(barbeiros);
    this.#tbodyEl.innerHTML = '';

    grupos.forEach((itens, letra) => {
      const sepRow = document.createElement('tr');
      sepRow.className = 'adm-tr-letra';
      sepRow.innerHTML = `<td colspan="5" class="adm-td-letra">${letra}</td>`;
      this.#tbodyEl.appendChild(sepRow);

      itens.forEach(b => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${this.#escapar(b.full_name ?? '—')}</td>
            <td>${this.#escapar(b.email     ?? '—')}</td>
            <td><span class="adm-badge adm-badge--pro-type">${this.#escapar(b.pro_type ?? '—')}</span></td>
            <td>${this.#formatarData(b.created_at)}</td>
            <td>
              <button class="btn btn--danger btn--sm adm-btn-excluir"
                      data-id="${this.#escapar(b.id)}"
                      data-nome="${this.#escapar(b.full_name ?? b.email)}">
                Excluir
              </button>
            </td>`;
        this.#tbodyEl.appendChild(tr);
      });
    });

    this.#tbodyEl.querySelectorAll('.adm-btn-excluir').forEach(btn => {
      btn.addEventListener('click', () => this.#confirmarExcluir(btn.dataset.id, btn.dataset.nome));
    });
  }

  #atualizarPaginacao(quantidade) {
    const pagina = Math.floor(this.#offset / AdminTabBarbeiros.#LIMIT) + 1;
    if (this.#paginaEl) this.#paginaEl.textContent = `Página ${pagina}`;
    if (this.#btnAnterior) this.#btnAnterior.disabled = this.#offset === 0;
    if (this.#btnProximo)  this.#btnProximo.disabled  = quantidade < AdminTabBarbeiros.#LIMIT;
  }

  #confirmarExcluir(id, nome) {
    this.#modal.abrir(
      'Excluir barbeiro',
      `<p>Tem certeza que deseja excluir <strong>${this.#escapar(nome)}</strong>?<br>Esta ação é irreversível.</p>`,
      async () => {
        try {
          await this.#api.excluirBarbeiro(id);
          this.#toast.sucesso('Barbeiro excluído.');
          this.carregar();
        } catch (e) {
          this.#toast.erro(e.message);
        }
      },
      'Excluir',
      true,
    );
  }

  #abrirModalCriar() {
    this.#modal.abrir(
      'Novo barbeiro',
      `<form id="adm-form-barbeiro" class="adm-form" autocomplete="off">
        <label>Nome completo<input name="full_name" type="text" required placeholder="Carlos Barbeiro"></label>
        <label>E-mail<input name="email" type="email" required placeholder="carlos@barbearia.com"></label>
        <label>Senha<input name="senha" type="password" required placeholder="mínimo 8 caracteres" minlength="8"></label>
        <label>Tipo
          <select name="pro_type">
            <option value="barbeiro">Barbeiro</option>
            <option value="barbearia">Barbearia (dono)</option>
          </select>
        </label>
        <label>Plano
          <select name="plano">
            <option value="trial">Trial</option>
            <option value="basic">Basic</option>
            <option value="premium">Premium</option>
          </select>
        </label>
        <label>Valor (R$)<input name="price" type="number" min="0" step="0.01" placeholder="0.00"></label>
        <label>Válido até<input name="ends_at" type="date"></label>
      </form>`,
      async dados => {
        try {
          await this.#api.criarBarbeiro({ ...dados, role: 'professional' });
          this.#toast.sucesso('Barbeiro criado com sucesso!');
          this.carregar();
        } catch (e) {
          this.#toast.erro(e.message);
        }
      },
      'Criar',
    );
  }

  #escapar(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  #formatarData(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('pt-BR');
  }
}


// ─────────────────────────────────────────────────────────────
// AdminTabFinanceiro
// ─────────────────────────────────────────────────────────────

class AdminTabFinanceiro {

  /** @type {AdminApiService} */ #api;
  /** @type {AdminToast}      */ #toast;
  /** @type {AdminModal}      */ #modal;

  #offset = 0;
  static #LIMIT = 20;

  /** @type {HTMLElement} */ #tbodyEl;
  /** @type {HTMLElement} */ #filtroStatusEl;
  /** @type {HTMLElement} */ #btnAnterior;
  /** @type {HTMLElement} */ #btnProximo;
  /** @type {HTMLElement} */ #paginaEl;

  constructor(api, toast, modal) {
    this.#api   = api;
    this.#toast = toast;
    this.#modal = modal;
  }

  init() {
    this.#tbodyEl       = document.getElementById('adm-financeiro-tbody');
    this.#filtroStatusEl = document.getElementById('adm-filtro-status');
    this.#btnAnterior    = document.getElementById('adm-financeiro-anterior');
    this.#btnProximo     = document.getElementById('adm-financeiro-proximo');
    this.#paginaEl       = document.getElementById('adm-financeiro-pagina');

    this.#filtroStatusEl?.addEventListener('change', () => {
      this.#offset = 0;
      this.carregar();
    });
    this.#btnAnterior?.addEventListener('click', () => {
      if (this.#offset > 0) {
        this.#offset -= AdminTabFinanceiro.#LIMIT;
        this.carregar();
      }
    });
    this.#btnProximo?.addEventListener('click', () => {
      this.#offset += AdminTabFinanceiro.#LIMIT;
      this.carregar();
    });
  }

  async carregar() {
    this.#tbodyEl.innerHTML = '<tr><td colspan="6" class="adm-carregando">Carregando…</td></tr>';
    try {
      const status = this.#filtroStatusEl?.value || undefined;
      const subs   = await this.#api.listarFinanceiro({
        status,
        limit:  AdminTabFinanceiro.#LIMIT,
        offset: this.#offset,
      });
      this.#renderizarTabela(subs);
      this.#atualizarPaginacao(subs.length);
    } catch (e) {
      this.#toast.erro(e.message);
      if (e.status === 401) window.dispatchEvent(new Event('adm:logout'));
    }
  }

  /** @param {object[]} subs */
  #renderizarTabela(subs) {
    if (!subs.length) {
      this.#tbodyEl.innerHTML = '<tr><td colspan="6" class="adm-vazio">Nenhuma subscription encontrada.</td></tr>';
      return;
    }
    this.#tbodyEl.innerHTML = subs.map(s => `
      <tr>
        <td>${this.#escapar(s.full_name  ?? '—')}</td>
        <td>${this.#escapar(s.email      ?? '—')}</td>
        <td>${this.#escapar(s.plan_type  ?? '—')}</td>
        <td>R$ ${this.#formatarPreco(s.price)}</td>
        <td>${this.#badgeStatus(s.status)}</td>
        <td>${this.#formatarData(s.ends_at)}</td>
        <td>
          <button class="btn btn--secondary btn--sm adm-btn-editar-plano"
                  data-id="${this.#escapar(s.id)}"
                  data-nome="${this.#escapar(s.full_name ?? s.email)}"
                  data-plan="${this.#escapar(s.plan_type ?? '')}"
                  data-price="${this.#escapar(String(s.price ?? '0'))}"
                  data-status="${this.#escapar(s.status ?? '')}"
                  data-ends="${this.#escapar(s.ends_at ?? '')}">
            Editar
          </button>
        </td>
      </tr>
    `).join('');

    this.#tbodyEl.querySelectorAll('.adm-btn-editar-plano').forEach(btn => {
      btn.addEventListener('click', () => this.#abrirModalEditar(btn.dataset));
    });
  }

  #atualizarPaginacao(quantidade) {
    const pagina = Math.floor(this.#offset / AdminTabFinanceiro.#LIMIT) + 1;
    if (this.#paginaEl) this.#paginaEl.textContent = `Página ${pagina}`;
    if (this.#btnAnterior) this.#btnAnterior.disabled = this.#offset === 0;
    if (this.#btnProximo)  this.#btnProximo.disabled  = quantidade < AdminTabFinanceiro.#LIMIT;
  }

  /** @param {object} data — dataset do botão */
  #abrirModalEditar({ id, nome, plan, price, status, ends }) {
    const dataISO = ends ? ends.substring(0, 10) : '';
    this.#modal.abrir(
      `Editar plano — ${this.#escapar(nome)}`,
      `<form id="adm-form-plano" class="adm-form" autocomplete="off">
        <label>Plano
          <select name="plan_type">
            <option value="trial"   ${plan === 'trial'   ? 'selected' : ''}>Trial</option>
            <option value="basic"   ${plan === 'basic'   ? 'selected' : ''}>Basic</option>
            <option value="premium" ${plan === 'premium' ? 'selected' : ''}>Premium</option>
          </select>
        </label>
        <label>Valor (R$)<input name="price" type="number" min="0" step="0.01" value="${this.#escapar(price)}"></label>
        <label>Status
          <select name="status">
            <option value="trial"   ${status === 'trial'   ? 'selected' : ''}>Trial</option>
            <option value="active"  ${status === 'active'  ? 'selected' : ''}>Ativo</option>
            <option value="expired" ${status === 'expired' ? 'selected' : ''}>Expirado</option>
          </select>
        </label>
        <label>Válido até<input name="ends_at" type="date" value="${this.#escapar(dataISO)}"></label>
      </form>`,
      async dados => {
        try {
          await this.#api.atualizarPlano(id, dados);
          this.#toast.sucesso('Plano atualizado!');
          this.carregar();
        } catch (e) {
          this.#toast.erro(e.message);
        }
      },
      'Salvar',
    );
  }

  // ── Helpers ──────────────────────────────────────────────

  #escapar(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  #formatarData(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('pt-BR');
  }

  #formatarPreco(val) {
    const n = parseFloat(val ?? 0);
    return isNaN(n) ? '0,00' : n.toFixed(2).replace('.', ',');
  }

  /** @param {string} status */
  #badgeStatus(status) {
    const mapa = {
      active:  ['adm-badge--success', 'Ativo'],
      trial:   ['adm-badge--warning', 'Trial'],
      expired: ['adm-badge--danger',  'Expirado'],
    };
    const [cls, label] = mapa[status] ?? ['adm-badge--neutral', status ?? '—'];
    return `<span class="adm-badge ${cls}">${label}</span>`;
  }
}


// ─────────────────────────────────────────────────────────────
// AdminDashboard — Orquestrador principal
// ─────────────────────────────────────────────────────────────

class AdminDashboard {

  /** @type {AdminApiService}   */ #api;
  /** @type {AdminToast}        */ #toast;
  /** @type {AdminModal}        */ #modal;
  /** @type {AdminTabUsuarios}  */ #tabUsuarios;
  /** @type {AdminTabBarbeiros} */ #tabBarbeiros;
  /** @type {AdminTabFinanceiro}*/ #tabFinanceiro;

  /** @type {string} */ #abaAtiva = 'usuarios';

  constructor() {
    this.#api          = AdminApiService.getInstance();
    this.#toast        = new AdminToast();
    this.#modal        = new AdminModal();
    this.#tabUsuarios  = new AdminTabUsuarios(this.#api, this.#toast, this.#modal);
    this.#tabBarbeiros = new AdminTabBarbeiros(this.#api, this.#toast, this.#modal);
    this.#tabFinanceiro= new AdminTabFinanceiro(this.#api, this.#toast, this.#modal);
  }

  init() {
    this.#bindLogin();
    this.#bindLogout();
    this.#bindAbas();
    this.#tabUsuarios.init();
    this.#tabBarbeiros.init();
    this.#tabFinanceiro.init();

    // Logout automático ao receber evento de 401
    window.addEventListener('adm:logout', () => this.#fazerLogout());

    // Se já tem token → vai direto para a dashboard
    if (this.#api.isAutenticado()) {
      this.#mostrarDashboard();
    } else {
      this.#mostrarLogin();
    }
  }

  // ── Login ─────────────────────────────────────────────────

  #bindLogin() {
    const form  = document.getElementById('adm-login-form');
    const erro  = document.getElementById('adm-login-erro');

    form?.addEventListener('submit', async e => {
      e.preventDefault();
      const email = form.querySelector('[name="email"]')?.value?.trim();
      const senha = form.querySelector('[name="senha"]')?.value;

      erro.textContent = '';
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;

      try {
        await this.#api.login(email, senha);
        this.#mostrarDashboard();
      } catch (err) {
        erro.textContent = err.message;
        btn.disabled = false;
      }
    });
  }

  // ── Logout ────────────────────────────────────────────────

  #bindLogout() {
    document.getElementById('adm-btn-logout')
      ?.addEventListener('click', () => this.#fazerLogout());
  }

  #fazerLogout() {
    this.#api.clearToken();
    this.#mostrarLogin();
    this.#toast.info('Sessão encerrada.');
  }

  // ── Abas ─────────────────────────────────────────────────

  #bindAbas() {
    document.querySelectorAll('[data-aba]').forEach(btn => {
      btn.addEventListener('click', () => this.#trocarAba(btn.dataset.aba));
    });
  }

  /** @param {string} aba */
  #trocarAba(aba) {
    this.#abaAtiva = aba;

    document.querySelectorAll('[data-aba]').forEach(btn =>
      btn.classList.toggle('adm-nav__item--ativo', btn.dataset.aba === aba)
    );
    document.querySelectorAll('.adm-aba').forEach(el =>
      el.classList.toggle('adm-aba--visivel', el.id === `adm-aba-${aba}`)
    );

    // Carrega dados da aba ao abrir
    if (aba === 'usuarios') {
      this.#tabUsuarios.carregarCards();
      this.#tabUsuarios.carregar();
    } else if (aba === 'barbeiros') {
      this.#tabBarbeiros.carregar();
    } else if (aba === 'financeiro') {
      this.#tabFinanceiro.carregar();
    }
  }

  // ── Telas ─────────────────────────────────────────────────

  #mostrarLogin() {
    document.getElementById('adm-login').classList.add('adm-tela--visivel');
    document.getElementById('adm-dash').classList.remove('adm-tela--visivel');
    document.getElementById('adm-login-form')?.reset();
  }

  #mostrarDashboard() {
    document.getElementById('adm-login').classList.remove('adm-tela--visivel');
    document.getElementById('adm-dash').classList.add('adm-tela--visivel');
    this.#trocarAba('usuarios');
  }
}

// ── Bootstrap ─────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  new AdminDashboard().init();
});
