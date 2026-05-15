'use strict';

const BaseRepository = require('./BaseRepository');
const AppError       = require('../utils/AppError');

// ================================================================
// AuthRepository — Acesso à Supabase Auth REST API e tabela profiles.
//
// Responsabilidades:
//   - Autenticar usuários via /auth/v1/token (sem SDK — fetch direto)
//   - Renovar tokens via grant_type=refresh_token
//   - Invalidar tokens via /auth/v1/logout
//   - Buscar perfil do usuário em profiles (service_role via _db)
//
// Todas as chamadas de Auth usam fetch direto à REST API do Supabase
// com a ANON_KEY do servidor (nunca exposta ao browser).
// ================================================================

class AuthRepository extends BaseRepository {

  static #AUTH_URL = null;
  static #ANON_KEY = null;

  /** @param {import('@supabase/supabase-js').SupabaseClient} db */
  constructor(db) {
    super('AuthRepository', db);
    AuthRepository.#AUTH_URL = `${process.env.SUPABASE_URL}/auth/v1`;
    AuthRepository.#ANON_KEY = process.env.SUPABASE_ANON_KEY;

    if (!AuthRepository.#AUTH_URL || !AuthRepository.#ANON_KEY) {
      throw new Error('[AuthRepository] SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórios.');
    }
  }

  // ── Cabeçalhos base ──────────────────────────────────────────────

  static #baseHeaders() {
    return {
      'Content-Type': 'application/json',
      'apikey':       AuthRepository.#ANON_KEY,
    };
  }

  // ── Parseia erro da Auth REST API ───────────────────────────────

  static #parseAuthError(json, httpStatus) {
    const msg = json?.error_description ?? json?.msg ?? json?.error ?? 'Erro de autenticação.';
    const status = httpStatus >= 400 && httpStatus < 500 ? 401 : 502;
    return new AppError(msg, status);
  }

  // ── Chamadas de Auth ─────────────────────────────────────────────

  /**
   * Autentica email + senha via Supabase Auth REST.
   * @param {string} email
   * @param {string} password
   * @returns {Promise<{ access_token, refresh_token, expires_at, user }>}
   */
  async signIn(email, password) {
    const url = `${AuthRepository.#AUTH_URL}/token?grant_type=password`;
    const res = await fetch(url, {
      method:  'POST',
      headers: AuthRepository.#baseHeaders(),
      body:    JSON.stringify({ email, password }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw AuthRepository.#parseAuthError(json, res.status);

    console.info('[AUTH] login ok', { userId: json.user?.id });
    return {
      access_token:  json.access_token,
      refresh_token: json.refresh_token,
      expires_at:    json.expires_at,
      user:          { id: json.user?.id, email: json.user?.email },
    };
  }

  /**
   * Renova tokens via refresh_token.
   * @param {string} refreshToken
   * @returns {Promise<{ access_token, refresh_token, expires_at, user }>}
   */
  async refreshToken(refreshToken) {
    const url = `${AuthRepository.#AUTH_URL}/token?grant_type=refresh_token`;
    const res = await fetch(url, {
      method:  'POST',
      headers: AuthRepository.#baseHeaders(),
      body:    JSON.stringify({ refresh_token: refreshToken }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw AuthRepository.#parseAuthError(json, res.status);

    console.info('[AUTH] refresh ok', { userId: json.user?.id });
    return {
      access_token:  json.access_token,
      refresh_token: json.refresh_token,
      expires_at:    json.expires_at,
      user:          { id: json.user?.id, email: json.user?.email },
    };
  }

  /**
   * Invalida o access_token via Supabase Auth (logout scope=local).
   * @param {string} accessToken — token do usuário a ser invalidado
   */
  async signOut(accessToken) {
    const url = `${AuthRepository.#AUTH_URL}/logout?scope=local`;
    const res = await fetch(url, {
      method:  'POST',
      headers: {
        ...AuthRepository.#baseHeaders(),
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    // 204 = sucesso; qualquer outro 2xx também aceito
    if (!res.ok && res.status !== 204) {
      const json = await res.json().catch(() => ({}));
      throw AuthRepository.#parseAuthError(json, res.status);
    }

    console.info('[AUTH] logout ok');
  }

  // ── Queries de perfil ────────────────────────────────────────────

  /**
   * Busca perfil completo na tabela profiles usando service_role_key.
   * @param {string} userId
   * @returns {Promise<object|null>}
   */
  async getPerfil(userId) {
    this._uuid('userId', userId);

    const { data, error } = await this._db
      .from('profiles')
      .select('id, full_name, phone, avatar_path, role, pro_type, updated_at')
      .eq('id', userId)
      .single();

    if (error) {
      const code = error?.code ?? '';
      if (code === 'PGRST116' || error?.status === 406) return null;
      this._throwDbError(error, 'getPerfil');
    }

    return data ?? null;
  }
}

module.exports = AuthRepository;
