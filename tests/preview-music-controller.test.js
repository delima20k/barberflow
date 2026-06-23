'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PreviewMusicController } = require('../shared/js/PreviewMusicController');

const wait = (ms = 70) => new Promise(resolve => setTimeout(resolve, ms));

function deps() {
  const calls = [];
  const overlay = {
    element: { id: 'same-node' },
    render(text) { calls.push(text); return this.element; },
    destroy() { calls.push('destroy'); this.element = null; },
    reattach(container) { this.container = container; return this.element; },
  };
  const creditsService = {
    generate(metadata) {
      if (!metadata.artist || !metadata.title) return null;
      return `${metadata.artist} - ${metadata.title}`;
    },
  };
  return { overlay, creditsService, calls };
}

test('PreviewMusicController renderiza a ultima selecao depois do debounce', async () => {
  const { overlay, creditsService, calls } = deps();
  const ctrl = new PreviewMusicController({ overlay, creditsService });

  ctrl.selectMusic({ title: 'A', artist: 'One' });
  ctrl.selectMusic({ title: 'B', artist: 'Two' });
  await wait();

  assert.deepEqual(calls, ['Two - B']);
});

test('PreviewMusicController nao renderiza metadados incompletos', async () => {
  const { overlay, creditsService, calls } = deps();
  const ctrl = new PreviewMusicController({ overlay, creditsService });

  ctrl.selectMusic({ title: 'A' });
  await wait();

  assert.deepEqual(calls, ['destroy']);
});

test('PreviewMusicController reusa overlay em 100 trocas', async () => {
  const { overlay, creditsService } = deps();
  const ctrl = new PreviewMusicController({ overlay, creditsService });
  const node = overlay.element;

  for (let i = 0; i < 100; i += 1) {
    ctrl.selectMusic({ title: `Track ${i}`, artist: 'Artist' });
  }
  await wait();

  assert.equal(ctrl.overlayElement, node);
});
