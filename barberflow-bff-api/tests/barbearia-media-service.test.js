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

async function detailedCoverBuffer() {
  const width = 1600;
  const height = 1000;
  const raw = Buffer.alloc(width * height * 3);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      const stripe = ((Math.floor(x / 12) + Math.floor(y / 10)) % 2) * 28;
      raw[i] = (x * 7 + y * 3 + stripe) % 256;
      raw[i + 1] = (x * 2 + y * 5 + stripe) % 256;
      raw[i + 2] = (x * 3 + y * 2 + stripe) % 256;
    }
  }

  return sharp(raw, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 92 })
    .toBuffer();
}

describe('BarbeariaMediaService', () => {
  it('processa imagem de servico via BFF em WebP sem upload direto do frontend', async () => {
    const uploads = [];
    const service = new BarbeariaMediaService({
      getPorOwner: async () => ({ id: 'shop-1' }),
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
      getPorOwner: async () => ({ id: 'shop-1' }),
      uploadImagemBarbearia: async () => {},
      getBarbershopPublicUrl: (path) => path,
    });

    await assert.rejects(
      () => service.salvarImagemServico(OWNER_ID, Buffer.from('<svg></svg>'), 'image/svg+xml'),
      /Formato de imagem invalido/,
    );
  });

  it('processa logo em WebP 256x256 usando contain sem alterar cover', async () => {
    const uploads = [];
    const updates = [];
    const service = new BarbeariaMediaService({
      getPorOwner: async () => ({ id: 'shop-1' }),
      uploadImagemBarbearia: async (path, buffer, contentType) => uploads.push({ path, buffer, contentType }),
      updateImagem: async (shopId, campo, path) => updates.push({ shopId, campo, path }),
      getBarbershopPublicUrl: (path) => `https://cdn.test/${path}`,
    });

    const result = await service.salvarImagem(OWNER_ID, 'logo', await pngBuffer(), 'image/png');
    const meta = await sharp(uploads[0].buffer).metadata();

    assert.equal(result.path, 'shop-1/logo.webp');
    assert.equal(uploads[0].contentType, 'image/webp');
    assert.equal(meta.format, 'webp');
    assert.equal(meta.width, 256);
    assert.equal(meta.height, 256);
    assert.deepEqual(updates[0], { shopId: 'shop-1', campo: 'logo_path', path: 'shop-1/logo.webp' });
  });

  it('processa capa em WebP sem cortar e respeita teto desejado de 40KB', async () => {
    const uploads = [];
    const updates = [];
    const service = new BarbeariaMediaService({
      getPorOwner: async () => ({ id: 'shop-1' }),
      uploadImagemBarbearia: async (path, buffer, contentType) => uploads.push({ path, buffer, contentType }),
      updateImagem: async (shopId, campo, path) => updates.push({ shopId, campo, path }),
      getBarbershopPublicUrl: (path) => `https://cdn.test/${path}`,
    });

    const result = await service.salvarImagem(OWNER_ID, 'cover', await detailedCoverBuffer(), 'image/jpeg');
    const meta = await sharp(uploads[0].buffer).metadata();

    assert.equal(result.path, 'shop-1/cover.webp');
    assert.equal(uploads[0].contentType, 'image/webp');
    assert.equal(meta.format, 'webp');
    assert.equal(meta.width / meta.height, 1.6);
    assert.ok(meta.width <= 1280);
    assert.ok(uploads[0].buffer.length <= 40 * 1024);
    assert.deepEqual(updates[0], { shopId: 'shop-1', campo: 'cover_path', path: 'shop-1/cover.webp' });
  });

  it('remove logo antigo quando path salvo muda apos update confirmado', async () => {
    const events = [];
    const service = new BarbeariaMediaService({
      getPorOwner: async () => ({ id: 'shop-1', logo_path: 'legacy/logo.jpeg' }),
      uploadImagemBarbearia: async (path) => events.push(['upload', path]),
      updateImagem: async (_shopId, _campo, path) => events.push(['update', path]),
      removerImagemBarbearia: async (path) => events.push(['remove', path]),
      getBarbershopPublicUrl: (path) => `https://cdn.test/${path}`,
    });

    await service.salvarImagem(OWNER_ID, 'logo', await pngBuffer(), 'image/png');

    assert.deepEqual(events, [
      ['upload', 'shop-1/logo.webp'],
      ['update', 'shop-1/logo.webp'],
      ['remove', 'legacy/logo.jpeg'],
    ]);
  });

  it('remove capa antiga quando path salvo muda apos update confirmado', async () => {
    const events = [];
    const service = new BarbeariaMediaService({
      getPorOwner: async () => ({ id: 'shop-1', cover_path: 'legacy/cover.jpeg' }),
      uploadImagemBarbearia: async (path) => events.push(['upload', path]),
      updateImagem: async (_shopId, _campo, path) => events.push(['update', path]),
      removerImagemBarbearia: async (path) => events.push(['remove', path]),
      getBarbershopPublicUrl: (path) => `https://cdn.test/${path}`,
    });

    await service.salvarImagem(OWNER_ID, 'cover', await pngBuffer(), 'image/png');

    assert.deepEqual(events, [
      ['upload', 'shop-1/cover.webp'],
      ['update', 'shop-1/cover.webp'],
      ['remove', 'legacy/cover.jpeg'],
    ]);
  });

  it('nao remove logo quando path antigo e igual ao novo', async () => {
    const removidos = [];
    const service = new BarbeariaMediaService({
      getPorOwner: async () => ({ id: 'shop-1', logo_path: 'shop-1/logo.webp' }),
      uploadImagemBarbearia: async () => {},
      updateImagem: async () => {},
      removerImagemBarbearia: async (path) => removidos.push(path),
      getBarbershopPublicUrl: (path) => `https://cdn.test/${path}`,
    });

    await service.salvarImagem(OWNER_ID, 'logo', await pngBuffer(), 'image/png');

    assert.equal(removidos.length, 0);
  });

  it('nao bloqueia resposta quando delete antigo da barbearia falha', async () => {
    const service = new BarbeariaMediaService({
      getPorOwner: async () => ({ id: 'shop-1', logo_path: 'legacy/logo.jpeg' }),
      uploadImagemBarbearia: async () => {},
      updateImagem: async () => {},
      removerImagemBarbearia: async () => { throw new Error('storage indisponivel'); },
      getBarbershopPublicUrl: (path) => `https://cdn.test/${path}`,
    });

    const result = await service.salvarImagem(OWNER_ID, 'logo', await pngBuffer(), 'image/png');

    assert.equal(result.path, 'shop-1/logo.webp');
  });

  it('remove variantes antigas de logo e mantem apenas o logo atual', async () => {
    const calls = [];
    const service = new BarbeariaMediaService({
      getPorOwner: async () => ({ id: 'shop-1', logo_path: 'shop-1/logo.webp' }),
      uploadImagemBarbearia: async () => {},
      updateImagem: async () => {},
      removerImagemBarbearia: async (path) => calls.push(['remove-old', path]),
      removerVariantesImagemBarbearia: async (shopId, arquivoAtual) => calls.push(['remove-variants', shopId, arquivoAtual]),
      getBarbershopPublicUrl: (path) => `https://cdn.test/${path}`,
    });

    await service.salvarImagem(OWNER_ID, 'logo', await pngBuffer(), 'image/png');

    assert.deepEqual(calls, [['remove-variants', 'shop-1', 'logo.webp']]);
  });

  it('remove variantes antigas de capa e mantem apenas a capa atual', async () => {
    const calls = [];
    const service = new BarbeariaMediaService({
      getPorOwner: async () => ({ id: 'shop-1', cover_path: 'shop-1/cover.webp' }),
      uploadImagemBarbearia: async () => {},
      updateImagem: async () => {},
      removerImagemBarbearia: async (path) => calls.push(['remove-old', path]),
      removerVariantesImagemBarbearia: async (shopId, arquivoAtual) => calls.push(['remove-variants', shopId, arquivoAtual]),
      getBarbershopPublicUrl: (path) => `https://cdn.test/${path}`,
    });

    await service.salvarImagem(OWNER_ID, 'cover', await pngBuffer(), 'image/png');

    assert.deepEqual(calls, [['remove-variants', 'shop-1', 'cover.webp']]);
  });
});
