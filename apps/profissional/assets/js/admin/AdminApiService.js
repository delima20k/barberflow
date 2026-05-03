'use strict';

// =============================================================
// AdminApiService.js — Wrapper fetch para /api/admin/*.
//
// Singleton. Token JWT armazenado em sessionStorage
// (destruído ao fechar a aba — mais seguro que localStorage).
//
// Uso:
//   const api = AdminApiService.getInstance();
//   await api.login(email, senha);
//   const totais = await api.getTotais();
// =============================================================

class AdminApiService {

  static #STORAGE_KEY = 'adm_token';
  static #BASE_URL    = 'https://barberflow.vercel.app/api/admin';
  static #instance    = null;

  /** @type {string|null} */
  #token = null;

  constructor() {
    // Restaura token da sessão anterior (mesma aba/recarregamento)
    this.#token = sessionStorage.getItem(AdminApiService.#STORAGE_KEY) ?? null;
  }

  /** @returns {AdminApiService} */
  static getInstance() {
    if (!AdminApiService.#instance) {
      AdminApiService.#instance = new AdminApiService();
    }
    return AdminApiService.#instance;
  }

  // ── Token ──────────────────────────────────────────────────

  /** @param {string} token */
  setToken(token) {
    this.#token = token;
    sessionStorage.setItem(AdminApiService.#STORAGE_KEY, token);
  }

  /** @returns {string|null} */
  getToken() { return this.#token; }

  clearToken() {
    this.#token = null;
    sessionStorage.removeItem(AdminApiService.#STORAGE_KEY);
  }

  /** @returns {boolean} */
  isAutenticado() { return !!this.#token; }

  // ── Core fetch ─────────────────────────────────────────────

  /**
   * @param {'GET'|'POST'|'DELETE'|'PATCH'} method
   * @param {string} path   — ex: '/login', '/usuarios'
   * @param {object} [body] — payload JSON (opcional)
   * @returns {Promise<object>}
   * @throws {Error} com propriedade `status` e mensagem traduzida
   */
  async #request(method, path, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.#token) headers['Authorization'] = `Bearer ${this.#token}`;

    const opts = { method, headers };
    if (body && method !== 'GET') opts.body = JSON.stringify(body);

    let res;
    try {
      res = await fetch(`${AdminApiService.#BASE_URL}${path}`, opts);
    } catch {
      throw Object.assign(new Error('Sem conexão com o servidor.'), { status: 0 });
    }

    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      // Token expirado ou inválido → limpa sessão
      this.clearToken();
      throw Object.assign(new Error(data.error ?? 'Sessão expirada. Faça login novamente.'), { status: 401 });
    }

    if (!res.ok) {
      throw Object.assign(new Error(data.error ?? `Erro ${res.status}.`), { status: res.status });
    }

    return data;
  }

  // ── Autenticação ───────────────────────────────────────────

  /**
   * Login do admin. Armazena token automaticamente.
   * @param {string} email
   * @param {string} senha
   * @returns {Promise<void>}
   */
  async login(email, senha) {
    const data = await this.#request('POST', '/login', { email, senha });
    if (!data.token) throw new Error('Resposta inválida do servidor.');
    this.setToken(data.token);
  }

  // ── Totais ─────────────────────────────────────────────────

  /** @returns {Promise<{ clientes: number, profissionais: number, barbearias: number }>} */
  async getTotais() {
    const data = await this.#request('GET', '/totais');
    return data.dados ?? {};
  }

  // ── Usuários ───────────────────────────────────────────────

  /**
   * @param {{ role?: string, limit?: number, offset?: number }} [filtros]
   * @returns {Promise<object[]>}
   */
  async listarUsuarios(filtros = {}) {
    const qs = new URLSearchParams();
    if (filtros.role)   qs.set('role',   filtros.role);
    if (filtros.limit)  qs.set('limit',  filtros.limit);
    if (filtros.offset) qs.set('offset', filtros.offset);
    const query = qs.toString() ? `?${qs}` : '';
    const data  = await this.#request('GET', `/usuarios${query}`);
    return data.dados ?? [];
  }

  /**
   * @param {{ email: string, senha: string, full_name: string, role?: string, pro_type?: string, plano?: string, price?: number, ends_at?: string }} dados
   * @returns {Promise<object>}
   */
  async criarUsuario(dados) {
    return this.#request('POST', '/usuarios', dados);
  }

  /**
   * @param {string} id — UUID do usuário
   * @returns {Promise<void>}
   */
  async excluirUsuario(id) {
    await this.#request('DELETE', `/usuarios/${encodeURIComponent(id)}`);
  }

  // ── Barbeiros ─────────────────────────────────────────────

  /**
   * @param {object} dados — mesmo shape de criarUsuario
   * @returns {Promise<object>}
   */
  async criarBarbeiro(dados) {
    return this.#request('POST', '/barbeiros', dados);
  }

  /**
   * @param {string} id — UUID do barbeiro
   * @returns {Promise<void>}
   */
  async excluirBarbeiro(id) {
    await this.#request('DELETE', `/barbeiros/${encodeURIComponent(id)}`);
  }

  // ── Financeiro ─────────────────────────────────────────────

  /**
   * @param {{ status?: string, limit?: number, offset?: number }} [filtros]
   * @returns {Promise<object[]>}
   */
  async listarFinanceiro(filtros = {}) {
    const qs = new URLSearchParams();
    if (filtros.status) qs.set('status', filtros.status);
    if (filtros.limit)  qs.set('limit',  filtros.limit);
    if (filtros.offset) qs.set('offset', filtros.offset);
    const query = qs.toString() ? `?${qs}` : '';
    const data  = await this.#request('GET', `/financeiro${query}`);
    return data.dados ?? [];
  }

  /**
   * @param {string} id     — UUID da subscription
   * @param {object} campos — campos a atualizar
   * @returns {Promise<object>}
   */
  async atualizarPlano(id, campos) {
    const data = await this.#request('PATCH', `/financeiro/${encodeURIComponent(id)}`, campos);
    return data.dados ?? {};
  }
}
