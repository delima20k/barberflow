'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const fs       = require('node:fs');
const path     = require('node:path');

const root = path.resolve(__dirname, '..');

function lerFonte(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function extrairMetodo(fonte, assinatura, fimMarca) {
  const inicio = fonte.indexOf(assinatura);
  if (inicio === -1) return '';
  const fim = fimMarca ? fonte.indexOf(fimMarca, inicio) : fonte.length;
  return fonte.slice(inicio, fim);
}

// ─── Cenário A — barbershop_id válido → filtro duplo sempre aplicado ────────

test('Cenário A: BarbeariaRepository.updateEndereco filtra sempre por owner_id E id (sem if condicional)', () => {
  const fonte  = lerFonte('barberflow-bff-api/repositories/BarbeariaRepository.js');
  const metodo = extrairMetodo(fonte, 'async updateEndereco(', '\n  async ');

  // Ambos os filtros presentes
  assert.match(metodo, /\.eq\('owner_id',\s*ownerId\)/);
  assert.match(metodo, /\.eq\('id',\s*barbershopId\)/);

  // Filtro de id não deve estar dentro de um bloco if condicional
  assert.doesNotMatch(metodo, /if\s*\(\s*barbershopId\s*\)\s*\{[\s\S]*?\.eq\('id'/);
});

// ─── Cenário A (repo): maybeSingle substitui single ─────────────────────────

test('Cenário A: BarbeariaRepository.updateEndereco usa .maybeSingle() em vez de .single()', () => {
  const fonte  = lerFonte('barberflow-bff-api/repositories/BarbeariaRepository.js');
  const metodo = extrairMetodo(fonte, 'async updateEndereco(', '\n  async ');

  assert.match(metodo, /\.maybeSingle\(\)/);
  assert.doesNotMatch(metodo, /\.single\(\)/);
});

// ─── Cenário B — barbershop_id inexistente → service lança 404 ──────────────

test('Cenário B: BarbeariaService.salvarEndereco lança AppError.notFound quando resultado é falsy', () => {
  const fonte  = lerFonte('barberflow-bff-api/services/BarbeariaService.js');
  const metodo = extrairMetodo(fonte, 'async salvarEndereco(', '\n  /**');

  assert.match(metodo, /AppError\.notFound\(/);
  assert.match(metodo, /if\s*\(\s*!result\s*\)/);
});

// ─── Cenário C — barbershop_id de outro owner → 404 (segurança) ─────────────

test('Cenário C: segurança — owner_id sempre filtrado junto com barbershop_id', () => {
  const fonte  = lerFonte('barberflow-bff-api/repositories/BarbeariaRepository.js');
  const metodo = extrairMetodo(fonte, 'async updateEndereco(', '\n  async ');

  // Os dois .eq devem coexistir no mesmo método (dupla proteção)
  assert.match(metodo, /\.eq\('owner_id',\s*ownerId\)/);
  assert.match(metodo, /\.eq\('id',\s*barbershopId\)/);
});

// ─── Cenário D — barbershop_id ausente → 400 ────────────────────────────────

test('Cenário D: BarbeariaService.salvarEndereco rejeita com 400 quando barbershop_id ausente', () => {
  const fonte  = lerFonte('barberflow-bff-api/services/BarbeariaService.js');
  const metodo = extrairMetodo(fonte, 'async salvarEndereco(', '\n  /**');

  assert.match(metodo, /AppError\.badRequest\(/);
  assert.match(metodo, /!dados\.barbershop_id/);
});

// ─── Cenário E — coluna neighborhood: migration aplicada + campo condicional ─

test('Cenário E: migration define coluna neighborhood com ADD COLUMN IF NOT EXISTS', () => {
  const migration = lerFonte('supabase/migrations/20260423000001_barbershops_extra_fields.sql');
  assert.match(migration, /ADD COLUMN IF NOT EXISTS\s+neighborhood/i);
});

test('Cenário E: BarbeariaService.salvarEndereco inclui neighborhood apenas quando presente', () => {
  const fonte  = lerFonte('barberflow-bff-api/services/BarbeariaService.js');
  const metodo = extrairMetodo(fonte, 'async salvarEndereco(', '\n  /**');

  // neighborhood é incluído condicionalmente
  assert.match(metodo, /neighborhood\s*\?\s*\{\s*neighborhood\s*\}/);
  // não deve ser enviado sempre como null
  assert.doesNotMatch(metodo, /neighborhood:\s*neighborhood\s*\|\|\s*null/);
});

// ─── Controller encaminha barbershop_id desde o frontend ────────────────────

test('MinhaBarbeariaRuntimeController envia barbershop_id no payload de #salvarGps', () => {
  const fonte  = lerFonte(
    'apps/profissional/assets/js/pages/MinhaBarbeariaPage/MinhaBarbeariaRuntimeController.js'
  );
  const metodo = extrairMetodo(fonte, 'async #salvarGps()', '\n  #');

  assert.match(metodo, /barbershop_id:\s*this\.#barbershopId/);
});
