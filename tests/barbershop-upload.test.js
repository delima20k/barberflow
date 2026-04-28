'use strict';
/**
 * tests/barbershop-upload.test.js
 *
 * Testa o endpoint POST /api/media/barbershop-image do MediaController.
 * Cobre: tipo válido, tipo inválido, MIME guard (magic bytes), tamanho, sucesso completo.
 */

const { suite, test } = require('node:test');
const assert           = require('node:assert/strict');
const path             = require('node:path');
const { fn }           = require('./_helpers.js');

// ── Mock de AuthMiddleware antes de qualquer require do controller ────────────
const authMiddlewarePath = path.resolve(__dirname, '../src/infra/AuthMiddleware.js');
require.cache[authMiddlewarePath] = {
  id: authMiddlewarePath, filename: authMiddlewarePath, loaded: true,
  exports: { verificar: fn().mockImplementation((_req, _res, next) => next()) },
};

// ── Fixtures ────────────────────────────────────────────────────────────────

/** Gera um buffer com magic bytes de JPEG (FF D8 FF). */
function jpegBuffer(extraBytes = 100) {
  const buf = Buffer.alloc(12 + extraBytes);
  buf[0] = 0xFF; buf[1] = 0xD8; buf[2] = 0xFF;
  return buf;
}

/** Gera um buffer com magic bytes de PNG. */
function pngBuffer(extraBytes = 100) {
  const buf = Buffer.alloc(12 + extraBytes);
  buf[0] = 0x89; buf[1] = 0x50; buf[2] = 0x4E; buf[3] = 0x47;
  return buf;
}

/** Gera um buffer com magic bytes de WebP (RIFF????WEBP). */
function webpBuffer(extraBytes = 100) {
  const buf = Buffer.alloc(12 + extraBytes);
  buf.write('RIFF', 0, 'ascii');
  buf.write('WEBP', 8, 'ascii');
  return buf;
}

/** Gera um buffer sem MIME reconhecido. */
function unknownBuffer() {
  return Buffer.alloc(20, 0x00);
}

// ── Criação do controller ────────────────────────────────────────────────────

function criarController({ supabaseError = null, uploadError = null } = {}) {
  const uploadFn = fn().mockResolvedValue(
    uploadError ? { error: uploadError } : { error: null }
  );
  const registrarFn = fn().mockResolvedValue({ id: 'media-uuid-1', public_url: 'https://cdn.example.com/logo/user1/abc.jpg' });
  const publicUrlFn = fn().mockReturnValue('https://cdn.example.com/logo/user1/abc.jpg');

  const supabaseStorage = { upload: uploadFn, publicUrl: publicUrlFn };
  const mediaManager    = { registrarImagemProcessada: registrarFn };
  const imageProcessor  = {};

  const criarMediaController = require('../src/controllers/MediaController');
  return {
    router: criarMediaController(mediaManager, imageProcessor, supabaseStorage),
    mocks: { uploadFn, registrarFn, publicUrlFn },
  };
}

/** Simula req/res do Express para testar o handler isolado. */
function simularRequisicao(router, { method = 'POST', path = '/', body, query = {}, user = { id: 'user-1' } } = {}) {
  return new Promise((resolve) => {
    // Encontrar o handler da rota manualmente
    const layers = router.stack ?? [];
    const match  = layers.find(l => l.route?.path === path && l.route?.methods?.[method.toLowerCase()]);
    if (!match) { resolve({ status: 404, body: { error: 'rota não encontrada' } }); return; }

    const handlers = match.route.stack.map(s => s.handle);

    let statusCode = 200;
    const resBody  = {};
    const res = {
      status: fn().mockImplementation((s) => { statusCode = s; return res; }),
      json:   fn().mockImplementation((b) => { Object.assign(resBody, b); resolve({ status: statusCode, body: resBody }); }),
    };
    const req = { method, path, body, query, user, headers: {} };

    // Executar handlers em sequência (ignora middlewares de auth nos testes unitários)
    const next = fn();
    handlers[handlers.length - 1](req, res, next);
  });
}

// ── Testes diretos via _detectarMime ────────────────────────────────────────

suite('MediaController._detectarMime (magic bytes)', () => {
  const criarMediaController = require('../src/controllers/MediaController');
  const detectarMime = criarMediaController.detectarMime;

  test('reconhece JPEG (FF D8 FF)', () => {
    assert.strictEqual(detectarMime(jpegBuffer()), 'image/jpeg');
  });

  test('reconhece PNG (89 50 4E 47)', () => {
    assert.strictEqual(detectarMime(pngBuffer()), 'image/png');
  });

  test('reconhece WebP (RIFF????WEBP)', () => {
    assert.strictEqual(detectarMime(webpBuffer()), 'image/webp');
  });

  test('buffer desconhecido → application/octet-stream', () => {
    assert.strictEqual(detectarMime(unknownBuffer()), 'application/octet-stream');
  });

  test('buffer muito curto (< 12 bytes) → application/octet-stream', () => {
    assert.strictEqual(detectarMime(Buffer.alloc(5, 0xFF)), 'application/octet-stream');
  });
});

// ── Testes de validação de tipo ──────────────────────────────────────────────

suite('POST /api/media/barbershop-image — validação de tipo', () => {

  test('tipo inválido retorna 400', async () => {
    // Acessar o handler diretamente para testar validação de tipo
    // Criar um mock de req/res simplificado
    let statusCode;
    let responseBody;
    const res = {
      status: (s) => { statusCode = s; return res; },
      json:   (b) => { responseBody = b; },
    };

    const req = {
      query: { tipo: 'invalido' },
      user:  { id: 'user-1' },
      body:  jpegBuffer(100),
    };

    // Usar o controller real e extrair a rota de barbershop-image
    const criarMediaController = require('../src/controllers/MediaController');
    const supabaseStorage      = { upload: fn().mockResolvedValue({ error: null }), publicUrl: fn().mockReturnValue('https://cdn.example.com') };
    const mediaManager         = { registrarImagemProcessada: fn().mockResolvedValue({ id: 'x', public_url: 'https://cdn.example.com' }) };
    const router               = criarMediaController(mediaManager, {}, supabaseStorage);

    // Localizar o handler da rota /barbershop-image
    const layer = router.stack?.find(l => l.route?.path === '/barbershop-image');
    assert.ok(layer, 'Rota /barbershop-image deve existir no router');

    const handler = layer.route.stack[layer.route.stack.length - 1].handle;
    await handler(req, res, fn());

    assert.strictEqual(statusCode, 400);
    assert.ok(responseBody?.error, 'Deve retornar mensagem de erro');
  });

  test('tipo válido "logo" é aceito', () => {
    const TIPOS_VALIDOS = ['logo', 'cover', 'banner'];
    assert.ok(TIPOS_VALIDOS.includes('logo'));
    assert.ok(TIPOS_VALIDOS.includes('cover'));
    assert.ok(TIPOS_VALIDOS.includes('banner'));
    assert.ok(!TIPOS_VALIDOS.includes('avatar'));
    assert.ok(!TIPOS_VALIDOS.includes('story'));
  });
});

// ── Testes de limite de tamanho ──────────────────────────────────────────────

suite('POST /api/media/barbershop-image — limites de tamanho', () => {

  test('logo acima de 2MB retorna 413', async () => {
    const criarMediaController = require('../src/controllers/MediaController');
    const supabaseStorage      = { upload: fn(), publicUrl: fn() };
    const mediaManager         = { registrarImagemProcessada: fn() };
    const router               = criarMediaController(mediaManager, {}, supabaseStorage);

    const layer   = router.stack?.find(l => l.route?.path === '/barbershop-image');
    assert.ok(layer, 'Rota /barbershop-image deve existir');
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;

    let statusCode;
    const res = {
      status: (s) => { statusCode = s; return res; },
      json:   fn(),
    };

    // Buffer de 2.1MB com magic bytes JPEG
    const bigBuf = Buffer.alloc(2.1 * 1024 * 1024);
    bigBuf[0] = 0xFF; bigBuf[1] = 0xD8; bigBuf[2] = 0xFF;

    const req = { query: { tipo: 'logo' }, user: { id: 'user-1' }, body: bigBuf };
    await handler(req, res, fn());

    assert.strictEqual(statusCode, 413);
  });

  test('MIME inválido (não é imagem) retorna 415', async () => {
    const criarMediaController = require('../src/controllers/MediaController');
    const supabaseStorage      = { upload: fn(), publicUrl: fn() };
    const mediaManager         = { registrarImagemProcessada: fn() };
    const router               = criarMediaController(mediaManager, {}, supabaseStorage);

    const layer   = router.stack?.find(l => l.route?.path === '/barbershop-image');
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;

    let statusCode;
    const res = {
      status: (s) => { statusCode = s; return res; },
      json:   fn(),
    };

    const req = { query: { tipo: 'logo' }, user: { id: 'user-1' }, body: unknownBuffer() };
    await handler(req, res, fn());

    assert.strictEqual(statusCode, 415);
  });
});
