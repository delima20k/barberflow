'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

describe('PortfolioImageActions', () => {
  test('usa BFF para hidratar e persistir curtidas do portfolio', () => {
    const source = fs.readFileSync(path.join(ROOT, 'shared/js/PortfolioImageActions.js'), 'utf8');

    assert.match(source, /listarCurtidasPortfolio/);
    assert.match(source, /curtirPortfolioImagem/);
    assert.match(source, /descurtirPortfolioImagem/);
    assert.match(source, /listarMensagens/);
    assert.match(source, /portfolio-messages-panel/);
    assert.match(source, /\\uD83D\\uDC4D/);
    assert.doesNotMatch(source, /from\(['"]likes['"]\)/);
    assert.doesNotMatch(source, /SupabaseService\.getUser/);
  });
});
