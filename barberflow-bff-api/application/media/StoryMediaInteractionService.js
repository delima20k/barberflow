'use strict';

const AppError = require('../../utils/AppError');
const ContentModerationService = require('../../services/ContentModerationService');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STORY_MESSAGE_MAX = 240;
const STORY_MESSAGES_LIMIT_MAX = 50;

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
    StoryMediaInteractionService.#assertUuid(mediaId, 'mediaId');

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
    StoryMediaInteractionService.#assertUuid(mediaId, 'mediaId');
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

  async sendMessage(userId, mediaId, payload = {}) {
    StoryMediaInteractionService.#assertRequired(userId, 'userId');
    StoryMediaInteractionService.#assertRequired(mediaId, 'mediaId');
    StoryMediaInteractionService.#assertUuid(mediaId, 'mediaId');

    const story = await this.#storyRepository.buscarStoryAtivoPorMediaId(mediaId);
    if (!story) throw AppError.notFound('Story nao encontrado ou expirado.');
    if (!story.owner_id) throw AppError.badRequest('Story sem destinatario valido.');

    const body = StoryMediaInteractionService.#normalizarBody(payload?.body);
    const moderacao = ContentModerationService.verificar(body);
    if (moderacao.bloqueado) {
      throw AppError.badRequest('Mensagem nao permitida. Revise o conteudo antes de enviar.');
    }

    const clientMessageId = StoryMediaInteractionService.#normalizarClientMessageId(payload?.clientMessageId);
    const message = await this.#storyRepository.salvarMensagemStory({
      storyId: story.id,
      mediaId,
      recipientId: story.owner_id,
      senderId: userId,
      body,
      clientMessageId,
    });

    return {
      media_id: mediaId,
      story_id: story.id,
      message: {
        id: message?.id ?? null,
        body: message?.body ?? body,
        createdAt: message?.created_at ?? new Date().toISOString(),
      },
    };
  }

  async listMessages(userId, mediaId, query = {}) {
    StoryMediaInteractionService.#assertRequired(userId, 'userId');
    StoryMediaInteractionService.#assertRequired(mediaId, 'mediaId');
    StoryMediaInteractionService.#assertUuid(mediaId, 'mediaId');

    const story = await this.#storyRepository.buscarStoryAtivoPorMediaId(mediaId);
    if (!story) throw AppError.notFound('Story nao encontrado ou expirado.');
    if (story.owner_id !== userId) {
      throw AppError.forbidden('Apenas o dono do story pode ver as mensagens.');
    }

    const limit = StoryMediaInteractionService.#normalizarLimit(query?.limit);
    const result = await this.#storyRepository.listarMensagensStory(story.id, userId, limit);
    return {
      media_id: mediaId,
      story_id: story.id,
      messages: result?.messages ?? [],
      likesCount: Math.max(0, Number(result?.likesCount ?? story.likes_count ?? 0)),
    };
  }

  static #assertRequired(value, name) {
    if (!String(value ?? '').trim()) throw AppError.badRequest(`${name} e obrigatorio.`);
  }

  static #assertUuid(value, name) {
    if (!UUID_RE.test(String(value ?? ''))) throw AppError.badRequest(`${name} invalido.`);
  }

  static #normalizarBody(value) {
    const texto = String(value ?? '').replace(/\0/g, '').trim();
    if (!texto) throw AppError.badRequest('Mensagem obrigatoria.');
    if (Array.from(texto).length > STORY_MESSAGE_MAX) {
      throw AppError.badRequest(`body: Maximo de ${STORY_MESSAGE_MAX} caracteres.`);
    }
    return texto;
  }

  static #normalizarClientMessageId(value) {
    const texto = String(value ?? '').replace(/\0/g, '').trim();
    if (!texto) return null;
    return texto.slice(0, 80);
  }

  static #normalizarLimit(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1) return STORY_MESSAGES_LIMIT_MAX;
    return Math.min(Math.floor(n), STORY_MESSAGES_LIMIT_MAX);
  }
}

module.exports = { StoryMediaInteractionService };
