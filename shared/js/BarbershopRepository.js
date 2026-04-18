'use strict';

// =============================================================
// BarbershopRepository.js — Repositório central de dados de barbearias.
// Abstrai todas as queries Supabase das tabelas barbershops e
// profiles_public. Nenhuma lógica de negócio aqui — apenas acesso a dados.
//
// Dependências: SupabaseService.js
// =============================================================

// Repositório responsável por todas as operações de leitura de barbearias e barbeiros.
class BarbershopRepository {

  // Campos base usados na maioria das consultas
  static #SELECT_BASIC =
    'id, name, address, city, latitude, longitude, logo_path, is_open, rating_avg, rating_count';

  // ═══════════════════════════════════════════════════════════
  // BARBEARIAS
  // ═══════════════════════════════════════════════════════════

  /**
   * Retorna todas as barbearias ativas, ordenadas por avaliação.
   * @param {number} limit
   * @returns {Promise<object[]>}
   */
  static async getAll(limit = 10) {
    const { data, error } = await SupabaseService.client
      .from('barbershops')
      .select(BarbershopRepository.#SELECT_BASIC)
      .eq('is_active', true)
      .order('rating_avg', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data ?? [];
  }

  /**
   * Busca barbearias dentro de um bounding-box geográfico aproximado.
   * O filtro de raio preciso é feito pelo chamador (haversine).
   * @param {number} lat
   * @param {number} lng
   * @param {number} radiusKm
   * @returns {Promise<object[]>}
   */
  static async getNearby(lat, lng, radiusKm = 3) {
    const latD = radiusKm / 111.0;
    const lonD = radiusKm / (111.0 * Math.cos(lat * Math.PI / 180));

    const { data, error } = await SupabaseService.client
      .from('barbershops')
      .select(BarbershopRepository.#SELECT_BASIC)
      .eq('is_active', true)
      .gte('latitude',  lat - latD).lte('latitude',  lat + latD)
      .gte('longitude', lng - lonD).lte('longitude', lng + lonD)
      .limit(30);

    if (error) throw error;
    return data ?? [];
  }

  /**
   * Retorna barbearias em destaque ordenadas por avaliação.
   * @param {number} limit
   * @returns {Promise<object[]>}
   */
  static async getFeatured(limit = 6) {
    const { data, error } = await SupabaseService.client
      .from('barbershops')
      .select('id, name, logo_path, is_open, rating_avg')
      .eq('is_active', true)
      .order('rating_avg', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data ?? [];
  }

  /**
   * Busca barbearia por ID.
   * @param {string} id
   * @returns {Promise<object>}
   */
  static async getById(id) {
    const { data, error } = await SupabaseService.client
      .from('barbershops')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Busca textual por nome, endereço, cidade ou CEP.
   * @param {string} query — termo digitado pelo usuário
   * @param {number} limit
   * @returns {Promise<object[]>}
   */
  static async search(query, limit = 20) {
    const q = query.trim();
    const { data, error } = await SupabaseService.client
      .from('barbershops')
      .select('id, name, address, city, zip_code, logo_path, is_open, rating_avg')
      .eq('is_active', true)
      .or(`name.ilike.%${q}%,address.ilike.%${q}%,city.ilike.%${q}%,zip_code.ilike.%${q}%`)
      .limit(limit);

    if (error) throw error;
    return data ?? [];
  }

  // ═══════════════════════════════════════════════════════════
  // BARBEIROS
  // ═══════════════════════════════════════════════════════════

  /**
   * Retorna barbeiros profissionais com perfil público.
   * @param {number} limit
   * @returns {Promise<object[]>}
   */
  static async getBarbers(limit = 10) {
    const { data, error } = await SupabaseService.client
      .from('profiles_public')
      .select('id, full_name, avatar_path, pro_type')
      .eq('role', 'professional')
      .eq('pro_type', 'barbeiro')
      .limit(limit);

    if (error) throw error;
    return data ?? [];
  }
}
