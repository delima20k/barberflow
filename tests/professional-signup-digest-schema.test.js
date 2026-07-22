'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const HOTFIX_MIGRATION = join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260722000001_fix_professional_signup_digest_schema.sql',
);

describe('Hotfix do hash no cadastro profissional', () => {
  it('deve resolver digest explicitamente pelo schema extensions', () => {
    const sql = readFileSync(HOTFIX_MIGRATION, 'utf8');

    assert.match(sql, /extensions\.digest\s*\(/i);
    assert.doesNotMatch(sql, /(?<!extensions\.)\bdigest\s*\(/i);
  });

  it('deve redefinir somente handle_new_user_trial sem alterar schema ou RLS', () => {
    const sql = readFileSync(HOTFIX_MIGRATION, 'utf8');
    const functions = sql.match(/CREATE\s+OR\s+REPLACE\s+FUNCTION/gi) ?? [];

    assert.equal(functions.length, 1);
    assert.match(sql, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.handle_new_user_trial\s*\(\s*\)/i);
    assert.doesNotMatch(sql, /\b(?:ALTER|CREATE|DROP)\s+TABLE\b/i);
    assert.doesNotMatch(sql, /\b(?:CREATE|ALTER|DROP)\s+POLICY\b/i);
    assert.doesNotMatch(sql, /\bCREATE\s+TRIGGER\b/i);
  });

  it('deve preservar trial profissional, consumo unico e vinculo do voucher ao email', () => {
    const sql = readFileSync(HOTFIX_MIGRATION, 'utf8');

    assert.match(sql, /role[\s\S]*professional/i);
    assert.match(sql, /plan_intent[\s\S]*trial/i);
    assert.match(sql, /voucher\.used_at\s+IS\s+NULL/i);
    assert.match(sql, /voucher\.issued_email_hash\s*=\s*v_email_hash/i);
    assert.match(sql, /INSERT\s+INTO\s+public\.subscriptions/i);
  });
});
