'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { StoryMediaInteractionService } = require('../../../../application/media/StoryMediaInteractionService');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const STORY_ID = '33333333-3333-4333-8333-333333333333';
const MEDIA_ID = '44444444-4444-4444-8444-444444444444';
const SHOP_ID = '55555555-5555-4555-8555-555555555555';

describe('StoryMediaInteractionService', () => {
  it('ativa like quando usuario ainda nao curtiu o story', async () => {
    const calls = [];
    const service = new StoryMediaInteractionService({
      storyRepository: {
        buscarStoryAtivoPorMediaId: async () => ({ id: STORY_ID, media_id: MEDIA_ID }),
        buscarLikeStory: async () => null,
        adicionarLikeStory: async (userId, storyId) => calls.push(['add', userId, storyId]),
        sincronizarLikesStory: async () => 1,
      },
    });

    const result = await service.toggleLike(USER_ID, MEDIA_ID);

    assert.deepEqual(calls, [['add', USER_ID, STORY_ID]]);
    assert.equal(result.user_liked, true);
    assert.equal(result.likes_count, 1);
    assert.equal(result.media_id, MEDIA_ID);
  });

  it('remove like quando usuario ja curtiu o story', async () => {
    const calls = [];
    const service = new StoryMediaInteractionService({
      storyRepository: {
        buscarStoryAtivoPorMediaId: async () => ({ id: STORY_ID, media_id: MEDIA_ID }),
        buscarLikeStory: async () => ({ id: 'like-1' }),
        removerLikeStory: async (userId, storyId) => calls.push(['remove', userId, storyId]),
        sincronizarLikesStory: async () => 0,
      },
    });

    const result = await service.toggleLike(USER_ID, MEDIA_ID);

    assert.deepEqual(calls, [['remove', USER_ID, STORY_ID]]);
    assert.equal(result.user_liked, false);
    assert.equal(result.likes_count, 0);
  });

  it('exclui por media_id reaproveitando DeleteStoryUseCase com owner validado', async () => {
    const service = new StoryMediaInteractionService({
      storyRepository: {
        buscarStoryPorMediaIdEOwner: async () => ({
          id: STORY_ID,
          media_id: MEDIA_ID,
          owner_id: USER_ID,
          barbershop_id: SHOP_ID,
        }),
      },
      deleteStoryUseCase: {
        execute: async (params) => {
          assert.deepEqual(params, {
            storyId: STORY_ID,
            ownerId: USER_ID,
            barbershopId: SHOP_ID,
          });
          return { storyRemoved: true, storageDeletionPending: false };
        },
      },
    });

    const result = await service.deleteByMediaId(USER_ID, MEDIA_ID);

    assert.equal(result.storyRemoved, true);
    assert.equal(result.media_id, MEDIA_ID);
    assert.equal(result.story_id, STORY_ID);
  });

  it('salva mensagem privada de story ativo com texto moderado', async () => {
    const calls = [];
    const service = new StoryMediaInteractionService({
      storyRepository: {
        buscarStoryAtivoPorMediaId: async () => ({ id: STORY_ID, media_id: MEDIA_ID, owner_id: OTHER_ID }),
        salvarMensagemStory: async (payload) => {
          calls.push(payload);
          return { id: 'msg-1', body: payload.body, created_at: '2026-06-26T12:00:00.000Z' };
        },
      },
    });

    const result = await service.sendMessage(USER_ID, MEDIA_ID, {
      body: 'Ficou top',
      clientMessageId: 'client-1',
    });

    assert.equal(result.story_id, STORY_ID);
    assert.equal(result.message.body, 'Ficou top');
    assert.deepEqual(calls[0], {
      storyId: STORY_ID,
      mediaId: MEDIA_ID,
      recipientId: OTHER_ID,
      senderId: USER_ID,
      body: 'Ficou top',
      clientMessageId: 'client-1',
    });
  });

  it('bloqueia mensagem ofensiva ou com padrao de spam antes de persistir', async () => {
    let persisted = false;
    const service = new StoryMediaInteractionService({
      storyRepository: {
        buscarStoryAtivoPorMediaId: async () => ({ id: STORY_ID, media_id: MEDIA_ID, owner_id: OTHER_ID }),
        salvarMensagemStory: async () => { persisted = true; },
      },
    });

    await assert.rejects(
      () => service.sendMessage(USER_ID, MEDIA_ID, { body: 'Veja https://spam.test' }),
      /Mensagem nao permitida/,
    );
    assert.equal(persisted, false);
  });

  it('lista mensagens somente para o dono do story', async () => {
    const service = new StoryMediaInteractionService({
      storyRepository: {
        buscarStoryAtivoPorMediaId: async () => ({ id: STORY_ID, media_id: MEDIA_ID, owner_id: USER_ID, likes_count: 2 }),
        listarMensagensStory: async (storyId, recipientId, limit) => ({
          messages: [{ id: 'msg-1', body: 'Top', createdAt: '2026-06-26T12:00:00.000Z' }],
          likesCount: 2,
          storyId,
          recipientId,
          limit,
        }),
      },
    });

    const result = await service.listMessages(USER_ID, MEDIA_ID, { limit: 999 });

    assert.equal(result.story_id, STORY_ID);
    assert.equal(result.messages.length, 1);
    assert.equal(result.likesCount, 2);
  });

  it('nega listagem para usuario que nao e dono do story', async () => {
    const service = new StoryMediaInteractionService({
      storyRepository: {
        buscarStoryAtivoPorMediaId: async () => ({ id: STORY_ID, media_id: MEDIA_ID, owner_id: OTHER_ID }),
      },
    });

    await assert.rejects(
      () => service.listMessages(USER_ID, MEDIA_ID),
      /Apenas o dono/,
    );
  });
});
