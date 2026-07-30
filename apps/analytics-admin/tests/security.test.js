'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('Analytics Admin deployment security', () => {
  it('deve publicar CSP, HSTS e isolamento de janela', () => {
    const vercel = fs.readFileSync(
      path.resolve(__dirname, '..', 'vercel.json'),
      'utf8',
    );

    assert.match(vercel, /Content-Security-Policy/);
    assert.match(vercel, /default-src 'self'/);
    assert.match(vercel, /frame-ancestors 'none'/);
    assert.match(vercel, /Strict-Transport-Security/);
    assert.match(vercel, /Cross-Origin-Opener-Policy/);
    assert.doesNotMatch(vercel, /unsafe-inline|unsafe-eval/);
  });
});
