'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  DbValidationRunner,
  MigrationRollbackGuard,
} = require('../scripts/db-validate');
const { RlsPolicyParser } = require('../scripts/rls-policy-report');

test('pipeline falha quando migration dry-run detecta erro de syntax', () => {
  const report = DbValidationRunner.evaluate({
    'migration-dry-run': {
      status: 'failed',
      message: 'syntax error at or near "creat"',
    },
  });

  assert.equal(report.deployAllowed, false);
  assert.deepEqual(report.failures.map(failure => failure.id), ['migration-dry-run']);
});

test('pipeline falha quando contrato de RPC muda o output do snapshot', () => {
  const report = DbValidationRunner.evaluate({
    'contract-tests': {
      status: 'failed',
      message: 'snapshot mismatch: criar_agendamento_atomico',
    },
  });

  assert.equal(report.deployAllowed, false);
  assert.equal(report.failures[0].id, 'contract-tests');
});

test('pipeline falha quando nova tabela publica nasce sem RLS', () => {
  const parsed = RlsPolicyParser.parse([
    {
      file: '20260524000000_without_rls.sql',
      sql: 'create table public.payment_cards (id uuid primary key, user_id uuid not null);',
    },
  ]);

  assert.equal(parsed[0].rlsEnabled, false);

  const report = DbValidationRunner.evaluate({
    'rls-tests': {
      status: parsed[0].rlsEnabled ? 'passed' : 'failed',
      message: 'public.payment_cards sem RLS',
    },
  });

  assert.equal(report.deployAllowed, false);
  assert.equal(report.failures[0].id, 'rls-tests');
});

test('pipeline permite deploy quando passos bloqueantes passam e warnings nao bloqueiam', () => {
  const report = DbValidationRunner.evaluate({
    'counter-consistency': {
      status: 'warning',
      message: 'likes_count drift 1.2% acima do threshold',
    },
    'performance-baseline': {
      status: 'warning',
      message: 'plano mudou de index scan para bitmap scan',
    },
  });

  assert.equal(report.deployAllowed, true);
  assert.equal(report.failures.length, 0);
  assert.deepEqual(report.warnings.map(warning => warning.id), [
    'counter-consistency',
    'performance-baseline',
  ]);
});

test('rollback guard exige comentario rollback ou arquivo .down.sql para migration alterada', () => {
  const missing = MigrationRollbackGuard.findMissingRollback({
    migrationsDir: __dirname,
    rollbackDir: __dirname,
    changedFiles: ['supabase/migrations/20260524000000_sensitive_change.sql'],
  });

  assert.deepEqual(missing, ['20260524000000_sensitive_change.sql']);
});
