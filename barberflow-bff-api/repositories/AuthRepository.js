'use strict';

const BaseRepository  = require('./BaseRepository');
const AppError        = require('../utils/AppError');
const RetryHelper     = require('../utils/RetryHelper');
const DocumentCipher  = require('../infrastructure/crypto/DocumentCipher');

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

// Lidas uma vez ao carregar o módulo — imutáveis, sem risco de sobrescrita entre instâncias.
const AUTH_URL = process.env.SUPABASE_URL ? `${process.env.SUPABASE_URL}/auth/v1` : null;
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? null;

class AuthRepository extends BaseRepository {

  static #RETRY_CONFIG = {
    maxAttempts: 2,
    baseDelayMs: 300,
    shouldRetry:  (err) => !(err instanceof AppError) || err.status >= 500,
  };

  /** @param {import('@supabase/supabase-js').SupabaseClient} db */
  constructor(db) {
    super('AuthRepository', db);
    if (!AUTH_URL || !ANON_KEY) {
      throw new Error('[AuthRepository] SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórios.');
    }
  }

  // ── Cabeçalhos base ──────────────────────────────────────────────

  static #baseHeaders() {
    return {
      'Content-Type': 'application/json',
      'apikey':       ANON_KEY,
    };
  }

  // ── Parseia erro da Auth REST API ───────────────────────────────

  static #parseAuthError(json, httpStatus) {
    const msg = json?.error_description ?? json?.msg ?? json?.error ?? 'Erro de autenticação.';
    const status = httpStatus >= 400 && httpStatus < 500 ? 401 : 502;
    return new AppError(msg, status);
  }

  // ── Chamadas de Auth ─────────────────────────────────────────────

  // Fetch + retry + parse compartilhado por signIn e refreshToken.
  static async #fetchToken(url, body) {
    return RetryHelper.withRetry(
      async () => {
        const res  = await fetch(url, {
          method:  'POST',
          headers: AuthRepository.#baseHeaders(),
          body:    JSON.stringify(body),
          signal:  AbortSignal.timeout(10_000),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw AuthRepository.#parseAuthError(json, res.status);
        return {
          access_token:  json.access_token,
          refresh_token: json.refresh_token,
          expires_at:    json.expires_at,
          user:          { id: json.user?.id, email: json.user?.email },
        };
      },
      AuthRepository.#RETRY_CONFIG,
    );
  }

  /**
   * Autentica email + senha via Supabase Auth REST.
   * @param {string} email
   * @param {string} password
   * @returns {Promise<{ access_token, refresh_token, expires_at, user }>}
   */
  async signIn(email, password) {
    return AuthRepository.#fetchToken(
      `${AUTH_URL}/token?grant_type=password`,
      { email, password },
    );
  }

  /**
   * Renova tokens via refresh_token.
   * @param {string} refreshToken
   * @returns {Promise<{ access_token, refresh_token, expires_at, user }>}
   */
  async refreshToken(refreshToken) {
    return AuthRepository.#fetchToken(
      `${AUTH_URL}/token?grant_type=refresh_token`,
      { refresh_token: refreshToken },
    );
  }

  /**
   * Invalida o access_token via Supabase Auth (logout scope=local).
   * @param {string} accessToken — token do usuário a ser invalidado
   */
  async signOut(accessToken) {
    const url = `${AUTH_URL}/logout?scope=local`;
    const res = await fetch(url, {
      method:  'POST',
      headers: {
        ...AuthRepository.#baseHeaders(),
        'Authorization': `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(10_000),
    });

    // 204 = sucesso; qualquer outro 2xx também aceito
    if (!res.ok && res.status !== 204) {
      const json = await res.json().catch(() => ({}));
      throw AuthRepository.#parseAuthError(json, res.status);
    }
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
      .select('id, full_name, phone, avatar_path, role, pro_type, address, birth_date, gender, zip_code, is_active, created_at, updated_at, cpf_cnpj_enc')
      .eq('id', userId)
      .single();

    if (error) {
      const code = error?.code ?? '';
      if (code === 'PGRST116' || error?.status === 406) return null;
      this._throwDbError(error, 'getPerfil');
    }

    if (!data) return null;

    // Decifra o documento server-side; nunca expõe cpf_cnpj_enc ao caller
    const { cpf_cnpj_enc, ...rest } = data;
    rest.cpf_cnpj = DocumentCipher.tryDecrypt(cpf_cnpj_enc);
    return rest;
  }

  /**
   * Persiste o documento de identificação (CPF/CNPJ) cifrado na coluna
   * profiles.cpf_cnpj_enc. Chamado após o cadastro do profissional.
   *
   * @param {string} userId
   * @param {string} cpfCnpj — somente dígitos (11 ou 14)
   */
  async salvarDocumento(userId, cpfCnpj) {
    this._uuid('userId', userId);

    const digits = String(cpfCnpj ?? '').replace(/\D/g, '');
    if (![11, 14].includes(digits.length)) {
      throw AppError.badRequest('documento: deve ter 11 (CPF) ou 14 (CNPJ) dígitos.');
    }

    const cpf_cnpj_enc = DocumentCipher.encrypt(digits);

    const { error } = await this._db
      .from('profiles')
      .update({ cpf_cnpj_enc })
      .eq('id', userId);

    if (error) this._throwDbError(error, 'salvarDocumento');
  }
}

module.exports = AuthRepository;
