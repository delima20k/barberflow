'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CLIENTE_HTML = fs.readFileSync(path.join(ROOT, 'apps/cliente/index.html'), 'utf8');
const PRO_HTML = fs.readFileSync(path.join(ROOT, 'apps/profissional/index.html'), 'utf8');
const PAGE_JS = fs.readFileSync(path.join(ROOT, 'shared/js/BarbeariaPage.js'), 'utf8');
const SHARED_CSS = fs.readFileSync(path.join(ROOT, 'shared/css/components.css'), 'utf8');

function getPublicInfoCard(html) {
  const match = html.match(/<div id="bp-info-fixa"[\s\S]*?<\/div>\s*<\/main>/);
  assert.ok(match, 'pagina publica deve manter #bp-info-fixa para BarbeariaPage');
  return match[0];
}

describe('Barbearia publica - card de informacoes', () => {
  for (const [app, html] of [['cliente', CLIENTE_HTML], ['profissional', PRO_HTML]]) {
    test(`${app} usa estrutura visual mb-info-card mantendo ids publicos`, () => {
      const card = getPublicInfoCard(html);

      assert.match(card, /id="bp-info-fixa"[^>]*class="[^"]*mb-info-card/);
      assert.match(card, /class="[^"]*mb-info-header/);
      assert.match(card, /id="bp-info-nome"/);
      assert.match(card, /id="bp-endereco"/);
      assert.match(card, /id="bp-info-cidade"/);
      assert.match(card, /id="bp-info-whats"/);
      assert.match(card, /id="bp-badge"/);
      assert.match(card, /id="bp-rating"/);
      assert.match(card, /id="bp-likes-wrap"/);
      assert.match(card, /id="bp-desde"/);
    });
  }

  test('BarbeariaPage popula os campos adicionais do card publico', () => {
    assert.match(PAGE_JS, /infoNome:\s+dq\('#bp-info-nome'\)/);
    assert.match(PAGE_JS, /infoCidade:\s+dq\('#bp-info-cidade'\)/);
    assert.match(PAGE_JS, /infoWhats:\s+dq\('#bp-info-whats'\)/);
  });

  test('CSS compartilhado estiliza o card publico como mb-info-card', () => {
    assert.match(SHARED_CSS, /#bp-info-fixa\.mb-info-card/);
    assert.match(SHARED_CSS, /#bp-info-fixa\.mb-info-card\[hidden\]/);
  });
});
