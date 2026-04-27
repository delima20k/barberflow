'use strict';

// =============================================================
// SocialService.js — Regras de negócio de interações sociais.
// Camada: application
//
// Nunca acessa o banco diretamente — delega ao SocialRepository.
// =============================================================

const InputValidator = require('../infra/InputValidator');

class SocialService {

  static #TIPOS_STORY_VALIDOS = ['image', 'video'];

  #socialRepository;

  /** @param {import('../repositories/SocialRepository')} socialRepository */
  constructor(socialRepository) {
    this.#socialRepository = socialRepository;
  }

  // ── Stories ───────────────────────────────────────────────

  /**
   * Lista stories ativos de uma barbearia.
   * @param {string} barbershopId
   * @returns {Promise<object[]>}
   */
  async listarStories(barbershopId) {
    const rId = InputValidator.uuid(barbershopId);
    if (!rId.ok) throw Object.assign(new Error(rId.msg), { status: 400 });

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
    const rUser = InputValidator.uuid(userId);
    const rShop = InputValidator.uuid(barbershopId);
    if (!rUser.ok) throw Object.assign(new Error(rUser.msg), { status: 400 });
    if (!rShop.ok) throw Object.assign(new Error(rShop.msg), { status: 400 });

    if (!dados?.media_url?.trim())
      throw Object.assign(new Error('media_url é obrigatório.'), { status: 400 });

    const rType = InputValidator.enumValido(dados.type, SocialService.#TIPOS_STORY_VALIDOS);
    if (!rType.ok) throw Object.assign(new Error(`type: ${rType.msg}`), { status: 400 });

    if (dados.caption) {
      const rCap = InputValidator.textoLivre(dados.caption, 300);
      if (!rCap.ok) throw Object.assign(new Error(`caption: ${rCap.msg}`), { status: 400 });
      dados.caption = rCap.valor;
    }

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
    const rStr = InputValidator.uuid(storyId);
    const rUsr = InputValidator.uuid(userId);
    if (!rStr.ok) throw Object.assign(new Error(rStr.msg), { status: 400 });
    if (!rUsr.ok) throw Object.assign(new Error(rUsr.msg), { status: 400 });

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
    const rStr = InputValidator.uuid(storyId);
    const rUsr = InputValidator.uuid(userId);
    if (!rStr.ok) throw Object.assign(new Error(rStr.msg), { status: 400 });
    if (!rUsr.ok) throw Object.assign(new Error(rUsr.msg), { status: 400 });

    const rTxt = InputValidator.textoLivre(texto, 500, true);
    if (!rTxt.ok) throw Object.assign(new Error(`texto: ${rTxt.msg}`), { status: 400 });

    return this.#socialRepository.addComment(storyId, userId, rTxt.valor);
  }

  // ── Likes ─────────────────────────────────────────────────

  /**
   * Alterna like em um profissional (toggle).
   * @param {string} professionalId
   * @param {string} userId
   * @returns {Promise<{ curtido: boolean }>}
   */
  async toggleLike(professionalId, userId) {
    const rPro = InputValidator.uuid(professionalId);
    const rUsr = InputValidator.uuid(userId);
    if (!rPro.ok) throw Object.assign(new Error(rPro.msg), { status: 400 });
    if (!rUsr.ok) throw Object.assign(new Error(rUsr.msg), { status: 400 });

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
    const rPro = InputValidator.uuid(professionalId);
    const rUsr = InputValidator.uuid(userId);
    if (!rPro.ok) throw Object.assign(new Error(rPro.msg), { status: 400 });
    if (!rUsr.ok) throw Object.assign(new Error(rUsr.msg), { status: 400 });

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
    const rId = InputValidator.uuid(userId);
    if (!rId.ok) throw Object.assign(new Error(rId.msg), { status: 400 });

    return this.#socialRepository.getFavoritesByUser(userId);
  }
}

module.exports = SocialService;
