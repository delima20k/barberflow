'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SchemaSnapshotService = require('../scripts/db/SchemaSnapshotService');
const RpcContractTestRunner = require('../scripts/db/RpcContractTestRunner');

class TempWorkspace {
  #dir;

  constructor() {
    this.#dir = fs.mkdtempSync(path.join(os.tmpdir(), 'barberflow-db-contract-'));
  }

  get dir() {
    return this.#dir;
  }

  write(relativePath, content) {
    const file = path.join(this.#dir, relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, 'utf8');
  }
}

describe('SchemaSnapshotService', () => {
  it('deve gerar output deterministico ao normalizar duas vezes o mesmo schema em ordens diferentes', () => {
    const service = new SchemaSnapshotService();
    const schemaA = `
      CREATE TABLE public.b (id uuid);
      CREATE TABLE public.a (id uuid);
      CREATE OR REPLACE FUNCTION public.z() RETURNS void LANGUAGE sql AS $$ SELECT 1; $$;
    `;
    const schemaB = `
      -- comentario removido
      CREATE OR REPLACE FUNCTION public.z() RETURNS void LANGUAGE sql AS $$ SELECT 1; $$;
      CREATE TABLE public.a (id uuid);
      CREATE TABLE public.b (id uuid);
    `;

    assert.strictEqual(service.normalize(schemaA), service.normalize(schemaB));
  });

  it('deve detectar diff legivel quando uma RPC muda', () => {
    const service = new SchemaSnapshotService();
    const expected = service.normalize(`
      CREATE OR REPLACE FUNCTION public.search_users(p_limit integer)
      RETURNS TABLE (id uuid)
      LANGUAGE sql AS $$ SELECT null::uuid AS id; $$;
    `);
    const actual = service.normalize(`
      CREATE OR REPLACE FUNCTION public.search_users(p_limit integer)
      RETURNS TABLE (id uuid, full_name text)
      LANGUAGE sql AS $$ SELECT null::uuid AS id, ''::text AS full_name; $$;
    `);

    const diff = service.buildReadableDiff(expected, actual);

    assert.equal(diff.changes, 1);
    assert.match(diff.text, /FUNCTIONS/);
    assert.match(diff.text, /CHANGED public\.search_users/);
  });
});

describe('RpcContractTestRunner', () => {
  it('deve falhar quando output da RPC diverge do snapshot salvo', () => {
    const workspace = new TempWorkspace();
    workspace.write('db/contracts/snapshots/search_users.json', '[\n  {\n    "id": "old"\n  }\n]\n');
    const runner = new RpcContractTestRunner(workspace.dir, async () => ({}));

    assert.throws(
      () => runner.compareSnapshot({ name: 'search_users' }, [{ id: 'new' }]),
      /snapshot mismatch/,
    );
  });
});
