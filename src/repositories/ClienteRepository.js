'use strict';

// =============================================================
// ClienteRepository.js — Repositório de perfis de clientes.
// Camada: infra
//
// Única camada que acessa o banco de dados (tabela: profiles).
// Sem lógica de negócio — apenas acesso e persistência.
// Usa @supabase/supabase-js com service_role key.
// =============================================================

const BaseRepository = require('../infra/BaseRepository');

class ClienteRepository extends BaseRepository {

  #supabase;

  /** @param {import('@supabase/supabase-js').SupabaseClient} supabase */
  constructor(supabase) {
    super('ClienteRepository');
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
    this._validarUuid('id', id);

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
    this._validarUuid('id', id);

    const valor = this._validarPayload(dados, ClienteRepository.#CAMPOS_ATUALIZAVEIS);

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
    this._validarUuid('id', id);

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
    this._validarEmail(email);

    const { data, error } = await this.#supabase
      .rpc('get_client_by_email', { p_email: email.toLowerCase().trim() });

    if (error) throw error;
    return data ?? null;
  }

  /**
   * Busca perfis por nome (full_name ilike). Usado no modal de seleção de cliente.
   * Usa service_role — ignora RLS. Não expõe dados sensíveis.
   * @param {string} termo
   * @param {number} [limite=20]
   * @returns {Promise<object[]>}
   */
  async buscarPorNome(termo, limite = 20) {
    if (!termo || typeof termo !== 'string') throw new TypeError('[ClienteRepository] termo inválido');

    const { data, error } = await this.#supabase
      .from('profiles')
      .select('id, full_name, avatar_path, updated_at')
      .ilike('full_name', `%${termo}%`)
      .order('full_name', { ascending: true })
      .limit(Math.min(limite, 50));

    if (error) throw error;
    return data ?? [];
  }

  /**
   * Retorna perfis de usuários que favoritaram a barbearia OU o barbeiro.
   * Usa service_role — ignora RLS de barbershop_interactions e favorite_professionals.
   * @param {string} barbershopId
   * @param {string} professionalId
   * @returns {Promise<object[]>}
   */
  async getClientesFavoritosModal(barbershopId, professionalId) {
    this._validarUuid('barbershopId', barbershopId);
    this._validarUuid('professionalId', professionalId);

    const ids = new Set();

    // Apenas quem favoritou este profissional específico
    const { data: profFavs } = await this.#supabase
      .from('favorite_professionals')
      .select('user_id')
      .eq('professional_id', professionalId);
    (profFavs ?? []).forEach(r => { if (r.user_id) ids.add(r.user_id); });

    if (!ids.size) return [];

    const { data, error } = await this.#supabase
      .from('profiles')
      .select('id, full_name, email, avatar_path, updated_at')
      .in('id', [...ids])
      .order('full_name', { ascending: true });

    if (error) throw error;
    return (data ?? []).map(p => ({
      id:          p.id,
      full_name:   p.full_name   ?? 'Cliente',
      email:       p.email       ?? null,
      avatar_path: p.avatar_path ?? null,
      updated_at:  p.updated_at  ?? null,
    }));
  }
}

module.exports = ClienteRepository;
