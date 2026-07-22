'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const migrationPath = path.resolve(
  __dirname,
  '../supabase/migrations/20260722000002_transactions_financeiro_realtime.sql',
);

test('transactions participa da publicacao realtime de forma idempotente', () => {
  assert.equal(fs.existsSync(migrationPath), true, 'migration realtime deve existir');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /ALTER\s+PUBLICATION\s+supabase_realtime\s+ADD\s+TABLE\s+public\.transactions/i);
  assert.match(sql, /pg_publication_tables/i);
  assert.match(sql, /tablename\s*=\s*'transactions'/i);
  assert.doesNotMatch(sql, /DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
  assert.doesNotMatch(sql, /DROP\s+POLICY/i);
});
