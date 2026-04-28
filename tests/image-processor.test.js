'use strict';

// =============================================================
// image-processor.test.js — Testes de ImageProcessor
//
// Cobre: processAvatar() e processIcon() com imagens sintéticas
// geradas via sharp.create (sem fixtures externas em disco).
//
// Executar: node --test tests/image-processor.test.js
// =============================================================

const { describe, it, before } = require('node:test');
const assert                   = require('node:assert/strict');
const sharp                    = require('sharp');

const ImageProcessor = require('../src/services/ImageProcessor');

// ── Constante de limite ────────────────────────────────────────
const MAX_BYTES = 20_480; // 20 KB

// ── Helper: cria buffer PNG sintético ─────────────────────────

/**
 * Gera um buffer PNG com cor sólida para testes.
 * Não requer arquivos em disco — gerado em memória.
 *
 * @param {number} w
 * @param {number} h
 * @param {{ r: number, g: number, b: number }} [cor]
 * @returns {Promise<Buffer>}
 */
async function criarImagemTeste(w, h, cor = { r: 200, g: 100, b: 50 }) {
  return sharp({
    create: { width: w, height: h, channels: 3, background: cor },
  })
    .png()
    .toBuffer();
}

/**
 * Gera um buffer JPEG com gradiente horizontal sintético.
 * Útil para testar qualidade de compressão em imagens complexas.
 *
 * @param {number} w
 * @param {number} h
 * @returns {Promise<Buffer>}
 */
async function criarImagemGradiente(w, h) {
  // Cria buffer raw com gradiente horizontal
  const pixels = Buffer.allocUnsafe(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 3;
      pixels[idx]     = Math.floor((x / w) * 255);  // R
      pixels[idx + 1] = Math.floor((y / h) * 255);  // G
      pixels[idx + 2] = 128;                          // B
    }
  }
  return sharp(pixels, { raw: { width: w, height: h, channels: 3 } })
    .png()
    .toBuffer();
}

// ── Instância compartilhada ────────────────────────────────────
let proc;

before(() => {
  proc = new ImageProcessor();
});

// ═══════════════════════════════════════════════════════════════
// Suite 1: processAvatar()
// ═══════════════════════════════════════════════════════════════

describe('ImageProcessor.processAvatar()', () => {

  it('retorna objeto { data: Buffer, format: "webp", bytes: number }', async () => {
    const input  = await criarImagemTeste(400, 400);
    const result = await proc.processAvatar(input);

    assert.ok(Buffer.isBuffer(result.data),   'data deve ser Buffer');
    assert.strictEqual(result.format, 'webp', 'format deve ser "webp"');
    assert.ok(typeof result.bytes === 'number' && result.bytes > 0, 'bytes deve ser number > 0');
  });

  it('imagem quadrada 400x400 → dimensões de saída ≤ 200×200', async () => {
    const input  = await criarImagemTeste(400, 400);
    const result = await proc.processAvatar(input);

    const meta = await sharp(result.data).metadata();
    assert.ok(meta.width  <= 200, `largura ${meta.width} deve ser ≤ 200`);
    assert.ok(meta.height <= 200, `altura ${meta.height} deve ser ≤ 200`);
    assert.strictEqual(meta.width, meta.height, 'imagem de saída deve ser quadrada');
  });

  it('imagem landscape 600×400 → crop 1:1 central + redimensionamento ≤200px', async () => {
    const input  = await criarImagemTeste(600, 400);
    const result = await proc.processAvatar(input);

    const meta = await sharp(result.data).metadata();
    assert.ok(meta.width  <= 200, `largura ${meta.width} deve ser ≤ 200`);
    assert.ok(meta.height <= 200, `altura ${meta.height} deve ser ≤ 200`);
    assert.strictEqual(meta.width, meta.height, 'imagem de saída deve ser quadrada (crop 1:1)');
  });

  it('imagem portrait 400×600 → crop 1:1 central + redimensionamento ≤200px', async () => {
    const input  = await criarImagemTeste(400, 600);
    const result = await proc.processAvatar(input);

    const meta = await sharp(result.data).metadata();
    assert.ok(meta.width  <= 200, `largura ${meta.width} deve ser ≤ 200`);
    assert.ok(meta.height <= 200, `altura ${meta.height} deve ser ≤ 200`);
    assert.strictEqual(meta.width, meta.height, 'imagem de saída deve ser quadrada');
  });

  it('saída ≤ 20KB independente do tamanho da entrada', async () => {
    const input  = await criarImagemGradiente(1200, 800);
    const result = await proc.processAvatar(input);

    assert.ok(result.bytes <= MAX_BYTES,
      `tamanho ${result.bytes} bytes excede limite de ${MAX_BYTES} bytes (20KB)`);
  });

  it('formato de saída padrão é WebP', async () => {
    const input  = await criarImagemTeste(300, 300);
    const result = await proc.processAvatar(input);

    const meta = await sharp(result.data).metadata();
    assert.strictEqual(meta.format, 'webp', 'formato detectado pelo sharp deve ser webp');
    assert.strictEqual(result.format, 'webp');
  });

  it('EXIF removido — metadados de saída não contêm campos EXIF', async () => {
    const input  = await criarImagemTeste(400, 400);
    const result = await proc.processAvatar(input);

    const meta = await sharp(result.data).metadata();

    // sharp retorna `exif` como Buffer se presente, ou undefined se removido
    assert.ok(meta.exif == null, 'exif deve estar ausente/null na saída');
    assert.ok(meta.icc  == null, 'perfil ICC deve estar ausente na saída');
    assert.ok(meta.xmp  == null, 'XMP deve estar ausente na saída');
  });

  it('input não-Buffer → lança Error{ status: 400 }', async () => {
    await assert.rejects(
      () => proc.processAvatar('não-é-buffer'),
      (err) => {
        assert.strictEqual(err.status, 400, 'status deve ser 400');
        return true;
      }
    );
  });

  it('input null → lança Error{ status: 400 }', async () => {
    await assert.rejects(
      () => proc.processAvatar(null),
      (err) => { assert.strictEqual(err.status, 400); return true; }
    );
  });

});

// ═══════════════════════════════════════════════════════════════
// Suite 2: processIcon()
// ═══════════════════════════════════════════════════════════════

describe('ImageProcessor.processIcon()', () => {

  it('retorna objeto { data: Buffer, format: "webp", bytes: number }', async () => {
    const input  = await criarImagemTeste(256, 256);
    const result = await proc.processIcon(input);

    assert.ok(Buffer.isBuffer(result.data));
    assert.strictEqual(result.format, 'webp');
    assert.ok(typeof result.bytes === 'number' && result.bytes > 0);
  });

  it('saída ≤ 200×200 e quadrada', async () => {
    const input  = await criarImagemTeste(512, 256);
    const result = await proc.processIcon(input);

    const meta = await sharp(result.data).metadata();
    assert.ok(meta.width  <= 200);
    assert.ok(meta.height <= 200);
    assert.strictEqual(meta.width, meta.height);
  });

  it('saída ≤ 20KB', async () => {
    const input  = await criarImagemGradiente(800, 800);
    const result = await proc.processIcon(input);

    assert.ok(result.bytes <= MAX_BYTES,
      `${result.bytes} bytes excede 20KB`);
  });

  it('EXIF removido da saída', async () => {
    const input  = await criarImagemTeste(300, 300);
    const result = await proc.processIcon(input);

    const meta = await sharp(result.data).metadata();
    assert.ok(meta.exif == null, 'exif deve estar ausente');
  });

  it('input não-Buffer → lança Error{ status: 400 }', async () => {
    await assert.rejects(
      () => proc.processIcon(42),
      (err) => { assert.strictEqual(err.status, 400); return true; }
    );
  });

});

// ═══════════════════════════════════════════════════════════════
// Suite 3: consistência entre processAvatar e processIcon
// ═══════════════════════════════════════════════════════════════

describe('ImageProcessor — consistência de pipeline', () => {

  it('mesma imagem processada por avatar e icon produz resultados equivalentes', async () => {
    const input   = await criarImagemTeste(400, 400);
    const avatar  = await proc.processAvatar(input);
    const icon    = await proc.processIcon(input);

    // Ambos devem ser quadrados, ≤200px, WebP, ≤20KB
    const metaA = await sharp(avatar.data).metadata();
    const metaI = await sharp(icon.data).metadata();

    assert.strictEqual(metaA.width,  metaI.width);
    assert.strictEqual(metaA.height, metaI.height);
    assert.strictEqual(avatar.format, icon.format);
    assert.ok(avatar.bytes <= MAX_BYTES);
    assert.ok(icon.bytes   <= MAX_BYTES);
  });

  it('imagem mínima (1×1) → não lança erro, retorna WebP ≤20KB', async () => {
    const input  = await criarImagemTeste(1, 1);
    const result = await proc.processAvatar(input);

    assert.ok(Buffer.isBuffer(result.data));
    assert.ok(result.bytes <= MAX_BYTES);
  });

});
