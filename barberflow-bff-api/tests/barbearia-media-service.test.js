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

  it('og-card: converte WebP do cliente em JPEG comprimido (og-card.jpg)', async () => {
    const uploads = [];
    const service = new BarbeariaMediaService({
      getPorOwner: async () => ({ id: 'shop-1' }),
      uploadImagemBarbearia: async (path, buffer, contentType) => uploads.push({ path, buffer, contentType }),
      getBarbershopPublicUrl: (path) => `https://cdn.test/${path}`,
    });

    // O cliente comprime o canvas para WebP antes de subir (ImageCompressionService).
    const webp = await sharp({
      create: { width: 64, height: 64, channels: 3, background: { r: 0, g: 0, b: 0 } },
    }).webp().toBuffer();

    const result = await service.salvarOgCard(OWNER_ID, webp);
    const meta = await sharp(uploads[0].buffer).metadata();

    assert.equal(result.path, 'shop-1/og-card.jpg');
    assert.equal(uploads[0].contentType, 'image/jpeg');
    assert.equal(meta.format, 'jpeg'); // WhatsApp não renderiza WebP e ignora PNG grande
    assert.equal(meta.width, 1080);    // card guardado quadrado; banner 1200×630 é feito ao servir
    assert.equal(meta.height, 1080);
    assert.equal(result.publicUrl, 'https://cdn.test/shop-1/og-card.jpg');
  });

  it('og-card: permite barbeiro vinculado salvar card da barbearia ativa', async () => {
    const chamadas = [];
    const uploads = [];
    const service = new BarbeariaMediaService({
      getParaOgCard: async (userId, barbershopId) => {
        chamadas.push({ userId, barbershopId });
        return { id: 'linked-shop-1' };
      },
      uploadImagemBarbearia: async (path, buffer, contentType) => uploads.push({ path, buffer, contentType }),
      getBarbershopPublicUrl: (path) => `https://cdn.test/${path}`,
    });

    const webp = await sharp({
      create: { width: 64, height: 64, channels: 3, background: { r: 12, g: 12, b: 12 } },
    }).webp().toBuffer();

    const result = await service.salvarOgCard(OWNER_ID, webp, '11111111-1111-4111-8111-111111111111');

    assert.deepEqual(chamadas, [
      { userId: OWNER_ID, barbershopId: '11111111-1111-4111-8111-111111111111' },
    ]);
    assert.equal(result.path, 'linked-shop-1/og-card.jpg');
    assert.equal(uploads[0].contentType, 'image/jpeg');
  });

  it('og-card: reencoda PNG grande do cliente em JPEG (dentro do limite do WhatsApp)', async () => {
    const uploads = [];
    const service = new BarbeariaMediaService({
      getPorOwner: async () => ({ id: 'shop-1' }),
      uploadImagemBarbearia: async (path, buffer, contentType) => uploads.push({ path, buffer, contentType }),
      getBarbershopPublicUrl: (path) => `https://cdn.test/${path}`,
    });

    const png = await pngBuffer();
    const result = await service.salvarOgCard(OWNER_ID, png);
    const meta = await sharp(uploads[0].buffer).metadata();

    assert.equal(result.path, 'shop-1/og-card.jpg');
    assert.equal(uploads[0].contentType, 'image/jpeg');
    assert.equal(meta.format, 'jpeg');
    assert.equal(meta.width, 1080);
    assert.equal(meta.height, 1080);
  });

  it('og-card: rejeita formato fora de PNG/JPEG/WebP', async () => {
    const service = new BarbeariaMediaService({
      getPorOwner: async () => ({ id: 'shop-1' }),
      uploadImagemBarbearia: async () => {},
      getBarbershopPublicUrl: (path) => path,
    });

    await assert.rejects(
      () => service.salvarOgCard(OWNER_ID, Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05])),
      /Formato inv/,
    );
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

  it('processa logo em WebP 256x256 usando contain e preserva capa ativa', async () => {
    const uploads = [];
    const updates = [];
    const removidos = [];
    const service = new BarbeariaMediaService({
      getPorOwner: async () => ({ id: 'shop-1', cover_path: 'shop-1/cover.webp' }),
      uploadImagemBarbearia: async (path, buffer, contentType) => uploads.push({ path, buffer, contentType }),
      updateImagem: async (shopId, campo, path) => updates.push({ shopId, campo, path }),
      removerImagemBarbearia: async (path) => removidos.push(path),
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
    assert.equal(removidos.includes('shop-1/cover.webp'), false);
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

  it('processa capa e preserva logo ativo', async () => {
    const updates = [];
    const removidos = [];
    const variantes = [];
    const service = new BarbeariaMediaService({
      getPorOwner: async () => ({ id: 'shop-1', logo_path: 'shop-1/logo.png' }),
      uploadImagemBarbearia: async () => {},
      updateImagem: async (shopId, campo, path) => updates.push({ shopId, campo, path }),
      removerImagemBarbearia: async (path) => removidos.push(path),
      removerVariantesImagemBarbearia: async (shopId, arquivoAtual) => variantes.push({ shopId, arquivoAtual }),
      getBarbershopPublicUrl: (path) => `https://cdn.test/${path}`,
    });

    await service.salvarImagem(OWNER_ID, 'cover', await pngBuffer(), 'image/png');

    assert.deepEqual(updates[0], { shopId: 'shop-1', campo: 'cover_path', path: 'shop-1/cover.webp' });
    assert.equal(removidos.includes('shop-1/logo.png'), false);
    assert.deepEqual(variantes, [
      { shopId: 'shop-1', arquivoAtual: 'cover.webp' },
    ]);
  });

  it('substitui logo antigo preservando capa existente', async () => {
    const events = [];
    const service = new BarbeariaMediaService({
      getPorOwner: async () => ({ id: 'shop-1', logo_path: 'legacy/logo.jpeg', cover_path: 'shop-1/cover.webp' }),
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
    assert.equal(events.some(([op, path]) => op === 'remove' && path === 'shop-1/cover.webp'), false);
  });

  it('substitui capa antiga preservando logo existente', async () => {
    const events = [];
    const service = new BarbeariaMediaService({
      getPorOwner: async () => ({ id: 'shop-1', cover_path: 'legacy/cover.jpeg', logo_path: 'shop-1/logo.webp' }),
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
    assert.equal(events.some(([op, path]) => op === 'remove' && path === 'shop-1/logo.webp'), false);
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

  it('remove variantes antigas de logo sem remover variantes da capa', async () => {
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

    assert.deepEqual(calls, [
      ['remove-variants', 'shop-1', 'logo.webp'],
    ]);
  });

  it('remove variantes antigas de capa sem remover variantes do logo', async () => {
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

    assert.deepEqual(calls, [
      ['remove-variants', 'shop-1', 'cover.webp'],
    ]);
  });
});
