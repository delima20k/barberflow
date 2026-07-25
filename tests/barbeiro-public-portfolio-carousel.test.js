'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

describe('Portifolio publico do barbeiro', () => {
  it('mantem os trabalhos em uma unica faixa horizontal navegavel', () => {
    const css = fs.readFileSync(path.join(ROOT, 'shared/css/components.css'), 'utf8');
    const carousel = css.slice(
      css.indexOf('.portfolio-gallery__carousel {'),
      css.indexOf('.port-item {'),
    );

    assert.match(carousel, /display:\s*flex/);
    assert.match(carousel, /flex-flow:\s*row nowrap/);
    assert.match(carousel, /overflow-x:\s*auto/);
    assert.match(carousel, /overflow-y:\s*hidden/);
    assert.match(carousel, /scroll-snap-type:\s*x mandatory/);
  });
});
