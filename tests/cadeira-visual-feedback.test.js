'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

class CadeiraVisualFeedbackTest {
  static #ROOT = path.join(__dirname, '..');

  static #ler(rel) {
    return fs.readFileSync(path.join(CadeiraVisualFeedbackTest.#ROOT, rel), 'utf8');
  }

  static #bloco(css, seletor) {
    const escaped = seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = css.match(new RegExp(`${escaped}\\s*\\{[^}]*\\}`, 's'));
    assert.ok(match, `seletor ${seletor} deve existir`);
    return match[0];
  }

  static minhaBarbeariaRemoveHighlightNativo() {
    const css = CadeiraVisualFeedbackTest.#ler('apps/profissional/assets/css/styles.css');
    const cadeira = CadeiraVisualFeedbackTest.#bloco(css, '.mb-cadeira');
    const wrap = CadeiraVisualFeedbackTest.#bloco(css, '.mb-cadeiras-wrap');
    const row = CadeiraVisualFeedbackTest.#bloco(css, '.mb-barbeiro-row');

    assert.match(cadeira, /-webkit-tap-highlight-color:\s*transparent\s*!important/);
    assert.match(cadeira, /touch-action:\s*manipulation/);
    assert.match(cadeira, /-webkit-touch-callout:\s*none/);
    assert.match(wrap, /-webkit-tap-highlight-color:\s*transparent\s*!important/);
    assert.match(row, /-webkit-tap-highlight-color:\s*transparent/);
  }

  static minhaBarbeariaNaoAnimaParent() {
    const css = CadeiraVisualFeedbackTest.#ler('apps/profissional/assets/css/styles.css');

    assert.doesNotMatch(css, /\.mb-cadeiras-wrap[^{]*(?:active|focus|focus-visible|focus-within)[^{]*\{[^}]*(background|box-shadow|border-color|transform|opacity)\s*:/s);
    assert.doesNotMatch(css, /\.mb-barbeiro-row[^{]*(?:active|focus|focus-visible|focus-within)[^{]*\{[^}]*(background|box-shadow|border-color|transform|opacity)\s*:/s);
  }

  static minhaBarbeariaAnimaSomenteCadeira() {
    const css = CadeiraVisualFeedbackTest.#ler('apps/profissional/assets/css/styles.css');
    const source = CadeiraVisualFeedbackTest.#ler('apps/profissional/assets/js/pages/MinhaBarbeariaPage/MinhaBarbeariaRuntimeController.js');
    const interativa = CadeiraVisualFeedbackTest.#bloco(css, '.mb-cadeira--interativa');
    const active = CadeiraVisualFeedbackTest.#bloco(css, '.mb-cadeira--interativa:active .mb-cadeira-icon');

    assert.match(interativa, /transition:\s*transform\s+\.1[2-8]s\s+ease,\s*opacity\s+\.1[2-8]s\s+ease/);
    assert.match(active, /transform:\s*scale\(\.9[0-9]\)/);
    assert.doesNotMatch(active, /background|box-shadow|border-color|outline/);
    assert.match(source, /#bloquearSelecaoNativaCadeira/);
    assert.match(source, /event\.preventDefault\(\)/);
    assert.match(source, /#piscarCadeira/);
    assert.match(source, /animate\(\[/);
  }

  static barbeariaPublicaRemoveHighlightNativo() {
    const css = CadeiraVisualFeedbackTest.#ler('shared/css/components.css');
    const cadeira = CadeiraVisualFeedbackTest.#bloco(css, '.cdr-cadeira');
    const wrap = CadeiraVisualFeedbackTest.#bloco(css, '.cdr-cadeiras-wrap');
    const row = CadeiraVisualFeedbackTest.#bloco(css, '.cdr-row');

    assert.match(cadeira, /-webkit-tap-highlight-color:\s*transparent\s*!important/);
    assert.match(cadeira, /touch-action:\s*manipulation/);
    assert.match(cadeira, /-webkit-touch-callout:\s*none/);
    assert.match(wrap, /-webkit-tap-highlight-color:\s*transparent\s*!important/);
    assert.match(row, /-webkit-tap-highlight-color:\s*transparent/);
  }

  static barbeariaPublicaMantemFocoAcessivelSemAzul() {
    const css = CadeiraVisualFeedbackTest.#ler('shared/css/components.css');
    const focus = CadeiraVisualFeedbackTest.#bloco(css, '.cdr-cadeira--interativa:focus-visible');

    assert.match(focus, /outline:\s*2px\s+solid\s+var\(--gold/);
    assert.doesNotMatch(focus, /blue|#00f|#0000ff|rgb\(0,\s*0,\s*255\)/i);
  }

  static barbeariaPublicaPiscaSomenteCadeiraClicada() {
    const source = CadeiraVisualFeedbackTest.#ler('shared/js/Cadeira.js');

    assert.match(source, /#bloquearSelecaoNativa/);
    assert.match(source, /event\.preventDefault\(\)/);
    assert.match(source, /#piscarClique/);
    assert.match(source, /animate\(\[/);
    assert.match(source, /opacity:\s*\.54/);
  }
}

test('Minha Barbearia remove highlight nativo das cadeiras e do container', () => {
  CadeiraVisualFeedbackTest.minhaBarbeariaRemoveHighlightNativo();
});

test('Minha Barbearia não aplica feedback visual no parent das cadeiras', () => {
  CadeiraVisualFeedbackTest.minhaBarbeariaNaoAnimaParent();
});

test('Minha Barbearia anima somente a cadeira clicada com transform e opacity', () => {
  CadeiraVisualFeedbackTest.minhaBarbeariaAnimaSomenteCadeira();
});

test('Barbearia pública remove highlight nativo das cadeiras e do container', () => {
  CadeiraVisualFeedbackTest.barbeariaPublicaRemoveHighlightNativo();
});

test('Barbearia pública mantém foco acessível sem azul nativo', () => {
  CadeiraVisualFeedbackTest.barbeariaPublicaMantemFocoAcessivelSemAzul();
});

test('Barbearia pública pisca somente a cadeira clicada antes da ação', () => {
  CadeiraVisualFeedbackTest.barbeariaPublicaPiscaSomenteCadeiraClicada();
});
