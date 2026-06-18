'use strict';

const AppError = require('../../utils/AppError');

/**
 * StoryMediaInteractionService - interacoes HTTP sobre midias de stories.
 *
 * Mantem a rota /media focada em adaptar media_id para o dominio de stories,
 * sem duplicar regra de negocio de exclusao ou contadores.
 */
class StoryMediaInteractionService {
  #storyRepository;
  #deleteStoryUseCase;

  constructor({ storyRepository, deleteStoryUseCase }) {
    if (!storyRepository) throw new TypeError('StoryMediaInteractionService requer storyRepository.');
    this.#storyRepository = storyRepository;
    this.#deleteStoryUseCase = deleteStoryUseCase ?? null;
  }

  async toggleLike(userId, mediaId) {
    StoryMediaInteractionService.#assertRequired(userId, 'userId');
    StoryMediaInteractionService.#assertRequired(mediaId, 'mediaId');

    const story = await this.#storyRepository.buscarStoryAtivoPorMediaId(mediaId);
    if (!story) throw AppError.notFound('Story nao encontrado ou expirado.');

    const existing = await this.#storyRepository.buscarLikeStory(userId, story.id);
    let userLiked;
    if (existing) {
      await this.#storyRepository.removerLikeStory(userId, story.id);
      userLiked = false;
    } else {
      await this.#storyRepository.adicionarLikeStory(userId, story.id);
      userLiked = true;
    }

    const likesCount = await this.#storyRepository.sincronizarLikesStory(story.id);
    return {
      media_id: mediaId,
      story_id: story.id,
      likes_count: likesCount,
      user_liked: userLiked,
    };
  }

  async deleteByMediaId(userId, mediaId) {
    StoryMediaInteractionService.#assertRequired(userId, 'userId');
    StoryMediaInteractionService.#assertRequired(mediaId, 'mediaId');
    if (!this.#deleteStoryUseCase) throw AppError.unavailable('Exclusao de stories indisponivel.');

    const story = await this.#storyRepository.buscarStoryPorMediaIdEOwner(mediaId, userId);
    if (!story) throw AppError.forbidden('Story nao encontrado ou sem permissao para excluir.');

    const result = await this.#deleteStoryUseCase.execute({
      storyId: story.id,
      ownerId: userId,
      barbershopId: story.barbershop_id,
    });

    return {
      media_id: mediaId,
      story_id: story.id,
      ...result,
    };
  }

  static #assertRequired(value, name) {
    if (!String(value ?? '').trim()) throw AppError.badRequest(`${name} e obrigatorio.`);
  }
}

module.exports = { StoryMediaInteractionService };
