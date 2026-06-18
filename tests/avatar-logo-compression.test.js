'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

class TestFile extends Blob {
  constructor(parts, name, opts = {}) {
    super(parts, opts);
    this.name = name;
    this.lastModified = opts.lastModified ?? Date.now();
  }
}

function criarCanvasFactory({ webp = true, qualities = [] } = {}) {
  return () => ({
    width: 1,
    height: 1,
    getContext: () => ({
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
      drawImage: fn(),
    }),
    toDataURL: (mime) => webp && mime === 'image/webp' ? 'data:image/webp;base64,x' : 'data:image/png;base64,x',
    toBlob: (cb, mime, quality = 0.82) => {
      qualities.push(quality);
      const bytes = Math.max(1, Math.ceil(this?.width ?? 1));
      cb(new Blob([new Uint8Array(bytes)], { type: mime }));
    },
  });
}

function criarSandboxCompressao({ webp = true, bitmap = { width: 1200, height: 800 } } = {}) {
  const qualities = [];
  const sb = vm.createContext({
    Blob,
    Uint8Array,
    Promise,
    Error,
    TypeError,
    FileReader: class {
      readAsDataURL() {
        this.result = 'data:image/webp;base64,x';
        this.onload?.();
      }
    },
    document: {
      createElement: criarCanvasFactory({ webp, qualities }),
    },
    createImageBitmap: fn(async () => ({ ...bitmap, close: fn() })),
  });
  carregar(sb, 'shared/js/ImageCompressionService.js');
  return { sb, qualities };
}

describe('ImageCompressionService presets de avatar/logo', () => {
  test('mantem presets legados e adiciona AVATAR/LOGO com regras especificas', () => {
    const { sb } = criarSandboxCompressao();

    assert.equal(sb.ImageCompressionService.PRESETS.THUMB.name, 'thumb');
    assert.equal(sb.ImageCompressionService.PRESETS.THUMB.maxWidth, 300);
    assert.equal(sb.ImageCompressionService.PRESETS.THUMB.quality, 0.62);
    assert.equal(sb.ImageCompressionService.PRESETS.MEDIUM.name, 'medium');
    assert.equal(sb.ImageCompressionService.PRESETS.MEDIUM.maxWidth, 900);
    assert.equal(sb.ImageCompressionService.PRESETS.MEDIUM.quality, 0.76);
    assert.equal(sb.ImageCompressionService.PRESETS.FULL.name, 'full');
    assert.equal(sb.ImageCompressionService.PRESETS.FULL.maxWidth, 1600);
    assert.equal(sb.ImageCompressionService.PRESETS.FULL.quality, 0.82);
    assert.equal(sb.ImageCompressionService.PRESETS.AVATAR.fit, 'cover');
    assert.equal(sb.ImageCompressionService.PRESETS.LOGO.fit, 'contain');
  });

  test('usa JPEG quando WebP nao e suportado pela plataforma', async () => {
    const { sb } = criarSandboxCompressao({ webp: false });

    const result = await sb.ImageCompressionService.compress(
      new TestFile([new Uint8Array(4096)], 'foto.png', { type: 'image/png' }),
      { preset: 'AVATAR', contentType: 'image/png' },
    );

    assert.equal(result.contentType, 'image/jpeg');
    assert.equal(result.width, 160);
    assert.equal(result.height, 160);
  });
});

describe('AvatarService fallback comprimido', () => {
  test('envia compressedFile no fallback e nunca o arquivo original', async () => {
    const original = new TestFile([new Uint8Array(4096)], 'original.jpg', { type: 'image/jpeg' });
    const compressed = new TestFile([new Uint8Array(512)], 'avatar.webp', { type: 'image/webp' });
    const fallbackCalls = [];
    const bffCalls = [];
    const sb = vm.createContext({
      Blob,
      File: TestFile,
      Error,
      Promise,
      Date,
      console,
      document: {
        getElementById: fn(() => null),
        querySelectorAll: fn(() => []),
      },
      URL: {
        createObjectURL: fn(() => 'blob:preview'),
        revokeObjectURL: fn(),
      },
      UserService: { getUser: fn(() => ({ id: 'user-1' })) },
      ImageCompressionService: {
        compress: fn(async () => ({ blob: compressed, buffer: await compressed.arrayBuffer(), contentType: 'image/webp' })),
      },
      BackendApiService: {
        uploadBinario: fn(async (_path, _buffer, opts) => {
          bffCalls.push(opts);
          return { ok: false, status: 404, json: async () => ({ error: 'not found' }) };
        }),
      },
      ProfileRepository: {
        updateAvatar: fn(async (_userId, file) => {
          fallbackCalls.push(file);
          return 'https://cdn/avatar.webp';
        }),
        update: fn(async () => {}),
      },
      LoggerService: { warn: fn() },
    });
    carregar(sb, 'shared/js/AvatarService.js');

    sb.AvatarService.preview({ files: [original] });
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.notEqual(fallbackCalls[0], original);
    assert.equal(fallbackCalls[0].name, 'avatar.webp');
    assert.equal(fallbackCalls[0].type, 'image/webp');
    assert.equal(fallbackCalls[0].size, compressed.size);
    assert.equal(bffCalls[0].skipCompression, true);
  });
});
