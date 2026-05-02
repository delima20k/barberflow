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

    assert.match(regra, /position:\s*fixed;/, 'deve usar o mesmo position das telas');
    assert.match(regra, /top:\s*var\(--header-h\);/, 'deve abrir abaixo da header global');
    assert.match(regra, /bottom:\s*0;/, 'deve manter a área rolável padrão das telas');
    assert.match(regra, /z-index:\s*10;/, 'deve ficar abaixo da header e do rodapé');
  }
}

test('minha barbearia entra abaixo da header e abaixo do rodapé na pilha visual', () => {
  MinhaBarbeariaLayoutCssTest.deveEntrarAbaixoDaHeaderGlobal();
});
