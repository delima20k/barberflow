'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const ROOT = join(__dirname, '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

describe('Perfil do app profissional', () => {
  it('nao deve oferecer o fluxo de criacao de barbearia pelo perfil', () => {
    const appHtml = read('apps/profissional/index.html');
    const legacyHtml = read('profissional.html');
    const app = read('apps/profissional/assets/js/app.js');
    const authUi = read('shared/js/AuthUI.js');
    const componentsCss = read('shared/css/components.css');
    const classRegistry = read('CLASS_REGISTRY.md');

    assert.doesNotMatch(appHtml, /btn-perfil-criar|tela-criar|CriarBarbeariaPage\.js/);
    assert.doesNotMatch(legacyHtml, /btn-perfil-criar|Pro\.nav\(['"]criar['"]\)/);
    assert.doesNotMatch(app, /CriarBarbeariaPage|criarBarbeariaPage|['"]criar['"]/);
    assert.doesNotMatch(authUi, /btn-perfil-criar/);
    assert.doesNotMatch(componentsCss, /btn-perfil-criar|criar-msg|criar-intro/);
    assert.doesNotMatch(classRegistry, /CriarBarbeariaPage/);
    assert.equal(
      existsSync(join(ROOT, 'apps/profissional/assets/js/pages/CriarBarbeariaPage.js')),
      false,
    );
  });
});
