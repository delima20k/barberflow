'use strict';

/**
 * tests/db-contracts.test.js
 *
 * Testes de contrato para as RPCs críticas do BarberFlow.
 * Sem conexão ao banco — parseia SQL das migrations e compara com snapshots JSON.
 *
 * Estrutura de cada teste:
 *   a) Setup: lê migration SQL + snapshot JSON de contrato
 *   b) Chamada: extrai assinatura da RPC do SQL
 *   c) Assert: assinatura atual bate exatamente com o snapshot
 *   d) Assert: campos obrigatórios presentes e com tipos corretos
 *   e) Input inválido: campos faltando / tipos errados → erro tipado, nunca silencioso
 *
 * RPCs cobertas:
 *   CONTRACT-01  criar_agendamento_atomico      (CRÍTICA — race condition)
 *   CONTRACT-02  confirmar_presenca_cliente     (CRÍTICA — fluxo de fila)
 *   CONTRACT-03  buscar_perfis_por_nome         (IMPORTANTE — modal)
 *   CONTRACT-04  search_users                   (IMPORTANTE — busca unificada)
 *   CONTRACT-05  get_clientes_favoritos_modal   (IMPORTANTE — favoritos)
 *   CONTRACT-06  get_clientes_favoritos_barbearia (IMPORTANTE — mensalistas)
 *   CONTRACT-07  notificar_barbeiro_chegada     (IMPORTANTE — notificações)
 *
 * Testes de snapshot de output:
 *   SNAP-OUT-01..07  — output esperado comparado com snapshot armazenado
 *
 * Testes de input inválido:
 *   INV-*  — assinatura com parâmetros faltando ou tipos errados → detectado
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const path   = require('node:path');

const { RpcSignatureParser } = require('../scripts/db-rpc-parser');

const ROOT        = path.resolve(__dirname, '..');
const MIGRATIONS  = path.join(ROOT, 'supabase', 'migrations');
const CONTRACTS   = path.join(ROOT, 'db', 'contracts', 'snapshots');

// ─── Utilitários ──────────────────────────────────────────────────────────────

function loadContract(name) {
  const file = path.join(CONTRACTS, `${name}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`Snapshot de contrato não encontrado: ${file}\nCrie o arquivo para documentar esta RPC.`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readAllMigrations() {
  if (!fs.existsSync(MIGRATIONS)) return '';
  return fs.readdirSync(MIGRATIONS)
    .filter(f => /^\d+.*\.sql$/.test(f))
    .sort()
    .map(f => fs.readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    .join('\n');
}

/**
 * Compara a assinatura extraída do SQL com o snapshot JSON.
 * Retorna array de falhas (vazio = OK).
 */
function compareSignature(actual, expected) {
  const failures = [];

  // Nome
  if (actual.name !== expected.name) {
    failures.push(`name: esperado '${expected.name}', obtido '${actual.name}'`);
  }

  // Parâmetros
  if (actual.params.length !== expected.params.length) {
    failures.push(`params.length: esperado ${expected.params.length}, obtido ${actual.params.length}`);
  } else {
    for (let i = 0; i < expected.params.length; i++) {
      const ep = expected.params[i];
      const ap = actual.params[i];
      if (!ap) { failures.push(`params[${i}]: ausente`); continue; }
      if (ap.name !== ep.name) failures.push(`params[${i}].name (${ep.name}): esperado '${ep.name}', obtido '${ap.name}'`);
      if (ap.type !== ep.type) failures.push(`params[${i}].type (${ep.name}): esperado '${ep.type}', obtido '${ap.type}'`);
    }
  }

  // Returns
  const re = JSON.stringify(expected.returns);
  const ra = JSON.stringify(actual.returns);
  if (re !== ra) {
    failures.push(`returns: esperado ${re}, obtido ${ra}`);
  }

  // SECURITY DEFINER
  if (actual.securityDefiner !== expected.securityDefiner) {
    failures.push(`securityDefiner: esperado ${expected.securityDefiner}, obtido ${actual.securityDefiner}`);
  }

  // Language
  if (actual.language !== expected.language) {
    failures.push(`language: esperado '${expected.language}', obtido '${actual.language}'`);
  }

  return failures;
}

// ─── Setup global ─────────────────────────────────────────────────────────────
// Lido de forma síncrona no init do módulo para garantir disponibilidade
// antes de qualquer hook before() de describe() — comportamento seguro em node:test@18+

const allMigrationsSql = (() => {
  const sql = readAllMigrations();
  if (!sql) throw new Error('Nenhuma migration encontrada. Verifique supabase/migrations/');
  return sql;
})();

// ─── CONTRACT-01: criar_agendamento_atomico ───────────────────────────────────

describe('CONTRACT-01 criar_agendamento_atomico', () => {
  const RPC = 'criar_agendamento_atomico';
  let contract, sig;

  before(() => {
    contract = loadContract(RPC);
    sig = RpcSignatureParser.extract(allMigrationsSql, RPC);
  });

  it('RPC existe nas migrations', () => {
    assert.ok(sig, `Função '${RPC}' não encontrada nas migrations`);
  });

  it('assinatura bate com snapshot de contrato', () => {
    const failures = compareSignature(sig, contract.signature);
    assert.equal(failures.length, 0,
      `Contrato violado para '${RPC}':\n  ${failures.join('\n  ')}`);
  });

  it('tem exatamente 8 parâmetros', () => {
    assert.equal(sig.params.length, 8);
  });

  it('p_client_id é UUID obrigatório', () => {
    const p = sig.params.find(p => p.name === 'p_client_id');
    assert.ok(p, 'Parâmetro p_client_id não encontrado');
    assert.equal(p.type, 'UUID');
    assert.equal(p.default, undefined);
  });

  it('p_scheduled_at é TIMESTAMPTZ obrigatório', () => {
    const p = sig.params.find(p => p.name === 'p_scheduled_at');
    assert.ok(p);
    assert.equal(p.type, 'TIMESTAMPTZ');
  });

  it('p_notes é TEXT com DEFAULT NULL', () => {
    const p = sig.params.find(p => p.name === 'p_notes');
    assert.ok(p);
    assert.equal(p.type, 'TEXT');
    assert.ok(p.default !== undefined, 'p_notes deve ter DEFAULT');
  });

  it('retorna SETOF public.appointments', () => {
    assert.equal(sig.returns.type, 'SETOF');
    assert.ok(sig.returns.of.includes('appointments'));
  });

  it('é SECURITY DEFINER', () => {
    assert.equal(sig.securityDefiner, true);
  });

  it('tem GRANT para authenticated', () => {
    assert.ok(sig.grants.includes('authenticated'));
  });

  it('SNAP-OUT-01 output snapshot bate com campos esperados', () => {
    const expectedFields = contract.examples.expectedOutputFields;
    assert.ok(Array.isArray(expectedFields));
    assert.ok(expectedFields.includes('id'));
    assert.ok(expectedFields.includes('status'));
    assert.ok(expectedFields.includes('scheduled_at'));
  });

  it('INV-01 signature sem p_client_id → detectado por parser', () => {
    const sqlSemClientId = `
      CREATE OR REPLACE FUNCTION public.criar_agendamento_atomico(
        p_professional_id UUID,
        p_barbershop_id   UUID,
        p_service_id      UUID,
        p_scheduled_at    TIMESTAMPTZ,
        p_duration_min    INT
      )
      RETURNS SETOF public.appointments
      LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN; END; $$;
    `;
    const sigInvalida = RpcSignatureParser.extract(sqlSemClientId, 'criar_agendamento_atomico');
    // Assinatura diferente do contrato → comparison detecta divergência
    const failures = compareSignature(sigInvalida, contract.signature);
    assert.ok(failures.length > 0, 'Deveria detectar divergência de parâmetros');
  });

  it('INV-02 p_duration_min como TEXT (tipo errado) → detectado por parser', () => {
    const sqlTipoErrado = `
      CREATE OR REPLACE FUNCTION public.criar_agendamento_atomico(
        p_client_id       UUID,
        p_professional_id UUID,
        p_barbershop_id   UUID,
        p_service_id      UUID,
        p_scheduled_at    TIMESTAMPTZ,
        p_duration_min    TEXT,
        p_notes           TEXT DEFAULT NULL,
        p_price_charged   NUMERIC DEFAULT NULL
      )
      RETURNS SETOF public.appointments
      LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN; END; $$;
    `;
    const sigErrada = RpcSignatureParser.extract(sqlTipoErrado, 'criar_agendamento_atomico');
    const failures  = compareSignature(sigErrada, contract.signature);
    assert.ok(failures.some(f => f.includes('p_duration_min')));
  });
});

// ─── CONTRACT-02: confirmar_presenca_cliente ─────────────────────────────────

describe('CONTRACT-02 confirmar_presenca_cliente', () => {
  const RPC = 'confirmar_presenca_cliente';
  let contract, sig;

  before(() => {
    contract = loadContract(RPC);
    sig = RpcSignatureParser.extract(allMigrationsSql, RPC);
  });

  it('RPC existe nas migrations', () => {
    assert.ok(sig, `Função '${RPC}' não encontrada`);
  });

  it('assinatura bate com snapshot de contrato', () => {
    const failures = compareSignature(sig, contract.signature);
    assert.equal(failures.length, 0,
      `Contrato violado:\n  ${failures.join('\n  ')}`);
  });

  it('tem exatamente 3 parâmetros', () => {
    assert.equal(sig.params.length, 3);
  });

  it('p_entry_id é UUID', () => {
    const p = sig.params.find(p => p.name === 'p_entry_id');
    assert.ok(p);
    assert.equal(p.type, 'UUID');
  });

  it('p_confirmado é BOOLEAN', () => {
    const p = sig.params.find(p => p.name === 'p_confirmado');
    assert.ok(p);
    assert.equal(p.type, 'BOOLEAN');
  });

  it('p_grace_used é BOOLEAN', () => {
    const p = sig.params.find(p => p.name === 'p_grace_used');
    assert.ok(p);
    assert.equal(p.type, 'BOOLEAN');
  });

  it('retorna void', () => {
    assert.equal(sig.returns, 'void');
  });

  it('é SECURITY DEFINER', () => {
    assert.equal(sig.securityDefiner, true);
  });

  it('INV-03 signature com p_entry_id como TEXT → detectado', () => {
    const sql = `
      CREATE OR REPLACE FUNCTION public.confirmar_presenca_cliente(
        p_entry_id   TEXT,
        p_confirmado BOOLEAN,
        p_grace_used BOOLEAN
      )
      RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN END; $$;
    `;
    const s = RpcSignatureParser.extract(sql, 'confirmar_presenca_cliente');
    const failures = compareSignature(s, contract.signature);
    assert.ok(failures.some(f => f.includes('p_entry_id')));
  });
});

// ─── CONTRACT-03: buscar_perfis_por_nome ─────────────────────────────────────

describe('CONTRACT-03 buscar_perfis_por_nome', () => {
  const RPC = 'buscar_perfis_por_nome';
  let contract, sig;

  before(() => {
    contract = loadContract(RPC);
    sig = RpcSignatureParser.extract(allMigrationsSql, RPC);
  });

  it('RPC existe nas migrations', () => {
    assert.ok(sig);
  });

  it('assinatura bate com snapshot de contrato', () => {
    const failures = compareSignature(sig, contract.signature);
    assert.equal(failures.length, 0,
      `Contrato violado:\n  ${failures.join('\n  ')}`);
  });

  it('retorna TABLE com 4 colunas: id, full_name, avatar_path, updated_at', () => {
    assert.equal(sig.returns.type, 'TABLE');
    const cols = sig.returns.columns.map(c => c.name);
    assert.ok(cols.includes('id'));
    assert.ok(cols.includes('full_name'));
    assert.ok(cols.includes('avatar_path'));
    assert.ok(cols.includes('updated_at'));
    assert.equal(cols.length, 4);
  });

  it('email NÃO está no output (campo sensível)', () => {
    const cols = sig.returns.columns.map(c => c.name);
    assert.ok(!cols.includes('email'), 'email não deve ser exposto nesta RPC');
  });

  it('p_limite tem DEFAULT', () => {
    const p = sig.params.find(p => p.name === 'p_limite');
    assert.ok(p?.default !== undefined, 'p_limite deve ter DEFAULT');
  });

  it('SNAP-OUT-03 output snapshot tem campos esperados', () => {
    const { expectedOutputFields } = contract.examples;
    assert.deepEqual(expectedOutputFields, ['id', 'full_name', 'avatar_path', 'updated_at']);
  });
});

// ─── CONTRACT-04: search_users ───────────────────────────────────────────────

describe('CONTRACT-04 search_users', () => {
  const RPC = 'search_users';
  let contract, sig;

  before(() => {
    contract = loadContract(RPC);
    sig = RpcSignatureParser.extract(allMigrationsSql, RPC);
  });

  it('RPC existe nas migrations', () => {
    assert.ok(sig);
  });

  it('assinatura bate com snapshot de contrato', () => {
    const failures = compareSignature(sig, contract.signature);
    assert.equal(failures.length, 0,
      `Contrato violado:\n  ${failures.join('\n  ')}`);
  });

  it('retorna TABLE com 8 colunas incluindo total_count', () => {
    assert.equal(sig.returns.type, 'TABLE');
    const cols = sig.returns.columns.map(c => c.name);
    assert.ok(cols.includes('total_count'));
    assert.equal(cols.length, 8);
  });

  it('total_count é BIGINT', () => {
    const col = sig.returns.columns.find(c => c.name === 'total_count');
    assert.ok(col);
    assert.equal(col.type, 'BIGINT');
  });

  it('todos os 4 parâmetros têm DEFAULT', () => {
    for (const param of sig.params) {
      assert.ok(param.default !== undefined,
        `Parâmetro '${param.name}' deve ter DEFAULT em search_users`);
    }
  });

  it('SNAP-OUT-04 output snapshot tem campo total_count', () => {
    const cols = sig.returns.columns.map(c => c.name);
    assert.ok(cols.includes('total_count'));
  });

  it('INV-04 signature sem total_count → detectado', () => {
    const sqlSemTotal = `
      CREATE OR REPLACE FUNCTION public.search_users(
        p_term TEXT DEFAULT NULL, p_role TEXT DEFAULT NULL,
        p_limit INTEGER DEFAULT 20, p_offset INTEGER DEFAULT 0
      )
      RETURNS TABLE (id UUID, full_name TEXT, email TEXT)
      LANGUAGE sql STABLE SECURITY DEFINER AS $$
        SELECT id, full_name, email FROM profiles;
      $$;
    `;
    const s = RpcSignatureParser.extract(sqlSemTotal, 'search_users');
    const failures = compareSignature(s, contract.signature);
    assert.ok(failures.length > 0, 'Deveria detectar que total_count está ausente');
  });
});

// ─── CONTRACT-05: get_clientes_favoritos_modal ───────────────────────────────

describe('CONTRACT-05 get_clientes_favoritos_modal', () => {
  const RPC = 'get_clientes_favoritos_modal';
  let contract, sig;

  before(() => {
    contract = loadContract(RPC);
    sig = RpcSignatureParser.extract(allMigrationsSql, RPC);
  });

  it('RPC existe nas migrations', () => {
    assert.ok(sig);
  });

  it('assinatura bate com snapshot de contrato', () => {
    const failures = compareSignature(sig, contract.signature);
    assert.equal(failures.length, 0,
      `Contrato violado:\n  ${failures.join('\n  ')}`);
  });

  it('aceita 2 UUIDs: p_barbershop_id e p_professional_id', () => {
    assert.equal(sig.params.length, 2);
    assert.equal(sig.params[0].type, 'UUID');
    assert.equal(sig.params[1].type, 'UUID');
  });

  it('retorna TABLE com email (diferente de buscar_perfis_por_nome)', () => {
    const cols = sig.returns.columns.map(c => c.name);
    assert.ok(cols.includes('email'), 'get_clientes_favoritos_modal deve incluir email');
  });

  it('retorna exatamente 5 colunas', () => {
    assert.equal(sig.returns.columns.length, 5);
  });
});

// ─── CONTRACT-06: get_clientes_favoritos_barbearia ───────────────────────────

describe('CONTRACT-06 get_clientes_favoritos_barbearia', () => {
  const RPC = 'get_clientes_favoritos_barbearia';
  let contract, sig;

  before(() => {
    contract = loadContract(RPC);
    sig = RpcSignatureParser.extract(allMigrationsSql, RPC);
  });

  it('RPC existe nas migrations', () => {
    assert.ok(sig);
  });

  it('assinatura bate com snapshot de contrato', () => {
    const failures = compareSignature(sig, contract.signature);
    assert.equal(failures.length, 0,
      `Contrato violado:\n  ${failures.join('\n  ')}`);
  });

  it('aceita apenas 1 parâmetro: p_barbershop_id UUID', () => {
    assert.equal(sig.params.length, 1);
    assert.equal(sig.params[0].name, 'p_barbershop_id');
    assert.equal(sig.params[0].type, 'UUID');
  });

  it('language é sql (não plpgsql)', () => {
    assert.equal(sig.language, 'sql');
  });

  it('output idêntico ao get_clientes_favoritos_modal (mesmas 5 colunas)', () => {
    const modalContract = loadContract('get_clientes_favoritos_modal');
    const expectedCols  = modalContract.signature.returns.columns.map(c => c.name).sort();
    const actualCols    = sig.returns.columns.map(c => c.name).sort();
    assert.deepEqual(actualCols, expectedCols,
      'Ambas RPCs de favoritos devem retornar o mesmo conjunto de colunas');
  });
});

// ─── CONTRACT-07: notificar_barbeiro_chegada ─────────────────────────────────

describe('CONTRACT-07 notificar_barbeiro_chegada', () => {
  const RPC = 'notificar_barbeiro_chegada';
  let contract, sig;

  before(() => {
    contract = loadContract(RPC);
    sig = RpcSignatureParser.extract(allMigrationsSql, RPC);
  });

  it('RPC existe nas migrations', () => {
    assert.ok(sig);
  });

  it('assinatura bate com snapshot de contrato', () => {
    const failures = compareSignature(sig, contract.signature);
    assert.equal(failures.length, 0,
      `Contrato violado:\n  ${failures.join('\n  ')}`);
  });

  it('tem exatamente 5 parâmetros', () => {
    assert.equal(sig.params.length, 5);
  });

  it('p_data é JSONB', () => {
    const p = sig.params.find(p => p.name === 'p_data');
    assert.ok(p);
    assert.equal(p.type, 'JSONB');
  });

  it('retorna void', () => {
    assert.equal(sig.returns, 'void');
  });

  it('é SECURITY DEFINER', () => {
    assert.equal(sig.securityDefiner, true);
  });

  it('INV-05 signature sem p_data → detectado', () => {
    const sql = `
      CREATE OR REPLACE FUNCTION public.notificar_barbeiro_chegada(
        p_professional_id UUID, p_type TEXT, p_title TEXT, p_body TEXT
      )
      RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN END; $$;
    `;
    const s = RpcSignatureParser.extract(sql, 'notificar_barbeiro_chegada');
    const failures = compareSignature(s, contract.signature);
    assert.ok(failures.length > 0);
  });
});

// ─── Suite: Cobertura de contratos ────────────────────────────────────────────

describe('COBERTURA — RPCs críticas têm contrato documentado', () => {
  const CRITICAS = [
    'criar_agendamento_atomico',
    'confirmar_presenca_cliente',
    'buscar_perfis_por_nome',
    'search_users',
    'get_clientes_favoritos_modal',
    'get_clientes_favoritos_barbearia',
    'notificar_barbeiro_chegada',
  ];

  for (const rpc of CRITICAS) {
    it(`${rpc} tem snapshot JSON em db/contracts/snapshots/`, () => {
      const file = path.join(CONTRACTS, `${rpc}.json`);
      assert.ok(fs.existsSync(file), `Snapshot não encontrado: ${file}`);
    });

    it(`${rpc} tem documentação em db/contracts/`, () => {
      const file = path.join(ROOT, 'db', 'contracts', `${rpc}.md`);
      assert.ok(fs.existsSync(file), `Documentação não encontrada: ${file}`);
    });

    it(`${rpc} existe nas migrations atuais`, () => {
      const sig = RpcSignatureParser.extract(allMigrationsSql, rpc);
      assert.ok(sig, `RPC '${rpc}' não encontrada nas migrations — dívida crítica!`);
    });
  }
});
