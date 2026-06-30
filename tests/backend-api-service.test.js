'use strict';

// =============================================================
// backend-api-service.test.js — Teste de regressão para
// BackendApiService (shared/js/).
//
// Verifica que a URL base da API aponta para o domínio oficial
// correto (pro.barberflow.live) e não para projetos de terceiros.
// =============================================================

const { describe, test } = require('node:test');
const assert          = require('node:assert/strict');
const fs              = require('node:fs');
const path            = require('node:path');

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../shared/js/BackendApiService.js'),
  'utf8',
);

// ─── describe 1: URL de produção ─────────────────────────────────

describe('BackendApiService — BASE_URL de produção', () => {

  test('usa pro.barberflow.live como URL base de produção', () => {
    assert.ok(
      SRC.includes('pro.barberflow.live'),
      'BackendApiService deve apontar para pro.barberflow.live',
    );
  });

  test('NÃO usa barberflow-api.vercel.app (projeto de terceiro) como URL base', () => {
    const linhaRetornoProducao = SRC
      .split('\n')
      .find(l =>
        l.includes('barberflow-api.vercel.app') &&
        !l.trim().startsWith('//'),
      );
    assert.ok(
      !linhaRetornoProducao,
      `Encontrada referência ativa para barberflow-api.vercel.app (projeto de terceiro): "${linhaRetornoProducao}"`,
    );
  });

  test('mantém localhost:3001 para desenvolvimento', () => {
    assert.ok(
      SRC.includes('localhost:3001'),
      'BackendApiService deve usar localhost:3001 em desenvolvimento',
    );
  });
});

describe('BackendApiService upload otimizado', () => {
  test('uploadBinario aceita skipCompression e evita recompressao', () => {
    assert.match(SRC, /uploadBinario\(path,\s*buffer,\s*\{[\s\S]*skipCompression\s*=\s*false/);
    assert.match(SRC, /#prepareBinaryUpload\(buffer,\s*contentType,\s*\{\s*skipCompression\s*\}\)/);
    assert.match(SRC, /if \(skipCompression\) return \{ buffer, contentType:/);
  });
});

// ─── describe 2: consistência de URL nos frontends ───────────────

describe('BackendApiService — consistência cross-file', () => {

  test('src/app.js ALLOWED_ORIGINS inclui domínios oficiais barberflow.live', () => {
    const appSrc = fs.readFileSync(
      path.resolve(__dirname, '../src/app.js'),
      'utf8',
    );
    assert.ok(
      appSrc.includes('app.barberflow.live'),
      'src/app.js ALLOWED_ORIGINS deve incluir app.barberflow.live',
    );
    assert.ok(
      appSrc.includes('pro.barberflow.live'),
      'src/app.js ALLOWED_ORIGINS deve incluir pro.barberflow.live',
    );
  });

  test('vercel.json possui bff.barberflow.live no CSP connect-src', () => {
    const vercelJson = fs.readFileSync(
      path.resolve(__dirname, '../vercel.json'),
      'utf8',
    );
    assert.ok(
      vercelJson.includes('bff.barberflow.live'),
      'vercel.json deve ter bff.barberflow.live no connect-src do CSP',
    );
  });
});
