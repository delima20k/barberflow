'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');

const { StoryMediaCompressor } = require('../../../../infrastructure/media/StoryMediaCompressor');

const MB = 1024 * 1024;

// Gera um PNG grande e ruidoso (pior caso de compressão) a partir de raw RGB.
async function pngRuidoso(w, h) {
  const raw = Buffer.allocUnsafe(w * h * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (Math.random() * 256) | 0;
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

test('compressImage: gera WebP, cabe em ≤2MB e reduz o tamanho', async () => {
  const png = await pngRuidoso(1400, 1750); // PNG ruidoso ~7MB
  const c = new StoryMediaCompressor({ logger: { warn() {} } });

  const r = await c.compressImage(png, { targetBytes: 2 * MB, maxLado: 1080 });

  assert.equal(r.contentType, 'image/webp', 'saída em WebP');
  assert.ok(r.bytes <= 2 * MB, `bytes ${r.bytes} deve caber em 2MB`);
  assert.equal(r.ok, true, 'ok=true quando cabe no alvo');
  assert.ok(r.bytes < r.originalBytes, 'reduziu o tamanho');
});

test('compressImage: maxLado menor produz arquivo menor (resolução reduz tamanho)', async () => {
  const png = await pngRuidoso(1400, 1750);
  const c = new StoryMediaCompressor({ logger: { warn() {} } });

  const grande = await c.compressImage(png, { targetBytes: 2 * MB, maxLado: 1080 });
  const pequeno = await c.compressImage(png, { targetBytes: 2 * MB, maxLado: 480 });

  assert.ok(pequeno.bytes < grande.bytes, 'maxLado 480 < 1080 em bytes');
  assert.ok(pequeno.bytes <= 2 * MB);
});

test('compressImage: rejeita buffer vazio', async () => {
  const c = new StoryMediaCompressor({ logger: { warn() {} } });
  await assert.rejects(() => c.compressImage(Buffer.alloc(0)), /Buffer nao vazio/);
});

// Vídeo: validado via CLI (--dry-run --sample) por ser pesado/lento p/ CI.
