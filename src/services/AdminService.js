'use strict';

// =============================================================
// AdminService.js — Lógica de negócio da dashboard administrativa.
// Camada: application
//
// Responsabilidades:
//   - Login do admin com credenciais fixas (env) e emissão de JWT próprio
//   - Criação e exclusão de usuários e barbeiros
//   - Consulta de totais e financeiro
//   - Gerenciamento de planos (subscriptions)
//
// SEGURANÇA:
//   - Senha nunca é retornada ou logada
//   - Credenciais lidas de process.env em tempo de chamada
//   - ADMIN_EMAIL e ADMIN_PASSWORD_HASH obrigatórios no ambiente
// =============================================================

const bcrypt      = require('bcryptjs');
const BaseService = require('../infra/BaseService');
const TokenService = require('../infra/TokenService');

const PLAN_TYPES    = ['trial', 'mensal', 'trimestral'];
const ROLES_VALIDOS = ['client', 'professional'];
const PRO_TYPES     = ['barbeiro', 'barbearia'];

// ends_at para usuários "permanentes" criados pelo admin
const ENDS_AT_PERMANENTE = '2099-12-31T23:59:59Z';

class AdminService extends BaseService {

  #repo;

  /** @param {import('../repositories/AdminRepository')} adminRepo */
  constructor(adminRepo) {
    super('AdminService');
    this.#repo = adminRepo;
  }

  // ── Login ──────────────────────────────────────────────────

  /**
   * Autentica o admin com e-mail + senha fixos (env).
   * Retorna JWT com validade de 4h.
   *
   * @param {string} email
   * @param {string} senha
   * @returns {Promise<{ token: string }>}
   * @throws {Error{status:401}} credenciais inválidas (mensagem genérica)
   */
  async login(email, senha) {
    this._email('email', email);
    if (!senha?.trim()) throw this._erro('Credenciais inválidas.', 401);

    const adminEmail = process.env.ADMIN_EMAIL;
    const adminHash  = process.env.ADMIN_PASSWORD_HASH;

    if (!adminEmail || !adminHash) {
      throw this._erro('Configuração de admin ausente no servidor.', 500);
    }

    const emailOk = email.trim().toLowerCase() === adminEmail.trim().toLowerCase();
    const senhaOk = emailOk && await bcrypt.compare(senha, adminHash);

    // Mensagem intencionalemente genérica — nunca expõe se e-mail existe
    if (!emailOk || !senhaOk) {
      throw this._erro('Credenciais inválidas.', 401);
    }

    const token = TokenService.gerarAdmin({ email: adminEmail });
    return { token };
  }

  // ── Totais ─────────────────────────────────────────────────

  /**
   * @returns {Promise<{ clientes: number, profissionais: number, barbearias: number }>}
   */
  async getTotais() {
    return this.#repo.getTotais();
  }

  // ── Usuários ───────────────────────────────────────────────

  /**
   * Lista usuários com paginação.
   * @param {{ role?: string, limit?: number, offset?: number }} filtros
   * @returns {Promise<object[]>}
   */
  async listarUsuarios(filtros = {}) {
    const limit  = Math.min(Number(filtros.limit)  || 20, 100);
    const offset = Math.max(Number(filtros.offset) || 0,   0);
    const role   = filtros.role ?? null;
    return this.#repo.listarUsuarios({ role, limit, offset });
  }

  /**
   * Cria um usuário comum (cliente) ou profissional.
   * Se `plano` for informado, cria subscription associada.
   * Se `plano` não for informado, usuário é "permanente" (sem expiração real).
   *
   * @param {{
   *   email:      string,
   *   senha:      string,
   *   full_name:  string,
   *   role?:      'client'|'professional',
   *   pro_type?:  'barbeiro'|'barbearia',
   *   plano?:     'trial'|'mensal'|'trimestral',
   *   price?:     number,
   *   ends_at?:   string
   * }} dados
   * @returns {Promise<{ perfil: object, subscription?: object }>}
   */
  async criarUsuario(dados) {
    this._email('email', dados.email);
    this._nome('full_name', dados.full_name);
    if (!dados.senha || dados.senha.length < 6) {
      throw this._erro('Senha deve ter no mínimo 6 caracteres.');
    }

    const role     = dados.role     ?? 'client';
    const pro_type = dados.pro_type ?? null;

    if (!ROLES_VALIDOS.includes(role)) {
      throw this._erro(`role inválido. Valores aceitos: ${ROLES_VALIDOS.join(', ')}.`);
    }
    if (pro_type && !PRO_TYPES.includes(pro_type)) {
      throw this._erro(`pro_type inválido. Valores aceitos: ${PRO_TYPES.join(', ')}.`);
    }

    const perfil = await this.#repo.criarUsuario({
      email:     dados.email.trim().toLowerCase(),
      senha:     dados.senha,
      full_name: dados.full_name.trim(),
      role,
      pro_type,
    });

    // Cria subscription se plano informado — ou permanente sem plano
    const plan_type = dados.plano ?? 'mensal';
    const ends_at   = dados.ends_at ?? ENDS_AT_PERMANENTE;
    const price     = Number(dados.price ?? 0);

    if (!PLAN_TYPES.includes(plan_type)) {
      throw this._erro(`plano inválido. Valores aceitos: ${PLAN_TYPES.join(', ')}.`);
    }

    const subscription = await this.#repo.criarSubscription({
      userId: perfil.id,
      plan_type,
      status:  'active',
      price,
      ends_at,
    });

    return { perfil, subscription };
  }

  /**
   * Exclui usuário pelo UUID.
   * @param {string} userId
   * @returns {Promise<void>}
   */
  async excluirUsuario(userId) {
    this._uuid('userId', userId);
    await this.#repo.excluirUsuario(userId);
  }

  // ── Barbeiros ─────────────────────────────────────────────

  /**
   * Cria um barbeiro (alias de criarUsuario com role=professional).
   * @param {object} dados — mesmo shape de criarUsuario
   * @returns {Promise<{ perfil: object, subscription?: object }>}
   */
  async criarBarbeiro(dados) {
    return this.criarUsuario({
      ...dados,
      role:     'professional',
      pro_type: dados.pro_type ?? 'barbeiro',
    });
  }

  /**
   * Exclui barbeiro pelo UUID.
   * @param {string} userId
   * @returns {Promise<void>}
   */
  async excluirBarbeiro(userId) {
    return this.excluirUsuario(userId);
  }

  // ── Financeiro ─────────────────────────────────────────────

  /**
   * Lista subscriptions com dados do perfil.
   * @param {{ status?: string, limit?: number, offset?: number }} filtros
   * @returns {Promise<object[]>}
   */
  async listarFinanceiro(filtros = {}) {
    const limit  = Math.min(Number(filtros.limit)  || 50, 200);
    const offset = Math.max(Number(filtros.offset) || 0,    0);
    return this.#repo.listarFinanceiro({ status: filtros.status ?? null, limit, offset });
  }

  /**
   * Atualiza campos de uma subscription.
   * @param {string} subId
   * @param {{ plan_type?: string, status?: string, price?: number, ends_at?: string }} campos
   * @returns {Promise<object>}
   */
  async atualizarPlano(subId, campos) {
    this._uuid('subId', subId);
    if (campos.plan_type && !PLAN_TYPES.includes(campos.plan_type)) {
      throw this._erro(`plan_type inválido. Valores aceitos: ${PLAN_TYPES.join(', ')}.`);
    }
    return this.#repo.atualizarPlano(subId, campos);
  }
}

module.exports = AdminService;
