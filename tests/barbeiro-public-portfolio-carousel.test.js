'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

describe('Portifolio publico do barbeiro', () => {
  it('mantem os trabalhos em uma unica faixa horizontal navegavel', () => {
    const css = fs.readFileSync(path.join(ROOT, 'shared/css/components.css'), 'utf8');
    const appCss = fs.readFileSync(path.join(ROOT, 'apps/profissional/assets/css/styles.css'), 'utf8');
    const carousel = css.slice(
      css.indexOf('.portfolio-grid.portfolio-gallery__carousel {'),
      css.indexOf('.port-item {'),
    );

    assert.ok(carousel.length > 0, 'o seletor do carrossel deve vencer .portfolio-grid do app profissional');
    assert.match(appCss, /\.portfolio-grid\s*\{[\s\S]*?display:\s*grid/);
    assert.match(carousel, /display:\s*flex/);
    assert.match(carousel, /flex-flow:\s*row nowrap/);
    assert.match(carousel, /overflow-x:\s*auto/);
    assert.match(carousel, /overflow-y:\s*hidden/);
    assert.match(carousel, /scroll-snap-type:\s*x mandatory/);
  });

  it('renderiza os trabalhos antes da hidratacao opcional das curtidas', () => {
    const source = fs.readFileSync(path.join(ROOT, 'shared/js/PortfolioGallery.js'), 'utf8');
    const start = source.indexOf('async load(professionalId)');
    const end = source.indexOf('reset()', start);
    const load = source.slice(start, end);

    assert.ok(load.indexOf('this.#renderItems(items)') < load.indexOf('PortfolioImageActions.hidratar(items)'),
      'a galeria publica deve aparecer sem esperar a sessao das curtidas');
    assert.doesNotMatch(load, /await\s+PortfolioImageActions\.hidratar\(items\)/);
  });
});
