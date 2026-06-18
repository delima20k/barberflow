'use strict';

/**
 * tests/video-thumbnail-capture.test.js
 *
 * TDD — VideoThumbnailCapture.capturar()
 * Verifica extração de thumbnail via Canvas API no ambiente de browser simulado.
 */

const { test, suite } = require('node:test');
const assert           = require('node:assert/strict');
const fs               = require('node:fs');
const path             = require('node:path');

const src = fs.readFileSync(
  path.resolve(__dirname, '../shared/js/VideoThumbnailCapture.js'),
  'utf8',
);

// ── Análise estática ────────────────────────────────────────────────────────

suite('VideoThumbnailCapture — análise estática', () => {

  test('define classe VideoThumbnailCapture com campos privados', () => {
    assert.match(src, /class VideoThumbnailCapture/);
  });

  test('expõe método estático capturar', () => {
    assert.match(src, /static async capturar/);
  });

  test('revoga ObjectURL após uso (sem vazamento de memória)', () => {
    assert.match(src, /URL\.revokeObjectURL/);
  });

  test('usa Canvas API para extração do frame', () => {
    assert.match(src, /canvas/i);
    assert.match(src, /drawImage/);
  });

  test('usa toBlob para gerar JPEG', () => {
    assert.match(src, /toBlob|toDataURL/);
  });

  test('retorna null em caso de erro (não lança)', () => {
    assert.match(src, /catch/);
    assert.match(src, /return null/);
  });
});

// ── Testes funcionais com stubs de DOM ──────────────────────────────────────

suite('VideoThumbnailCapture.capturar() — comportamento', () => {

  /** Constrói a classe com globals simulados e retorna instância pronta */
  function buildClass({ onSeek = null, toBlob = null, revokeObjectURL = null } = {}) {
    let objectURLRevogado = false;

    const URL = {
      createObjectURL: () => 'blob:mock-url',
      revokeObjectURL: (url) => {
        objectURLRevogado = true;
        if (revokeObjectURL) revokeObjectURL(url);
      },
    };

    let videoEl = null;
    const document = {
      createElement: (tag) => {
        if (tag === 'video') {
          videoEl = {
            _tag: 'video',
            src: '',
            currentTime: 0,
            videoWidth: 320,
            videoHeight: 568,
            onloadedmetadata: null,
            onseeked: null,
            onerror: null,
            addEventListener: function(ev, fn) { this[`on${ev}`] = fn; },
          };
          // Dispara loadedmetadata automaticamente no próximo tick
          Promise.resolve().then(() => {
            if (videoEl.onloadedmetadata) videoEl.onloadedmetadata();
            // Dispara onseeked após seek, também no próximo tick
            Promise.resolve().then(() => {
              if (onSeek) onSeek(videoEl);
              if (videoEl.onseeked) videoEl.onseeked();
            });
          });
          return videoEl;
        }
        if (tag === 'canvas') {
          return {
            _tag: 'canvas',
            width: 0,
            height: 0,
            getContext: () => ({
              drawImage: () => {},
            }),
            toBlob: toBlob ?? ((cb, mime, qual) => {
              cb(new Uint8Array([0xff, 0xd8, 0xff]).buffer); // JPEG mínimo
            }),
            toDataURL: () => 'data:image/jpeg;base64,/9j/mock',
          };
        }
        return {};
      },
    };

    const fn = new Function('URL', 'document', `${src}\nreturn VideoThumbnailCapture;`);
    return { VideoThumbnailCapture: fn(URL, document), getObjectURLRevogado: () => objectURLRevogado };
  }

  test('retorna Blob quando extração é bem-sucedida', async () => {
    let blobRecebido = null;
    const { VideoThumbnailCapture } = buildClass({
      toBlob: (cb) => {
        const blob = { type: 'image/jpeg', size: 100 };
        blobRecebido = blob;
        cb(blob);
      },
    });

    const fakeFile = { type: 'video/mp4', size: 1 };
    const result = await VideoThumbnailCapture.capturar(fakeFile, 500);

    assert.ok(result !== null, 'deve retornar o blob gerado');
    assert.ok(blobRecebido !== null);
  });

  test('revoga ObjectURL após extração bem-sucedida', async () => {
    const { VideoThumbnailCapture, getObjectURLRevogado } = buildClass({
      toBlob: (cb) => cb({ type: 'image/jpeg', size: 100 }),
    });

    await VideoThumbnailCapture.capturar({ type: 'video/mp4', size: 1 }, 500);
    assert.ok(getObjectURLRevogado(), 'URL.revokeObjectURL deve ser chamado');
  });

  test('retorna null quando toBlob falha', async () => {
    const { VideoThumbnailCapture } = buildClass({
      toBlob: (cb) => cb(null), // simula falha
    });

    const result = await VideoThumbnailCapture.capturar(new Uint8Array([0x00]).buffer, 500);
    assert.strictEqual(result, null);
  });

  test('retorna null quando arquivo é null', async () => {
    const fn = new Function(
      'URL', 'document',
      `${src}\nreturn VideoThumbnailCapture;`,
    );
    const VC = fn(
      { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
      { createElement: () => ({ addEventListener: () => {} }) },
    );

    const result = await VC.capturar(null);
    assert.strictEqual(result, null);
  });
});
