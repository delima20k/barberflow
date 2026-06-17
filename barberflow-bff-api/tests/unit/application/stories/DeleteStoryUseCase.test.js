'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { DeleteStoryUseCase } = require('../../../../application/stories/DeleteStoryUseCase');

// ── Helpers ──────────────────────────────────────────────────────────────────

const STORY_ID  = 'story-uuid-0001';
const OWNER_ID  = 'owner-uuid-0001';
const SHOP_ID   = 'shop-uuid-0001';
const MEDIA_ID  = 'media-uuid-0001';
const VARIANT_PATH = 'stories/media-uuid-0001/thumb/v1/media-uuid-0001.webp';
const SOURCE_PATH  = 'stories/media-uuid-0001/incoming/media-uuid-0001.mp4';

function makeStory(overrides = {}) {
  return {
    id:           STORY_ID,
    media_id:     MEDIA_ID,
    storage_path: null,
    media_files:  { id: MEDIA_ID, path: SOURCE_PATH },
    ...overrides,
  };
}

function makeStoryRepo(story = makeStory(), outrasRefs = 0) {
  return {
    buscarStoryPorIdEOwner: async () => story,
    contarOutrasReferencias: async () => outrasRefs,
    excluirStoryPorId: async () => {},
  };
}

function makeMediaRepo(variants = [{ storage_path: VARIANT_PATH, name: 'thumb' }]) {
  let pendingCalled = false;
  let falhouCalled = false;
  let excluirCalled = false;
  return {
    listarVariantesPorMediaId: async () => variants,
    marcarComoPendenteLimpeza: async () => { pendingCalled = true; },
    marcarCleanupFalhou: async () => { falhouCalled = true; },
    excluirPorId: async () => { excluirCalled = true; },
    _state: { get pendingCalled() { return pendingCalled; },
               get falhouCalled()  { return falhouCalled;  },
               get excluirCalled() { return excluirCalled; } },
  };
}

function makeR2Gateway(shouldFail = false) {
  const deleted = [];
  return {
    deleteObject: async (path) => {
      if (shouldFail) throw new Error('R2 indisponível');
      deleted.push(path);
    },
    deleted,
  };
}

function makeSupabaseGateway(shouldFail = false) {
  const deleted = [];
  return {
    deleteObject: async (path) => {
      if (shouldFail) throw new Error('Supabase Storage indisponível');
      deleted.push(path);
    },
    deleted,
  };
}

function makeUseCase({ storyRepo, mediaRepo, r2, supabase } = {}) {
  return new DeleteStoryUseCase({
    storyRepository:        storyRepo  ?? makeStoryRepo(),
    mediaRepository:        mediaRepo  ?? makeMediaRepo(),
    r2Gateway:              r2         ?? makeR2Gateway(),
    supabaseStorageGateway: supabase   ?? makeSupabaseGateway(),
  });
}

// ── Testes ───────────────────────────────────────────────────────────────────

describe('DeleteStoryUseCase', () => {

  it('1. Delete bem-sucedido: R2 ok → storyRemoved=true, storageDeletionPending=false', async () => {
    const mediaRepo = makeMediaRepo();
    const r2 = makeR2Gateway();
    const uc = makeUseCase({ mediaRepo, r2 });
    const result = await uc.execute({ storyId: STORY_ID, ownerId: OWNER_ID, barbershopId: SHOP_ID });
    assert.equal(result.storyRemoved, true);
    assert.equal(result.storageDeletionPending, false);
    assert.equal(mediaRepo._state.excluirCalled, true, 'media_files deve ser excluído após R2 ok');
    assert.ok(r2.deleted.includes(SOURCE_PATH), 'source path deve ser deletado do R2');
    assert.ok(r2.deleted.includes(VARIANT_PATH), 'variante deve ser deletada do R2');
  });

  it('2. Owner incorreto → AppError 403, R2 e DB não são tocados', async () => {
    const storyRepo = { ...makeStoryRepo(null), buscarStoryPorIdEOwner: async () => null };
    const mediaRepo = makeMediaRepo();
    const r2 = makeR2Gateway();
    const uc = makeUseCase({ storyRepo, mediaRepo, r2 });
    await assert.rejects(
      () => uc.execute({ storyId: STORY_ID, ownerId: 'outro-owner', barbershopId: SHOP_ID }),
      (err) => { assert.equal(err.status, 403); return true; }
    );
    assert.equal(r2.deleted.length, 0, 'R2 não deve ser chamado quando não autorizado');
    assert.equal(mediaRepo._state.pendingCalled, false);
  });

  it('3. R2 falha → story removido do DB, storageDeletionPending=true, retorno não lança', async () => {
    let storyExcluido = false;
    const storyRepo = {
      ...makeStoryRepo(),
      excluirStoryPorId: async () => { storyExcluido = true; },
    };
    const mediaRepo = makeMediaRepo();
    const r2 = makeR2Gateway(true); // falha sempre
    const uc = makeUseCase({ storyRepo, mediaRepo, r2 });
    const result = await uc.execute({ storyId: STORY_ID, ownerId: OWNER_ID, barbershopId: SHOP_ID });
    assert.equal(result.storyRemoved, true);
    assert.equal(result.storageDeletionPending, true, 'pendente quando R2 falha');
    assert.equal(storyExcluido, true, 'story deve ser excluído do DB mesmo com falha R2');
    assert.equal(mediaRepo._state.falhouCalled, true, 'falha deve ser registrada no media_file');
    assert.equal(mediaRepo._state.excluirCalled, false, 'media_file NÃO deve ser hard-deletado quando R2 falha');
  });

  it('4. Path de variante fora de stories/ → StoryR2PathValidator rejeita, R2 não chamado para esse path', async () => {
    const variants = [
      { storage_path: 'avatars/foto.jpg', name: 'avatar' }, // path inválido
      { storage_path: VARIANT_PATH,       name: 'thumb'  }, // path válido
    ];
    const mediaRepo = makeMediaRepo(variants);
    const r2 = makeR2Gateway();
    const uc = makeUseCase({ mediaRepo, r2 });
    await uc.execute({ storyId: STORY_ID, ownerId: OWNER_ID, barbershopId: SHOP_ID });
    assert.ok(!r2.deleted.includes('avatars/foto.jpg'), 'path fora do prefixo não deve ser enviado ao R2');
    assert.ok(r2.deleted.includes(VARIANT_PATH), 'path válido deve ser deletado normalmente');
  });

  it('5. Miniatura + source deletadas; media_files excluído; story row excluído', async () => {
    const extraVariants = [
      { storage_path: VARIANT_PATH, name: 'thumb' },
      { storage_path: 'stories/media-uuid-0001/medium/v1/media-uuid-0001.webp', name: 'medium' },
    ];
    const mediaRepo = makeMediaRepo(extraVariants);
    const r2 = makeR2Gateway();
    let storyExcluido = false;
    const storyRepo = {
      ...makeStoryRepo(),
      excluirStoryPorId: async () => { storyExcluido = true; },
    };
    const uc = makeUseCase({ storyRepo, mediaRepo, r2 });
    await uc.execute({ storyId: STORY_ID, ownerId: OWNER_ID, barbershopId: SHOP_ID });
    assert.equal(r2.deleted.length, 3, 'source + 2 variantes devem ser deletadas');
    assert.equal(mediaRepo._state.excluirCalled, true);
    assert.equal(storyExcluido, true);
  });

});
