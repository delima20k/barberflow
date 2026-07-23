'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIGRATION = path.join(
  ROOT,
  'supabase/migrations/20260723000001_queue_entry_services_partner_rls.sql',
);

describe('queue_entry_services RLS do barbeiro parceiro', () => {
  it('reafirma RLS e preserva a leitura existente de forma idempotente', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf8');

    assert.match(
      sql,
      /ALTER TABLE public\.queue_entry_services ENABLE ROW LEVEL SECURITY/i,
    );
    assert.match(sql, /DROP POLICY IF EXISTS "qes_select_public"/i);
    assert.match(sql, /CREATE POLICY "qes_select_public"/i);
  });

  it('permite gravar servicos apenas para cliente ou profissional responsavel ativo', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf8');

    assert.match(sql, /DROP POLICY IF EXISTS "qes_insert"/i);
    assert.match(sql, /CREATE POLICY "qes_insert"/i);
    assert.match(sql, /qe\.client_id\s*=\s*auth\.uid\(\)/i);
    assert.match(sql, /qe\.professional_id\s*=\s*auth\.uid\(\)/i);
    assert.match(sql, /psl\.professional_id\s*=\s*auth\.uid\(\)/i);
    assert.match(sql, /psl\.is_active\s*=\s*true/i);
  });

  it('vincula entrada e servico a mesma barbearia para impedir acesso cruzado', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf8');

    assert.match(
      sql,
      /qe\.barbershop_id\s*=\s*queue_entry_services\.barbershop_id/i,
    );
    assert.match(
      sql,
      /s\.barbershop_id\s*=\s*queue_entry_services\.barbershop_id/i,
    );
    assert.match(sql, /s\.is_active\s*=\s*true/i);
  });

  it('mantem exclusao sob as mesmas restricoes de propriedade', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf8');

    assert.match(sql, /DROP POLICY IF EXISTS "qes_delete"/i);
    assert.match(sql, /CREATE POLICY "qes_delete"/i);
    assert.match(
      sql,
      /FOR DELETE[\s\S]*qe\.professional_id\s*=\s*auth\.uid\(\)/i,
    );
  });
});
