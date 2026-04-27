'use strict';

// =============================================================
// SocialService.js — Regras de negócio de interações sociais.
// Camada: application
//
// Nunca acessa o banco diretamente — delega ao SocialRepository.
// =============================================================

const BaseService = require('../infra/BaseService');

class SocialService extends BaseService {

  static #TIPOS_STORY_VALIDOS = ['image', 'video'];

  #socialRepository;

  /** @param {import('../repositories/SocialRepository')} socialRepository */
  constructor(socialRepository) {
    super('SocialService');
    this.#socialRepository = socialRepository;
  }

  // ── Stories ───────────────────────────────────────────────

  /**
   * Lista stories ativos de uma barbearia.
   * @param {string} barbershopId
   * @returns {Promise<object[]>}
   */
  async listarStories(barbershopId) {
    this._uuid('barbershopId', barbershopId);
    return this.#socialRepository.getStoriesByBarbershop(barbershopId);
  }

  /**
   * Cria um story.
   * @param {string} userId
   * @param {string} barbershopId
   * @param {{ media_url: string, type: string, caption?: string }} dados
   * @returns {Promise<object>}
   */
  async criarStory(userId, barbershopId, dados) {
    this._uuid('userId', userId);
    this._uuid('barbershopId', barbershopId);

    if (!dados?.media_url?.trim())
      throw this._erro('media_url é obrigatório.');

    this._enum('type', dados.type, SocialService.#TIPOS_STORY_VALIDOS);

    if (dados.caption) dados.caption = this._texto('caption', dados.caption, 300);

    return this.#socialRepository.createStory({
      barbershop_id: barbershopId,
      author_id:     userId,
      media_url:     dados.media_url,
      type:          dados.type,
      caption:       dados.caption ?? null,
    });
  }

  /**
   * Deleta um story (apenas o próprio autor pode deletar).
   * @param {string} storyId
   * @param {string} userId
   * @returns {Promise<boolean>}
   */
  async deletarStory(storyId, userId) {
    this._uuid('storyId', storyId);
    this._uuid('userId', userId);
    return this.#socialRepository.deleteStory(storyId, userId);
  }

  /**
   * Adiciona comentário em um story.
   * @param {string} storyId
   * @param {string} userId
   * @param {string} texto
   * @returns {Promise<object>}
   */
  async comentarStory(storyId, userId, texto) {
    this._uuid('storyId', storyId);
    this._uuid('userId', userId);
    const conteudo = this._texto('texto', texto, 500, true);
    return this.#socialRepository.addComment(storyId, userId, conteudo);
  }

  // ── Likes ─────────────────────────────────────────────────

  /**
   * Alterna like em um profissional (toggle).
   * @param {string} professionalId
   * @param {string} userId
   * @returns {Promise<{ curtido: boolean }>}
   */
  async toggleLike(professionalId, userId) {
    this._uuid('professionalId', professionalId);
    this._uuid('userId', userId);

    const deletados = await this.#socialRepository.deleteLike(professionalId, userId);

    if (deletados === 0) {
      await this.#socialRepository.addLike(professionalId, userId);
      return { curtido: true };
    }
    return { curtido: false };
  }

  // ── Favoritos ─────────────────────────────────────────────

  /**
   * Alterna favorito em um profissional (toggle).
   * @param {string} professionalId
   * @param {string} userId
   * @returns {Promise<{ favoritado: boolean }>}
   */
  async toggleFavorite(professionalId, userId) {
    this._uuid('professionalId', professionalId);
    this._uuid('userId', userId);

    const deletados = await this.#socialRepository.deleteFavorite(professionalId, userId);

    if (deletados === 0) {
      await this.#socialRepository.addFavorite(professionalId, userId);
      return { favoritado: true };
    }
    return { favoritado: false };
  }

  /**
   * Lista favoritos do usuário.
   * @param {string} userId
   * @returns {Promise<object[]>}
   */
  async listarFavoritos(userId) {
    this._uuid('userId', userId);
    return this.#socialRepository.getFavoritesByUser(userId);
  }
}

module.exports = SocialService;
