'use strict';

const BaseController  = require('./BaseController');
const AuthMiddleware  = require('../middlewares/auth');

// ================================================================
// AuthController — Endpoints de autenticação da BFF.
//
// Rotas:
//   POST /api/auth/login    — pública (sem JWT)
//   POST /api/auth/refresh  — pública (sem JWT, refresh_token no body)
//   POST /api/auth/logout   — autenticada (JWT via AuthMiddleware)
//   GET  /api/auth/me       — autenticada (JWT via AuthMiddleware)
//
// NÃO remove Supabase Auth — BFF é proxy centralizado com logging.
// O SDK Supabase no browser continua gerenciando autoRefresh.
// ================================================================

class AuthController extends BaseController {

  /** @type {import('../services/AuthBffService')} */
  #service;

  /** @param {import('../services/AuthBffService')} service */
  constructor(service) {
    super();
    this.#service = service;
  }

  // ── POST /api/auth/login ─────────────────────────────────────────

  /**
   * Autentica o usuário e retorna tokens JWT.
   * Público — sem exigência de Authorization.
   */
  async login(req, res) {
    await this.handle(res, async () => {
      const email    = (req.body?.email    ?? '').trim();
      const password =  req.body?.password ?? '';

      const dados = await this.#service.login(email, password);
      this.success(res, dados);
    });
  }

  // ── POST /api/auth/refresh ───────────────────────────────────────

  /**
   * Renova o access_token via refresh_token.
   * Público — token expirado não pode se autenticar.
   */
  async refresh(req, res) {
    await this.handle(res, async () => {
      const refreshToken = req.body?.refresh_token ?? '';

      const dados = await this.#service.refresh(refreshToken);
      this.success(res, dados);
    });
  }

  // ── POST /api/auth/logout ────────────────────────────────────────

  /**
   * Invalida o token do usuário autenticado.
   * Requer Authorization: Bearer <token> (via AuthMiddleware).
   */
  async logout(req, res) {
    await this.handle(res, async () => {
      const accessToken = req.headers['authorization']?.slice(7) ?? '';
      await this.#service.logout(req.user.id, accessToken);
      AuthMiddleware.invalidarToken(accessToken);
      this.success(res, { mensagem: 'Sessão encerrada com sucesso.' });
    });
  }

  // ── GET /api/auth/me ─────────────────────────────────────────────

  /**
   * Retorna dados do usuário autenticado + perfil.
   * Requer Authorization: Bearer <token> (via AuthMiddleware).
   */
  async me(req, res) {
    await this.handle(res, async () => {
      const dados = await this.#service.me(req.user);
      this.success(res, dados);
    });
  }

  // ── POST /api/auth/documento ─────────────────────────────────────

  /**
   * Persiste o CPF ou CNPJ cifrado do profissional logo após o cadastro.
   * Requer Authorization: Bearer <token> (via AuthMiddleware).
   * Body: { cpfCnpj: string } — somente dígitos
   */
  async salvarDocumento(req, res) {
    await this.handle(res, async () => {
      const cpfCnpj = String(req.body?.cpfCnpj ?? '').replace(/\D/g, '');
      await this.#service.salvarDocumento(req.user, cpfCnpj);
      this.success(res, { mensagem: 'Documento salvo com sucesso.' });
    });
  }
}

module.exports = AuthController;
