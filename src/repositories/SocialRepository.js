'use strict';

// =============================================================
// SocialRepository.js — Repositório de interações sociais.
// Camada: infra
//
// Tabelas: stories, story_comments, professional_likes,
//          favorite_professionals.
// Sem lógica de negócio — apenas acesso e persistência.
// =============================================================

const BaseRepository = require('../infra/BaseRepository');

class SocialRepository extends BaseRepository {

  #supabase;

  /** @param {import('@supabase/supabase-js').SupabaseClient} supabase */
  constructor(supabase) {
    super('SocialRepository');
    this.#supabase = supabase;
  }

  // ── Stories ───────────────────────────────────────────────

  /**
   * Retorna stories ativos de uma barbearia (não expirados).
   * @param {string} barbershopId
   * @returns {Promise<object[]>}
   */
  async getStoriesByBarbershop(barbershopId) {
    this._validarUuid('barbershopId', barbershopId);

    const now = new Date().toISOString();

    const { data, error } = await this.#supabase
      .from('stories')
      .select(`
        id, barbershop_id, author_id, media_url, caption, type,
        views_count, likes_count, expires_at, created_at,
        author:profiles!author_id(full_name, avatar_path)
      `)
      .eq('barbershop_id', barbershopId)
      .gte('expires_at', now)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data ?? [];
  }

  /**
   * Cria um story.
   * @param {object} dados
   * @returns {Promise<object>}
   */
  async createStory(dados) {
    this._validarUuid('barbershop_id', dados?.barbershop_id);
    this._validarUuid('author_id', dados?.author_id);

    const { data, error } = await this.#supabase
      .from('stories')
      .insert({
        barbershop_id: dados.barbershop_id,
        author_id:     dados.author_id,
        media_url:     dados.media_url,
        caption:       dados.caption ?? null,
        type:          dados.type,
        expires_at:    dados.expires_at ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Deleta um story (verifica ownership via author_id).
   * @param {string} storyId
   * @param {string} authorId
   * @returns {Promise<boolean>}
   */
  async deleteStory(storyId, authorId) {
    this._validarUuid('storyId', storyId);
    this._validarUuid('authorId', authorId);

    const { error } = await this.#supabase
      .from('stories')
      .delete()
      .eq('id', storyId)
      .eq('author_id', authorId);

    if (error) throw error;
    return true;
  }

  /**
   * Adiciona comentário em um story.
   * @param {string} storyId
   * @param {string} userId
   * @param {string} texto
   * @returns {Promise<object>}
   */
  async addComment(storyId, userId, texto) {
    this._validarUuid('storyId', storyId);
    this._validarUuid('userId', userId);
    const conteudo = this._validarTexto('texto', texto, 500, true);

    const { data, error } = await this.#supabase
      .from('story_comments')
      .insert({ story_id: storyId, user_id: userId, content: conteudo })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // ── Professional Likes ────────────────────────────────────

  /**
   * Remove like em profissional (retorna qtd de linhas deletadas).
   * @param {string} professionalId
   * @param {string} userId
   * @returns {Promise<number>} — 0 se não existia, 1 se deletou
   */
  async deleteLike(professionalId, userId) {
    this._validarUuid('professionalId', professionalId);
    this._validarUuid('userId', userId);

    const { data, error } = await this.#supabase
      .from('professional_likes')
      .delete()
      .eq('professional_id', professionalId)
      .eq('user_id', userId)
      .select();

    if (error) throw error;
    return (data ?? []).length;
  }

  /**
   * Adiciona like em profissional.
   * @param {string} professionalId
   * @param {string} userId
   * @returns {Promise<boolean>}
   */
  async addLike(professionalId, userId) {
    this._validarUuid('professionalId', professionalId);
    this._validarUuid('userId', userId);

    const { error } = await this.#supabase
      .from('professional_likes')
      .insert({ professional_id: professionalId, user_id: userId });

    // Ignora duplicate (race condition)
    if (error && error.code !== '23505') throw error;
    return true;
  }

  /**
   * Retorna os IDs de profissionais que o usuário curtiu.
   * @param {string} userId
   * @returns {Promise<string[]>}
   */
  async getLikesByUser(userId) {
    this._validarUuid('userId', userId);

    const { data, error } = await this.#supabase
      .from('professional_likes')
      .select('professional_id')
      .eq('user_id', userId);

    if (error) throw error;
    return (data ?? []).map(r => r.professional_id);
  }

  // ── Favorite Professionals ────────────────────────────────

  /**
   * Remove favorito (retorna qtd de linhas deletadas).
   * @param {string} professionalId
   * @param {string} userId
   * @returns {Promise<number>}
   */
  async deleteFavorite(professionalId, userId) {
    this._validarUuid('professionalId', professionalId);
    this._validarUuid('userId', userId);

    const { data, error } = await this.#supabase
      .from('favorite_professionals')
      .delete()
      .eq('professional_id', professionalId)
      .eq('user_id', userId)
      .select();

    if (error) throw error;
    return (data ?? []).length;
  }

  /**
   * Adiciona favorito.
   * @param {string} professionalId
   * @param {string} userId
   * @returns {Promise<boolean>}
   */
  async addFavorite(professionalId, userId) {
    this._validarUuid('professionalId', professionalId);
    this._validarUuid('userId', userId);

    const { error } = await this.#supabase
      .from('favorite_professionals')
      .insert({ professional_id: professionalId, user_id: userId });

    if (error && error.code !== '23505') throw error;
    return true;
  }

  /**
   * Retorna lista de profissionais favoritos do usuário.
   * @param {string} userId
   * @returns {Promise<object[]>}
   */
  async getFavoritesByUser(userId) {
    this._validarUuid('userId', userId);

    const { data, error } = await this.#supabase
      .from('favorite_professionals')
      .select(`
        professional_id,
        professional:professionals!professional_id(
          id, barbershop_id,
          profile:profiles!id(full_name, avatar_path)
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data ?? [];
  }
}

module.exports = SocialRepository;
