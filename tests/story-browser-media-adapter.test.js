'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { carregar, fn, ROOT } = require('./_helpers.js');

function carregarAdapter() {
  const sandbox = vm.createContext({});
  carregar(sandbox, 'apps/profissional/assets/js/pages/MinhaBarbeariaPage/StorySection/StoryBrowserMediaAdapter.js');
  return sandbox.StoryBrowserMediaAdapter;
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
    const StoryBrowserMediaAdapter = carregarAdapter();
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

  it('deve ser o adapter injetado no fluxo de Story do runtime', () => {
    const runtime = fs.readFileSync(
      path.join(ROOT, 'apps/profissional/assets/js/pages/MinhaBarbeariaPage/MinhaBarbeariaRuntimeController.js'),
      'utf8',
    );

    assert.match(runtime, /new StoryBrowserMediaAdapter/);
    assert.match(runtime, /mediaAdapter: this\.\#storyMediaAdapter/);
    assert.equal(runtime.includes("this.#mediaP2P.fazerUpload(uid, 'stories'"), false);
  });
});
