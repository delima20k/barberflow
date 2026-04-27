'use strict';

// =============================================================
// AuthService.js — Orquestração de autenticação via Supabase Auth.
// Camada: application
//
// Responsabilidade:
//   - Login, logout e renovação de sessão via Supabase Auth
//   - Validação de força de senha antes de alteração
//   - Reset de senha por e-mail (anti-enumeração de usuários)
//
// REGRAS DE SEGURANÇA:
//   - NUNCA retorna senha ou hash no resultado.
//   - Mensagens de erro são genéricas — sem expor detalhes internos.
//   - solicitarResetSenha() nunca confirma se o e-mail existe no banco.
//   - logout() é tolerante a falhas (token pode já estar expirado).
//
// Nunca acessa o banco diretamente — usa o Supabase Auth Admin API.
// =============================================================

const BaseService     = require('../infra/BaseService');
const PasswordService = require('../infra/PasswordService');
const TokenService    = require('../infra/TokenService');

class AuthService extends BaseService {

  #supabase;

  /** @param {import('@supabase/supabase-js').SupabaseClient} supabase */
  constructor(supabase) {
    super('AuthService');
    this.#supabase = supabase;
  }

  // ── Login ──────────────────────────────────────────────────

  /**
   * Autentica usuário com e-mail e senha via Supabase Auth.
   * Mensagem de erro genérica (anti-enumeração / anti-brute-force).
   *
   * @param {string} email
   * @param {string} senha
   * @returns {Promise<{
   *   userId:       string,
   *   accessToken:  string,
   *   refreshToken: string,
   *   expiresAt:    number
   * }>}
   * @throws {Error{status:400}} e-mail ou senha com formato inválido
   * @throws {Error{status:401}} credenciais inválidas (mensagem genérica)
   */
  async login(email, senha) {
    this._email('email', email);
    if (!senha?.trim()) throw this._erro('Senha obrigatória.');

    const { data, error } = await this.#supabase.auth.signInWithPassword({
      email:    email.trim().toLowerCase(),
      password: senha,
    });

    // Mensagem intencionalemente genérica — nunca expõe se o e-mail existe
    if (error || !data?.session) {
      throw this._erro('Credenciais inválidas.', 401);
    }

    return {
      userId:       data.user.id,
      accessToken:  data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt:    data.session.expires_at,
    };
  }

  // ── Renovação de sessão ────────────────────────────────────

  /**
   * Renova o access token usando o refresh token do Supabase Auth.
   *
   * @param {string} refreshToken
   * @returns {Promise<{
   *   accessToken:  string,
   *   refreshToken: string,
   *   expiresAt:    number
   * }>}
   * @throws {Error{status:400}} token vazio
   * @throws {Error{status:401}} token inválido ou expirado
   */
  async renovarToken(refreshToken) {
    if (!refreshToken?.trim()) throw this._erro('Refresh token obrigatório.');

    const { data, error } = await this.#supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data?.session) {
      throw this._erro('Refresh token inválido ou expirado.', 401);
    }

    return {
      accessToken:  data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt:    data.session.expires_at,
    };
  }

  // ── Logout ─────────────────────────────────────────────────

  /**
   * Revoga a sessão específica do usuário (apenas o dispositivo atual).
   * Falhas são toleradas silenciosamente — token pode já ter expirado.
   *
   * @param {string|null} accessToken — JWT do Bearer token atual
   * @returns {Promise<void>}
   */
  async logout(accessToken) {
    if (!accessToken?.trim()) return;
    try {
      // scope 'local' revoga apenas esta sessão, sem deslogar outros dispositivos
      await this.#supabase.auth.admin.signOut(accessToken, 'local');
    } catch {
      // Falha silenciosa — logout do lado cliente procede normalmente
    }
  }

  // ── Alteração de senha ─────────────────────────────────────

  /**
   * Altera a senha de um usuário (operação admin — server-side).
   * Valida força da nova senha ANTES de enviar ao Supabase.
   *
   * @param {string} userId    — UUID do usuário
   * @param {string} novaSenha — nova senha em texto puro
   * @returns {Promise<void>}
   * @throws {Error{status:400}} userId inválido ou senha fraca
   * @throws {Error{status:500}} falha interna no Supabase
   */
  async alterarSenha(userId, novaSenha) {
    this._uuid('userId', userId);

    const forca = PasswordService.validarForca(novaSenha);
    if (!forca.ok) throw this._erro(forca.msg);

    const { error } = await this.#supabase.auth.admin.updateUserById(userId, {
      password: novaSenha,
    });

    if (error) throw this._erro('Não foi possível alterar a senha.', 500);
  }

  // ── Reset de senha ─────────────────────────────────────────

  /**
   * Solicita envio de e-mail de recuperação de senha.
   *
   * SEGURANÇA: NUNCA informa se o e-mail está ou não cadastrado.
   * Retorna silenciosamente para qualquer e-mail com formato válido.
   * Isso previne user enumeration attacks.
   *
   * @param {string} email
   * @returns {Promise<void>}
   * @throws {Error{status:400}} formato de e-mail inválido
   */
  async solicitarResetSenha(email) {
    this._email('email', email);

    // Resultado e erros ignorados intencionalmente — anti-enumeração:
    // nunca confirmar se o e-mail existe ou não no banco de dados.
    try {
      await this.#supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
    } catch {
      // Silencioso
    }
  }

  // ── Validação de token (uso no SecureMediaAccessService) ──────────

  /**
   * Valida um JWT do Supabase Auth e retorna o usuário autenticado.
   * Tenta verificação local (zero latência) com fallback para rede.
   *
   * @param {string} token — Bearer token do Supabase Auth
   * @returns {Promise<{ id: string, email: string }>}
   * @throws {Error{status:401}} token ausente, inválido ou expirado
   */
  async validateUser(token) {
    if (!token?.trim()) throw this._erro('Token de autenticação ausente.', 401);

    // Verificação local (zero latência) quando SUPABASE_JWT_SECRET está disponível
    if (process.env.SUPABASE_JWT_SECRET) {
      try {
        const payload = TokenService.verificarSupabase(token);
        return { id: payload.sub, email: payload.email ?? '' };
      } catch {
        throw this._erro('Token inválido ou expirado.', 401);
      }
    }

    // Fallback: verificação por rede (quando SUPABASE_JWT_SECRET não está configurado)
    const { data, error } = await this.#supabase.auth.getUser(token);
    if (error || !data?.user) throw this._erro('Token inválido ou expirado.', 401);

    return { id: data.user.id, email: data.user.email ?? '' };
  }
}

module.exports = AuthService;
