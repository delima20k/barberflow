'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  RlsPolicyParser,
  RlsPolicyReport,
} = require('../scripts/rls-policy-report');

const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS = path.join(ROOT, 'supabase', 'migrations');
const COVERAGE = path.join(ROOT, 'db', 'rls', 'coverage.json');
const SQL_SUITE = path.join(ROOT, 'supabase', 'tests', 'rls_crud_suite.sql');

class TempMigrations {
  constructor(files) {
    this.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'barberflow-rls-'));
    for (const [file, sql] of Object.entries(files)) {
      fs.writeFileSync(path.join(this.dir, file), sql, 'utf8');
    }
  }

  cleanup() {
    fs.rmSync(this.dir, { recursive: true, force: true });
  }
}

describe('RlsPolicyReport', () => {
  let report;

  before(() => {
    report = RlsPolicyReport.fromMigrations(MIGRATIONS, COVERAGE);
  });

  it('lista todas as tabelas com RLS e policies por operacao', () => {
    const notifications = report.rows.find(row => row.table === 'public.notifications');
    assert.ok(notifications, 'public.notifications deve aparecer no report');
    assert.equal(typeof notifications.policyCounts.select, 'number');
    assert.equal(typeof notifications.policyCounts.insert, 'number');
    assert.equal(typeof notifications.policyCounts.update, 'number');
    assert.equal(typeof notifications.policyCounts.delete, 'number');
  });

  it('falha quando uma tabela publica fica sem RLS habilitado', () => {
    const fixture = new TempMigrations({
      '20260101000001_base.sql': `
        create table public.private_notes (
          id uuid primary key,
          user_id uuid not null,
          body text not null
        );
      `,
    });

    try {
      const fixtureReport = RlsPolicyReport.fromMigrations(
        fixture.dir,
        path.join(fixture.dir, 'coverage.json'),
      );
      assert.ok(fixtureReport.failures.some(row =>
        row.table === 'public.private_notes' && row.failures.includes('rls_disabled'),
      ));
    } finally {
      fixture.cleanup();
    }
  });

  it('detecta disable row level security como falha explicita', () => {
    const tables = RlsPolicyParser.parse([{
      file: 'fixture.sql',
      sql: `
        create table public.profiles (id uuid primary key, email text);
        alter table public.profiles enable row level security;
        alter table public.profiles disable row level security;
      `,
    }]);

    const fixtureReport = new RlsPolicyReport(tables, { tables: {} }).build();
    const profiles = fixtureReport.rows.find(row => row.table === 'public.profiles');
    assert.ok(profiles.failures.includes('rls_explicitly_disabled'));
  });

  it('sinaliza coluna sensivel sem cobertura declarada', () => {
    const tables = RlsPolicyParser.parse([{
      file: 'fixture.sql',
      sql: `
        create table public.profiles (
          id uuid primary key,
          user_id uuid not null,
          email text not null
        );
        alter table public.profiles enable row level security;
        create policy profiles_select_own on public.profiles for select using (auth.uid() = user_id);
      `,
    }]);

    const fixtureReport = new RlsPolicyReport(tables, {
      tables: { 'public.profiles': { operations: ['select', 'insert', 'update', 'delete'], sensitiveColumns: [] } },
    }).build();
    const profiles = fixtureReport.rows.find(row => row.table === 'public.profiles');
    assert.ok(profiles.warnings.some(warning => warning.includes('sensitive_columns_without_tests:email')));
  });

  it('marca tabelas sensiveis sem CRUD completo como warning priorizado', () => {
    const profiles = report.rows.find(row => row.table === 'public.profiles');
    assert.ok(profiles, 'public.profiles deve existir no report');
    assert.deepEqual(profiles.coveredOperations.sort(), ['delete', 'insert', 'select', 'update']);
  });

  it('gera markdown com resumo por tabela e operacao', () => {
    const markdown = RlsPolicyReport.toMarkdown(report);
    assert.match(markdown, /RLS Coverage Report/);
    assert.match(markdown, /\| Table \| RLS \| SELECT \| INSERT \| UPDATE \| DELETE \|/);
    assert.match(markdown, /public\.notifications/);
  });
});

describe('RLS SQL CRUD suite', () => {
  let sql;

  before(() => {
    sql = fs.readFileSync(SQL_SUITE, 'utf8');
  });

  it('define helpers transacionais as_anon, as_user e as_service', () => {
    assert.match(sql, /create\s+or\s+replace\s+function\s+rls_test\.as_anon/i);
    assert.match(sql, /create\s+or\s+replace\s+function\s+rls_test\.as_user/i);
    assert.match(sql, /create\s+or\s+replace\s+function\s+rls_test\.as_service/i);
    assert.match(sql, /begin/i);
    assert.match(sql, /rollback/i);
  });

  it('inclui meta-teste de isolamento entre usuario A e usuario B', () => {
    assert.match(sql, /meta_user_a_cannot_read_user_b/i);
    assert.match(sql, /as_user\(.*user_a/i);
    assert.match(sql, /as_user\(.*user_b/i);
  });

  it('importa a regressao canonica de notifications', () => {
    assert.match(sql, /notifications_rls_fix\.sql/i);
    assert.match(sql, /notifications_select_own/i);
  });

  it('inclui vetores de bypass para RPC injection e SET ROLE manual', () => {
    assert.match(sql, /sql_injection/i);
    assert.match(sql, /set_role_manual/i);
    assert.match(sql, /security\s+invoker/i);
  });
});
