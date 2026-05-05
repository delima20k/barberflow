'use strict';

// =============================================================
// BarbeariaRepository.js — Repositório de barbearias.
// Camada: infra
//
// Única camada que acessa o banco de dados (tabela: barbershops).
// Sem lógica de negócio — apenas acesso e persistência.
// Usa @supabase/supabase-js com service_role key.
// =============================================================

const BaseRepository  = require('../infra/BaseRepository');

class BarbeariaRepository extends BaseRepository {

  #supabase;

  static #SELECT_BASICO = `
    id, name, slug, address, city, latitude, longitude,
    logo_path, cover_path, is_open, is_active,
    rating_avg, rating_count, rating_score,
    likes_count, phone
  `;

  /** @param {import('@supabase/supabase-js').SupabaseClient} supabase */
  constructor(supabase) {
    super('BarbeariaRepository');
    this.#supabase = supabase;
  }

  /**
   * Busca barbearia pelo ID.
   * @param {string} id
   * @returns {Promise<object>}
   */
  async getById(id) {
    this._validarUuid('id', id);

    const { data, error } = await this.#supabase
      .from('barbershops')
      .select(BarbeariaRepository.#SELECT_BASICO)
      .eq('id', id)
      .eq('is_active', true)
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Busca barbearias dentro de um bounding-box geográfico.
   * O filtro de raio preciso (Haversine) é feito pelo service.
   * @param {number} lat
   * @param {number} lng
   * @param {number} latDelta — variação de latitude (graus)
   * @param {number} lngDelta — variação de longitude (graus)
   * @param {number} [limit=30]
   * @returns {Promise<object[]>}
   */
  async getNearby(lat, lng, latDelta, lngDelta, limit = 30) {
    this._validarCoordenada(lat, lng);

    const { data, error } = await this.#supabase
      .from('barbershops')
      .select(BarbeariaRepository.#SELECT_BASICO)
      .eq('is_active', true)
      .gte('latitude',  lat - latDelta).lte('latitude',  lat + latDelta)
      .gte('longitude', lng - lngDelta).lte('longitude', lng + lngDelta)
      .order('rating_score', { ascending: false })
      .order('likes_count',  { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data ?? [];
  }

  /**
   * Retorna todos os serviços de uma barbearia.
   * @param {string} barbershopId
   * @returns {Promise<object[]>}
   */
  async getServicos(barbershopId) {
    this._validarUuid('barbershopId', barbershopId);

    const { data, error } = await this.#supabase
      .from('services')
      .select('id, name, category, price, duration_min, is_active')
      .eq('barbershop_id', barbershopId)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) throw error;
    return data ?? [];
  }

  /**
   * Retorna as barbearias favoritadas pelo usuário.
   * @param {string} userId
   * @returns {Promise<object[]>}
   */
  async getFavoritas(userId) {
    this._validarUuid('userId', userId);

    const { data, error } = await this.#supabase
      .from('favorite_barbershops')
      .select(`barbershop_id, barbershops(${BarbeariaRepository.#SELECT_BASICO.trim()})`)
      .eq('user_id', userId);

    if (error) throw error;
    return (data ?? [])
      .map(row => row.barbershops)
      .filter(Boolean)
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'pt-BR'));
  }

  /**
   * Registra uma interação do usuário com a barbearia (like, favorite, visit).
   * @param {string} barbershopId
   * @param {string} userId
   * @param {string} tipo — 'like' | 'favorite' | 'visit'
   * @returns {Promise<object>}
   */
  async addInteracao(barbershopId, userId, tipo) {
    this._validarUuid('barbershopId', barbershopId);
    this._validarUuid('userId', userId);

    const { data, error } = await this.#supabase
      .from('barbershop_interactions')
      .insert({ barbershop_id: barbershopId, user_id: userId, type: tipo })
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

module.exports = BarbeariaRepository;
