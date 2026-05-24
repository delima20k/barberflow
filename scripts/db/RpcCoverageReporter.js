'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

class RpcCoverageReporter {
  #rootDir;

  constructor(rootDir = process.cwd()) {
    this.#rootDir = rootDir;
  }

  report() {
    const discovered = this.#discoverFunctions();
    const consumed = this.#discoverRpcUsage();
    const executable = this.#discoverAuthenticatedGrants();
    const contracts = this.#readContracts();
    const contracted = new Set(contracts.rpcs.map(item => item.name));
    const rpcs = discovered.filter(item => consumed.has(item.name) || executable.has(item.name));
    const critical = rpcs.filter(item => item.count >= 2 || consumed.has(item.name));
    const missingCritical = critical.filter(item => !contracted.has(item.name));
    const missingAll = rpcs.filter(item => !contracted.has(item.name));

    return {
      ok: missingCritical.length === 0,
      totalDiscovered: discovered.length,
      totalRpcCandidates: rpcs.length,
      totalContracted: contracted.size,
      critical: critical.map(item => item.name).sort(),
      contracted: Array.from(contracted).sort(),
      missingCritical: missingCritical.map(item => item.name).sort(),
      missingAll: missingAll.map(item => item.name).sort(),
    };
  }

  assertNoNewRpcWithoutContract(baseRef = process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'origin/main') {
    const changed = this.#changedMigrationFiles(baseRef);
    if (changed.length === 0) return { ok: true, missing: [] };

    const contracts = new Set(this.#readContracts().rpcs.map(item => item.name));
    const missing = [];
    for (const file of changed) {
      const sql = fs.readFileSync(path.join(this.#rootDir, file), 'utf8');
      for (const name of this.#extractFunctionNames(sql)) {
        if (!contracts.has(name)) missing.push(name);
      }
    }

    return { ok: missing.length === 0, missing: Array.from(new Set(missing)).sort() };
  }

  #discoverFunctions() {
    const counts = new Map();
    const migrationsDir = path.join(this.#rootDir, 'supabase', 'migrations');
    if (!fs.existsSync(migrationsDir)) return [];

    for (const file of fs.readdirSync(migrationsDir).filter(name => name.endsWith('.sql'))) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      for (const name of this.#extractFunctionNames(sql)) {
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    }

    return Array.from(counts, ([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
  }

  #discoverRpcUsage() {
    const files = this.#walkFiles(this.#rootDir)
      .filter(file => /\.(js|ts)$/.test(file))
      .filter(file => !file.includes(`${path.sep}node_modules${path.sep}`));
    const names = new Set();
    const pattern = /\.rpc\(\s*['"`]([a-zA-Z0-9_]+)['"`]/g;

    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      let match;
      while ((match = pattern.exec(source)) !== null) names.add(match[1]);
    }

    return names;
  }

  #discoverAuthenticatedGrants() {
    const names = new Set();
    const migrationsDir = path.join(this.#rootDir, 'supabase', 'migrations');
    if (!fs.existsSync(migrationsDir)) return names;

    const pattern = /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+(?:public\.)?([a-zA-Z0-9_]+)/gi;
    for (const file of fs.readdirSync(migrationsDir).filter(name => name.endsWith('.sql'))) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      let match;
      while ((match = pattern.exec(sql)) !== null) names.add(match[1]);
    }
    return names;
  }

  #readContracts() {
    const file = path.join(this.#rootDir, 'db', 'contracts', 'rpc-contracts.json');
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { rpcs: [] };
  }

  #extractFunctionNames(sql) {
    const names = [];
    const pattern = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-zA-Z0-9_]+)/gi;
    let match;
    while ((match = pattern.exec(sql)) !== null) names.push(match[1]);
    return names;
  }

  #changedMigrationFiles(baseRef) {
    const result = spawnSync('git', ['diff', '--name-only', `${baseRef}...HEAD`, '--', 'supabase/migrations/*.sql'], {
      cwd: this.#rootDir,
      encoding: 'utf8',
    });
    if (result.status !== 0) return [];
    return result.stdout.split(/\r?\n/).filter(Boolean);
  }

  #walkFiles(dir) {
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) files.push(...this.#walkFiles(full));
      else files.push(full);
    }
    return files;
  }
}

module.exports = RpcCoverageReporter;
