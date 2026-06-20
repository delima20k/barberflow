'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { carregar, fn, ROOT } = require('./_helpers.js');

function carregarAdapter(globals = {}) {
  const sandbox = vm.createContext(globals);
  carregar(sandbox, 'apps/profissional/assets/js/pages/MinhaBarbeariaPage/StorySection/StoryBrowserMediaAdapter.js');
  return sandbox.StoryBrowserMediaAdapter;
}

function criarAmbienteVideo({ duration }) {
  const revoked = [];
  let videoEl = null;
  const URL = {
    createObjectURL: () => 'blob:story-video',
    revokeObjectURL: (url) => revoked.push(url),
  };
  const document = {
    createElement: (tag) => {
      assert.equal(tag, 'video');
      videoEl = {
        duration,
        preload: '',
        src: '',
        removeAttribute: fn(),
        load: fn(),
        onloadedmetadata: null,
        onerror: null,
      };
      Promise.resolve().then(() => videoEl.onloadedmetadata?.());
      return videoEl;
    },
  };
  return { URL, document, revoked };
}

describe('StoryBrowserMediaAdapter', () => {
  it('deve publicar story usando MediaP2P injetado sem expor chamadas cruas ao runtime', async () => {
    const StoryBrowserMediaAdapter = carregarAdapter();
    const registrar = fn().mockResolvedValue('blob:story');
    const fazerUpload = fn().mockResolvedValue({ publicUrl: 'https://cdn.test/story.webp' });
    const adapter = new StoryBrowserMediaAdapter({
      mediaP2P: { registrar, fazerUpload },
    });

    const result = await adapter.upload({
      file: { type: 'image/webp' },
      uid: 'story-1',
      barbershopId: 'shop-1',
      expiresAt: '2026-05-24T00:00:00.000Z',
    });

    assert.equal(registrar.calls.length, 1);
    assert.equal(fazerUpload.calls[0][0], 'story-1');
    assert.equal(fazerUpload.calls[0][1], 'stories');
    assert.equal(fazerUpload.calls[0][2].barbershopId, 'shop-1');
    assert.equal(fazerUpload.calls[0][2].mediaType, 'image');
    assert.equal(fazerUpload.calls[0][2].expiresAt, '2026-05-24T00:00:00.000Z');
    assert.equal(result.publicUrl, 'https://cdn.test/story.webp');
    assert.equal(result.mediaType, 'image');
  });

  it('deve retornar null quando o usuario cancela a selecao no MediaP2P', async () => {
    const env = criarAmbienteVideo({ duration: 30 });
    const StoryBrowserMediaAdapter = carregarAdapter(env);
    const adapter = new StoryBrowserMediaAdapter({
      mediaP2P: {
        registrar: fn().mockResolvedValue(null),
        fazerUpload: fn(),
      },
    });

    const result = await adapter.upload({
      file: { type: 'video/mp4' },
      uid: 'story-2',
      barbershopId: 'shop-1',
      expiresAt: '2026-05-24T00:00:00.000Z',
    });

    assert.equal(result, null);
  });

  it('deve aceitar video de story com 30 segundos', async () => {
    const env = criarAmbienteVideo({ duration: 30 });
    const StoryBrowserMediaAdapter = carregarAdapter(env);
    const registrar = fn().mockResolvedValue('blob:story');
    const fazerUpload = fn().mockResolvedValue({ publicUrl: 'https://cdn.test/story.mp4' });
    const adapter = new StoryBrowserMediaAdapter({ mediaP2P: { registrar, fazerUpload } });

    const result = await adapter.upload({
      file: { type: 'video/mp4', size: 100 * 1024 * 1024 },
      uid: 'story-30',
      barbershopId: 'shop-1',
      expiresAt: '2026-05-24T00:00:00.000Z',
    });

    assert.equal(result.mediaType, 'video');
    assert.equal(registrar.calls.length, 1);
    assert.equal(fazerUpload.calls.length, 1);
    assert.deepEqual(env.revoked, ['blob:story-video']);
  });

  it('deve aceitar video de story com 35 segundos', async () => {
    const env = criarAmbienteVideo({ duration: 35 });
    const StoryBrowserMediaAdapter = carregarAdapter(env);
    const registrar = fn().mockResolvedValue('blob:story');
    const fazerUpload = fn().mockResolvedValue({ publicUrl: 'https://cdn.test/story.mp4' });
    const adapter = new StoryBrowserMediaAdapter({ mediaP2P: { registrar, fazerUpload } });

    await adapter.upload({
      file: { type: 'video/mp4', size: 128 * 1024 * 1024 },
      uid: 'story-35',
      barbershopId: 'shop-1',
      expiresAt: '2026-05-24T00:00:00.000Z',
    });

    assert.equal(registrar.calls.length, 1);
    assert.equal(fazerUpload.calls.length, 1);
  });

  it('deve bloquear video de story acima de 35 segundos sem registrar upload', async () => {
    const env = criarAmbienteVideo({ duration: 36 });
    const StoryBrowserMediaAdapter = carregarAdapter(env);
    const registrar = fn();
    const fazerUpload = fn();
    const adapter = new StoryBrowserMediaAdapter({ mediaP2P: { registrar, fazerUpload } });

    await assert.rejects(
      () => adapter.upload({
        file: { type: 'video/mp4', size: 1024 },
        uid: 'story-36',
        barbershopId: 'shop-1',
        expiresAt: '2026-05-24T00:00:00.000Z',
      }),
      /Este vídeo tem 36s\. O limite máximo para Stories é de 35 segundos\./,
    );

    assert.equal(registrar.calls.length, 0);
    assert.equal(fazerUpload.calls.length, 0);
    assert.deepEqual(env.revoked, ['blob:story-video']);
  });

  it('deve ser o adapter injetado no fluxo de Story do runtime', () => {
    const runtime = fs.readFileSync(
      path.join(ROOT, 'apps/profissional/assets/js/pages/MinhaBarbeariaPage/MinhaBarbeariaRuntimeController.js'),
      'utf8',
    );

    assert.match(runtime, /new StoryBrowserMediaAdapter/);
    assert.match(runtime, /mediaAdapter: this\.\#storyMediaAdapter/);
    assert.equal(runtime.includes("this.#mediaP2P.fazerUpload(uid, 'stories'"), false);
  });

  it('nao deve manter bloqueio de stories por tamanho em MB no runtime', () => {
    const runtime = fs.readFileSync(
      path.join(ROOT, 'apps/profissional/assets/js/pages/MinhaBarbeariaPage/MinhaBarbeariaRuntimeController.js'),
      'utf8',
    );

    assert.equal(runtime.includes('const MAX_BYTES = 30 * 1024 * 1024'), false);
    assert.equal(runtime.includes('O arquivo deve ter no mÃ¡ximo 30 MB.'), false);
  });
});
