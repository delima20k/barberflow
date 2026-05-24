'use strict';

const fs = require('node:fs');
const path = require('node:path');

class RlsMigrationReader {
  static readDirectory(migrationsDir) {
    if (!fs.existsSync(migrationsDir)) {
      throw new Error(`Diretorio de migrations nao encontrado: ${migrationsDir}`);
    }

    return fs.readdirSync(migrationsDir)
      .filter(file => /^\d+.*\.sql$/i.test(file))
      .sort()
      .map(file => ({
        file,
        sql: fs.readFileSync(path.join(migrationsDir, file), 'utf8'),
      }));
  }
}

class RlsSqlNormalizer {
  static stripComments(sql) {
    return String(sql)
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/--.*$/gm, ' ');
  }

  static normalizeIdentifier(identifier) {
    return String(identifier)
      .trim()
      .replace(/^only\s+/i, '')
      .replace(/["'`]/g, '')
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  static normalizeTable(rawTable) {
    const table = RlsSqlNormalizer.normalizeIdentifier(rawTable);
    if (!table.includes('.')) return `public.${table}`;
    return table;
  }
}

class RlsPolicyParser {
  static OPERATIONS = ['select', 'insert', 'update', 'delete'];

  static parse(migrationFiles) {
    const state = new Map();
    const sql = RlsSqlNormalizer.stripComments(
      migrationFiles.map(file => file.sql).join('\n'),
    );

    this.#collectCreatedTables(sql, state);
    this.#collectRlsState(sql, state);
    this.#collectPolicies(sql, state);
    this.#collectColumns(sql, state);

    return [...state.values()].sort((a, b) => a.table.localeCompare(b.table));
  }

  static #ensureTable(state, table) {
    const normalized = RlsSqlNormalizer.normalizeTable(table);
    if (!state.has(normalized)) {
      state.set(normalized, {
        table: normalized,
        schema: normalized.split('.')[0],
        name: normalized.split('.').slice(1).join('.'),
        rlsEnabled: false,
        rlsExplicitlyDisabled: false,
        policies: {
          select: new Set(),
          insert: new Set(),
          update: new Set(),
          delete: new Set(),
        },
        columns: new Set(),
      });
    }
    return state.get(normalized);
  }

  static #collectCreatedTables(sql, state) {
    const re = /\bcreate\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?([a-zA-Z0-9_".]+)\s*\(([\s\S]*?)\)\s*;/gi;
    for (const match of sql.matchAll(re)) {
      const table = this.#ensureTable(state, match[1]);
      for (const column of this.#extractColumns(match[2])) {
        table.columns.add(column);
      }
    }
  }

  static #collectRlsState(sql, state) {
    const re = /\balter\s+table\s+(?:if\s+exists\s+)?([a-zA-Z0-9_".]+)\s+(enable|disable)\s+row\s+level\s+security\b/gi;
    for (const match of sql.matchAll(re)) {
      const table = this.#ensureTable(state, match[1]);
      const action = match[2].toLowerCase();
      table.rlsEnabled = action === 'enable';
      table.rlsExplicitlyDisabled = action === 'disable';
    }
  }

  static #collectPolicies(sql, state) {
    const re = /\bcreate\s+policy\s+(?:"([^"]+)"|([a-zA-Z0-9_]+))\s+on\s+([a-zA-Z0-9_".]+)([\s\S]*?);/gi;
    for (const match of sql.matchAll(re)) {
      const policyName = match[1] || match[2];
      const table = this.#ensureTable(state, match[3]);
      const body = match[4] || '';
      const operationMatch = body.match(/\bfor\s+(select|insert|update|delete|all)\b/i);
      const operation = operationMatch ? operationMatch[1].toLowerCase() : 'all';
      const operations = operation === 'all' ? this.OPERATIONS : [operation];
      for (const op of operations) {
        table.policies[op].add(policyName);
      }
    }
  }

  static #collectColumns(sql, state) {
    const re = /\balter\s+table\s+(?:if\s+exists\s+)?([a-zA-Z0-9_".]+)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?("?[\w]+"?)/gi;
    for (const match of sql.matchAll(re)) {
      const table = this.#ensureTable(state, match[1]);
      table.columns.add(RlsSqlNormalizer.normalizeIdentifier(match[2]));
    }
  }

  static #extractColumns(definition) {
    return definition
      .split(/\n|,/)
      .map(line => line.trim())
      .filter(Boolean)
      .filter(line => !/^(constraint|primary|foreign|unique|check|exclude)\b/i.test(line))
      .map(line => line.match(/^"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+/)?.[1])
      .filter(Boolean)
      .map(column => column.toLowerCase());
  }
}

class RlsCoverageManifest {
  static load(file) {
    if (!fs.existsSync(file)) {
      return { tables: {}, rpcInjectionTests: [] };
    }
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
}

class RlsPolicyReport {
  static SENSITIVE_TABLE_PATTERNS = [
    /profiles?$/,
    /users?$/,
    /appointments?$/,
    /agenda$/,
    /messages?$/,
    /chat/,
    /media/,
    /uploads?$/,
    /likes?$/,
    /favorites?$/,
    /ratings?$/,
    /stories?$/,
    /portfolio/,
    /queue_entries$/,
    /transactions?$/,
    /payments?$/,
    /subscriptions?$/,
    /financial/,
    /notifications?$/,
    /legal_consents?$/,
    /data_/,
    /push_subscriptions?$/,
  ];

  static SENSITIVE_COLUMN_PATTERNS = [
    /email/,
    /phone/,
    /cpf/,
    /cnpj/,
    /password/,
    /token/,
    /secret/,
    /amount/,
    /price/,
    /gross/,
    /net/,
    /address/,
    /location/,
    /^lat$/,
    /^lng$/,
    /birth/,
    /document/,
    /device/,
    /endpoint/,
  ];

  constructor(tables, coverageManifest = {}) {
    this.tables = tables;
    this.coverageManifest = coverageManifest;
  }

  build() {
    const rows = this.tables.map(table => this.#buildRow(table));
    const failures = rows.filter(row => row.failures.length > 0);
    const warnings = rows.flatMap(row => row.warnings.map(warning => ({
      table: row.table,
      warning,
    })));

    return {
      generatedAt: new Date(0).toISOString(),
      totals: {
        tables: rows.length,
        rlsEnabled: rows.filter(row => row.rlsEnabled).length,
        failures: failures.length,
        warnings: warnings.length,
      },
      rows,
      failures,
      warnings,
    };
  }

  static fromMigrations(migrationsDir, coverageFile) {
    const migrations = RlsMigrationReader.readDirectory(migrationsDir);
    const tables = RlsPolicyParser.parse(migrations);
    const manifest = RlsCoverageManifest.load(coverageFile);
    return new RlsPolicyReport(tables, manifest).build();
  }

  static toMarkdown(report) {
    const lines = [
      '# RLS Coverage Report',
      '',
      `Tables: ${report.totals.tables}`,
      `RLS enabled: ${report.totals.rlsEnabled}`,
      `Failures: ${report.totals.failures}`,
      `Warnings: ${report.totals.warnings}`,
      '',
      '| Table | RLS | SELECT | INSERT | UPDATE | DELETE | Test coverage | Status |',
      '|---|---:|---:|---:|---:|---:|---|---|',
    ];

    for (const row of report.rows) {
      lines.push([
        row.table,
        row.rlsEnabled ? 'yes' : 'no',
        row.policyCounts.select,
        row.policyCounts.insert,
        row.policyCounts.update,
        row.policyCounts.delete,
        row.coveredOperations.join(', ') || '-',
        row.failures.length ? `FAIL: ${row.failures.join('; ')}` : (row.warnings.length ? `WARN: ${row.warnings.join('; ')}` : 'OK'),
      ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
    }

    return `${lines.join('\n')}\n`;
  }

  #buildRow(table) {
    const policyCounts = {};
    for (const op of RlsPolicyParser.OPERATIONS) {
      policyCounts[op] = table.policies[op].size;
    }

    const sensitiveColumns = [...table.columns].filter(column =>
      RlsPolicyReport.SENSITIVE_COLUMN_PATTERNS.some(pattern => pattern.test(column)),
    );
    const sensitive = this.#isSensitiveTable(table.table) || sensitiveColumns.length > 0;
    const coverage = this.coverageManifest.tables?.[table.table] || this.coverageManifest.tables?.[table.name] || {};
    const coveredOperations = Array.isArray(coverage.operations) ? coverage.operations : [];
    const coveredSensitiveColumns = Array.isArray(coverage.sensitiveColumns)
      ? coverage.sensitiveColumns
      : [];

    const failures = [];
    const warnings = [];

    const isProjectTable = table.schema === 'public';
    if (isProjectTable && !table.rlsEnabled) failures.push('rls_disabled');
    if (isProjectTable && table.rlsExplicitlyDisabled) failures.push('rls_explicitly_disabled');

    for (const op of RlsPolicyParser.OPERATIONS) {
      if (policyCounts[op] === 0) warnings.push(`missing_${op}_policy`);
    }

    if (sensitive) {
      const missingOps = RlsPolicyParser.OPERATIONS.filter(op => !coveredOperations.includes(op));
      if (missingOps.length > 0) warnings.push(`missing_sensitive_crud_tests:${missingOps.join(',')}`);

      const uncoveredColumns = sensitiveColumns.filter(column => !coveredSensitiveColumns.includes(column));
      if (uncoveredColumns.length > 0) warnings.push(`sensitive_columns_without_tests:${uncoveredColumns.join(',')}`);
    }

    return {
      table: table.table,
      rlsEnabled: table.rlsEnabled,
      rlsExplicitlyDisabled: table.rlsExplicitlyDisabled,
      policyCounts,
      sensitive,
      sensitiveColumns,
      coveredOperations,
      failures,
      warnings,
    };
  }

  #isSensitiveTable(table) {
    return RlsPolicyReport.SENSITIVE_TABLE_PATTERNS.some(pattern => pattern.test(table));
  }
}

class RlsReportCli {
  static run(argv = process.argv.slice(2), cwd = process.cwd()) {
    const migrationsDir = this.#argValue(argv, '--migrations') || path.join(cwd, 'supabase', 'migrations');
    const coverageFile = this.#argValue(argv, '--coverage') || path.join(cwd, 'db', 'rls', 'coverage.json');
    const format = this.#argValue(argv, '--format') || 'markdown';
    const failOnMissingRls = argv.includes('--fail-on-missing-rls');

    const report = RlsPolicyReport.fromMigrations(migrationsDir, coverageFile);
    const output = format === 'json'
      ? `${JSON.stringify(report, null, 2)}\n`
      : RlsPolicyReport.toMarkdown(report);

    process.stdout.write(output);

    if (failOnMissingRls && report.failures.length > 0) {
      process.exitCode = 1;
    }

    return report;
  }

  static #argValue(argv, name) {
    const index = argv.indexOf(name);
    if (index === -1) return null;
    return argv[index + 1] || null;
  }
}

module.exports = {
  RlsMigrationReader,
  RlsSqlNormalizer,
  RlsPolicyParser,
  RlsCoverageManifest,
  RlsPolicyReport,
  RlsReportCli,
};

if (require.main === module) {
  RlsReportCli.run();
}
