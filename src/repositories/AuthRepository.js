'use strict';

// =============================================================
// AuthRepository.js — Repositório de cadastro de perfil.
// Camada: infra
//
// Tabelas: profiles, barbershops.
// Responsável pela criação de perfil pós-signUp.
// =============================================================

const InputValidator = require('../infra/InputValidator');

class AuthRepository {

  #supabase;

  /** @param {import('@supabase/supabase-js').SupabaseClient} supabase */
  constructor(supabase) {
    this.#supabase = supabase;
  }

  /**
   * Cria ou atualiza o perfil do usuário (fallback pós-signUp).
   * Usa upsert para idempotência caso o trigger do Supabase já tenha criado o perfil.
   * NUNCA envia role/pro_type — esses campos são controlados pelo trigger handle_new_user.
   * @param {string} userId
   * @param {{ full_name: string, phone?: string|null }} dados
   * @returns {Promise<object>}
   */
  async criarPerfil(userId, dados) {
    const rId = InputValidator.uuid(userId);
    if (!rId.ok) throw new TypeError(`[AuthRepository] userId: ${rId.msg}`);

    const { data, error } = await this.#supabase
      .from('profiles')
      .upsert(
        { id: userId, full_name: dados.full_name, phone: dados.phone ?? null },
        { onConflict: 'id' }
      )
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Cria o registro inicial de uma barbearia para dono de barbearia.
   * @param {string} ownerId — UUID do perfil do dono
   * @param {string} nome    — Nome da barbearia
   * @returns {Promise<object>}
   */
  async criarBarbearia(ownerId, nome) {
    const rId = InputValidator.uuid(ownerId);
    if (!rId.ok) throw new TypeError(`[AuthRepository] ownerId: ${rId.msg}`);

    const { data, error } = await this.#supabase
      .from('barbershops')
      .insert({
        owner_id:  ownerId,
        name:      nome,
        is_active: true,
        is_open:   false,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Busca o perfil público de um usuário.
   * @param {string} userId
   * @returns {Promise<object|null>}
   */
  async getPerfilPublico(userId) {
    const rId = InputValidator.uuid(userId);
    if (!rId.ok) throw new TypeError(`[AuthRepository] userId: ${rId.msg}`);

    const { data, error } = await this.#supabase
      .from('profiles_public')
      .select('id, full_name, avatar_path, role')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    return data ?? null;
  }
}

module.exports = AuthRepository;
