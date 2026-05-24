'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

class RpcContractTestRunner {
  #rootDir;
  #fetch;

  constructor(rootDir = process.cwd(), fetchImpl = globalThis.fetch) {
    this.#rootDir = rootDir;
    this.#fetch = fetchImpl;
  }

  async runAll() {
    const config = this.#readConfig();
    const results = [];

    for (const contract of config.rpcs) {
      results.push(await this.run(contract));
    }

    const failed = results.filter(item => !item.ok);
    return { ok: failed.length === 0, results, failed };
  }

  async run(contract) {
    if (!this.#canRunDatabaseTests()) {
      this.#assertStaticContract(contract);
      return {
        name: contract.name,
        ok: true,
        skippedLive: true,
        reason: 'set DB_CONTRACT_LIVE=true to execute against Supabase',
      };
    }

    try {
      this.#executeSql(contract.setupSql ?? []);
      const output = await this.#callRpc(contract.name, contract.validInput ?? {});
      this.#assertShape(contract, output);
      this.#assertSnapshot(contract, output);
      this.#executeSql(contract.sideEffectAssertions ?? []);

      for (const invalid of contract.invalidInputs ?? []) {
        await this.#assertInvalidInput(contract.name, invalid);
      }

      return { name: contract.name, ok: true };
    } catch (err) {
      return { name: contract.name, ok: false, error: err.message };
    } finally {
      this.#executeSql(contract.teardownSql ?? [], { ignoreErrors: true });
    }
  }

  compareSnapshot(contract, actualOutput) {
    const snapshot = this.#readSnapshot(contract.name);
    const normalizedActual = this.#stableJson(actualOutput);
    if (snapshot !== normalizedActual) {
      throw new Error(`RPC ${contract.name} output snapshot mismatch`);
    }
    return true;
  }

  #readConfig() {
    const file = path.join(this.#rootDir, 'db', 'contracts', 'rpc-contracts.json');
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  #canRunDatabaseTests() {
    return Boolean(
      process.env.DB_CONTRACT_LIVE === 'true'
      && process.env.DATABASE_URL
      && process.env.SUPABASE_URL
      && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY),
    );
  }

  #assertStaticContract(contract) {
    if (!contract.name || !contract.signature || !contract.doc) {
      throw new Error(`invalid static contract for ${contract.name ?? '(sem nome)'}`);
    }
    const doc = path.join(this.#rootDir, contract.doc);
    if (!fs.existsSync(doc)) throw new Error(`missing contract doc for ${contract.name}`);
    this.#readSnapshot(contract.name);
  }

  async #callRpc(name, body) {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
    const response = await this.#fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`RPC ${name} failed with ${response.status}: ${JSON.stringify(payload)}`);
    return payload;
  }

  #assertShape(contract, output) {
    if (contract.outputKind === 'void') {
      if (output !== null && output !== undefined) throw new Error(`RPC ${contract.name} expected void output`);
      return;
    }

    const sample = Array.isArray(output) ? output[0] : output;
    if (!sample && contract.allowEmptyOutput === true) return;
    if (!sample || typeof sample !== 'object') throw new Error(`RPC ${contract.name} returned empty/non-object output`);

    const expected = contract.expectedFields ?? {};
    const keys = Object.keys(sample).sort();
    const expectedKeys = Object.keys(expected).sort();
    if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
      throw new Error(`RPC ${contract.name} fields mismatch: expected ${expectedKeys.join(',')}, got ${keys.join(',')}`);
    }

    for (const [field, type] of Object.entries(expected)) {
      if (!this.#matchesType(sample[field], type)) {
        throw new Error(`RPC ${contract.name}.${field} expected ${type}, got ${typeof sample[field]}`);
      }
    }
  }

  #assertSnapshot(contract, output) {
    if (process.env.UPDATE_RPC_SNAPSHOTS === '1') {
      this.#writeSnapshot(contract.name, output);
      return;
    }
    this.compareSnapshot(contract, output);
  }

  async #assertInvalidInput(name, invalid) {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
    const response = await this.#fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(invalid.input ?? {}),
    });
    if (response.status >= 500) throw new Error(`RPC ${name} invalid input returned generic 5xx`);
    if (!invalid.allowedStatuses?.includes(response.status)) {
      throw new Error(`RPC ${name} invalid input returned ${response.status}, expected ${invalid.allowedStatuses}`);
    }
  }

  #executeSql(statements, opts = {}) {
    for (const sql of statements) {
      const result = spawnSync('psql', [process.env.DATABASE_URL, '--set', 'ON_ERROR_STOP=1', '--command', sql], {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 10,
      });
      if (result.status !== 0 && !opts.ignoreErrors) throw new Error(result.stderr || result.stdout || 'psql failed');
    }
  }

  #matchesType(value, type) {
    if (value === null) return type.endsWith('?');
    const cleanType = type.replace(/\?$/, '');
    if (cleanType === 'uuid') return typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);
    if (cleanType === 'timestamp') return typeof value === 'string' && !Number.isNaN(Date.parse(value));
    if (cleanType === 'number') return typeof value === 'number';
    if (cleanType === 'boolean') return typeof value === 'boolean';
    if (cleanType === 'object') return typeof value === 'object' && !Array.isArray(value);
    return typeof value === cleanType;
  }

  #readSnapshot(name) {
    const file = path.join(this.#rootDir, 'db', 'contracts', 'snapshots', `${name}.json`);
    return fs.readFileSync(file, 'utf8').trim();
  }

  #writeSnapshot(name, output) {
    const dir = path.join(this.#rootDir, 'db', 'contracts', 'snapshots');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${name}.json`), `${this.#stableJson(output)}\n`, 'utf8');
  }

  #stableJson(value) {
    return JSON.stringify(this.#sortValue(value), null, 2);
  }

  #sortValue(value) {
    if (Array.isArray(value)) return value.map(item => this.#sortValue(item));
    if (!value || typeof value !== 'object') return value;
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = this.#sortValue(value[key]);
      return acc;
    }, {});
  }
}

module.exports = RpcContractTestRunner;
