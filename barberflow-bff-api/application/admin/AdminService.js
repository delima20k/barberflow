'use strict';

// =============================================================
// AdminService.js — Lógica de negócio da dashboard administrativa.
// Camada: application
//
// Responsabilidades:
//   - Login com credenciais fixas (env) e emissão de JWT admin (4h)
//   - Criação e exclusão de usuários e barbeiros
//   - Consulta de totais e financeiro
//   - Gerenciamento de planos (subscriptions)
//
// SEGURANÇA:
//   - Senha jamais é retornada ou logada
//   - Credenciais lidas de process.env em tempo de chamada
//   - ADMIN_EMAIL e ADMIN_PASSWORD_HASH obrigatórios no ambiente
// =============================================================

const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const AppError = require('../../utils/AppError');

const PLAN_TYPES    = ['trial', 'mensal', 'trimestral'];
const ROLES_VALIDOS = ['client', 'professional'];
const PRO_TYPES     = ['barbeiro', 'barbearia'];
const ENDS_AT_PERMANENTE = '2099-12-31T23:59:59Z';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class AdminService {

  /** @type {import('../../repositories/AdminRepository')} */
  #repo;

  /** @param {import('../../repositories/AdminRepository')} adminRepo */
  constructor(adminRepo) {
    this.#repo = adminRepo;
  }

  // ── Helpers ────────────────────────────────────────────────

  static #uuid(campo, valor) {
    if (!valor || !UUID_RE.test(valor)) {
      throw AppError.badRequest(`${campo} deve ser um UUID válido.`);
    }
  }

  static #email(campo, valor) {
    if (!valor || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor.trim())) {
      throw AppError.badRequest(`${campo} inválido.`);
    }
  }

  // ── Login ──────────────────────────────────────────────────

  /**
   * Autentica o admin com e-mail + senha fixos (env).
   * Retorna JWT com validade de 4h assinado com ADMIN_JWT_SECRET.
   *
   * @param {string} email
   * @param {string} senha
   * @returns {Promise<{ token: string }>}
   * @throws {AppError(401)} credenciais inválidas (mensagem genérica)
   */
  async login(email, senha) {
    const _ts = () => new Date().toISOString();
    // DEBUG_LOGIN_START
    try {
      console.log(JSON.stringify({ etapa: '1_inicio', sucesso: true, timestamp: _ts() }));

      AdminService.#email('email', email);
      if (!senha?.trim()) throw AppError.badRequest('Payload inválido: os campos email e senha são obrigatórios.');

      const adminEmail = process.env.ADMIN_EMAIL;
      const adminHash  = process.env.ADMIN_PASSWORD_HASH;
      const secret     = process.env.ADMIN_JWT_SECRET;

      console.log(JSON.stringify({
        etapa: '2_env_lidas', sucesso: true, timestamp: _ts(),
        temEmail: !!adminEmail, temHash: !!adminHash, temSecret: !!secret,
        hashLen: adminHash?.length ?? 0, secretLen: secret?.length ?? 0,
      }));

      if (!adminEmail || !adminHash || !secret) {
        console.log(JSON.stringify({ etapa: '3_env_validacao', sucesso: false, timestamp: _ts() }));
        throw AppError.internal('Configuração de admin ausente no servidor.');
      }

      console.log(JSON.stringify({ etapa: '3_env_validacao', sucesso: true, timestamp: _ts() }));

      const emailOk = email.trim().toLowerCase() === adminEmail.trim().toLowerCase();

      console.log(JSON.stringify({ etapa: '4_email_comparado', sucesso: emailOk, timestamp: _ts() }));

      if (!emailOk) throw AppError.unauthorized('Credenciais inválidas.');

      console.log(JSON.stringify({ etapa: '5_antes_bcrypt', sucesso: true, timestamp: _ts() }));

      let senhaOk;
      try {
        senhaOk = await bcrypt.compare(senha, adminHash);
      } catch (bcryptErr) {
        console.error(JSON.stringify({
          etapa: '6_bcrypt_excecao', sucesso: false, timestamp: _ts(),
          errorName: bcryptErr?.name, errorMessage: bcryptErr?.message,
          stack: bcryptErr?.stack,
        }));
        throw bcryptErr;
      }

      console.log(JSON.stringify({ etapa: '6_bcrypt_resultado', sucesso: senhaOk, timestamp: _ts() }));

      if (!senhaOk) throw AppError.unauthorized('Credenciais inválidas.');

      console.log(JSON.stringify({ etapa: '7_antes_jwt', sucesso: true, timestamp: _ts() }));

      let token;
      try {
        token = jwt.sign(
          { email: adminEmail, type: 'admin' },
          secret,
          { expiresIn: '4h', issuer: 'barberflow', algorithm: 'HS256' }
        );
      } catch (jwtErr) {
        console.error(JSON.stringify({
          etapa: '7_jwt_excecao', sucesso: false, timestamp: _ts(),
          errorName: jwtErr?.name, errorMessage: jwtErr?.message,
          stack: jwtErr?.stack,
        }));
        throw jwtErr;
      }

      console.log(JSON.stringify({ etapa: '8_jwt_gerado', sucesso: true, timestamp: _ts() }));

      return { token };

    } catch (err) {
      if (!(err instanceof AppError)) {
        console.error(JSON.stringify({
          etapa: 'excecao_inesperada', sucesso: false, timestamp: _ts(),
          errorName: err?.name, errorMessage: err?.message, stack: err?.stack,
        }));
      }
      throw err;
    }
    // DEBUG_LOGIN_END
  }

  // ── Totais ─────────────────────────────────────────────────

  /** @returns {Promise<{ clientes: number, profissionais: number, barbearias: number }>} */
  async getTotais() {
    return this.#repo.getTotais();
  }

  // ── Usuários ───────────────────────────────────────────────

  /**
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
   * @param {{ email: string, senha: string, full_name: string, role?: string, pro_type?: string, plano?: string, price?: number, ends_at?: string }} dados
   * @returns {Promise<{ perfil: object, subscription: object }>}
   */
  async criarUsuario(dados) {
    AdminService.#email('email', dados.email);

    if (!dados.full_name?.trim()) throw AppError.badRequest('full_name é obrigatório.');
    if (!dados.senha || dados.senha.length < 6) {
      throw AppError.badRequest('Senha deve ter no mínimo 6 caracteres.');
    }

    const role     = dados.role     ?? 'client';
    const pro_type = dados.pro_type ?? null;

    if (!ROLES_VALIDOS.includes(role)) {
      throw AppError.badRequest(`role inválido. Valores aceitos: ${ROLES_VALIDOS.join(', ')}.`);
    }
    if (pro_type && !PRO_TYPES.includes(pro_type)) {
      throw AppError.badRequest(`pro_type inválido. Valores aceitos: ${PRO_TYPES.join(', ')}.`);
    }

    const perfil = await this.#repo.criarUsuario({
      email:     dados.email.trim().toLowerCase(),
      senha:     dados.senha,
      full_name: dados.full_name.trim(),
      role,
      pro_type,
    });

    const plan_type = dados.plano ?? 'mensal';
    if (!PLAN_TYPES.includes(plan_type)) {
      throw AppError.badRequest(`plano inválido. Valores aceitos: ${PLAN_TYPES.join(', ')}.`);
    }

    const subscription = await this.#repo.criarSubscription({
      userId:    perfil.id,
      plan_type,
      status:    'active',
      price:     Number(dados.price ?? 0),
      ends_at:   dados.ends_at ?? ENDS_AT_PERMANENTE,
    });

    return { perfil, subscription };
  }

  /**
   * @param {string} userId
   * @returns {Promise<void>}
   */
  async excluirUsuario(userId) {
    AdminService.#uuid('userId', userId);
    await this.#repo.excluirUsuario(userId);
  }

  // ── Barbeiros ─────────────────────────────────────────────

  /**
   * Alias de criarUsuario com role=professional.
   * @param {object} dados
   * @returns {Promise<{ perfil: object, subscription: object }>}
   */
  async criarBarbeiro(dados) {
    return this.criarUsuario({
      ...dados,
      role:     'professional',
      pro_type: dados.pro_type ?? 'barbeiro',
    });
  }

  /**
   * @param {string} userId
   * @returns {Promise<void>}
   */
  async excluirBarbeiro(userId) {
    return this.excluirUsuario(userId);
  }

  // ── Financeiro ─────────────────────────────────────────────

  /**
   * @param {{ status?: string, limit?: number, offset?: number }} filtros
   * @returns {Promise<object[]>}
   */
  async listarFinanceiro(filtros = {}) {
    const limit  = Math.min(Number(filtros.limit)  || 50, 200);
    const offset = Math.max(Number(filtros.offset) || 0,    0);
    return this.#repo.listarFinanceiro({ status: filtros.status ?? null, limit, offset });
  }

  /**
   * @param {string} subId
   * @param {{ plan_type?: string, status?: string, price?: number, ends_at?: string }} campos
   * @returns {Promise<object>}
   */
  async atualizarPlano(subId, campos) {
    AdminService.#uuid('subId', subId);
    if (campos.plan_type && !PLAN_TYPES.includes(campos.plan_type)) {
      throw AppError.badRequest(`plan_type inválido. Valores aceitos: ${PLAN_TYPES.join(', ')}.`);
    }
    return this.#repo.atualizarPlano(subId, campos);
  }
}

module.exports = AdminService;
