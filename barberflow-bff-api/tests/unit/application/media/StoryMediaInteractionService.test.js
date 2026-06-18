'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { StoryMediaInteractionService } = require('../../../../application/media/StoryMediaInteractionService');

describe('StoryMediaInteractionService', () => {
  it('ativa like quando usuario ainda nao curtiu o story', async () => {
    const calls = [];
    const service = new StoryMediaInteractionService({
      storyRepository: {
        buscarStoryAtivoPorMediaId: async () => ({ id: 'story-1', media_id: 'media-1' }),
        buscarLikeStory: async () => null,
        adicionarLikeStory: async (userId, storyId) => calls.push(['add', userId, storyId]),
        sincronizarLikesStory: async () => 1,
      },
    });

    const result = await service.toggleLike('user-1', 'media-1');

    assert.deepEqual(calls, [['add', 'user-1', 'story-1']]);
    assert.equal(result.user_liked, true);
    assert.equal(result.likes_count, 1);
    assert.equal(result.media_id, 'media-1');
  });

  it('remove like quando usuario ja curtiu o story', async () => {
    const calls = [];
    const service = new StoryMediaInteractionService({
      storyRepository: {
        buscarStoryAtivoPorMediaId: async () => ({ id: 'story-1', media_id: 'media-1' }),
        buscarLikeStory: async () => ({ id: 'like-1' }),
        removerLikeStory: async (userId, storyId) => calls.push(['remove', userId, storyId]),
        sincronizarLikesStory: async () => 0,
      },
    });

    const result = await service.toggleLike('user-1', 'media-1');

    assert.deepEqual(calls, [['remove', 'user-1', 'story-1']]);
    assert.equal(result.user_liked, false);
    assert.equal(result.likes_count, 0);
  });

  it('exclui por media_id reaproveitando DeleteStoryUseCase com owner validado', async () => {
    const service = new StoryMediaInteractionService({
      storyRepository: {
        buscarStoryPorMediaIdEOwner: async () => ({
          id: 'story-1',
          media_id: 'media-1',
          owner_id: 'user-1',
          barbershop_id: 'shop-1',
        }),
      },
      deleteStoryUseCase: {
        execute: async (params) => {
          assert.deepEqual(params, {
            storyId: 'story-1',
            ownerId: 'user-1',
            barbershopId: 'shop-1',
          });
          return { storyRemoved: true, storageDeletionPending: false };
        },
      },
    });

    const result = await service.deleteByMediaId('user-1', 'media-1');

    assert.equal(result.storyRemoved, true);
    assert.equal(result.media_id, 'media-1');
    assert.equal(result.story_id, 'story-1');
  });
});
