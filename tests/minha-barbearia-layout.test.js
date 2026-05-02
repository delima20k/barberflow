'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

class MinhaBarbeariaLayoutCssTest {
  static #ROOT = path.join(__dirname, '..');

  static #lerCss() {
    return fs.readFileSync(
      path.join(MinhaBarbeariaLayoutCssTest.#ROOT, 'shared/css/components.css'),
      'utf8'
    );
  }

  static #regraMinhaBarbearia() {
    const css = MinhaBarbeariaLayoutCssTest.#lerCss();
    const match = css.match(/#tela-minha-barbearia\s*\{[^}]+\}/);
    assert.ok(match, 'deve existir regra específica para #tela-minha-barbearia');
    return match[0];
  }

  static deveEntrarAbaixoDaHeaderGlobal() {
    const regra = MinhaBarbeariaLayoutCssTest.#regraMinhaBarbearia();

    assert.match(regra, /position:\s*fixed\s*!important;/, 'deve forçar o mesmo position das telas');
    assert.match(regra, /top:\s*var\(--header-h\)\s*!important;/, 'deve forçar abertura abaixo da header global');
    assert.match(regra, /bottom:\s*var\(--nav-h\)\s*!important;/, 'deve forçar limite acima do rodapé');
    assert.match(regra, /z-index:\s*1\s*!important;/, 'deve forçar a tela abaixo da header e do rodapé');
  }

  static deveManterHeaderERodapeAcima() {
    const css = MinhaBarbeariaLayoutCssTest.#lerCss();

    assert.match(css, /#app-header\s*\{[^}]*z-index:\s*3000\s*!important;/s,
      'header global deve ficar forçada acima das telas');
    assert.match(css, /\.footer-nav\s*\{[^}]*z-index:\s*2500\s*!important;/s,
      'rodapé global deve ficar forçado acima das telas');
  }
}

test('minha barbearia entra abaixo da header e abaixo do rodapé na pilha visual', () => {
  MinhaBarbeariaLayoutCssTest.deveEntrarAbaixoDaHeaderGlobal();
  MinhaBarbeariaLayoutCssTest.deveManterHeaderERodapeAcima();
});
