'use strict';

// =============================================================
// TokenService.js — Geração e verificação de tokens JWT.
// Camada: infra
//
// Responsabilidade única: operações criptográficas sobre JWTs.
//
// Tokens customizados gerados por esta classe:
//   access  — curta duração (15 min) | carrega sub + role + type='access'
//   refresh — longa duração  (7 dias) | carrega apenas sub + type='refresh'
//
// Também verifica tokens do Supabase Auth LOCALMENTE (sem chamada de rede),
// eliminando a latência HTTP em cada requisição autenticada.
//
// Segredos lidos de process.env em tempo de chamada (não de carregamento):
//   JWT_ACCESS_SECRET   — para access tokens customizados
//   JWT_REFRESH_SECRET  — para refresh tokens customizados
//   SUPABASE_JWT_SECRET — para tokens emitidos pelo Supabase Auth (HS256)
//
// Se SUPABASE_JWT_SECRET não estiver configurado, AuthMiddleware faz
// fallback automático para verificação por rede.
// =============================================================

const jwt = require('jsonwebtoken');

class TokenService {

  static #ACCESS_EXPIRES  = '15m';
  static #REFRESH_EXPIRES = '7d';
  static #ISSUER          = 'barberflow';
  static #ALGORITHM       = 'HS256';

  // ── Segredos (lidos em tempo de chamada) ──────────────────

  static #segredoAccess() {
    const s = process.env.JWT_ACCESS_SECRET;
    if (!s) throw Object.assign(new Error('JWT_ACCESS_SECRET não configurado.'), { status: 500 });
    return s;
  }

  static #segredoRefresh() {
    const s = process.env.JWT_REFRESH_SECRET;
    if (!s) throw Object.assign(new Error('JWT_REFRESH_SECRET não configurado.'), { status: 500 });
    return s;
  }

  // ── Access token ──────────────────────────────────────────

  /**
   * Gera access token JWT customizado (curta duração — 15 min).
   *
   * @param {{ sub: string, email?: string, role?: string }} payload
   * @returns {string} JWT assinado com HS256
   * @throws {Error{status:400}} se payload.sub ausente
   */
  static gerarAccessToken(payload) {
    if (!payload?.sub) {
      throw Object.assign(new Error('payload.sub é obrigatório.'), { status: 400 });
    }
    return jwt.sign(
      {
        sub:   payload.sub,
        email: payload.email ?? '',
        role:  payload.role  ?? 'client',
        type:  'access',
      },
      TokenService.#segredoAccess(),
      {
        expiresIn:  TokenService.#ACCESS_EXPIRES,
        issuer:     TokenService.#ISSUER,
        algorithm:  TokenService.#ALGORITHM,
      }
    );
  }

  // ── Refresh token ─────────────────────────────────────────

  /**
   * Gera refresh token JWT (longa duração — 7 dias).
   * Carrega apenas o userId — nunca dados sensíveis.
   *
   * @param {string} userId
   * @returns {string} JWT assinado com HS256
   * @throws {Error{status:400}} se userId ausente
   */
  static gerarRefreshToken(userId) {
    if (!userId) {
      throw Object.assign(new Error('userId é obrigatório.'), { status: 400 });
    }
    return jwt.sign(
      { sub: userId, type: 'refresh' },
      TokenService.#segredoRefresh(),
      {
        expiresIn: TokenService.#REFRESH_EXPIRES,
        issuer:    TokenService.#ISSUER,
        algorithm: TokenService.#ALGORITHM,
      }
    );
  }

  // ── Verificação de token customizado ──────────────────────

  /**
   * Verifica e decodifica token customizado (access ou refresh).
   * Valida assinatura, expiração, issuer e campo `type`.
   *
   * @param {string}             token
   * @param {'access'|'refresh'} [tipo='access']
   * @returns {{ sub: string, type: string, [key: string]: unknown }}
   * @throws {Error{status:401}} token inválido, expirado ou de tipo errado
   */
  static verificar(token, tipo = 'access') {
    const secret = tipo === 'refresh'
      ? TokenService.#segredoRefresh()
      : TokenService.#segredoAccess();

    try {
      const payload = jwt.verify(token, secret, {
        issuer:     TokenService.#ISSUER,
        algorithms: [TokenService.#ALGORITHM],
      });

      if (payload.type !== tipo) {
        // Previne uso de refresh token onde se espera access e vice-versa
        throw new Error('Tipo de token inválido.');
      }

      return payload;
    } catch (err) {
      throw Object.assign(
        new Error('Token inválido ou expirado.'),
        { status: 401, cause: err }
      );
    }
  }

  // ── Verificação de token Supabase Auth (local — sem rede) ─

  /**
   * Verifica token do Supabase Auth LOCALMENTE usando SUPABASE_JWT_SECRET.
   * Zero latência HTTP — muito mais rápido que supabase.auth.getUser(token).
   *
   * Supabase assina JWTs com HS256 por padrão.
   * Se o projeto usar Ed25519 (versões mais recentes), a verificação falhará
   * e AuthMiddleware fará fallback para verificação por rede automaticamente.
   *
   * @param {string} token — Bearer token do Supabase Auth
   * @returns {{ sub: string, email: string, role: string, [key: string]: unknown }}
   * @throws {Error{status:401}} token inválido ou expirado
   * @throws {Error{status:500}} SUPABASE_JWT_SECRET não configurado
   */
  static verificarSupabase(token) {
    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret) {
      throw Object.assign(
        new Error('SUPABASE_JWT_SECRET não configurado.'),
        { status: 500 }
      );
    }

    try {
      // Supabase usa HS256 — algoritmo fixo para evitar algorithm confusion attacks
      return jwt.verify(token, secret, { algorithms: [TokenService.#ALGORITHM] });
    } catch (err) {
      throw Object.assign(
        new Error('Token inválido ou expirado.'),
        { status: 401, cause: err }
      );
    }
  }

  // ── Admin token ───────────────────────────────────────────

  static #segredoAdmin() {
    const s = process.env.ADMIN_JWT_SECRET;
    if (!s) throw Object.assign(new Error('ADMIN_JWT_SECRET não configurado.'), { status: 500 });
    return s;
  }

  /**
   * Gera token JWT exclusivo para o admin da dashboard.
   * Usa secret próprio (ADMIN_JWT_SECRET) — completamente separado
   * dos tokens Supabase Auth e dos tokens de usuário.
   *
   * @param {{ email: string }} payload
   * @returns {string} JWT assinado com HS256, validade 4h
   * @throws {Error{status:400}} se email ausente
   */
  static gerarAdmin(payload) {
    if (!payload?.email) {
      throw Object.assign(new Error('payload.email é obrigatório.'), { status: 400 });
    }
    return jwt.sign(
      { email: payload.email, type: 'admin' },
      TokenService.#segredoAdmin(),
      {
        expiresIn:  '4h',
        issuer:     TokenService.#ISSUER,
        algorithm:  TokenService.#ALGORITHM,
      }
    );
  }

  /**
   * Verifica token de admin.
   * Rejeita explicitamente qualquer token cujo `type` não seja 'admin' —
   * tokens de usuário Supabase jamais passam aqui.
   *
   * @param {string} token
   * @returns {{ email: string, type: 'admin' }}
   * @throws {Error{status:401}} token inválido, expirado ou tipo errado
   */
  static verificarAdmin(token) {
    try {
      const payload = jwt.verify(token, TokenService.#segredoAdmin(), {
        issuer:     TokenService.#ISSUER,
        algorithms: [TokenService.#ALGORITHM],
      });
      if (payload.type !== 'admin') {
        throw new Error('Tipo de token inválido.');
      }
      return payload;
    } catch (err) {
      throw Object.assign(
        new Error('Token de admin inválido ou expirado.'),
        { status: 401, cause: err }
      );
    }
  }
}

module.exports = TokenService;
