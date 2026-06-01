'use strict';

// =============================================================
// RefreshTokenRepository.js — Armazenamento de refresh tokens customizados.
// Camada: infra
//
// Tabela: refresh_tokens
//
// Armazena APENAS o hash SHA-256 do token — nunca o token em claro.
// Isso garante que mesmo com acesso ao banco, os tokens não podem
// ser reutilizados (o hash é one-way).
//
// Usado para suporte a revogação explícita de tokens customizados
// gerados por TokenService.gerarRefreshToken().
//
// Para tokens do Supabase Auth, a revogação é feita via:
//   AuthService.logout() → supabase.auth.admin.signOut()
// =============================================================

const crypto         = require('node:crypto');
const BaseRepository = require('../infra/BaseRepository');

class RefreshTokenRepository extends BaseRepository {

  #supabase;

  /** @param {import('@supabase/supabase-js').SupabaseClient} supabase */
  constructor(supabase) {
    super('RefreshTokenRepository');
    this.#supabase = supabase;
  }

  // ── Hash interno ──────────────────────────────────────────

  /**
   * Deriva hash SHA-256 determinístico do token.
   * Permite lookup por hash sem armazenar o token original.
   * @param {string} token
   * @returns {string} hex SHA-256
   */
  static #hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  // ── Escrita ───────────────────────────────────────────────

  /**
   * Persiste novo refresh token (armazena apenas o hash SHA-256).
   *
   * @param {string}  userId
   * @param {string}  token        — token em texto puro (será hashed internamente)
   * @param {Date}    expiresAt
   * @param {string}  [deviceHint] — ex: 'iOS 18 / iPhone 15 Pro'
   * @param {string}  [ipAddress]  — IP do cliente
   * @param {string}  [familyId]   — UUID da família de tokens; null = novo login (DB gera UUID)
   * @returns {Promise<{ id: string, familyId: string }>}
   */
  async salvar(userId, token, expiresAt, deviceHint = null, ipAddress = null, familyId = null) {
    this._validarUuid('userId', userId);
    if (!token)                          throw new TypeError('token é obrigatório.');
    if (!(expiresAt instanceof Date))    throw new TypeError('expiresAt deve ser uma instância de Date.');

    const row = {
      user_id:     userId,
      token_hash:  RefreshTokenRepository.#hashToken(token),
      expires_at:  expiresAt.toISOString(),
      device_hint: deviceHint,
      ip_address:  ipAddress ?? null,
    };
    if (familyId) row.family_id = familyId;  // omitir → DB usa DEFAULT gen_random_uuid()

    const { data, error } = await this.#supabase
      .from('refresh_tokens')
      .insert(row)
      .select('id, family_id')
      .single();

    if (error) throw error;
    return { id: data.id, familyId: data.family_id };
  }

  // ── Leitura ───────────────────────────────────────────────

  /**
   * Busca refresh token por valor em texto puro.
   * Retorna null se não encontrado ou já revogado.
   *
   * @param {string} token — token em texto puro
   * @returns {Promise<{
   *   id:        string,
   *   userId:    string,
   *   expiresAt: string,
   * } | null>}
   */
  async buscar(token) {
    if (!token) return null;

    const { data, error } = await this.#supabase
      .from('refresh_tokens')
      .select('id, user_id, expires_at, revoked_at')
      .eq('token_hash', RefreshTokenRepository.#hashToken(token))
      .maybeSingle();

    if (error) throw error;
    if (!data)           return null;
    if (data.revoked_at) return null;  // já revogado — trata como não encontrado

    return {
      id:        data.id,
      userId:    data.user_id,
      expiresAt: data.expires_at,
      familyId:  data.family_id,
    };
  }

  // ── Cascade revocation ────────────────────────────────────────

  /**
   * Busca o family_id de um token, MESMO se já revogado.
   * Usado na detecção de compromisso: se o token foi revogado e alguém
   * tenta reutilizá-lo, encontramos a família e revogamos tudo.
   *
   * @param {string} token — token em texto puro
   * @returns {Promise<string | null>} familyId ou null se token não existe
   */
  async buscarFamiliaId(token) {
    if (!token) return null;

    const { data, error } = await this.#supabase
      .from('refresh_tokens')
      .select('family_id')
      .eq('token_hash', RefreshTokenRepository.#hashToken(token))
      .maybeSingle();

    if (error) throw error;
    return data?.family_id ?? null;
  }

  /**
   * Revoga TODOS os tokens de uma família (cascade revocation).
   * Chamado quando um token já revogado é reutilizado — sinal de compromisso.
   *
   * @param {string} familyId — UUID da família
   * @returns {Promise<void>}
   */
  async revogarFamilia(familyId) {
    if (!familyId) return;

    const { error } = await this.#supabase
      .from('refresh_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('family_id', familyId)
      .is('revoked_at', null);

    if (error) throw error;
  }

  // ── Revogação ─────────────────────────────────────────────

  /**
   * Revoga um token específico (soft delete — seta revoked_at).
   * Idempotente: chamadas repetidas não causam erro.
   *
   * @param {string} token — token em texto puro
   * @returns {Promise<void>}
   */
  async revogar(token) {
    if (!token) return;

    const { error } = await this.#supabase
      .from('refresh_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token_hash', RefreshTokenRepository.#hashToken(token))
      .is('revoked_at', null);     // só atualiza se ainda não revogado

    if (error) throw error;
  }

  /**
   * Revoga TODOS os refresh tokens de um usuário.
   * Usado em logout-all-devices e exclusão de conta.
   *
   * @param {string} userId
   * @returns {Promise<void>}
   */
  async revogarTodos(userId) {
    this._validarUuid('userId', userId);

    const { error } = await this.#supabase
      .from('refresh_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('revoked_at', null);

    if (error) throw error;
  }
}

module.exports = RefreshTokenRepository;
