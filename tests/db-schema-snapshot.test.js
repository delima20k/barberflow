'use strict';

/**
 * tests/db-schema-snapshot.test.js
 *
 * Testa o SISTEMA de snapshot de schema — não o conteúdo das RPCs,
 * mas a própria infraestrutura que detecta regressões.
 *
 * Cenários cobertos:
 *   SNAP-01  Snapshot é determinístico: mesmas migrations → mesmo SQL e mesmo hash
 *   SNAP-02  Snapshot detecta nova migration adicionada
 *   SNAP-03  Snapshot detecta migration removida
 *   SNAP-04  Hash muda quando qualquer migration muda
 *   SNAP-05  Hash idêntico em duas execuções sem mudança
 *   SNAP-06  Diff detecta função adicionada
 *   SNAP-07  Diff detecta função removida
 *   SNAP-08  Diff detecta mudança de assinatura (parâmetros)
 *   SNAP-09  Diff detecta mudança de tipo de retorno
 *   SNAP-10  Diff report é legível e agrupado por tipo
 *   SNAP-11  Sem divergência → diff.changed = false
 *   SNAP-12  Extração de assinaturas é case-insensitive para keywords SQL
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const os     = require('node:os');
const path   = require('node:path');

const { RpcSignatureParser, SchemaSnapshotGenerator, SchemaDiffer } = require('../scripts/db-rpc-parser');

// ─── Helpers de fixture em memória ───────────────────────────────────────────

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'barberflow-snap-'));
}

function populateMigrations(dir, migrations) {
  for (const [name, sql] of Object.entries(migrations)) {
    fs.writeFileSync(path.join(dir, name), sql, 'utf8');
  }
}

const FN_SIMPLES = `
CREATE OR REPLACE FUNCTION public.fn_teste(
  p_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN p_id::TEXT;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_teste(UUID) TO authenticated;
`;

const FN_TABLE = `
CREATE OR REPLACE FUNCTION public.fn_lista(
  p_limite INT DEFAULT 10
)
RETURNS TABLE (
  id   UUID,
  nome TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, full_name FROM public.profiles LIMIT p_limite;
$$;
GRANT EXECUTE ON FUNCTION public.fn_lista(INT) TO authenticated;
`;

const FN_VOID = `
CREATE OR REPLACE FUNCTION public.fn_void_op(
  p_user_id UUID,
  p_data    JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.logs(user_id, data) VALUES (p_user_id, p_data);
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_void_op(UUID, JSONB) TO authenticated;
`;

// ─── Suite: Determinismo ──────────────────────────────────────────────────────

describe('SNAP — determinismo', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    populateMigrations(dir, {
      '20260101000001_base.sql': FN_SIMPLES,
      '20260101000002_extra.sql': FN_TABLE,
    });
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('SNAP-01 mesmo conjunto de migrations gera sql idêntico em duas execuções', () => {
    const r1 = SchemaSnapshotGenerator.generate(dir);
    const r2 = SchemaSnapshotGenerator.generate(dir);
    assert.equal(r1.sql, r2.sql);
  });

  it('SNAP-05 hash idêntico em duas execuções consecutivas', () => {
    const r1 = SchemaSnapshotGenerator.generate(dir);
    const r2 = SchemaSnapshotGenerator.generate(dir);
    assert.equal(r1.hash, r2.hash);
  });

  it('SNAP-12 arquivos incluídos estão na lista `files`', () => {
    const { files } = SchemaSnapshotGenerator.generate(dir);
    assert.ok(files.includes('20260101000001_base.sql'));
    assert.ok(files.includes('20260101000002_extra.sql'));
  });
});

// ─── Suite: Detecção de mudanças ──────────────────────────────────────────────

describe('SNAP — detecção de mudanças', () => {
  let baseDir;

  before(() => {
    baseDir = tmpDir();
    populateMigrations(baseDir, {
      '20260101000001_base.sql': FN_SIMPLES,
    });
  });

  after(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  it('SNAP-02 snapshot detecta migration adicionada', () => {
    const before = SchemaSnapshotGenerator.generate(baseDir).hash;

    fs.writeFileSync(path.join(baseDir, '20260101000002_nova.sql'), FN_TABLE, 'utf8');
    const after = SchemaSnapshotGenerator.generate(baseDir).hash;

    assert.notEqual(before, after);

    // limpa para não afetar outros testes
    fs.rmSync(path.join(baseDir, '20260101000002_nova.sql'));
  });

  it('SNAP-03 snapshot detecta migration removida', () => {
    const extraDir = tmpDir();
    try {
      populateMigrations(extraDir, {
        '20260101000001_base.sql': FN_SIMPLES,
        '20260101000002_extra.sql': FN_TABLE,
      });

      const hashCom = SchemaSnapshotGenerator.generate(extraDir).hash;
      fs.rmSync(path.join(extraDir, '20260101000002_extra.sql'));
      const hashSem = SchemaSnapshotGenerator.generate(extraDir).hash;

      assert.notEqual(hashCom, hashSem);
    } finally {
      fs.rmSync(extraDir, { recursive: true, force: true });
    }
  });

  it('SNAP-04 hash muda quando conteúdo SQL real de migration muda', () => {
    const altDir = tmpDir();
    try {
      fs.writeFileSync(path.join(altDir, '20260101000001_base.sql'), FN_SIMPLES, 'utf8');
      const h1 = SchemaSnapshotGenerator.generate(altDir).hash;

      // Muda o conteúdo SQL real (não só comentário, que é stripped)
      const modificado = FN_SIMPLES.replace('RETURNS TEXT', 'RETURNS UUID');
      fs.writeFileSync(path.join(altDir, '20260101000001_base.sql'), modificado, 'utf8');
      const h2 = SchemaSnapshotGenerator.generate(altDir).hash;

      assert.notEqual(h1, h2);
    } finally {
      fs.rmSync(altDir, { recursive: true, force: true });
    }
  });
});

// ─── Suite: SchemaDiffer ──────────────────────────────────────────────────────

describe('SNAP — diff legível (SchemaDiffer)', () => {
  it('SNAP-11 sem mudança → changed=false e report indica conformidade', () => {
    const dir = tmpDir();
    try {
      populateMigrations(dir, { '20260101000001_base.sql': FN_SIMPLES });
      const snap = SchemaSnapshotGenerator.generate(dir).sql;
      const result = SchemaDiffer.diff(snap, snap);
      assert.equal(result.changed, false);
      assert.ok(result.report.includes('Nenhuma divergência'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('SNAP-06 diff detecta função adicionada', () => {
    const dir = tmpDir();
    try {
      populateMigrations(dir, { '20260101000001_base.sql': FN_SIMPLES });
      const stored = SchemaSnapshotGenerator.generate(dir).sql;

      fs.writeFileSync(path.join(dir, '20260101000002_extra.sql'), FN_TABLE, 'utf8');
      const current = SchemaSnapshotGenerator.generate(dir).sql;

      const result = SchemaDiffer.diff(stored, current);
      assert.equal(result.changed, true);
      assert.ok(result.groups.functions.added.includes('fn_lista'),
        `Esperava 'fn_lista' em added, obteve: ${JSON.stringify(result.groups.functions.added)}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('SNAP-07 diff detecta função removida', () => {
    const dir = tmpDir();
    try {
      populateMigrations(dir, {
        '20260101000001_base.sql': FN_SIMPLES,
        '20260101000002_extra.sql': FN_TABLE,
      });
      const stored = SchemaSnapshotGenerator.generate(dir).sql;

      fs.rmSync(path.join(dir, '20260101000002_extra.sql'));
      const current = SchemaSnapshotGenerator.generate(dir).sql;

      const result = SchemaDiffer.diff(stored, current);
      assert.equal(result.changed, true);
      assert.ok(result.groups.functions.removed.includes('fn_lista'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('SNAP-08 diff detecta mudança de parâmetros', () => {
    const FN_ALTERADA = FN_SIMPLES.replace('p_id UUID', 'p_id UUID, p_extra TEXT DEFAULT NULL');

    const stored  = FN_SIMPLES;
    const current = FN_ALTERADA;

    const result = SchemaDiffer.diff(stored, current);
    assert.equal(result.changed, true);
    const altered = result.groups.functions.changed.find(c => c.name === 'fn_teste');
    assert.ok(altered, 'Esperava fn_teste na lista changed');
    assert.equal(altered.curr.params.length, 2);
  });

  it('SNAP-09 diff detecta mudança de tipo de retorno', () => {
    const FN_RETORNO_NOVO = FN_SIMPLES.replace('RETURNS TEXT', 'RETURNS UUID');
    const result = SchemaDiffer.diff(FN_SIMPLES, FN_RETORNO_NOVO);
    assert.equal(result.changed, true);
    const altered = result.groups.functions.changed.find(c => c.name === 'fn_teste');
    assert.ok(altered);
    assert.notEqual(altered.prev.returns, altered.curr.returns);
  });

  it('SNAP-10 report é legível e agrupa por tipo de objeto', () => {
    const dir = tmpDir();
    try {
      populateMigrations(dir, { '20260101000001_base.sql': FN_SIMPLES });
      const stored = SchemaSnapshotGenerator.generate(dir).sql;

      fs.writeFileSync(path.join(dir, '20260101000002_extra.sql'), FN_TABLE, 'utf8');
      const current = SchemaSnapshotGenerator.generate(dir).sql;

      const { report } = SchemaDiffer.diff(stored, current);

      // Deve conter cabeçalho e seção de funções
      assert.ok(report.includes('SCHEMA DIFF REPORT'));
      assert.ok(report.includes('FUNÇÕES ADICIONADAS') || report.includes('MIGRATIONS NOVAS'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ─── Suite: RpcSignatureParser ────────────────────────────────────────────────

describe('SNAP — RpcSignatureParser', () => {
  it('extrai nome, params e retorno de função simples', () => {
    const sig = RpcSignatureParser.extract(FN_SIMPLES, 'fn_teste');
    assert.ok(sig, 'Deve retornar assinatura');
    assert.equal(sig.name, 'fn_teste');
    assert.equal(sig.params.length, 1);
    assert.equal(sig.params[0].name, 'p_id');
    assert.equal(sig.params[0].type, 'UUID');
    assert.equal(sig.returns, 'TEXT');
    assert.equal(sig.securityDefiner, true);
    assert.equal(sig.language, 'plpgsql');
  });

  it('extrai params com DEFAULT', () => {
    const sig = RpcSignatureParser.extract(FN_TABLE, 'fn_lista');
    assert.ok(sig);
    assert.equal(sig.params[0].default, '10');
  });

  it('extrai RETURNS TABLE com colunas', () => {
    const sig = RpcSignatureParser.extract(FN_TABLE, 'fn_lista');
    assert.ok(sig);
    assert.equal(sig.returns.type, 'TABLE');
    assert.equal(sig.returns.columns.length, 2);
    assert.equal(sig.returns.columns[0].name, 'id');
    assert.equal(sig.returns.columns[1].name, 'nome');
  });

  it('extrai RETURNS void', () => {
    const sig = RpcSignatureParser.extract(FN_VOID, 'fn_void_op');
    assert.ok(sig);
    assert.equal(sig.returns, 'void');
    assert.equal(sig.params.length, 2);
  });

  it('retorna null para função inexistente', () => {
    const sig = RpcSignatureParser.extract(FN_SIMPLES, 'funcao_que_nao_existe');
    assert.equal(sig, null);
  });

  it('extrai grants do SQL', () => {
    const sig = RpcSignatureParser.extract(FN_SIMPLES, 'fn_teste');
    assert.ok(sig.grants.includes('authenticated'));
  });

  it('CREATE OR REPLACE sobrescreve definição anterior', () => {
    const FN_V1 = FN_SIMPLES;
    const FN_V2 = FN_SIMPLES.replace('p_id UUID', 'p_id UUID, p_extra TEXT DEFAULT NULL');
    const sql = FN_V1 + '\n\n' + FN_V2;

    const sig = RpcSignatureParser.extract(sql, 'fn_teste');
    assert.ok(sig);
    // Deve usar a última definição (V2)
    assert.equal(sig.params.length, 2);
  });

  it('extractAll retorna todas as funções do SQL', () => {
    const sql = FN_SIMPLES + '\n\n' + FN_TABLE + '\n\n' + FN_VOID;
    const all = RpcSignatureParser.extractAll(sql);
    assert.ok(all.fn_teste);
    assert.ok(all.fn_lista);
    assert.ok(all.fn_void_op);
  });
});
