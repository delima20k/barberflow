'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');

process.env.SUPABASE_URL = 'https://test.supabase.co';

const BarbeariaMediaService = require('../services/BarbeariaMediaService');

const OWNER_ID = '00000000-0000-4000-8000-000000000001';

async function pngBuffer() {
  return sharp({
    create: {
      width: 1200,
      height: 800,
      channels: 3,
      background: { r: 24, g: 24, b: 24 },
    },
  }).png().toBuffer();
}

describe('BarbeariaMediaService', () => {
  it('processa imagem de servico via BFF em WebP sem upload direto do frontend', async () => {
    const uploads = [];
    const service = new BarbeariaMediaService({
      getAtivaPorOwner: async () => ({ id: 'shop-1' }),
      uploadImagemBarbearia: async (path, buffer, contentType) => uploads.push({ path, buffer, contentType }),
      getBarbershopPublicUrl: (path) => `https://cdn.test/${path}`,
    });

    const result = await service.salvarImagemServico(OWNER_ID, await pngBuffer(), 'image/png');

    assert.match(result.path, /^shop-1\/services\/.+\.webp$/);
    assert.equal(uploads[0].contentType, 'image/webp');
    assert.equal(result.publicUrl, `https://cdn.test/${result.path}`);
  });

  it('bloqueia SVG e tipos fora da allowlist em imagem de servico', async () => {
    const service = new BarbeariaMediaService({
      getAtivaPorOwner: async () => ({ id: 'shop-1' }),
      uploadImagemBarbearia: async () => {},
      getBarbershopPublicUrl: (path) => path,
    });

    await assert.rejects(
      () => service.salvarImagemServico(OWNER_ID, Buffer.from('<svg></svg>'), 'image/svg+xml'),
      /Formato de imagem invalido/,
    );
  });
});
