'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

describe('PortfolioPrismViewer', () => {
  const js = fs.readFileSync(path.join(ROOT, 'shared/js/PortfolioPrismViewer.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'shared/css/components.css'), 'utf8');

  test('exibe avatar, nome e curtidas no topo esquerdo em tela cheia', () => {
    assert.match(js, /pp-prism-meta/);
    assert.match(js, /pp-prism-avatar/);
    assert.match(js, /pp-prism-name/);
    assert.match(js, /pp-prism-likes/);
    assert.match(js, /#renderMeta/);
    assert.match(js, /professionalName/);
    assert.match(js, /professionalAvatarUrl/);
    assert.match(js, /likesCount/);
    assert.match(css, /\.pp-prism-meta\s*\{[\s\S]*top:\s*14px/);
    assert.match(css, /\.pp-prism-meta\s*\{[\s\S]*left:\s*14px/);
  });
});
