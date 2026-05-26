'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

describe('PortfolioViewerModal', () => {
  test('mantem viewer reutilizavel sem botoes de navegacao e com swipe 3D', () => {
    const js = fs.readFileSync(path.join(ROOT, 'shared/js/PortfolioViewerModal.js'), 'utf8');
    const css = fs.readFileSync(path.join(ROOT, 'shared/css/components.css'), 'utf8');

    assert.doesNotMatch(js, /portfolio-viewer__nav/);
    assert.match(js, /portfolio-viewer__cube/);
    assert.match(js, /portfolio-viewer__face/);
    assert.match(js, /pointerdown/);
    assert.match(js, /pointerup/);
    assert.match(js, /#renderFaces/);
    assert.match(css, /portfolio-viewer__cube/);
    assert.match(css, /portfolio-spin-next/);
    assert.match(css, /portfolio-spin-prev/);
    assert.match(css, /portfolio-viewer__actions/);
    assert.match(css, /top:\s*18px/);
    assert.match(css, /right:\s*72px/);
  });
});
