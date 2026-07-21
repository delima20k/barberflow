'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { RpcSignatureParser } = require('../scripts/db-rpc-parser');

const MIGRATION = join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260721000001_issue_professional_trial_vouchers.sql',
);
const CONTRACT = JSON.parse(readFileSync(
  join(__dirname, '..', 'db', 'contracts', 'snapshots', 'issue_professional_trial_voucher.json'),
  'utf8',
));

describe('Migration de emissao de vouchers profissionais', () => {
  it('deve reservar o primeiro voucher de forma atomica', () => {
    const sql = readFileSync(MIGRATION, 'utf8');

    assert.match(sql, /issue_professional_trial_voucher/i);
    assert.match(sql, /ORDER BY voucher\.created_at, voucher\.id/i);
    assert.match(sql, /FOR UPDATE SKIP LOCKED/i);
    assert.match(sql, /issued_at IS NULL/i);
  });

  it('deve impedir dois vouchers para o mesmo hash de email', () => {
    const sql = readFileSync(MIGRATION, 'utf8');

    assert.match(sql, /issued_email_hash text/i);
    assert.match(sql, /CREATE UNIQUE INDEX[\s\S]*issued_email_hash/i);
    assert.match(sql, /duplicate_email/i);
    assert.doesNotMatch(sql, /issued_email\s+text/i);
  });

  it('deve restringir a emissao ao service role e manter consumo unico', () => {
    const sql = readFileSync(MIGRATION, 'utf8');

    assert.match(sql, /REVOKE ALL ON FUNCTION[\s\S]*PUBLIC, anon, authenticated/i);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION[\s\S]*service_role/i);
    assert.match(sql, /used_at IS NULL/i);
    assert.match(sql, /NEW\.email/i);
  });

  it('deve manter assinatura e grant iguais ao contrato versionado', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    const signature = RpcSignatureParser.extract(sql, CONTRACT.rpc);

    assert.deepEqual({
      name: signature.name,
      params: signature.params,
      returns: signature.returns,
      language: signature.language,
      securityDefiner: signature.securityDefiner,
    }, CONTRACT.signature);
    assert.deepEqual(signature.grants, CONTRACT.grants);
  });
});
