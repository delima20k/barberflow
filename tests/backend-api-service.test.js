'use strict';

// =============================================================
// backend-api-service.test.js — Teste de regressão para
// BackendApiService (shared/js/).
//
// Verifica que a URL base da API aponta para o projeto Vercel
// correto (barberflow-api.vercel.app) e não para o Next.js
// em barberflow.vercel.app.
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

  test('usa barberflow-api.vercel.app como URL base de produção', () => {
    assert.ok(
      SRC.includes('barberflow-api.vercel.app'),
      'BackendApiService deve apontar para barberflow-api.vercel.app',
    );
  });

  test('NÃO usa barberflow.vercel.app (projeto Next.js errado) como URL base', () => {
    // barberflow.vercel.app pode aparecer em comentários explicativos — tudo bem.
    // O que não pode é aparecer como VALOR retornado pela lógica de produção.
    // A forma mais segura de testar: o bloco de retorno de produção não contém
    // a URL antiga como string ativa.
    const linhaRetornoProducao = SRC
      .split('\n')
      .find(l =>
        l.includes('barberflow.vercel.app') &&
        !l.trim().startsWith('//') &&          // não é comentário
        !l.includes('barberflow-api') &&        // não é a nova URL
        !l.includes('barberflow-cliente') &&
        !l.includes('barberflow-profissional') &&
        !l.includes('barberflow-pro-one'),
      );

    assert.ok(
      !linhaRetornoProducao,
      `Encontrada referência ativa para barberflow.vercel.app (projeto errado): "${linhaRetornoProducao}"`,
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

  test('vercel.json possui entry CORS para barberflow-pro-one.vercel.app', () => {
    const vercelJson = fs.readFileSync(
      path.resolve(__dirname, '../vercel.json'),
      'utf8',
    );
    assert.ok(
      vercelJson.includes('barberflow-pro-one'),
      'vercel.json deve ter entrada CORS para barberflow-pro-one.vercel.app',
    );
  });
});
