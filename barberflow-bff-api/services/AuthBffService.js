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

  /** @type {import('../domain/notifications/ports/IEmailService').IEmailService|null} */
  #emailService;

  /**
   * @param {import('../repositories/AuthRepository')} repo
   * @param {import('../domain/notifications/ports/IEmailService').IEmailService|null} emailService
   */
  constructor(repo, emailService = null) {
    super('AuthBffService');
    this.#repo = repo;
    this.#emailService = emailService;
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

  // ── Documento ────────────────────────────────────────────────────

  /**
   * Persiste o documento de identificação (CPF/CNPJ) cifrado.
   * Chamado imediatamente após o cadastro do profissional.
   *
   * @param {{ id: string }} user — req.user (JWT já validado)
   * @param {string} cpfCnpj     — somente dígitos (11 ou 14)
   */
  async salvarDocumento(user, cpfCnpj) {
    this._uuid('userId', user.id);
    await this.#repo.salvarDocumento(user.id, cpfCnpj);
    console.info('[AUTH] documento salvo', { userId: user.id });
  }

  // ── Emails transacionais ─────────────────────────────────────────

  /**
   * Dispara email de confirmacao de cadastro sem bloquear o fluxo.
   * @param {{ email: string, userName?: string|null, redirectTo?: string|null }} payload
   * @returns {Promise<{ accepted: true }>}
   */
  async enviarConfirmacaoCadastro({ email, userName = null, redirectTo = null } = {}) {
    const normalizedEmail = String(email ?? '').trim().toLowerCase();
    this._email('email', normalizedEmail);

    try {
      const link = await this.#repo.generateSignupConfirmationLink(normalizedEmail, AuthBffService.#safeRedirect(redirectTo));
      await this.#emailService?.sendSignupConfirmation(normalizedEmail, userName, link);
    } catch (err) {
      console.warn('[AUTH] confirmacao de cadastro nao enviada', {
        email: AuthBffService.#mascarar(normalizedEmail),
        erro: err?.message,
      });
    }

    return { accepted: true };
  }

  /**
   * Gera link e envia email de recuperacao. Resposta sempre generica para
   * nao permitir enumeracao de usuarios por email.
   * @param {{ email: string, redirectTo?: string|null }} payload
   * @returns {Promise<{ accepted: true }>}
   */
  async solicitarRecuperacaoSenha({ email, redirectTo = null } = {}) {
    const normalizedEmail = String(email ?? '').trim().toLowerCase();
    this._email('email', normalizedEmail);

    try {
      const [perfil, link] = await Promise.all([
        this.#repo.getPerfilByEmail(normalizedEmail).catch(() => null),
        this.#repo.generatePasswordResetLink(normalizedEmail, AuthBffService.#safeRedirect(redirectTo)),
      ]);
      const userName = perfil?.full_name ?? normalizedEmail.split('@')[0] ?? 'tudo bem';
      await this.#emailService?.sendPasswordReset(normalizedEmail, userName, link, 60);
    } catch (err) {
      console.warn('[AUTH] recuperacao de senha nao enviada', {
        email: AuthBffService.#mascarar(normalizedEmail),
        erro: err?.message,
      });
    }

    return { accepted: true };
  }

  /**
   * Envia alerta de senha alterada. Falha nao deve quebrar o fluxo de auth.
   * @param {{ id: string, email: string }} user
   * @returns {Promise<{ sent: boolean, skipped?: boolean }>}
   */
  async notificarSenhaAlterada(user) {
    this._uuid('userId', user.id);
    const email = String(user.email ?? '').trim().toLowerCase();
    this._email('email', email);

    try {
      const perfil = await this.#repo.getPerfil(user.id);
      const result = await this.#emailService?.sendPasswordChangedNotification(
        email,
        perfil?.full_name ?? email.split('@')[0],
      );
      return { sent: result?.ok === true, skipped: result?.skipped === true };
    } catch (err) {
      console.warn('[AUTH] alerta de senha alterada nao enviado', { userId: user.id, erro: err?.message });
      return { sent: false, skipped: true };
    }
  }

  // ── Privados ─────────────────────────────────────────────────────

  /** Mascara email para logs (sem expor dados sensíveis). */
  static #mascarar(email) {
    const [local, domain] = (email ?? '').split('@');
    if (!domain) return '***';
    return `${local?.[0] ?? '*'}***@${domain}`;
  }

  static #safeRedirect(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    try {
      const url = new URL(raw);
      if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
        return null;
      }
      return url.toString();
    } catch {
      return null;
    }
  }
}

module.exports = AuthBffService;
