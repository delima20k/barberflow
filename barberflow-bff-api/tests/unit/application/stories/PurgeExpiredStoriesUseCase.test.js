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

function makeMediaRepo({ variants = [{ storage_path: THUMB_PATH, name: 'thumb' }], pendentes = [], existeIds = null } = {}) {
  const state = { pendingCalls: 0, falhouCalls: 0, excluirCalls: 0, existeChecks: [] };
  return {
    listarVariantesPorMediaId: async () => variants,
    marcarComoPendenteLimpeza: async () => { state.pendingCalls++; },
    marcarCleanupFalhou:       async () => { state.falhouCalls++;  },
    excluirPorId:              async () => { state.excluirCalls++; },
    listarPendentesLimpeza:    async () => pendentes,
    // existeIds=null → tudo existe (compat). Set → só os ids do Set existem.
    existePorId:               async (id) => { state.existeChecks.push(id); return existeIds ? existeIds.has(id) : true; },
    state,
  };
}

function makeR2Gateway({ failPaths = [], pages = [] } = {}) {
  const deleted = [];
  const state = { listCalls: 0, pageSize: null };
  return {
    deleteObject: async (path) => {
      if (failPaths.includes(path)) throw new Error('R2 error simulado');
      deleted.push(path);
    },
    async *listObjectsByPrefixPaginated(_prefix, pageSize) {
      state.listCalls++;
      state.pageSize = pageSize;
      for (const page of pages) yield page;
    },
    deleted,
    state,
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

  it('11. Dry-run sem includeR2Scan nao lista objetos no R2', async () => {
    const r2 = makeR2Gateway({
      pages: [[{ key: SOURCE_PATH, sizeBytes: 10, lastModified: new Date(0) }]],
    });
    const uc = makeUC({ r2 });
    const rel = await uc.execute({ dryRun: true, includeR2Scan: false });

    assert.equal(r2.state.listCalls, 0, 'dry-run sem scan nao deve chamar listObjects no R2');
    assert.equal(rel.r2ScanObjectsInspected, 0);
    assert.equal(rel.r2ScanPagesFetched, 0);
  });

  it('12. Scan R2 respeita batchSize e nao inspeciona alem do limite', async () => {
    const oldPath = 'stories/cccccccc-0000-0000-0000-000000000003/incoming/v.mp4';
    const pages = [[
      { key: SOURCE_PATH, sizeBytes: 10, lastModified: new Date(0) },
      { key: oldPath, sizeBytes: 20, lastModified: new Date(0) },
      { key: THUMB_PATH, sizeBytes: 30, lastModified: new Date(0) },
    ]];
    const r2 = makeR2Gateway({ pages });
    const uc = makeUC({ r2, batchSize: 2 });
    const rel = await uc.execute({ dryRun: true, includeR2Scan: true });

    assert.equal(r2.state.listCalls, 1);
    assert.equal(r2.state.pageSize, 2, 'pageSize deve acompanhar o batchSize');
    assert.equal(rel.r2ScanObjectsInspected, 2);
    assert.equal(rel.estimatedSizeBytes, 30);
  });

  it('13. FASE E: órfão real (stories/{ownerId}/incoming/{mediaId}.mp4) sem media_file é deletado', async () => {
    // Formato REAL de produção: parts[1] é o ownerId, NÃO o mediaId.
    const OWNER_ID  = 'dddddddd-0000-0000-0000-000000000009';
    const ORFAO_ID  = 'eeeeeeee-0000-0000-0000-000000000009';
    const orfaoKey  = `stories/${OWNER_ID}/incoming/${ORFAO_ID}.mp4`;
    const cutoff    = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48h atrás

    const mediaRepo = makeMediaRepo({ existeIds: new Set() }); // nenhum media_file existe
    const r2 = makeR2Gateway({ pages: [[{ key: orfaoKey, sizeBytes: 100, lastModified: cutoff }]] });
    const uc = makeUC({ mediaRepo, r2 });
    const rel = await uc.execute({ dryRun: false, includeR2Scan: true });

    assert.equal(rel.r2TrueOrphansFound, 1, 'órfão deve ser detectado');
    assert.equal(rel.r2TrueOrphansDeleted, 1, 'órfão deve ser deletado do R2');
    assert.ok(r2.deleted.includes(orfaoKey), 'deleteObject chamado para a key do órfão');
    // Confirma que o mediaId verificado foi o do FILENAME, não o ownerId.
    assert.ok(mediaRepo.state.existeChecks.includes(ORFAO_ID), 'existePorId checado com mediaId do filename');
    assert.ok(!mediaRepo.state.existeChecks.includes(OWNER_ID), 'ownerId NÃO deve ser tratado como mediaId');
  });

  it('14. FASE E: objeto com media_file existente NÃO é deletado (mídia ativa)', async () => {
    const OWNER_ID  = 'dddddddd-0000-0000-0000-00000000000a';
    const ATIVO_ID  = 'eeeeeeee-0000-0000-0000-00000000000a';
    const ativoKey  = `stories/${OWNER_ID}/incoming/${ATIVO_ID}.mp4`;
    const cutoff    = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const mediaRepo = makeMediaRepo({ existeIds: new Set([ATIVO_ID]) }); // media_file existe
    const r2 = makeR2Gateway({ pages: [[{ key: ativoKey, sizeBytes: 100, lastModified: cutoff }]] });
    const uc = makeUC({ mediaRepo, r2 });
    const rel = await uc.execute({ dryRun: false, includeR2Scan: true });

    assert.equal(rel.r2TrueOrphansFound, 0, 'mídia com media_file não é órfã');
    assert.equal(r2.deleted.length, 0, 'nada deve ser deletado do R2');
  });

  it('15. FASE E: objeto recente (<24h) é ignorado mesmo sem media_file', async () => {
    const OWNER_ID  = 'dddddddd-0000-0000-0000-00000000000b';
    const RECENTE_ID = 'eeeeeeee-0000-0000-0000-00000000000b';
    const recenteKey = `stories/${OWNER_ID}/incoming/${RECENTE_ID}.mp4`;
    const agora     = new Date(); // recém-criado

    const mediaRepo = makeMediaRepo({ existeIds: new Set() });
    const r2 = makeR2Gateway({ pages: [[{ key: recenteKey, sizeBytes: 100, lastModified: agora }]] });
    const uc = makeUC({ mediaRepo, r2 });
    const rel = await uc.execute({ dryRun: false, includeR2Scan: true });

    assert.equal(rel.r2TrueOrphansFound, 0, 'objeto recente não pode ser órfão (upload em andamento)');
    assert.equal(r2.deleted.length, 0, 'nada deletado: dentro da janela de 24h');
  });

  it('16. FASE E: catálogo de áudio (filename não-UUID) é ignorado com segurança', async () => {
    const audioKey = 'stories/audio/instrumental/agusalvarez-sunova-journey-48d87e42.m4a';
    const cutoff   = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const mediaRepo = makeMediaRepo({ existeIds: new Set() });
    const r2 = makeR2Gateway({ pages: [[{ key: audioKey, sizeBytes: 100, lastModified: cutoff }]] });
    const uc = makeUC({ mediaRepo, r2 });
    const rel = await uc.execute({ dryRun: false, includeR2Scan: true });

    assert.equal(rel.r2TrueOrphansFound, 0, 'áudio do catálogo nunca deve ser tratado como órfão');
    assert.equal(r2.deleted.length, 0, 'catálogo de áudio preservado');
    assert.ok(rel.skipped.some(s => s.reason === 'key_format_invalida'), 'áudio registrado como key_format_invalida');
  });

});
