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
    'id, name, address, city, latitude, longitude, logo_path, is_open, rating_avg, rating_count, rating_score, likes_count, dislikes_count';

  // ═══════════════════════════════════════════════════════════
  // BARBEARIAS
  // ═══════════════════════════════════════════════════════════

  /**
   * Retorna todas as barbearias ativas, ordenadas por avaliação.
   * @param {number} limit
   * @returns {Promise<object[]>}
   */
  static async getAll(limit = 10) {
    const { data, error } = await SupabaseService.barbershops()
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
    const rCoord = InputValidator.coordenada(lat, lng);
    if (!rCoord.ok) throw new TypeError(`[BarbershopRepository] ${rCoord.msg}`);

    if (typeof radiusKm !== 'number' || !isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 100)
      throw new TypeError('[BarbershopRepository] radiusKm fora do intervalo permitido (0–100 km).');

    const latD = radiusKm / 111.0;
    const lonD = radiusKm / (111.0 * Math.cos(lat * Math.PI / 180));

    const { data, error } = await SupabaseService.barbershops()
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
   * Inclui contadores de curtidas/descurtidas para exibição nos cards.
   * @param {number} limit
   * @returns {Promise<object[]>}
   */
  static async getFeatured(limit = 6) {
    const { data, error } = await SupabaseService.barbershops()
      .select('id, name, address, city, logo_path, is_open, rating_avg, rating_score, likes_count, dislikes_count')
      .eq('is_active', true)
      .order('rating_avg', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data ?? [];
  }

  /**
   * Retorna todas as barbearias ativas ordenadas por rating_score desc,
   * depois por rating_avg desc (desempate). Usado na tela de destaques.
   * @param {number} limit
   * @returns {Promise<object[]>}
   */
  static async getTopRated(limit = 50) {
    const { data, error } = await SupabaseService.barbershops()
      .select('id, name, address, city, logo_path, is_open, rating_avg, rating_score, likes_count, dislikes_count')
      .eq('is_active', true)
      .order('rating_score', { ascending: false })
      .order('rating_avg',   { ascending: false })
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
    const { data, error } = await SupabaseService.barbershops()
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Retorna todas as barbearias ativas ordenadas por número de cortes realizados
   * (rating_count desc), depois rating_avg como desempate.
   * Usado na seção "Todas as Barbearias" da home.
   * @param {number} limit
   * @returns {Promise<object[]>}
   */
  static async getAllByCortes(limit = 60) {
    const { data, error } = await SupabaseService.barbershops()
      .select(BarbershopRepository.#SELECT_BASIC)
      .eq('is_active', true)
      .order('rating_count', { ascending: false })
      .order('rating_avg',   { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data ?? [];
  }

  /**
   * Busca textual por nome, endereço, cidade ou CEP.
   * @param {string} query — termo digitado pelo usuário
   * @param {number} limit
   * @returns {Promise<object[]>}
   */
  static async search(query, limit = 20) {
    const q = query.trim();
    const { data, error } = await SupabaseService.barbershops()
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
    const { data, error } = await SupabaseService.profilesPublic()
      .select('id, full_name, avatar_path, pro_type')
      .eq('role', 'professional')
      .eq('pro_type', 'barbeiro')
      .limit(limit);

    if (error) throw error;
    return data ?? [];
  }

  // ═══════════════════════════════════════════════════════════
  // INTERAÇÕES (like / dislike / favorite)
  // ═══════════════════════════════════════════════════════════

  /**
   * Adiciona uma interação. Se já existir (UNIQUE), lança — o chamador faz o toggle removendo primeiro.
   * @param {string} barbershopId
   * @param {string} userId
   * @param {'like'|'dislike'|'favorite'} type
   */
  static async addInteraction(barbershopId, userId, type) {
    const rShop = InputValidator.uuid(barbershopId);
    if (!rShop.ok) throw new TypeError(`[BarbershopRepository] barbershopId: ${rShop.msg}`);

    const rUser = InputValidator.uuid(userId);
    if (!rUser.ok) throw new TypeError(`[BarbershopRepository] userId: ${rUser.msg}`);

    const rType = InputValidator.enumValido(type, ['like', 'dislike', 'favorite']);
    if (!rType.ok) throw new TypeError(`[BarbershopRepository] type: ${rType.msg}`);

    const { error } = await SupabaseService.barbershopInteractions()
      .insert({ barbershop_id: barbershopId, user_id: userId, type });
    if (error) throw error;
  }

  /**
   * Remove uma interação específica.
   * @param {string} barbershopId
   * @param {string} userId
   * @param {'like'|'dislike'|'favorite'} type
   */
  static async removeInteraction(barbershopId, userId, type) {
    const rShop = InputValidator.uuid(barbershopId);
    if (!rShop.ok) throw new TypeError(`[BarbershopRepository] barbershopId: ${rShop.msg}`);

    const rUser = InputValidator.uuid(userId);
    if (!rUser.ok) throw new TypeError(`[BarbershopRepository] userId: ${rUser.msg}`);

    const rType = InputValidator.enumValido(type, ['like', 'dislike', 'favorite']);
    if (!rType.ok) throw new TypeError(`[BarbershopRepository] type: ${rType.msg}`);

    const { error } = await SupabaseService.barbershopInteractions()
      .delete()
      .eq('barbershop_id', barbershopId)
      .eq('user_id', userId)
      .eq('type', type);
    if (error) throw error;
  }

  /**
   * Retorna todas as interações do usuário para um conjunto de barbearias.
   * Usado para restaurar o estado visual (ativo/inativo) dos botões.
   * @param {string} userId
   * @param {string[]} barbershopIds
   * @returns {Promise<Array<{barbershop_id:string, type:string}>>}
   */
  static async getUserInteractions(userId, barbershopIds) {
    if (!userId || !barbershopIds.length) return [];
    const { data, error } = await SupabaseService.barbershopInteractions()
      .select('barbershop_id, type')
      .eq('user_id', userId)
      .in('barbershop_id', barbershopIds);
    if (error) throw error;
    return data ?? [];
  }
}
