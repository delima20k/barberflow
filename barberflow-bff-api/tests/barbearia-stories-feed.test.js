'use strict';

/**
 * tests/barbearia-stories-feed.test.js
 *
 * TDD — BarbeariaService.listarFeedStories()
 * Verifica que o feed agrega stories por barbearia, resolve URLs
 * e filtra barbearias sem stories ativos.
 */

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');

const BarbeariaService = require('../services/BarbeariaService');

const SHOP_A = '00000000-0000-4000-8001-000000000001';
const SHOP_B = '00000000-0000-4000-8001-000000000002';

// ─────────────────────────────────────────────────────────────────────────────
// BarbeariaService.listarFeedStories()
// ─────────────────────────────────────────────────────────────────────────────

suite('BarbeariaService.listarFeedStories()', () => {

  test('retorna feed vazio quando nao ha stories ativos', async () => {
    const repo = {
      listarFeedStoriesAgrupados: async () => [],
    };
    const svc = new BarbeariaService(repo);
    const feed = await svc.listarFeedStories();
    assert.deepStrictEqual(feed, []);
  });

  test('retorna grupos com shop e stories quando ha dados', async () => {
    const story1 = { id: 's1', barbershop_id: SHOP_A, media_id: null, media_url: null };
    const story2 = { id: 's2', barbershop_id: SHOP_B, media_id: null, media_url: null };
    const repo = {
      listarFeedStoriesAgrupados: async () => [
        { shop: { id: SHOP_A, name: 'Barbearia A', logo_path: null }, stories: [story1] },
        { shop: { id: SHOP_B, name: 'Barbearia B', logo_path: null }, stories: [story2] },
      ],
    };
    const svc = new BarbeariaService(repo);
    const feed = await svc.listarFeedStories();

    assert.strictEqual(feed.length, 2);
    assert.strictEqual(feed[0].shop.id, SHOP_A);
    assert.strictEqual(feed[0].stories.length, 1);
    assert.strictEqual(feed[0].stories[0].id, 's1');
    assert.strictEqual(feed[1].shop.id, SHOP_B);
  });

  test('stories sem media_id nao tentam resolver URL e retornam inalterados', async () => {
    const story = { id: 's3', barbershop_id: SHOP_A, media_id: null, media_url: 'http://cdn.example.com/v.mp4' };
    const repo = {
      listarFeedStoriesAgrupados: async () => [
        { shop: { id: SHOP_A, name: 'A', logo_path: null }, stories: [story] },
      ],
    };
    const svc = new BarbeariaService(repo);
    const feed = await svc.listarFeedStories();
    assert.strictEqual(feed[0].stories[0].media_url, 'http://cdn.example.com/v.mp4');
  });

  test('preserva ordem das barbearias retornada pelo repo', async () => {
    const repo = {
      listarFeedStoriesAgrupados: async () => [
        { shop: { id: SHOP_B, name: 'B', logo_path: null }, stories: [{ id: 'sB', media_id: null }] },
        { shop: { id: SHOP_A, name: 'A', logo_path: null }, stories: [{ id: 'sA', media_id: null }] },
      ],
    };
    const svc = new BarbeariaService(repo);
    const feed = await svc.listarFeedStories();
    assert.strictEqual(feed[0].shop.id, SHOP_B);
    assert.strictEqual(feed[1].shop.id, SHOP_A);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BarbeariaRepository.listarFeedStoriesAgrupados() — comportamento esperado
// ─────────────────────────────────────────────────────────────────────────────

suite('BarbeariaRepository.listarFeedStoriesAgrupados() — contrato', () => {

  test('retorna array vazio quando DB nao tem stories ativos', async () => {
    const BarbeariaRepository = require('../repositories/BarbeariaRepository');
    const db = {
      from: () => ({
        select: () => ({
          gt: () => ({
            order: () => ({
              limit: async () => ({ data: [], error: null }),
            }),
          }),
        }),
      }),
    };
    const repo = new BarbeariaRepository(db);
    const result = await repo.listarFeedStoriesAgrupados();
    assert.deepStrictEqual(result, []);
  });

  test('agrupa corretamente stories de barbearias distintas', async () => {
    const BarbeariaRepository = require('../repositories/BarbeariaRepository');

    const storiesData = [
      { id: 's1', barbershop_id: SHOP_A, media_id: null, created_at: '2026-06-14T10:00:00Z' },
      { id: 's2', barbershop_id: SHOP_B, media_id: null, created_at: '2026-06-14T09:00:00Z' },
      { id: 's3', barbershop_id: SHOP_A, media_id: null, created_at: '2026-06-14T08:00:00Z' },
    ];

    const shopsData = [
      { id: SHOP_A, name: 'Barbearia A', logo_path: null },
      { id: SHOP_B, name: 'Barbearia B', logo_path: null },
    ];

    let callCount = 0;
    const db = {
      from: (table) => {
        if (table === 'stories') {
          return {
            select: () => ({
              gt: () => ({
                order: () => ({
                  limit: async () => ({ data: storiesData, error: null }),
                }),
              }),
            }),
          };
        }
        // barbershops
        callCount++;
        return {
          select: () => ({
            eq: (_col, _val) => ({
              in: async () => ({ data: shopsData, error: null }),
            }),
            in: async () => ({ data: shopsData, error: null }),
          }),
        };
      },
    };

    const repo = new BarbeariaRepository(db);
    const grupos = await repo.listarFeedStoriesAgrupados();

    assert.strictEqual(grupos.length, 2);
    // SHOP_A deve vir primeiro (story mais recente)
    assert.strictEqual(grupos[0].shop.id, SHOP_A);
    assert.strictEqual(grupos[0].stories.length, 2);
    assert.strictEqual(grupos[1].shop.id, SHOP_B);
    assert.strictEqual(grupos[1].stories.length, 1);
    // Consulta barbershops foi feita uma vez (não N+1)
    assert.strictEqual(callCount, 1);
  });
});
