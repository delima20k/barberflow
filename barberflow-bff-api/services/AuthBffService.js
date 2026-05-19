'use strict';

const BaseService = require('./BaseService');
const AppError    = require('../utils/AppError');

// ================================================================
// AuthBffService — Regras de negócio de autenticação na BFF.
//
// Responsabilidades:
//   - Validar inputs antes de delegar ao AuthRepository
//   - Centralizar logs de autenticação (login, logout, refresh, expiração)
//   - Construir payload de resposta padronizado
//   - NÃO acessa banco diretamente — delega ao AuthRepository
// ================================================================

class AuthBffService extends BaseService {

  /** @type {import('../repositories/AuthRepository')} */
  #repo;

  /** @param {import('../repositories/AuthRepository')} repo */
  constructor(repo) {
    super('AuthBffService');
    this.#repo = repo;
  }

  // ── Login ────────────────────────────────────────────────────────

  /**
   * Autentica o usuário e retorna tokens + user.
   * @param {string} email
   * @param {string} password
   * @returns {Promise<{ access_token, refresh_token, expires_at, user }>}
   */
  async login(email, password) {
    this._email('email', email);

    if (!password || typeof password !== 'string' || password.length < 1) {
      throw AppError.badRequest('senha: campo obrigatório.');
    }

    try {
      return await this.#repo.signIn(email, password);
    } catch (err) {
      console.error('[AUTH] falha no login', { email: AuthBffService.#mascarar(email), erro: err.message });
      throw err;
    }
  }

  // ── Refresh ──────────────────────────────────────────────────────

  /**
   * Renova access_token via refresh_token.
   * @param {string} refreshToken
   * @returns {Promise<{ access_token, refresh_token, expires_at, user }>}
   */
  async refresh(refreshToken) {
    if (!refreshToken || typeof refreshToken !== 'string') {
      throw AppError.badRequest('refresh_token: campo obrigatório.');
    }

    try {
      return await this.#repo.refreshToken(refreshToken);
    } catch (err) {
      console.error('[AUTH] falha no refresh', { erro: err.message });
      throw err;
    }
  }

  // ── Logout ───────────────────────────────────────────────────────

  /**
   * Invalida o token do usuário.
   * @param {string} userId     — ID do usuário (req.user.id populado pelo middleware)
   * @param {string} accessToken — Bearer token extraído do header
   */
  async logout(userId, accessToken) {
    try {
      await this.#repo.signOut(accessToken);
      console.info('[AUTH] logout ok', { userId });
    } catch (err) {
      // Logout nunca falha para o cliente — token pode já estar expirado
      console.warn('[AUTH] logout com aviso', { userId, erro: err.message });
    }
  }

  // ── Me ───────────────────────────────────────────────────────────

  /**
   * Retorna dados do usuário autenticado + perfil da tabela profiles.
   * O JWT já foi validado pelo AuthMiddleware antes de chegar aqui.
   * @param {{ id: string, email: string }} user — req.user
   * @returns {Promise<{ user: object, perfil: object|null }>}
   */
  async me(user) {
    this._uuid('userId', user.id);

    const perfil = await this.#repo.getPerfil(user.id);

    if (!perfil) {
      console.warn('[AUTH] me: perfil não encontrado', { userId: user.id });
    }

    return { user, perfil };
  }

  // ── Privados ─────────────────────────────────────────────────────

  /** Mascara email para logs (sem expor dados sensíveis). */
  static #mascarar(email) {
    const [local, domain] = (email ?? '').split('@');
    if (!domain) return '***';
    return `${local?.[0] ?? '*'}***@${domain}`;
  }
}

module.exports = AuthBffService;
