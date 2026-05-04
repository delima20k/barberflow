'use strict';

// =============================================================
// backend-api-service.test.js — Teste de regressão para
// BackendApiService (shared/js/).
//
// Verifica que a URL base da API aponta para o projeto Vercel
// correto (barberflow-profissional.vercel.app) e não para
// projetos de terceiros.
// =============================================================

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const fs              = require('node:fs');
const path            = require('node:path');

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../shared/js/BackendApiService.js'),
  'utf8',
);

// ─── Suite 1: URL de produção ─────────────────────────────────

suite('BackendApiService — BASE_URL de produção', () => {

  test('usa barberflow-profissional.vercel.app como URL base de produção', () => {
    assert.ok(
      SRC.includes('barberflow-profissional.vercel.app'),
      'BackendApiService deve apontar para barberflow-profissional.vercel.app',
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

// ─── Suite 2: consistência de URL nos frontends ───────────────

suite('BackendApiService — consistência cross-file', () => {

  test('src/app.js ALLOWED_ORIGINS inclui barberflow-pro-one.vercel.app', () => {
    const appSrc = fs.readFileSync(
      path.resolve(__dirname, '../src/app.js'),
      'utf8',
    );
    assert.ok(
      appSrc.includes('barberflow-pro-one.vercel.app'),
      'src/app.js ALLOWED_ORIGINS deve incluir barberflow-pro-one.vercel.app',
    );
  });

  test('vercel.json possui barberflow-pro-one.vercel.app no CSP connect-src', () => {
    const vercelJson = fs.readFileSync(
      path.resolve(__dirname, '../vercel.json'),
      'utf8',
    );
    assert.ok(
      vercelJson.includes('barberflow-pro-one'),
      'vercel.json deve ter barberflow-pro-one.vercel.app no connect-src do CSP',
    );
  });
});
