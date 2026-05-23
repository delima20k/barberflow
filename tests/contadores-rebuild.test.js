'use strict';

/**
 * Testes dos contadores desnormalizados — lógica de trigger e rebuild.
 *
 * Simulam o comportamento das funções SQL em JS sem conexão com banco.
 * Cada suite isola seu próprio estado. Cobertura:
 *
 *   CTR-01  Trigger INSERT: like inserido → contador sobe 1 atomicamente
 *   CTR-02  Trigger DELETE físico: like deletado → contador cai 1
 *   CTR-03  Soft delete: likes_count decrementado quando content_type match
 *   CTR-04  Concorrência: 50 INSERTs simultâneos → contador = 50 sem race
 *   CTR-05  Idempotência: rebuild executado duas vezes → resultado idêntico
 *   CTR-06  Validação pós-rebuild: stored = real para sample de 1000 registros
 *   CTR-07  Ranking pós-rebuild: ORDER BY likes_count DESC coerente com likes reais
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

// ─── Simuladores de estado ────────────────────────────────────────────────────

/**
 * Cria um estado isolado de banco em memória para um teste.
 * Tabelas: portfolio_images, stories, feed_items, likes, story_views.
 */
function createDb() {
  const portfolioImages = new Map(); // id → { likes_count, status }
  const stories         = new Map(); // id → { views_count, likes_count }
  const feedItems       = new Map(); // id → { likes_count, source_id, source_type }
  const likes           = new Map(); // `${user_id}:${content_id}:${content_type}` → { content_id, content_type }
  const storyViews      = new Map(); // `${story_id}:${viewer_id}` → true

  return { portfolioImages, stories, feedItems, likes, storyViews };
}

// ─── Simulador de fn_sync_likes_count (trigger AFTER INSERT OR DELETE em likes)
// Espelha exatamente o comportamento do PostgreSQL fn_sync_likes_count.
// Operação atômica: delta = +1 (INSERT) ou -1 (DELETE).
function applyLikeTrigger(db, op, like) {
  const delta = op === 'DELETE' ? -1 : 1;
  const id    = like.content_id;
  const type  = like.content_type;

  switch (type) {
    case 'portfolio_image': {
      const img = db.portfolioImages.get(id);
      if (img && img.status !== 'deleted') {
        img.likes_count = Math.max(0, img.likes_count + delta);
      }
      break;
    }
    case 'story': {
      const story = db.stories.get(id);
      if (story) {
        story.likes_count = Math.max(0, story.likes_count + delta);
      }
      break;
    }
    default: break;
  }

  // feed_items: qualquer content_type
  for (const [, fi] of db.feedItems) {
    if (fi.source_id === id && fi.source_type === type) {
      fi.likes_count = Math.max(0, fi.likes_count + delta);
    }
  }
}

// ─── Simulador de fn_sync_story_views_count (trigger AFTER INSERT em story_views)
function applyStoryViewTrigger(db, storyId) {
  const story = db.stories.get(storyId);
  if (story) story.views_count += 1;
}

// ─── Simulador de INSERT em likes (com deduplicação via UNIQUE constraint)
function insertLike(db, userId, contentId, contentType) {
  const key = `${userId}:${contentId}:${contentType}`;
  if (db.likes.has(key)) return false; // violação de UNIQUE — como no banco

  db.likes.set(key, { user_id: userId, content_id: contentId, content_type: contentType });
  applyLikeTrigger(db, 'INSERT', { content_id: contentId, content_type: contentType });
  return true;
}

// ─── Simulador de DELETE em likes
function deleteLike(db, userId, contentId, contentType) {
  const key = `${userId}:${contentId}:${contentType}`;
  if (!db.likes.has(key)) return false;

  db.likes.delete(key);
  applyLikeTrigger(db, 'DELETE', { content_id: contentId, content_type: contentType });
  return true;
}

// ─── Simulador de INSERT em story_views (com UNIQUE constraint)
function insertStoryView(db, storyId, viewerId) {
  const key = `${storyId}:${viewerId}`;
  if (db.storyViews.has(key)) return false;

  db.storyViews.set(key, true);
  applyStoryViewTrigger(db, storyId);
  return true;
}

// ─── Simulador de rebuild_counter_batch (recalcula stored a partir da fonte real)
function rebuildBatch(db, counter, batchIds) {
  let updated = 0;

  switch (counter) {
    case 'C8': {
      for (const id of batchIds) {
        const img = db.portfolioImages.get(id);
        if (!img || img.status === 'deleted') continue;
        const real = countLikes(db, id, 'portfolio_image');
        if (img.likes_count !== real) { img.likes_count = real; updated++; }
      }
      break;
    }
    case 'C10': {
      for (const id of batchIds) {
        const story = db.stories.get(id);
        if (!story) continue;
        const real = countViews(db, id);
        if (story.views_count !== real) { story.views_count = real; updated++; }
      }
      break;
    }
    case 'C11': {
      for (const id of batchIds) {
        const story = db.stories.get(id);
        if (!story) continue;
        const real = countLikes(db, id, 'story');
        if (story.likes_count !== real) { story.likes_count = real; updated++; }
      }
      break;
    }
    case 'C12': {
      for (const id of batchIds) {
        const fi = db.feedItems.get(id);
        if (!fi) continue;
        const real = countLikes(db, fi.source_id, fi.source_type);
        if (fi.likes_count !== real) { fi.likes_count = real; updated++; }
      }
      break;
    }
    default: break;
  }

  return updated;
}

// ─── Helpers de contagem (simulam SELECT COUNT(*) da fonte real)
function countLikes(db, contentId, contentType) {
  let n = 0;
  for (const [, l] of db.likes) {
    if (l.content_id === contentId && l.content_type === contentType) n++;
  }
  return n;
}

function countViews(db, storyId) {
  let n = 0;
  for (const [key] of db.storyViews) {
    if (key.startsWith(`${storyId}:`)) n++;
  }
  return n;
}

// ─── Fixtures helpers ─────────────────────────────────────────────────────────
let _id = 1;
function uid() { return `00000000-0000-0000-0000-${String(_id++).padStart(12, '0')}`; }

// ═════════════════════════════════════════════════════════════════════════════
// CTR-01: Trigger INSERT — like inserido → contador sobe 1
// ═════════════════════════════════════════════════════════════════════════════
describe('CTR-01 Trigger INSERT', () => {
  it('deve incrementar portfolio_images.likes_count em 1 ao inserir like', () => {
    const db  = createDb();
    const img = uid();
    const u1  = uid();
    db.portfolioImages.set(img, { likes_count: 0, status: 'active' });

    insertLike(db, u1, img, 'portfolio_image');

    assert.equal(db.portfolioImages.get(img).likes_count, 1);
  });

  it('deve incrementar stories.likes_count em 1 ao inserir like', () => {
    const db    = createDb();
    const story = uid();
    db.stories.set(story, { views_count: 0, likes_count: 0 });

    insertLike(db, uid(), story, 'story');

    assert.equal(db.stories.get(story).likes_count, 1);
  });

  it('deve incrementar feed_items.likes_count ao inserir like no content referenciado', () => {
    const db    = createDb();
    const story = uid();
    const fi    = uid();
    db.stories.set(story, { views_count: 0, likes_count: 0 });
    db.feedItems.set(fi, { likes_count: 0, source_id: story, source_type: 'story' });

    insertLike(db, uid(), story, 'story');

    assert.equal(db.feedItems.get(fi).likes_count, 1);
    assert.equal(db.stories.get(story).likes_count, 1);
  });

  it('não deve incrementar ao inserir like duplicado (UNIQUE constraint)', () => {
    const db  = createDb();
    const img = uid();
    const u1  = uid();
    db.portfolioImages.set(img, { likes_count: 0, status: 'active' });

    insertLike(db, u1, img, 'portfolio_image');
    const duplicado = insertLike(db, u1, img, 'portfolio_image');

    assert.equal(duplicado, false);
    assert.equal(db.portfolioImages.get(img).likes_count, 1);
  });

  it('deve incrementar stories.views_count ao inserir story_view', () => {
    const db    = createDb();
    const story = uid();
    db.stories.set(story, { views_count: 0, likes_count: 0 });

    insertStoryView(db, story, uid());

    assert.equal(db.stories.get(story).views_count, 1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CTR-02: Trigger DELETE físico — like deletado → contador cai 1
// ═════════════════════════════════════════════════════════════════════════════
describe('CTR-02 Trigger DELETE físico', () => {
  it('deve decrementar portfolio_images.likes_count ao deletar like', () => {
    const db  = createDb();
    const img = uid();
    const u1  = uid();
    db.portfolioImages.set(img, { likes_count: 0, status: 'active' });

    insertLike(db, u1, img, 'portfolio_image');
    assert.equal(db.portfolioImages.get(img).likes_count, 1);

    deleteLike(db, u1, img, 'portfolio_image');
    assert.equal(db.portfolioImages.get(img).likes_count, 0);
  });

  it('não deve ir abaixo de 0 ao deletar like inexistente', () => {
    const db  = createDb();
    const img = uid();
    db.portfolioImages.set(img, { likes_count: 0, status: 'active' });

    // simula decremento direto (bug legacy)
    applyLikeTrigger(db, 'DELETE', { content_id: img, content_type: 'portfolio_image' });

    assert.equal(db.portfolioImages.get(img).likes_count, 0); // GREATEST(0, ...) protege
  });

  it('deve decrementar feed_items.likes_count ao deletar like no content referenciado', () => {
    const db    = createDb();
    const story = uid();
    const fi    = uid();
    const u1    = uid();
    db.stories.set(story, { views_count: 0, likes_count: 0 });
    db.feedItems.set(fi, { likes_count: 0, source_id: story, source_type: 'story' });

    insertLike(db, u1, story, 'story');
    deleteLike(db, u1, story, 'story');

    assert.equal(db.feedItems.get(fi).likes_count, 0);
    assert.equal(db.stories.get(story).likes_count, 0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CTR-03: Soft delete — trigger não atualiza imagem deletada logicamente
// ═════════════════════════════════════════════════════════════════════════════
describe('CTR-03 Soft delete', () => {
  it('não deve incrementar portfolio_images.likes_count para imagem soft-deleted', () => {
    const db  = createDb();
    const img = uid();
    db.portfolioImages.set(img, { likes_count: 0, status: 'deleted' });

    insertLike(db, uid(), img, 'portfolio_image');

    assert.equal(db.portfolioImages.get(img).likes_count, 0);
  });

  it('não deve decrementar portfolio_images.likes_count para imagem soft-deleted', () => {
    const db  = createDb();
    const img = uid();
    const u1  = uid();
    // Imagina que a imagem tinha 3 likes antes de ser deletada
    db.portfolioImages.set(img, { likes_count: 3, status: 'deleted' });

    // trigger de DELETE não altera imagem soft-deleted
    applyLikeTrigger(db, 'DELETE', { content_id: img, content_type: 'portfolio_image' });

    assert.equal(db.portfolioImages.get(img).likes_count, 3);
  });

  it('rebuild_counter_batch C8 ignora imagens soft-deleted', () => {
    const db  = createDb();
    const img = uid();
    // likes existem na tabela likes, mas imagem está deletada
    db.portfolioImages.set(img, { likes_count: 99, status: 'deleted' });
    db.likes.set(`u1:${img}:portfolio_image`, { content_id: img, content_type: 'portfolio_image' });

    const updated = rebuildBatch(db, 'C8', [img]);

    assert.equal(updated, 0); // soft-deleted: não recalcula
    assert.equal(db.portfolioImages.get(img).likes_count, 99); // valor preservado
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CTR-04: Concorrência — 50 INSERTs simultâneos → contador = 50
// ═════════════════════════════════════════════════════════════════════════════
describe('CTR-04 Concorrência', () => {
  it('deve resultar em contador = 50 após 50 likes concorrentes distintos', async () => {
    const db  = createDb();
    const img = uid();
    db.portfolioImages.set(img, { likes_count: 0, status: 'active' });

    // Simula 50 "transações concorrentes" — em JS são sincronas mas o padrão
    // +1 atômico garante serialização correta no PostgreSQL
    const ops = Array.from({ length: 50 }, (_, i) =>
      Promise.resolve(insertLike(db, uid(), img, 'portfolio_image')),
    );

    const results = await Promise.all(ops);
    const inserted = results.filter(Boolean).length;

    assert.equal(inserted, 50, 'todos os 50 INSERTs devem ser aceitos (users distintos)');
    assert.equal(db.portfolioImages.get(img).likes_count, 50);
  });

  it('deve resultar em contador = 50 após 50 story_views concorrentes distintos', async () => {
    const db    = createDb();
    const story = uid();
    db.stories.set(story, { views_count: 0, likes_count: 0 });

    const ops = Array.from({ length: 50 }, () =>
      Promise.resolve(insertStoryView(db, story, uid())),
    );
    await Promise.all(ops);

    assert.equal(db.stories.get(story).views_count, 50);
  });

  it('deve resultar em contador = 0 após 50 INSERTs seguidos de 50 DELETEs', async () => {
    const db    = createDb();
    const story = uid();
    db.stories.set(story, { views_count: 0, likes_count: 0 });

    const users = Array.from({ length: 50 }, () => uid());

    // 50 likes
    await Promise.all(users.map(u => Promise.resolve(insertLike(db, u, story, 'story'))));
    assert.equal(db.stories.get(story).likes_count, 50);

    // 50 deletes
    await Promise.all(users.map(u => Promise.resolve(deleteLike(db, u, story, 'story'))));
    assert.equal(db.stories.get(story).likes_count, 0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CTR-05: Idempotência — rebuild executado duas vezes → resultado idêntico
// ═════════════════════════════════════════════════════════════════════════════
describe('CTR-05 Idempotência do rebuild', () => {
  it('deve produzir o mesmo resultado ao executar rebuild_counter_batch duas vezes (C8)', () => {
    const db  = createDb();
    const imgs = Array.from({ length: 5 }, () => uid());
    const u1  = uid();

    imgs.forEach(id => db.portfolioImages.set(id, { likes_count: 0, status: 'active' }));
    // Insere likes em 3 das 5 imagens
    insertLike(db, u1,   imgs[0], 'portfolio_image');
    insertLike(db, uid(), imgs[1], 'portfolio_image');
    insertLike(db, uid(), imgs[1], 'portfolio_image'); // segundo user na mesma imagem

    // Primeira execução
    rebuildBatch(db, 'C8', imgs);
    const afterFirst = imgs.map(id => db.portfolioImages.get(id).likes_count);

    // Segunda execução — deve retornar 0 rows_updated (nada mudou)
    const updatedSecond = rebuildBatch(db, 'C8', imgs);
    const afterSecond   = imgs.map(id => db.portfolioImages.get(id).likes_count);

    assert.equal(updatedSecond, 0, 'segunda execução não deve atualizar nada');
    assert.deepEqual(afterFirst, afterSecond, 'contadores idênticos após duas execuções');
  });

  it('deve produzir o mesmo resultado ao executar rebuild_counter_batch duas vezes (C10)', () => {
    const db     = createDb();
    const storyA = uid();
    const storyB = uid();
    db.stories.set(storyA, { views_count: 0, likes_count: 0 });
    db.stories.set(storyB, { views_count: 0, likes_count: 0 });

    insertStoryView(db, storyA, uid());
    insertStoryView(db, storyA, uid());
    insertStoryView(db, storyB, uid());

    rebuildBatch(db, 'C10', [storyA, storyB]);
    const first = [db.stories.get(storyA).views_count, db.stories.get(storyB).views_count];

    const updatedSecond = rebuildBatch(db, 'C10', [storyA, storyB]);
    const second = [db.stories.get(storyA).views_count, db.stories.get(storyB).views_count];

    assert.equal(updatedSecond, 0);
    assert.deepEqual(first, second);
  });

  it('deve produzir o mesmo resultado ao executar rebuild_counter_batch duas vezes (C12)', () => {
    const db    = createDb();
    const story = uid();
    const fi    = uid();
    db.stories.set(story, { views_count: 0, likes_count: 0 });
    db.feedItems.set(fi, { likes_count: 0, source_id: story, source_type: 'story' });

    insertLike(db, uid(), story, 'story');
    insertLike(db, uid(), story, 'story');

    rebuildBatch(db, 'C12', [fi]);
    const first = db.feedItems.get(fi).likes_count;

    const updatedSecond = rebuildBatch(db, 'C12', [fi]);
    const second = db.feedItems.get(fi).likes_count;

    assert.equal(updatedSecond, 0);
    assert.equal(first, second);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CTR-06: Validação pós-rebuild — stored = real para sample de 1000 registros
// ═════════════════════════════════════════════════════════════════════════════
describe('CTR-06 Validação pós-rebuild (sample 1000)', () => {
  let db;

  before(() => {
    db = createDb();
    const N_IMAGES = 1000;
    const N_USERS  = 200;

    const users = Array.from({ length: N_USERS }, () => uid());
    const imgs  = Array.from({ length: N_IMAGES }, () => {
      const id = uid();
      // Seed com valor errado para simular drift pré-rebuild
      db.portfolioImages.set(id, { likes_count: 99, status: 'active' });
      return id;
    });

    // Insere likes aleatórios (determinístico: user i curte image i % N_IMAGES)
    for (let i = 0; i < N_USERS; i++) {
      const imgId = imgs[i % N_IMAGES];
      insertLike(db, users[i], imgId, 'portfolio_image');
    }

    // Rebuild completo
    rebuildBatch(db, 'C8', imgs);
  });

  it('deve ter drift = 0 para todas as 1000 imagens após rebuild', () => {
    let driftCount = 0;

    for (const [id, img] of db.portfolioImages) {
      const real = countLikes(db, id, 'portfolio_image');
      if (img.likes_count !== real) driftCount++;
    }

    assert.equal(driftCount, 0, `${driftCount} imagens com drift remanescente`);
  });

  it('deve ter o total de likes nos contadores igual ao total real', () => {
    let storedTotal = 0;
    let realTotal   = 0;

    for (const [id, img] of db.portfolioImages) {
      storedTotal += img.likes_count;
      realTotal   += countLikes(db, id, 'portfolio_image');
    }

    assert.equal(storedTotal, realTotal);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CTR-07: Ranking pós-rebuild — ORDER BY likes_count coerente com likes reais
// ═════════════════════════════════════════════════════════════════════════════
describe('CTR-07 Ranking pós-rebuild', () => {
  it('deve ordenar portfolio_images por popularidade real após rebuild', () => {
    const db = createDb();
    const [imgA, imgB, imgC] = [uid(), uid(), uid()];
    db.portfolioImages.set(imgA, { likes_count: 0, status: 'active' });
    db.portfolioImages.set(imgB, { likes_count: 0, status: 'active' });
    db.portfolioImages.set(imgC, { likes_count: 0, status: 'active' });

    // imgB = 3 likes, imgA = 1 like, imgC = 0 likes
    insertLike(db, uid(), imgB, 'portfolio_image');
    insertLike(db, uid(), imgB, 'portfolio_image');
    insertLike(db, uid(), imgB, 'portfolio_image');
    insertLike(db, uid(), imgA, 'portfolio_image');

    // Ranking pós-trigger (sem rebuild necessário — triggers mantiveram correto)
    const ranking = [...db.portfolioImages.entries()]
      .sort((a, b) => b[1].likes_count - a[1].likes_count)
      .map(([id]) => id);

    assert.equal(ranking[0], imgB, 'imgB deve ser 1o com 3 likes');
    assert.equal(ranking[1], imgA, 'imgA deve ser 2o com 1 like');
    assert.equal(ranking[2], imgC, 'imgC deve ser 3o com 0 likes');
  });

  it('deve manter ranking correto após rebuild de estado degradado', () => {
    const db = createDb();
    const [imgA, imgB, imgC] = [uid(), uid(), uid()];

    // Estado degradado: contadores errados (drift legacy)
    db.portfolioImages.set(imgA, { likes_count: 100, status: 'active' }); // deve ter 1
    db.portfolioImages.set(imgB, { likes_count: 0,   status: 'active' }); // deve ter 3
    db.portfolioImages.set(imgC, { likes_count: 50,  status: 'active' }); // deve ter 2

    insertLike(db, uid(), imgA, 'portfolio_image');
    insertLike(db, uid(), imgB, 'portfolio_image');
    insertLike(db, uid(), imgB, 'portfolio_image');
    insertLike(db, uid(), imgB, 'portfolio_image');
    insertLike(db, uid(), imgC, 'portfolio_image');
    insertLike(db, uid(), imgC, 'portfolio_image');

    // Rebuild corrige os contadores
    rebuildBatch(db, 'C8', [imgA, imgB, imgC]);

    const ranking = [...db.portfolioImages.entries()]
      .sort((a, b) => b[1].likes_count - a[1].likes_count)
      .map(([id]) => id);

    assert.equal(db.portfolioImages.get(imgA).likes_count, 1);
    assert.equal(db.portfolioImages.get(imgB).likes_count, 3);
    assert.equal(db.portfolioImages.get(imgC).likes_count, 2);
    assert.equal(ranking[0], imgB);
    assert.equal(ranking[1], imgC);
    assert.equal(ranking[2], imgA);
  });

  it('deve corrigir ranking de stories pós-rebuild de views_count (C10)', () => {
    const db = createDb();
    const [sA, sB, sC] = [uid(), uid(), uid()];
    // Estado degradado: todos zerados
    db.stories.set(sA, { views_count: 0, likes_count: 0 });
    db.stories.set(sB, { views_count: 0, likes_count: 0 });
    db.stories.set(sC, { views_count: 0, likes_count: 0 });

    // sC: 5 views, sA: 3 views, sB: 1 view
    for (let i = 0; i < 5; i++) insertStoryView(db, sC, uid());
    for (let i = 0; i < 3; i++) insertStoryView(db, sA, uid());
    insertStoryView(db, sB, uid());

    // Triggers já mantiveram correto — rebuild confirma
    rebuildBatch(db, 'C10', [sA, sB, sC]);

    const ranking = [sA, sB, sC]
      .sort((a, b) => db.stories.get(b).views_count - db.stories.get(a).views_count);

    assert.equal(ranking[0], sC, 'sC deve ser 1o com 5 views');
    assert.equal(ranking[1], sA, 'sA deve ser 2o com 3 views');
    assert.equal(ranking[2], sB, 'sB deve ser 3o com 1 view');
  });
});
