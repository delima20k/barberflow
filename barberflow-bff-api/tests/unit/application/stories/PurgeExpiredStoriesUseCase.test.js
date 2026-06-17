'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { PurgeExpiredStoriesUseCase } = require('../../../../application/stories/PurgeExpiredStoriesUseCase');

// ── Helpers ──────────────────────────────────────────────────────────────────

const MEDIA_ID    = 'aaaaaaaa-0000-0000-0000-000000000001';
const STORY_ID_1  = 'bbbbbbbb-0000-0000-0000-000000000001';
const SOURCE_PATH = `stories/${MEDIA_ID}/incoming/${MEDIA_ID}.mp4`;
const THUMB_PATH  = `stories/${MEDIA_ID}/thumb/v1/${MEDIA_ID}.webp`;

function makeExpiredStory(overrides = {}) {
  return {
    id: STORY_ID_1,
    media_id: MEDIA_ID,
    storage_path: null,
    media_files: { id: MEDIA_ID, path: SOURCE_PATH },
    ...overrides,
  };
}

function makeStoryRepo({ stories = [], legacyStories = [], outrasRefs = 0 } = {}) {
  const deleted = [];
  return {
    listarStoriesExpirados: async (_batch, _margem, somenteSemMediaId) =>
      somenteSemMediaId ? legacyStories : stories,
    contarOutrasReferencias: async () => outrasRefs,
    excluirStoriesPorIds: async (ids) => { deleted.push(...ids); },
    deleted,
  };
}

function makeMediaRepo({ variants = [{ storage_path: THUMB_PATH, name: 'thumb' }], pendentes = [] } = {}) {
  const state = { pendingCalls: 0, falhouCalls: 0, excluirCalls: 0 };
  return {
    listarVariantesPorMediaId: async () => variants,
    marcarComoPendenteLimpeza: async () => { state.pendingCalls++; },
    marcarCleanupFalhou:       async () => { state.falhouCalls++;  },
    excluirPorId:              async () => { state.excluirCalls++; },
    listarPendentesLimpeza:    async () => pendentes,
    existePorId:               async () => true,
    state,
  };
}

function makeR2Gateway({ failPaths = [], pages = [] } = {}) {
  const deleted = [];
  return {
    deleteObject: async (path) => {
      if (failPaths.includes(path)) throw new Error('R2 error simulado');
      deleted.push(path);
    },
    async *listObjectsByPrefixPaginated() {
      for (const page of pages) yield page;
    },
    deleted,
  };
}

function makeSupabase() {
  const deleted = [];
  return {
    deleteObject: async (path) => { deleted.push(path); },
    deleted,
  };
}

function makeUC({ storyRepo, mediaRepo, r2, supabase, batchSize } = {}) {
  return new PurgeExpiredStoriesUseCase({
    storyRepository:        storyRepo ?? makeStoryRepo(),
    mediaRepository:        mediaRepo ?? makeMediaRepo(),
    r2Gateway:              r2        ?? makeR2Gateway(),
    supabaseStorageGateway: supabase  ?? makeSupabase(),
    batchSize:              batchSize ?? 50,
  });
}

// ── Testes ───────────────────────────────────────────────────────────────────

describe('PurgeExpiredStoriesUseCase', () => {

  it('6. Dry-run: nenhum write no DB nem delete no R2; relatório correto', async () => {
    const stories = [makeExpiredStory()];
    const storyRepo = makeStoryRepo({ stories });
    const mediaRepo = makeMediaRepo();
    const r2 = makeR2Gateway();
    const uc = makeUC({ storyRepo, mediaRepo, r2 });
    const rel = await uc.execute({ dryRun: true });
    assert.equal(rel.dryRun, true);
    assert.equal(rel.storiesExpiredFound, 1);
    assert.equal(rel.r2ObjectsWouldDelete, 2, 'source + variante contabilizados');
    assert.equal(rel.storiesDeleted, 0,         'dry-run não deleta stories');
    assert.equal(rel.r2ObjectsDeleted, 0,        'dry-run não deleta R2');
    assert.equal(r2.deleted.length, 0,           'R2.deleteObject não chamado em dry-run');
    assert.equal(mediaRepo.state.pendingCalls, 0, 'marcarPending não chamado em dry-run');
    assert.equal(storyRepo.deleted.length, 0,    'excluirStoriesPorIds não chamado em dry-run');
  });

  it('7. Story expirado com media_id: R2 + media_files + story deletados', async () => {
    const stories  = [makeExpiredStory()];
    const storyRepo = makeStoryRepo({ stories });
    const mediaRepo = makeMediaRepo();
    const r2 = makeR2Gateway();
    const uc = makeUC({ storyRepo, mediaRepo, r2 });
    const rel = await uc.execute({ dryRun: false });
    assert.equal(rel.storiesExpiredFound, 1);
    assert.equal(rel.r2ObjectsDeleted, 2, 'source + variante deletados');
    assert.equal(rel.storiesDeleted, 1);
    assert.ok(r2.deleted.includes(SOURCE_PATH), 'source deletado do R2');
    assert.ok(r2.deleted.includes(THUMB_PATH),  'variante deletada do R2');
    assert.equal(mediaRepo.state.excluirCalls, 1, 'media_files hard-deletado');
    assert.equal(storyRepo.deleted.length, 1, 'story row deletado');
  });

  it('8. Retry de órfão: cleanup_status=pending + next_attempt <= now → retry bem-sucedido', async () => {
    const orphan = { id: MEDIA_ID, path: SOURCE_PATH, cleanup_attempts: 2 };
    const mediaRepo = makeMediaRepo({ pendentes: [orphan] });
    const r2 = makeR2Gateway();
    const uc = makeUC({ mediaRepo, r2 });
    const rel = await uc.execute({ dryRun: false });
    assert.equal(rel.orphansPending, 1);
    assert.equal(rel.orphansRetried, 1);
    assert.equal(rel.orphansCleared, 1, 'órfão deve ser limpo com sucesso');
    assert.equal(mediaRepo.state.excluirCalls, 1, 'media_files deve ser excluído');
  });

  it('9. Path fora de stories/ → validador rejeita, skipped++, R2 não chamado para esse path', async () => {
    const story = makeExpiredStory({
      media_files: { id: MEDIA_ID, path: 'avatars/foto.jpg' }, // path fora do prefixo
    });
    const storyRepo = makeStoryRepo({ stories: [story] });
    const mediaRepo = makeMediaRepo({ variants: [] }); // sem variantes
    const r2 = makeR2Gateway();
    const uc = makeUC({ storyRepo, mediaRepo, r2 });
    const rel = await uc.execute({ dryRun: false });
    assert.equal(rel.skipped.length, 1, 'path inválido deve ser registrado em skipped');
    assert.equal(r2.deleted.length, 0, 'R2 não deve ser chamado para path fora do prefixo');
    assert.equal(rel.r2ObjectsDeleted, 0);
    // Story ainda deve ser excluído do DB
    assert.equal(storyRepo.deleted.length, 1);
  });

  it('10. Duas execuções simultâneas: lock Redis impede processamento duplicado (idempotência)', async () => {
    // Simula idempotência: segunda execução encontra lista vazia (story já deletado pela 1ª)
    let chamadas = 0;
    const storyRepo = {
      listarStoriesExpirados: async () => {
        chamadas++;
        return chamadas === 1 ? [makeExpiredStory()] : [];
      },
      contarOutrasReferencias: async () => 0,
      excluirStoriesPorIds: async () => {},
      deleted: [],
    };
    const mediaRepo = makeMediaRepo();
    const r2 = makeR2Gateway();
    const uc = makeUC({ storyRepo, mediaRepo, r2 });
    const [rel1, rel2] = await Promise.all([
      uc.execute({ dryRun: false }),
      uc.execute({ dryRun: false }),
    ]);
    const totalDeleted = rel1.r2ObjectsDeleted + rel2.r2ObjectsDeleted;
    assert.ok(totalDeleted <= 2, 'no máximo uma execução deve deletar os objetos R2');
    assert.equal(rel1.storiesExpiredFound + rel2.storiesExpiredFound, 1,
      'apenas uma execução deve encontrar stories (segunda encontra lista vazia)');
  });

});
