'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('Analytics Admin responsive layout', () => {
  it('deve cobrir desktop, tablet e celular sem largura fixa da pagina', () => {
    const root = path.resolve(__dirname, '..');
    const responsive = fs.readFileSync(path.join(root, 'css', 'responsive.css'), 'utf8');
    const global = fs.readFileSync(path.join(root, 'css', 'global.css'), 'utf8');
    const reset = fs.readFileSync(path.join(root, 'css', 'reset.css'), 'utf8');

    assert.match(responsive, /@media \(max-width: 1180px\)/);
    assert.match(responsive, /@media \(max-width: 860px\)/);
    assert.match(responsive, /@media \(max-width: 620px\)/);
    assert.match(responsive, /\.workspace\s*\{[\s\S]*margin-left:\s*0/);
    assert.match(reset, /min-width:\s*320px/);
    assert.doesNotMatch(global, /width:\s*1440px/);
  });
});
