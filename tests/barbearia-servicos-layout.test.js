'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./_helpers');

describe('BarbeariaPage servicos publicos', () => {
  const js = fs.readFileSync(path.join(ROOT, 'shared/js/BarbeariaPage.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'shared/css/components.css'), 'utf8');

  test('renderiza servicos como texto em colunas sem card, imagem ou carrossel horizontal', () => {
    const renderServicos = js.slice(
      js.indexOf('#renderServicos(lista)'),
      js.indexOf('#renderMensalBanner', js.indexOf('#renderServicos(lista)')),
    );
    const carouselCss = css.slice(
      css.indexOf('.bp-serv-carousel'),
      css.indexOf('.bp-serv-carousel::-webkit-scrollbar'),
    );
    const colunaCss = css.slice(
      css.indexOf('.bp-serv-coluna'),
      css.indexOf('.bp-serv-item'),
    );

    assert.match(renderServicos, /for\s*\(let i = 0; i < itens\.length; i \+= 5\)/);
    assert.match(renderServicos, /class="bp-serv-coluna"/);
    assert.match(renderServicos, /<h2 class="bp-serv-nome">/);
    assert.match(renderServicos, /<span class="bp-serv-preco">/);
    assert.doesNotMatch(renderServicos, /bp-serv-card|bp-serv-card-vazio|<img|image_path/);
    assert.match(carouselCss, /display:\s*flex/);
    assert.match(carouselCss, /overflow-x:\s*visible/);
    assert.match(colunaCss, /flex-direction:\s*column/);
    assert.match(css, /\.bp-serv-preco\s*\{[\s\S]*color:\s*var\(--gold/);
  });
});
