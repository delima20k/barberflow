'use strict';

const { suite, test } = require('node:test');
const assert = require('node:assert/strict');

const ProfissionalService = require('../services/ProfissionalService');

const CLIENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const PRO_ID = '660e8400-e29b-41d4-a716-446655440001';
const IMAGE_ID = '770e8400-e29b-41d4-a716-446655440002';

function criarRepo(overrides = {}) {
  return {
    listarPortfolioPublico: async () => ({
      items: [{
        id: IMAGE_ID,
        title: 'Degrade baixo',
        description: 'Finalizado na navalha',
        category: 'degrade',
        storage_path: 'images/original/pro-1.webp',
        thumbnail_path: 'images/thumbs/pro-1.webp',
        likes_count: 4,
        views_count: 12,
        is_featured: true,
        updated_at: '2026-05-25T12:00:00Z',
      }],
      total: 1,
    }),
    atualizarPortfolioImagem: async (_userId, imageId, payload) => ({ id: imageId, ...payload }),
    removerPortfolioImagem: async () => ({ deleted: true }),
    listarCurtidasPortfolio: async () => [IMAGE_ID],
    curtirPortfolioImagem: async () => ({ exists: true, liked: true, likes_count: 5 }),
    descurtirPortfolioImagem: async () => ({ exists: true, liked: false, likes_count: 4 }),
    ...overrides,
  };
}

suite('ProfissionalService - portfolio publico', () => {
  test('deve listar portfolio publico sem depender de usuario autenticado', async () => {
    const service = new ProfissionalService(criarRepo());

    const dto = await service.listarPortfolioPublico(PRO_ID, { limit: 12 });

    assert.deepEqual(dto, {
      items: [{
        id: IMAGE_ID,
        title: 'Degrade baixo',
        description: 'Finalizado na navalha',
        category: 'degrade',
        storagePath: 'images/original/pro-1.webp',
        thumbnailPath: 'images/thumbs/pro-1.webp',
        likesCount: 4,
        viewsCount: 12,
        isFeatured: true,
        updatedAt: '2026-05-25T12:00:00Z',
      }],
      total: 1,
      limit: 12,
      offset: 0,
    });
  });

  test('deve atualizar imagem do portfolio com allowlist', async () => {
    const recebidos = [];
    const service = new ProfissionalService(criarRepo({
      atualizarPortfolioImagem: async (userId, imageId, payload) => {
        recebidos.push({ userId, imageId, payload });
        return { id: imageId, ...payload };
      },
    }));

    const dto = await service.atualizarPortfolioImagem(PRO_ID, IMAGE_ID, {
      title: 'Corte social',
      description: 'Tesoura e acabamento',
      category: 'social',
      isFeatured: true,
      owner_id: CLIENT_ID,
    });

    assert.deepEqual(recebidos[0], {
      userId: PRO_ID,
      imageId: IMAGE_ID,
      payload: {
        title: 'Corte social',
        description: 'Tesoura e acabamento',
        category: 'social',
        is_featured: true,
      },
    });
    assert.equal(dto.id, IMAGE_ID);
  });

  test('deve remover imagem validando owner no repository', async () => {
    let chamado = null;
    const service = new ProfissionalService(criarRepo({
      removerPortfolioImagem: async (userId, imageId) => {
        chamado = { userId, imageId };
        return { deleted: true };
      },
    }));

    const dto = await service.removerPortfolioImagem(PRO_ID, IMAGE_ID);

    assert.deepEqual(chamado, { userId: PRO_ID, imageId: IMAGE_ID });
    assert.deepEqual(dto, { deleted: true });
  });

  test('deve curtir imagem do portfolio via repository', async () => {
    let chamado = null;
    const service = new ProfissionalService(criarRepo({
      curtirPortfolioImagem: async (userId, imageId) => {
        chamado = { userId, imageId };
        return { exists: true, liked: true, likes_count: 5 };
      },
    }));

    const dto = await service.curtirPortfolioImagem(CLIENT_ID, IMAGE_ID);

    assert.deepEqual(chamado, { userId: CLIENT_ID, imageId: IMAGE_ID });
    assert.deepEqual(dto, { imageId: IMAGE_ID, liked: true, likesCount: 5 });
  });

  test('deve listar curtidas do usuario por ids de portfolio', async () => {
    let chamado = null;
    const service = new ProfissionalService(criarRepo({
      listarCurtidasPortfolio: async (userId, ids) => {
        chamado = { userId, ids };
        return [IMAGE_ID];
      },
    }));

    const dto = await service.listarCurtidasPortfolio(CLIENT_ID, `${IMAGE_ID},${PRO_ID}`);

    assert.deepEqual(chamado, { userId: CLIENT_ID, ids: [IMAGE_ID, PRO_ID] });
    assert.deepEqual(dto, { likedIds: [IMAGE_ID] });
  });

  test('deve descurtir imagem do portfolio via repository', async () => {
    let chamado = null;
    const service = new ProfissionalService(criarRepo({
      descurtirPortfolioImagem: async (userId, imageId) => {
        chamado = { userId, imageId };
        return { exists: true, liked: false, likes_count: 4 };
      },
    }));

    const dto = await service.descurtirPortfolioImagem(CLIENT_ID, IMAGE_ID);

    assert.deepEqual(chamado, { userId: CLIENT_ID, imageId: IMAGE_ID });
    assert.deepEqual(dto, { imageId: IMAGE_ID, liked: false, likesCount: 4 });
  });
});
