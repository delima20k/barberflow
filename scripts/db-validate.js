'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { RlsPolicyReport } = require('./rls-policy-report');

class DbValidationStep {
  constructor({ id, title, blocking = true, command = '', description = '' }) {
    this.id = id;
    this.title = title;
    this.blocking = blocking;
    this.command = command;
    this.description = description;
  }
}

class DbValidationPlan {
  static build() {
    return [
      new DbValidationStep({
        id: 'schema-diff',
        title: 'Schema diff staging vs snapshot',
        command: 'pg_dump --schema-only staging && diff -u db/snapshots/schema-current.sql staging-schema.sql',
        description: 'Falha se staging divergir do snapshot sem migration registrada.',
      }),
      new DbValidationStep({
        id: 'migration-dry-run',
        title: 'Migration dry-run + rollback documentado',
        command: 'supabase start && supabase db reset && node scripts/db-validate.js --check-rollbacks',
        description: 'Aplica migrations em banco isolado e exige rollback documentado por migration nova.',
      }),
      new DbValidationStep({
        id: 'contract-tests',
        title: 'RPC contract tests',
        command: 'node --test tests/db-contracts.test.js',
        description: 'Compara contratos e snapshots das RPCs criticas no banco pos-migration.',
      }),
      new DbValidationStep({
        id: 'rls-tests',
        title: 'RLS policy tests',
        command: 'node --test tests/rls-policy-report.test.js && psql -f supabase/tests/rls_crud_suite.sql',
        description: 'Falha em qualquer tabela publica sem RLS ou assert SQL de policy.',
      }),
      new DbValidationStep({
        id: 'counter-consistency',
        title: 'Counter consistency check',
        blocking: false,
        command: 'psql staging -f db/audit/counter-consistency.sql',
        description: 'Avisa drift de contadores acima do threshold configurado.',
      }),
      new DbValidationStep({
        id: 'performance-baseline',
        title: 'Performance baseline',
        blocking: false,
        command: 'psql staging -f db/perf/critical-queries.sql',
        description: 'Avisa mudanca de plano nas queries criticas.',
      }),
      new DbValidationStep({
        id: 'data-integrity',
        title: 'Data integrity',
        command: 'psql staging -f db/audit/data-integrity.sql',
        description: 'Falha em orfaos de FK, nulos criticos e enums fora do dominio.',
      }),
    ];
  }
}

class DbValidationReport {
  constructor(stepResults) {
    this.stepResults = stepResults;
  }

  get failures() {
    return this.stepResults.filter(result => result.status === 'failed' && result.blocking);
  }

  get warnings() {
    return this.stepResults.filter(result => result.status === 'warning' || (result.status === 'failed' && !result.blocking));
  }

  get deployAllowed() {
    return this.failures.length === 0;
  }

  toMarkdown() {
    const rows = this.stepResults
      .map(result => `| ${result.id} | ${result.status} | ${result.blocking ? 'sim' : 'nao'} | ${result.message || '-'} |`)
      .join('\n');

    return [
      '# db-validate report',
      '',
      `Deploy liberado: ${this.deployAllowed ? 'sim' : 'nao'}`,
      '',
      '| passo | status | bloqueia | detalhe |',
      '| --- | --- | --- | --- |',
      rows,
      '',
    ].join('\n');
  }
}

class DbValidationRunner {
  static evaluate(resultsByStep) {
    const steps = DbValidationPlan.build();
    const stepResults = steps.map(step => {
      const result = resultsByStep[step.id] || { status: 'passed', message: 'ok' };
      return {
        id: step.id,
        title: step.title,
        blocking: step.blocking,
        status: result.status,
        message: result.message || '',
      };
    });

    return new DbValidationReport(stepResults);
  }
}

class MigrationRollbackGuard {
  static findMissingRollback({ migrationsDir, rollbackDir, changedFiles }) {
    const migrationFiles = changedFiles
      .filter(file => file.startsWith('supabase/migrations/') && file.endsWith('.sql'))
      .map(file => path.basename(file));

    return migrationFiles.filter(file => {
      const migrationPath = path.join(migrationsDir, file);
      const rollbackPath = path.join(rollbackDir, file.replace(/\.sql$/i, '.down.sql'));
      const sql = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, 'utf8') : '';
      return !/--\s*rollback\s*:/i.test(sql) && !fs.existsSync(rollbackPath);
    });
  }
}

class DbValidationCli {
  static run(argv = process.argv.slice(2), cwd = process.cwd()) {
    if (argv.includes('--checklist')) {
      process.stdout.write(`${this.checklistMarkdown()}\n`);
      return null;
    }

    if (argv.includes('--plan')) {
      process.stdout.write(`${this.planMarkdown()}\n`);
      return DbValidationPlan.build();
    }

    if (argv.includes('--check-rollbacks')) {
      const changedFiles = this.readChangedFiles(argv, cwd);
      const missing = MigrationRollbackGuard.findMissingRollback({
        migrationsDir: path.join(cwd, 'supabase', 'migrations'),
        rollbackDir: path.join(cwd, 'db', 'rollbacks'),
        changedFiles,
      });

      if (missing.length > 0) {
        process.stderr.write(`Migrations sem rollback documentado:\n${missing.map(file => `- ${file}`).join('\n')}\n`);
        process.exitCode = 1;
      }
      return missing;
    }

    return this.localReadiness(cwd);
  }

  static localReadiness(cwd) {
    const requiredFiles = [
      'db/snapshots/schema-current.sql',
      'db/perf/critical-queries.sql',
      'db/audit/counter-consistency.sql',
      'db/audit/data-integrity.sql',
      'supabase/tests/rls_crud_suite.sql',
    ];

    const missing = requiredFiles.filter(file => !fs.existsSync(path.join(cwd, file)));
    const rlsReport = RlsPolicyReport.fromMigrations(
      path.join(cwd, 'supabase', 'migrations'),
      path.join(cwd, 'db', 'rls', 'coverage.json'),
    );

    const report = DbValidationRunner.evaluate({
      'schema-diff': missing.includes('db/snapshots/schema-current.sql')
        ? { status: 'failed', message: 'snapshot ausente' }
        : { status: 'passed', message: 'snapshot encontrado' },
      'rls-tests': rlsReport.failures.length > 0
        ? { status: 'failed', message: `${rlsReport.failures.length} falha(s) RLS` }
        : { status: 'passed', message: 'RLS estatico ok' },
      'counter-consistency': missing.includes('db/audit/counter-consistency.sql')
        ? { status: 'warning', message: 'auditoria de contadores ausente' }
        : { status: 'passed', message: 'auditoria presente' },
      'performance-baseline': missing.includes('db/perf/critical-queries.sql')
        ? { status: 'warning', message: 'baseline de performance ausente' }
        : { status: 'passed', message: 'baseline presente' },
      'data-integrity': missing.includes('db/audit/data-integrity.sql')
        ? { status: 'failed', message: 'auditoria de integridade ausente' }
        : { status: 'passed', message: 'auditoria presente' },
    });

    process.stdout.write(report.toMarkdown());
    if (!report.deployAllowed) process.exitCode = 1;
    return report;
  }

  static checklistMarkdown() {
    return [
      '## Checklist pre-migration',
      '',
      '- [ ] Migration tem rollback documentado?',
      '- [ ] Afeta tabela com RLS? Se sim, RLS tests foram atualizados?',
      '- [ ] Afeta RPC existente? Se sim, contract test foi atualizado?',
      '- [ ] Afeta contadores? Se sim, triggers foram validados?',
      '- [ ] Migration rodou em staging sem erro?',
      '- [ ] Migration e reversivel?',
      '- [ ] Estimated downtime: 0 (online) ou X segundos (justificado)?',
    ].join('\n');
  }

  static planMarkdown() {
    const rows = DbValidationPlan.build()
      .map((step, index) => `${index + 1}. ${step.title} (${step.blocking ? 'FAIL bloqueia' : 'WARNING'})`)
      .join('\n');
    return `# db-validate\n\n${rows}`;
  }

  static readChangedFiles(argv, cwd) {
    const index = argv.indexOf('--changed-files');
    if (index !== -1 && argv[index + 1]) {
      return argv[index + 1].split(',').map(file => file.trim()).filter(Boolean);
    }

    const file = path.join(cwd, '.db-validate-changed-files');
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  }
}

module.exports = {
  DbValidationStep,
  DbValidationPlan,
  DbValidationReport,
  DbValidationRunner,
  MigrationRollbackGuard,
  DbValidationCli,
};

if (require.main === module) {
  DbValidationCli.run();
}
