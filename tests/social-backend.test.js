'use strict';
/**
 * tests/social-backend.test.js
 *
 * Testa SocialRepository e SocialService do backend Node.js.
 */

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const { fn }          = require('./_helpers.js');

const UUID_USER = '00000000-0000-4000-8000-000000000001';
const UUID_PRO  = 'a0000000-0000-4000-8000-000000000001';
const UUID_SHOP = 'b0000000-0000-4000-8000-000000000001';
const UUID_STR  = 's0000000-0000-4000-8000-000000000001';

function criarSupabaseMock({ data = null, error = null } = {}) {
  const result  = { data, error };
  const builder = {
    select: fn(), insert: fn(), update: fn(), delete: fn(), upsert: fn(),
    eq:     fn(), neq:   fn(), gte: fn(), lte: fn(), in: fn(), is: fn(),
    order:  fn(), limit: fn(), filter: fn(), or: fn(), not: fn(),
    single:      fn().mockResolvedValue(result),
    maybeSingle: fn().mockResolvedValue(result),
  };
  const chainable = [
    'select','insert','update','delete','upsert','eq','neq','gte','lte',
    'in','is','order','limit','filter','or','not',
  ];
  for (const m of chainable) builder[m].mockReturnValue(builder);
  Object.defineProperty(builder, 'then', {
    get() { return Promise.resolve(result).then.bind(Promise.resolve(result)); },
  });
  const supabase = { from: fn().mockReturnValue(builder) };
  return { supabase, builder };
}

const SocialRepository = require('../src/repositories/SocialRepository');
const SocialService    = require('../src/services/SocialService');

// ─────────────────────────────────────────────────────────────────────────────
// SocialRepository
// ─────────────────────────────────────────────────────────────────────────────

suite('SocialRepository.getStoriesByBarbershop()', () => {

  test('busca tabela stories', async () => {
    const { supabase } = criarSupabaseMock({ data: [] });
    const repo = new SocialRepository(supabase);
    await repo.getStoriesByBarbershop(UUID_SHOP);
    assert.ok(supabase.from.calls.some(([t]) => t === 'stories'));
  });

  test('retorna array vazio quando data é null', async () => {
    const { supabase } = criarSupabaseMock({ data: null });
    const repo = new SocialRepository(supabase);
    const result = await repo.getStoriesByBarbershop(UUID_SHOP);
    assert.deepEqual(result, []);
  });

  test('lança TypeError para UUID inválido', async () => {
    const { supabase } = criarSupabaseMock();
    const repo = new SocialRepository(supabase);
    await assert.rejects(() => repo.getStoriesByBarbershop('invalido'), TypeError);
  });
});

suite('SocialRepository.createStory()', () => {

  test('insere na tabela stories', async () => {
    const story = { id: UUID_STR, barbershop_id: UUID_SHOP, author_id: UUID_USER };
    const { supabase } = criarSupabaseMock({ data: story });
    const repo = new SocialRepository(supabase);
    await repo.createStory({ barbershop_id: UUID_SHOP, author_id: UUID_USER, media_url: 'https://cdn.example.com/img.jpg', type: 'image' });
    assert.ok(supabase.from.calls.some(([t]) => t === 'stories'));
  });
});

suite('SocialRepository.toggleLike()', () => {

  test('acessa tabela professional_likes', async () => {
    const { supabase } = criarSupabaseMock({ data: null });
    const repo = new SocialRepository(supabase);
    // Deve tentar delete primeiro
    await repo.deleteLike(UUID_PRO, UUID_USER).catch(() => {});
    assert.ok(supabase.from.calls.some(([t]) => t === 'professional_likes'));
  });

  test('addLike insere na tabela professional_likes', async () => {
    const { supabase } = criarSupabaseMock({ data: { professional_id: UUID_PRO, user_id: UUID_USER } });
    const repo = new SocialRepository(supabase);
    await repo.addLike(UUID_PRO, UUID_USER);
    assert.ok(supabase.from.calls.some(([t]) => t === 'professional_likes'));
  });
});

suite('SocialRepository.toggleFavorite()', () => {

  test('acessa tabela favorite_professionals', async () => {
    const { supabase } = criarSupabaseMock({ data: null });
    const repo = new SocialRepository(supabase);
    await repo.deleteFavorite(UUID_PRO, UUID_USER).catch(() => {});
    assert.ok(supabase.from.calls.some(([t]) => t === 'favorite_professionals'));
  });
});

suite('SocialRepository.getFavoritesByUser()', () => {

  test('busca favorite_professionals filtrando por user_id', async () => {
    const { supabase, builder } = criarSupabaseMock({ data: [] });
    const repo = new SocialRepository(supabase);
    await repo.getFavoritesByUser(UUID_USER);
    assert.ok(builder.eq.calls.some(([col, val]) => col === 'user_id' && val === UUID_USER));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SocialService
// ─────────────────────────────────────────────────────────────────────────────

function criarSocialService({ stories = [], liked = false, favorited = false } = {}) {
  const repo = {
    getStoriesByBarbershop: fn().mockResolvedValue(stories),
    createStory:            fn().mockResolvedValue({ id: UUID_STR }),
    deleteStory:            fn().mockResolvedValue(true),
    addComment:             fn().mockResolvedValue({ id: 'cmt-1' }),
    deleteLike:             fn().mockResolvedValue(liked ? 1 : 0),
    addLike:                fn().mockResolvedValue(true),
    deleteFavorite:         fn().mockResolvedValue(favorited ? 1 : 0),
    addFavorite:            fn().mockResolvedValue(true),
    getFavoritesByUser:     fn().mockResolvedValue([]),
    getLikesByUser:         fn().mockResolvedValue([]),
  };
  return { service: new SocialService(repo), repo };
}

suite('SocialService.listarStories()', () => {

  test('lança 400 para UUID inválido', async () => {
    const { service } = criarSocialService();
    await assert.rejects(
      () => service.listarStories('invalido'),
      (err) => err.status === 400,
    );
  });

  test('delega para repo.getStoriesByBarbershop()', async () => {
    const { service, repo } = criarSocialService({ stories: [{ id: UUID_STR }] });
    const result = await service.listarStories(UUID_SHOP);
    assert.strictEqual(repo.getStoriesByBarbershop.calls.length, 1);
    assert.ok(Array.isArray(result));
  });
});

suite('SocialService.criarStory()', () => {

  test('lança 400 quando media_url ausente', async () => {
    const { service } = criarSocialService();
    await assert.rejects(
      () => service.criarStory(UUID_USER, UUID_SHOP, { type: 'image' }),
      (err) => err.status === 400,
    );
  });

  test('lança 400 quando type inválido', async () => {
    const { service } = criarSocialService();
    await assert.rejects(
      () => service.criarStory(UUID_USER, UUID_SHOP, { media_url: 'https://cdn.example.com/img.jpg', type: 'gif' }),
      (err) => err.status === 400,
    );
  });

  test('delega para repo.createStory() com dados válidos', async () => {
    const { service, repo } = criarSocialService();
    await service.criarStory(UUID_USER, UUID_SHOP, {
      media_url: 'https://cdn.example.com/img.jpg',
      type: 'image',
    });
    assert.strictEqual(repo.createStory.calls.length, 1);
  });
});

suite('SocialService.toggleLike()', () => {

  test('quando like não existe, chama addLike', async () => {
    const { service, repo } = criarSocialService({ liked: false });
    await service.toggleLike(UUID_PRO, UUID_USER);
    assert.strictEqual(repo.addLike.calls.length, 1);
  });

  test('quando like já existe, chama deleteLike', async () => {
    const { service, repo } = criarSocialService({ liked: true });
    await service.toggleLike(UUID_PRO, UUID_USER);
    assert.strictEqual(repo.deleteLike.calls.length, 1);
  });
});

suite('SocialService.toggleFavorite()', () => {

  test('quando favorito não existe, chama addFavorite', async () => {
    const { service, repo } = criarSocialService({ favorited: false });
    await service.toggleFavorite(UUID_PRO, UUID_USER);
    assert.strictEqual(repo.addFavorite.calls.length, 1);
  });

  test('quando favorito já existe, chama deleteFavorite', async () => {
    const { service, repo } = criarSocialService({ favorited: true });
    await service.toggleFavorite(UUID_PRO, UUID_USER);
    assert.strictEqual(repo.deleteFavorite.calls.length, 1);
  });
});
