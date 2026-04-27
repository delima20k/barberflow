'use strict';

// =============================================================
// ClienteRepository.js — Repositório de perfis de clientes.
// Camada: infra
//
// Única camada que acessa o banco de dados (tabela: profiles).
// Sem lógica de negócio — apenas acesso e persistência.
// Usa @supabase/supabase-js com service_role key.
// =============================================================

const InputValidator = require('../infra/InputValidator');

class ClienteRepository {

  #supabase;

  /** @param {import('@supabase/supabase-js').SupabaseClient} supabase */
  constructor(supabase) {
    this.#supabase = supabase;
  }

  // Allowlist de campos que o cliente pode atualizar
  static #CAMPOS_ATUALIZAVEIS = [
    'full_name', 'phone', 'bio', 'birth_date', 'gender',
    'address', 'zip_code', 'city', 'avatar_path',
  ];

  /**
   * Busca o perfil completo de um cliente pelo ID.
   * @param {string} id — UUID do perfil
   * @returns {Promise<object>}
   */
  async getById(id) {
    const rId = InputValidator.uuid(id);
    if (!rId.ok) throw new TypeError(`[ClienteRepository] id: ${rId.msg}`);

    const { data, error } = await this.#supabase
      .from('profiles')
      .select('id, full_name, phone, bio, birth_date, gender, address, zip_code, city, avatar_path, is_active, created_at')
      .eq('id', id)
      .eq('role', 'client')
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Atualiza dados do perfil do cliente (apenas campos da allowlist).
   * @param {string} id    — UUID do perfil
   * @param {object} dados — campos a atualizar
   * @returns {Promise<object>}
   */
  async update(id, dados) {
    const rId = InputValidator.uuid(id);
    if (!rId.ok) throw new TypeError(`[ClienteRepository] id: ${rId.msg}`);

    const { ok, msg, valor } = InputValidator.payload(dados, ClienteRepository.#CAMPOS_ATUALIZAVEIS);
    if (!ok) throw new TypeError(`[ClienteRepository] ${msg}`);

    const { data, error } = await this.#supabase
      .from('profiles')
      .update(valor)
      .eq('id', id)
      .eq('role', 'client')
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Busca perfil público (sem dados sensíveis) de qualquer usuário.
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async getPerfilPublico(id) {
    const rId = InputValidator.uuid(id);
    if (!rId.ok) throw new TypeError(`[ClienteRepository] id: ${rId.msg}`);

    const { data, error } = await this.#supabase
      .from('profiles_public')
      .select('id, full_name, avatar_path, bio, role, pro_type, created_at')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  /**
   * Busca um cliente pelo e-mail via função PostgreSQL parametrizada.
   *
   * Usa supabase.rpc() para garantir zero interpolação de string na query.
   * Requer DB function: get_client_by_email(p_email text) returns profiles.
   *
   * @param {string} email
   * @returns {Promise<object|null>}
   */
  async findByEmail(email) {
    const rEmail = InputValidator.email(email);
    if (!rEmail.ok) throw new TypeError(`[ClienteRepository] email: ${rEmail.msg}`);

    const { data, error } = await this.#supabase
      .rpc('get_client_by_email', { p_email: email.toLowerCase().trim() });

    if (error) throw error;
    return data ?? null;
  }
}

module.exports = ClienteRepository;
