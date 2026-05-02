'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

class MinhaBarbeariaLayoutTest {
  static #ROOT = path.join(__dirname, '..');

  static #lerArquivo(rel) {
    return fs.readFileSync(path.join(MinhaBarbeariaLayoutTest.#ROOT, rel), 'utf8');
  }

  static telaHerdaTopoDaHeader() {
    const tokens = MinhaBarbeariaLayoutTest.#lerArquivo('shared/css/tokens.css');
    // .tela { top: var(--header-h) } → minha-barbearia herda este valor e começa abaixo do header
    assert.match(tokens, /\.tela\s*\{[^}]*top:\s*var\(--header-h\)/s,
      '.tela deve ter top: var(--header-h) — minha-barbearia herda este valor');
  }

  static headerComZIndexAcimaDaTela() {
    const components = MinhaBarbeariaLayoutTest.#lerArquivo('shared/css/components.css');
    assert.match(components, /#app-header\s*\{[^}]*z-index:\s*1000/s,
      '#app-header deve ter z-index: 1000 (acima do z-index 10 de .tela)');
  }

  static nenhumBlocoConflitante() {
    const components = MinhaBarbeariaLayoutTest.#lerArquivo('shared/css/components.css');
    // Não deve ter top: 0 em #tela-minha-barbearia (cobriria o header)
    assert.doesNotMatch(components, /#tela-minha-barbearia\s*\{[^}]*top:\s*0/s,
      '#tela-minha-barbearia não deve ter top: 0 — cobriria o header');
    // Não deve forçar z-index com !important nos elementos globais
    assert.doesNotMatch(components, /#app-header\s*\{[^}]*z-index:[^;}]+!important/s,
      'não deve forçar z-index global da header com !important');
    assert.doesNotMatch(components, /\.footer-nav\s*\{[^}]*z-index:[^;}]+!important/s,
      'não deve forçar z-index global do rodapé com !important');
  }

  static headerSnapInstantaneo() {
    const js = MinhaBarbeariaLayoutTest.#lerArquivo('shared/js/HeaderScrollBehavior.js');
    // tela-entrando usa snap instantâneo (transition = 'none') para evitar
    // animação concorrente com a WAAPI de entrada da tela
    assert.match(js, /tela-entrando[\s\S]{0,500}style\.transition\s*=\s*['"]none['"]/,
      'HeaderScrollBehavior deve desabilitar transition ao navegar (snap instantâneo)');
  }

  static minhaBarbeariaPageNaoInterfere() {
    const js = MinhaBarbeariaLayoutTest.#lerArquivo(
      'apps/profissional/assets/js/pages/MinhaBarbeariaPage.js'
    );
    // MinhaBarbeariaPage não deve tocar no header diretamente — responsabilidade
    // do HeaderScrollBehavior, evitando race condition com WAAPI da tela
    assert.doesNotMatch(js, /getElementById\s*\(\s*['"]app-header['"]\s*\)/,
      'MinhaBarbeariaPage não deve acessar app-header diretamente');
  }
}

test('minha-barbearia herda topo abaixo da header global via .tela', () => {
  MinhaBarbeariaLayoutTest.telaHerdaTopoDaHeader();
});

test('header global tem z-index acima de qualquer tela', () => {
  MinhaBarbeariaLayoutTest.headerComZIndexAcimaDaTela();
});

test('nenhum CSS conflitante em #tela-minha-barbearia', () => {
  MinhaBarbeariaLayoutTest.nenhumBlocoConflitante();
});

test('HeaderScrollBehavior usa snap instantâneo ao navegar (sem concorrência com WAAPI da tela)', () => {
  MinhaBarbeariaLayoutTest.headerSnapInstantaneo();
});

test('MinhaBarbeariaPage não interfere nas animações da header', () => {
  MinhaBarbeariaLayoutTest.minhaBarbeariaPageNaoInterfere();
});
