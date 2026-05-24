'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

class SchemaSnapshotService {
  static SNAPSHOT_PATH = path.join('db', 'snapshots', 'schema-current.sql');
  static HASH_PATH = path.join('db', 'snapshots', 'schema-current.hash');

  #rootDir;

  constructor(rootDir = process.cwd()) {
    this.#rootDir = rootDir;
  }

  normalize(rawSql) {
    let current = this.#normalizeOnce(rawSql);
    for (let i = 0; i < 3; i += 1) {
      const next = this.#normalizeOnce(current);
      if (next === current) return current;
      current = next;
    }
    return current;
  }

  #normalizeOnce(rawSql) {
    const withoutNoise = String(rawSql ?? '')
      .replace(/\r\n/g, '\n')
      .replace(/^\s*--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^SET\s+[^;]+;/gim, '')
      .replace(/^SELECT\s+pg_catalog\.set_config\([^;]+;/gim, '')
      .replace(/^ALTER\s+[^;]+\s+OWNER\s+TO\s+[^;]+;/gim, '')
      .replace(/^REVOKE\s+ALL\s+ON\s+SCHEMA\s+public\s+FROM\s+PUBLIC;/gim, '')
      .replace(/\n{2,}/g, '\n')
      .trim();

    const statements = this.#splitStatements(withoutNoise)
      .map(sql => sql.replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim())
      .filter(Boolean)
      .map(sql => sql.endsWith(';') ? sql : `${sql};`);

    return statements
      .sort((a, b) => this.#sortKey(a).localeCompare(this.#sortKey(b)))
      .join('\n\n')
      .concat('\n');
  }

  hash(normalizedSql) {
    return crypto.createHash('sha256').update(String(normalizedSql ?? ''), 'utf8').digest('hex');
  }

  buildReadableDiff(expectedSql, actualSql) {
    const expected = this.#groupByObject(expectedSql);
    const actual = this.#groupByObject(actualSql);
    const types = Array.from(new Set([...Object.keys(expected), ...Object.keys(actual)])).sort();
    const lines = ['# Schema Diff', ''];
    let changes = 0;

    for (const type of types) {
      const expectedObjects = expected[type] ?? new Map();
      const actualObjects = actual[type] ?? new Map();
      const names = Array.from(new Set([...expectedObjects.keys(), ...actualObjects.keys()])).sort();
      const section = [];

      for (const name of names) {
        const oldSql = expectedObjects.get(name);
        const newSql = actualObjects.get(name);
        if (oldSql === newSql) continue;
        changes += 1;
        if (!oldSql) section.push(`- ADDED ${name}`);
        else if (!newSql) section.push(`- REMOVED ${name}`);
        else section.push(`- CHANGED ${name}`);
      }

      if (section.length > 0) {
        lines.push(`## ${type}`);
        lines.push(...section, '');
      }
    }

    if (changes === 0) lines.push('No schema drift detected.');
    return { changes, text: lines.join('\n').trimEnd().concat('\n') };
  }

  readSnapshot() {
    const file = path.join(this.#rootDir, SchemaSnapshotService.SNAPSHOT_PATH);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  }

  writeSnapshot(normalizedSql) {
    const snapshotPath = path.join(this.#rootDir, SchemaSnapshotService.SNAPSHOT_PATH);
    const hashPath = path.join(this.#rootDir, SchemaSnapshotService.HASH_PATH);
    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
    fs.writeFileSync(snapshotPath, normalizedSql, 'utf8');
    fs.writeFileSync(hashPath, `${this.hash(normalizedSql)}\n`, 'utf8');
  }

  dumpSchema() {
    const dumpFile = process.env.SCHEMA_DUMP_FILE;
    if (dumpFile) return fs.readFileSync(path.resolve(this.#rootDir, dumpFile), 'utf8');

    const databaseUrl = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;
    if (!databaseUrl) return this.#readMigrationsAsBootstrapSchema();

    const result = spawnSync('pg_dump', [
      '--schema-only',
      '--no-owner',
      '--no-privileges',
      '--if-exists',
      databaseUrl,
    ], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 50 });

    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr || 'pg_dump failed');
    return result.stdout;
  }

  generate() {
    const normalized = this.normalize(this.dumpSchema());
    this.writeSnapshot(normalized);
    return { hash: this.hash(normalized), bytes: Buffer.byteLength(normalized) };
  }

  check() {
    const expected = this.normalize(this.readSnapshot());
    const actual = this.normalize(this.dumpSchema());
    const diff = this.buildReadableDiff(expected, actual);
    return {
      ok: diff.changes === 0,
      expectedHash: this.hash(expected),
      actualHash: this.hash(actual),
      diff,
    };
  }

  #readMigrationsAsBootstrapSchema() {
    const dir = path.join(this.#rootDir, 'supabase', 'migrations');
    if (!fs.existsSync(dir)) return '';
    return fs.readdirSync(dir)
      .filter(file => file.endsWith('.sql'))
      .sort()
      .map(file => fs.readFileSync(path.join(dir, file), 'utf8'))
      .join('\n\n');
  }

  #splitStatements(sql) {
    const statements = [];
    let current = '';
    let quote = null;
    let dollarTag = null;

    for (let i = 0; i < sql.length; i += 1) {
      const char = sql[i];
      const rest = sql.slice(i);
      current += char;

      if (dollarTag) {
        if (rest.startsWith(dollarTag) && i !== 0) {
          current += sql.slice(i + 1, i + dollarTag.length);
          i += dollarTag.length - 1;
          dollarTag = null;
        }
        continue;
      }

      if (quote) {
        if (char === quote && sql[i - 1] !== '\\') quote = null;
        continue;
      }

      const dollar = rest.match(/^\$[A-Za-z0-9_]*\$/);
      if (dollar) {
        dollarTag = dollar[0];
        current += sql.slice(i + 1, i + dollarTag.length);
        i += dollarTag.length - 1;
        continue;
      }

      if (char === '\'' || char === '"') {
        quote = char;
        continue;
      }

      if (char === ';') {
        statements.push(current.trim());
        current = '';
      }
    }

    if (current.trim()) statements.push(current.trim());
    return statements;
  }

  #sortKey(sql) {
    const type = this.#objectType(sql);
    const name = this.#objectName(sql);
    return `${type}:${name}:${sql}`;
  }

  #groupByObject(sql) {
    const grouped = {};
    for (const statement of this.#splitStatements(this.normalize(sql))) {
      const type = this.#objectType(statement);
      const name = this.#objectName(statement);
      grouped[type] ??= new Map();
      grouped[type].set(name, statement);
    }
    return grouped;
  }

  #objectType(sql) {
    const normalized = sql.trim().toUpperCase();
    if (normalized.startsWith('CREATE OR REPLACE FUNCTION') || normalized.startsWith('CREATE FUNCTION')) return 'FUNCTIONS';
    if (normalized.startsWith('CREATE TABLE') || normalized.startsWith('ALTER TABLE')) return 'TABLES';
    if (normalized.startsWith('CREATE INDEX') || normalized.startsWith('CREATE UNIQUE INDEX')) return 'INDEXES';
    if (normalized.startsWith('CREATE POLICY') || normalized.startsWith('DROP POLICY')) return 'POLICIES';
    if (normalized.startsWith('CREATE TRIGGER') || normalized.startsWith('DROP TRIGGER')) return 'TRIGGERS';
    if (normalized.startsWith('CREATE EXTENSION')) return 'EXTENSIONS';
    if (normalized.startsWith('GRANT') || normalized.startsWith('REVOKE')) return 'GRANTS';
    return 'OTHER';
  }

  #objectName(sql) {
    const patterns = [
      /FUNCTION\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)/i,
      /TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)/i,
      /INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)/i,
      /POLICY\s+(?:"([^"]+)"|([^\s]+))/i,
      /TRIGGER\s+(?:IF\s+EXISTS\s+)?([^\s]+)/i,
      /EXTENSION\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s;]+)/i,
    ];

    for (const pattern of patterns) {
      const match = sql.match(pattern);
      if (match) return (match[1] ?? match[2]).replace(/;$/, '');
    }

    return crypto.createHash('sha1').update(sql).digest('hex').slice(0, 12);
  }
}

module.exports = SchemaSnapshotService;
