'use strict';

// =============================================================
// BarbershopRepository.js — Repositório central de dados de barbearias.
// Abstrai todas as queries Supabase das tabelas barbershops e
// profiles_public. Nenhuma lógica de negócio aqui — apenas acesso a dados.
//
// Dependências: ApiService.js
// =============================================================

// Repositório responsável por todas as operações de leitura de barbearias e barbeiros.
class BarbershopRepository {

  // Flag: tabela barbershop_interactions ausente no banco remoto
  static #INTERACTIONS_UNAVAILABLE = false;

  /** Detecta erro 404 de tabela inexistente no PostgREST */
  static #is404(error) {
    return (
      error?.status === 404 ||
      error?.statusCode === 404 ||
      String(error?.code ?? '').includes('42P01') ||
      String(error?.message ?? '').toLowerCase().includes('does not exist')
    );
  }

  // Campos base usados na maioria das consultas
  static #SELECT_BASIC =
    'id, name, address, city, latitude, longitude, logo_path, cover_path, is_open, rating_avg, rating_count, rating_score, likes_count, dislikes_count, font_key';

  // ═══════════════════════════════════════════════════════════
  // BARBEARIAS
  // ═══════════════════════════════════════════════════════════

  /**
   * Retorna todas as barbearias ativas, ordenadas por avaliação.
   * @param {number} limit
   * @returns {Promise<object[]>}
   */
  static async getAll(limit = 10) {
    const { data, error } = await ApiService.from('barbershops')
      .select(BarbershopRepository.#SELECT_BASIC)
      .eq('is_active', true)
      .order('likes_count',  { ascending: false })
      .order('rating_score', { ascending: false })
      .order('rating_avg',   { ascending: false })
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

    const { data, error } = await ApiService.from('barbershops')
      .select(BarbershopRepository.#SELECT_BASIC)
      .eq('is_active', true)
      .gte('latitude',  lat - latD).lte('latitude',  lat + latD)
      .gte('longitude', lng - lonD).lte('longitude', lng + lonD)
      .order('rating_score', { ascending: false })
      .order('likes_count',  { ascending: false })
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
    const { data, error } = await ApiService.from('barbershops')
      .select('id, name, address, city, logo_path, cover_path, is_open, rating_avg, rating_score, likes_count, dislikes_count, font_key')
      .eq('is_active', true)
      .order('rating_score', { ascending: false })
      .order('likes_count',  { ascending: false })
      .order('rating_avg',   { ascending: false })
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
    const { data, error } = await ApiService.from('barbershops')
      .select('id, name, address, city, logo_path, cover_path, is_open, rating_avg, rating_score, likes_count, dislikes_count, font_key')
      .eq('is_active', true)
      .order('rating_score', { ascending: false })
      .order('rating_avg',   { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data ?? [];
  }

  /**
   * Atualiza latitude, longitude e campos de endereço da barbearia do owner.
   * Chamado após geocodificação por CEP ou GPS direto.
   *
   * @param {string} ownerId   — UUID do dono da barbearia
   * @param {number} lat       — latitude (−90 a 90)
   * @param {number} lng       — longitude (−180 a 180)
   * @param {string} [address] — logradouro + número (opcional)
   * @param {string} [city]    — cidade (opcional)
   * @param {string} [state]   — UF (opcional)
   * @param {string} [zipCode] — CEP formatado (opcional)
   * @returns {Promise<object>} — registro atualizado
   */
  static async updateLocation(ownerId, lat, lng, address, city, state, zipCode) {
    const rOwner = InputValidator.uuid(ownerId);
    if (!rOwner.ok) throw new TypeError(`[BarbershopRepository] owner_id inválido: ${rOwner.msg}`);

    const rCoord = InputValidator.coordenada(lat, lng);
    if (!rCoord.ok) throw new TypeError(`[BarbershopRepository] coordenadas inválidas: ${rCoord.msg}`);

    const payload = {
      latitude:   lat,
      longitude:  lng,
      updated_at: new Date().toISOString(),
    };
    if (address !== undefined && address !== null) payload.address  = address;
    if (city    !== undefined && city    !== null) payload.city     = city;
    if (state   !== undefined && state   !== null) payload.state    = state;
    if (zipCode !== undefined && zipCode !== null) payload.zip_code = zipCode;

    const { data, error } = await ApiService.from('barbershops')
      .update(payload)
      .eq('owner_id', ownerId)
      .single();

    if (error) throw new Error(`[BarbershopRepository] updateLocation: ${error.message ?? error.code}`);
    return data;
  }

  /**
   * Busca barbearia por ID.
   * @param {string} id
   * @returns {Promise<object>}
   */
  static async getById(id) {
    const { data, error } = await ApiService.from('barbershops')
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
    const { data, error } = await ApiService.from('barbershops')
      .select(BarbershopRepository.#SELECT_BASIC)
      .eq('is_active', true)
      .order('likes_count',  { ascending: false })
      .order('rating_score', { ascending: false })
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
    const q = InputValidator.escaparFiltroPostgREST(query);
    const { data, error } = await ApiService.from('barbershops')
      .select('id, name, address, city, zip_code, logo_path, cover_path, is_open, rating_avg, font_key')
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
    const { data, error } = await ApiService.from('profiles_public')
      .select('id, full_name, avatar_path, pro_type, rating_avg, rating_count')
      .eq('role', 'professional')
      .in('pro_type', ['barbeiro', 'barbearia'])
      .order('rating_count', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data ?? [];
  }

  /**
   * Retorna os barbeiros vinculados a uma barbearia específica.
   * Garante que o dono do salão apareça primeiro.
   * Robusto: se a coluna barbershop_id não existir (erro 400/42P01), retorna [].
   *
   * @param {string} barbershopId — UUID da barbearia
   * @param {string|null} ownerId — UUID do dono (para colocar primeiro e buscar
   *                                separadamente caso não esteja na lista de membros)
   * @returns {Promise<object[]>}
   */
  static async getBarbersByShop(barbershopId, ownerId = null) {
    const r = InputValidator.uuid(barbershopId);
    if (!r.ok) throw new TypeError(`[BarbershopRepository] barbershopId: ${r.msg}`);

    const FIELDS = 'id, full_name, avatar_path, pro_type, rating_avg, rating_count';

    // Tenta buscar membros vinculados ao salão
    let members = [];
    try {
      const { data, error } = await ApiService.from('profiles_public')
        .select(FIELDS)
        .eq('barbershop_id', barbershopId)
        .order('rating_count', { ascending: false })
        .limit(20);
      if (!error) members = data ?? [];
    } catch { /* coluna inexistente — members permanece [] */ }

    // Garante que o dono está na lista e em primeiro lugar
    if (ownerId && InputValidator.uuid(ownerId).ok) {
      const ownerInList = members.some(b => b.id === ownerId);
      if (!ownerInList) {
        try {
          const { data: ownerRow } = await ApiService.from('profiles_public')
            .select(FIELDS)
            .eq('id', ownerId)
            .single();
          if (ownerRow) members.unshift(ownerRow);
        } catch { /* perfil do dono inexistente — ignora */ }
      } else {
        // Move o dono para o topo sem criar novo array (sort estável)
        members.sort((a, b) =>
          a.id === ownerId ? -1 : b.id === ownerId ? 1 : 0
        );
      }
    }

    return members;
  }

  /**
   * Busca perfil público de um barbeiro por ID (para a tela BarbeiroPage).
   * @param {string} id — UUID do barbeiro
   * @returns {Promise<object|null>}
   */
  static async getBarberById(id) {
    const r = InputValidator.uuid(id);
    if (!r.ok) throw new TypeError(`[BarbershopRepository] id inválido: ${r.msg}`);

    const { data, error } = await ApiService.from('profiles_public')
      .select('id, full_name, avatar_path, pro_type, rating_avg, rating_count, bio')
      .eq('id', id)
      .single();

    if (error) return null;
    return data ?? null;
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

    if (BarbershopRepository.#INTERACTIONS_UNAVAILABLE) throw new Error('Tabela barbershop_interactions indisponível.');

    // Upsert garante idempotência: não falha se o registro já existir
    const { error } = await ApiService.from('barbershop_interactions')
      .upsert(
        { barbershop_id: barbershopId, user_id: userId, type },
        { onConflict: 'barbershop_id,user_id,type', ignoreDuplicates: true }
      );
    if (error) {
      if (BarbershopRepository.#is404(error)) BarbershopRepository.#INTERACTIONS_UNAVAILABLE = true;
      throw error;
    }
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

    if (BarbershopRepository.#INTERACTIONS_UNAVAILABLE) throw new Error('Tabela barbershop_interactions indisponível.');

    const { error } = await ApiService.from('barbershop_interactions')
      .delete()
      .eq('barbershop_id', barbershopId)
      .eq('user_id', userId)
      .eq('type', type);
    if (error) {
      if (BarbershopRepository.#is404(error)) BarbershopRepository.#INTERACTIONS_UNAVAILABLE = true;
      throw error;
    }
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
    if (BarbershopRepository.#INTERACTIONS_UNAVAILABLE) return [];
    const { data, error } = await ApiService.from('barbershop_interactions')
      .select('barbershop_id, type')
      .eq('user_id', userId)
      .in('barbershop_id', barbershopIds);
    if (error) {
      if (BarbershopRepository.#is404(error)) { BarbershopRepository.#INTERACTIONS_UNAVAILABLE = true; return []; }
      throw error;
    }
    return data ?? [];
  }

  /**
   * Retorna os contadores reais de uma barbearia após persistência.
   * Usado para re-sincronizar a UI com os valores do banco
   * (que incluem curtidas de TODOS os usuários).
   * @param {string} barbershopId
   * @returns {Promise<{likes_count:number, dislikes_count:number, rating_score:number}|null>}
   */
  static async getStats(barbershopId) {
    const { data, error } = await ApiService.from('barbershops')
      .select('likes_count, dislikes_count, rating_score')
      .eq('id', barbershopId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /**
   * Conta likes e dislikes por barbearia diretamente de barbershop_interactions.
   * Usado por restaurarInteracoes para restaurar contadores sem depender do trigger
   * que mantém likes_count/dislikes_count em barbershops.
   * @param {string[]} barbershopIds
   * @returns {Promise<Record<string, {likes:number, dislikes:number}>>}
   */
  static async getInteractionCountsAll(barbershopIds) {
    if (!barbershopIds?.length) return {};
    if (BarbershopRepository.#INTERACTIONS_UNAVAILABLE) return {};
    const { data, error } = await ApiService.from('barbershop_interactions')
      .select('barbershop_id, type')
      .in('barbershop_id', barbershopIds)
      .in('type', ['like', 'dislike']);
    if (error) {
      if (BarbershopRepository.#is404(error)) { BarbershopRepository.#INTERACTIONS_UNAVAILABLE = true; }
      return {};
    }
    const counts = {};
    (data ?? []).forEach(({ barbershop_id, type }) => {
      if (!counts[barbershop_id]) counts[barbershop_id] = { likes: 0, dislikes: 0 };
      if (type === 'like')    counts[barbershop_id].likes++;
      if (type === 'dislike') counts[barbershop_id].dislikes++;
    });
    return counts;
  }
}
