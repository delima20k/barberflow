'use strict';

// =============================================================
// replication-service.test.js — TDD para ReplicationService.
// Framework: node:test + node:assert/strict (nativo)
//
// Cenários cobertos:
//   registerDownload:
//     1.  fileId inválido (não-UUID) → lança Error{status:400}
//     2.  Insert bem-sucedido → resolve sem lançar
//     3.  DB retorna erro → lança Error{status:500}
//
//   decideStrategy:
//     4.  fileId inválido → lança Error{status:400}
//     5.  count = 0       → R2 (zero demanda)
//     6.  count < LOW     → R2 (baixa demanda)
//     7.  count = LOW     → P2P (fronteira inferior inclusiva)
//     8.  count no meio   → P2P (média demanda)
//     9.  count = HIGH-1  → P2P (justo abaixo da fronteira superior)
//    10.  count = HIGH    → BOTH (fronteira superior inclusiva)
//    11.  count > HIGH    → BOTH (alta demanda)
//    12.  DB retorna erro → lança Error{status:500}
//
//   Escalabilidade (validação de design):
//    13.  LOW_THRESHOLD > 0               — sem limiar negativo/zero
//    14.  HIGH_THRESHOLD > LOW_THRESHOLD  — hierarquia lógica
//    15.  WINDOW_DAYS > 0                 — janela sempre positiva
//    16.  HIGH > LOW garante zona P2P real (evita salto direto R2→BOTH)
//    17.  Arquivo com 0 downloads → R2 (sem custo de P2P desnecessário)
//    18.  Arquivo muito popular   → BOTH (máx disponibilidade)
//    19.  decideStrategy não lança para count nulo (null safety)
// =============================================================

// Fixar thresholds antes de require() para comportamento determinístico
process.env.REPLICATION_WINDOW_DAYS     = '7';
process.env.REPLICATION_LOW_THRESHOLD   = '10';
process.env.REPLICATION_HIGH_THRESHOLD  = '50';

const { describe, it } = require('node:test');
const assert           = require('node:assert/strict');
const { fn }           = require('./_helpers.js');

const ReplicationService = require('../src/services/ReplicationService');

// ─────────────────────────────────────────────────────────────
// Constantes de teste (lidas dos getters estáticos)
// ─────────────────────────────────────────────────────────────
const LOW  = ReplicationService.LOW_THRESHOLD;   // 10
const HIGH = ReplicationService.HIGH_THRESHOLD;  // 50
const WINDOW = ReplicationService.WINDOW_DAYS;   //  7

const UUID_FILE = '00000000-0000-4000-8000-000000000001';

// ─────────────────────────────────────────────────────────────
// Factory — mock do cliente Supabase
//
// Cada chamada a from() retorna um builder thenable.
// O builder suporta as duas chains usadas pelo ReplicationService:
//   INSERT: from(table).insert(row)            → await { error }
//   COUNT:  from(table).select().eq().gte()    → await { count, error }
// ─────────────────────────────────────────────────────────────

/**
 * @param {{ count?: number|null, dbError?: object|null }} opts
 */
function criarMock({ count = 0, dbError = null } = {}) {
  const builder = {
    select: fn(() => builder),
    eq:     fn(() => builder),
    gte:    fn(() => builder),
    insert: fn(() => builder),
    // Thenable: chamado quando o builder é awaited
    then: (resolve) => resolve({ count, error: dbError }),
  };
  const supabase = { from: fn(() => builder) };
  return { supabase, builder };
}

// ─────────────────────────────────────────────────────────────
// Suite: registerDownload()
// ─────────────────────────────────────────────────────────────
describe('ReplicationService.registerDownload()', () => {

  it('fileId não-UUID → lança Error com status 400', async () => {
    const { supabase } = criarMock();
    const svc = new ReplicationService(supabase);
    await assert.rejects(
      () => svc.registerDownload('nao-e-uuid'),
      (err) => {
        assert.equal(err.status, 400);
        return true;
      },
    );
  });

  it('fileId null → lança Error com status 400', async () => {
    const { supabase } = criarMock();
    const svc = new ReplicationService(supabase);
    await assert.rejects(() => svc.registerDownload(null), { status: 400 });
  });

  it('insert bem-sucedido → resolve sem lançar', async () => {
    const { supabase } = criarMock({ dbError: null });
    const svc = new ReplicationService(supabase);
    await assert.doesNotReject(() => svc.registerDownload(UUID_FILE));
  });

  it('insert bem-sucedido → chama from() com nome correto da tabela', async () => {
    const { supabase } = criarMock();
    const svc = new ReplicationService(supabase);
    await svc.registerDownload(UUID_FILE);
    assert.equal(supabase.from.calls.length, 1);
    assert.equal(supabase.from.calls[0][0], 'file_download_events');
  });

  it('insert bem-sucedido → chama insert() com file_id correto', async () => {
    const { supabase, builder } = criarMock();
    const svc = new ReplicationService(supabase);
    await svc.registerDownload(UUID_FILE);
    assert.equal(builder.insert.calls.length, 1);
    const payload = builder.insert.calls[0][0];
    assert.equal(payload.file_id, UUID_FILE);
    assert.ok(typeof payload.downloaded_at === 'string', 'downloaded_at deve ser ISO string');
  });

  it('DB retorna erro → lança Error com status 500', async () => {
    const { supabase } = criarMock({ dbError: { message: 'connection refused' } });
    const svc = new ReplicationService(supabase);
    await assert.rejects(
      () => svc.registerDownload(UUID_FILE),
      (err) => {
        assert.equal(err.status, 500);
        assert.ok(/connection refused/i.test(err.message));
        return true;
      },
    );
  });

});

// ─────────────────────────────────────────────────────────────
// Suite: decideStrategy() — lógica de classificação
// ─────────────────────────────────────────────────────────────
describe('ReplicationService.decideStrategy()', () => {

  it('fileId não-UUID → lança Error com status 400', async () => {
    const { supabase } = criarMock();
    const svc = new ReplicationService(supabase);
    await assert.rejects(() => svc.decideStrategy('invalido'), { status: 400 });
  });

  it('count = 0 → R2 (zero demanda, sem custo de P2P)', async () => {
    const { supabase } = criarMock({ count: 0 });
    const svc = new ReplicationService(supabase);
    assert.equal(await svc.decideStrategy(UUID_FILE), 'R2');
  });

  it(`count = ${LOW - 1} (< LOW) → R2 (baixa demanda)`, async () => {
    const { supabase } = criarMock({ count: LOW - 1 });
    const svc = new ReplicationService(supabase);
    assert.equal(await svc.decideStrategy(UUID_FILE), 'R2');
  });

  it(`count = ${LOW} (= LOW, fronteira inclusiva) → P2P`, async () => {
    const { supabase } = criarMock({ count: LOW });
    const svc = new ReplicationService(supabase);
    assert.equal(await svc.decideStrategy(UUID_FILE), 'P2P');
  });

  it(`count = ${Math.floor((LOW + HIGH) / 2)} (meio do range) → P2P`, async () => {
    const mid = Math.floor((LOW + HIGH) / 2);
    const { supabase } = criarMock({ count: mid });
    const svc = new ReplicationService(supabase);
    assert.equal(await svc.decideStrategy(UUID_FILE), 'P2P');
  });

  it(`count = ${HIGH - 1} (= HIGH-1, justo abaixo) → P2P`, async () => {
    const { supabase } = criarMock({ count: HIGH - 1 });
    const svc = new ReplicationService(supabase);
    assert.equal(await svc.decideStrategy(UUID_FILE), 'P2P');
  });

  it(`count = ${HIGH} (= HIGH, fronteira inclusiva) → BOTH`, async () => {
    const { supabase } = criarMock({ count: HIGH });
    const svc = new ReplicationService(supabase);
    assert.equal(await svc.decideStrategy(UUID_FILE), 'BOTH');
  });

  it(`count = ${HIGH * 4} (alta demanda) → BOTH`, async () => {
    const { supabase } = criarMock({ count: HIGH * 4 });
    const svc = new ReplicationService(supabase);
    assert.equal(await svc.decideStrategy(UUID_FILE), 'BOTH');
  });

  it('DB retorna erro → lança Error com status 500', async () => {
    const { supabase } = criarMock({ dbError: { message: 'timeout' } });
    const svc = new ReplicationService(supabase);
    await assert.rejects(
      () => svc.decideStrategy(UUID_FILE),
      (err) => {
        assert.equal(err.status, 500);
        assert.ok(/timeout/i.test(err.message));
        return true;
      },
    );
  });

  it('count null (retorno inesperado do DB) → trata como 0 → R2', async () => {
    const { supabase } = criarMock({ count: null });
    const svc = new ReplicationService(supabase);
    // null ?? 0 → R2; não deve lançar
    assert.equal(await svc.decideStrategy(UUID_FILE), 'R2');
  });

  it('decideStrategy passa janela de tempo correta ao query', async () => {
    const { supabase, builder } = criarMock({ count: 0 });
    const svc  = new ReplicationService(supabase);
    const ante = new Date();
    await svc.decideStrategy(UUID_FILE);
    const post = new Date();

    assert.equal(builder.gte.calls.length, 1, 'gte() deve ser chamado uma vez');

    const [campo, isoStr] = builder.gte.calls[0];
    assert.equal(campo, 'downloaded_at');

    const windowDate = new Date(isoStr);
    const expectedStart = new Date(ante);
    expectedStart.setDate(expectedStart.getDate() - WINDOW);
    const expectedEnd   = new Date(post);
    expectedEnd.setDate(expectedEnd.getDate() - WINDOW);

    assert.ok(
      windowDate >= expectedStart && windowDate <= expectedEnd,
      `windowStart deve estar ${WINDOW} dias atrás (foi: ${isoStr})`,
    );
  });

});

// ─────────────────────────────────────────────────────────────
// Suite: Escalabilidade — validação de design
// ─────────────────────────────────────────────────────────────
describe('ReplicationService — escalabilidade e thresholds', () => {

  it('LOW_THRESHOLD > 0 — sem limite negativo ou zero', () => {
    assert.ok(LOW > 0, `LOW_THRESHOLD deve ser > 0, foi ${LOW}`);
  });

  it('HIGH_THRESHOLD > LOW_THRESHOLD — hierarquia lógica de estratégias', () => {
    assert.ok(HIGH > LOW, `HIGH (${HIGH}) deve ser > LOW (${LOW})`);
  });

  it('WINDOW_DAYS > 0 — janela de tempo sempre positiva', () => {
    assert.ok(WINDOW > 0, `WINDOW_DAYS deve ser > 0, foi ${WINDOW}`);
  });

  it('zona P2P real: HIGH - LOW >= 1 — evita salto direto R2 → BOTH', () => {
    assert.ok(
      HIGH - LOW >= 1,
      `Deve existir ao menos um valor de count que retorna P2P. HIGH=${HIGH}, LOW=${LOW}`,
    );
  });

  it('arquivo zero downloads → R2 (sem custo de P2P desnecessário)', async () => {
    const { supabase } = criarMock({ count: 0 });
    const svc = new ReplicationService(supabase);
    assert.equal(await svc.decideStrategy(UUID_FILE), 'R2',
      'Arquivo não baixado nunca deve usar apenas R2 — P2P seria custo de seed sem benefício');
  });

  it('arquivo muito popular (10× HIGH) → BOTH — máxima disponibilidade', async () => {
    const { supabase } = criarMock({ count: HIGH * 10 });
    const svc = new ReplicationService(supabase);
    assert.equal(await svc.decideStrategy(UUID_FILE), 'BOTH',
      'Volume muito alto exige redundância P2P+R2 para garantir SLA');
  });

  it('fronteiras são determinísticas — mesma contagem sempre retorna mesmo resultado', async () => {
    const cenarios = [
      { count: 0,        esperado: 'R2'   },
      { count: LOW - 1,  esperado: 'R2'   },
      { count: LOW,      esperado: 'P2P'  },
      { count: HIGH - 1, esperado: 'P2P'  },
      { count: HIGH,     esperado: 'BOTH' },
    ];

    for (const { count, esperado } of cenarios) {
      const { supabase } = criarMock({ count });
      const svc = new ReplicationService(supabase);
      const resultado = await svc.decideStrategy(UUID_FILE);
      assert.equal(
        resultado, esperado,
        `count=${count} deve retornar '${esperado}', retornou '${resultado}'`,
      );
    }
  });

  it('múltiplos registerDownload independentes — sem estado compartilhado entre chamadas', async () => {
    const { supabase, builder } = criarMock();
    const svc = new ReplicationService(supabase);
    await svc.registerDownload(UUID_FILE);
    await svc.registerDownload(UUID_FILE);
    await svc.registerDownload(UUID_FILE);
    // 3 chamadas a from() → 3 inserts independentes (sem batch silencioso)
    assert.equal(supabase.from.calls.length, 3);
    assert.equal(builder.insert.calls.length, 3);
  });

  it('thresholds estáticos são acessíveis sem instância — util para docs e integração', () => {
    assert.equal(typeof ReplicationService.LOW_THRESHOLD,  'number');
    assert.equal(typeof ReplicationService.HIGH_THRESHOLD, 'number');
    assert.equal(typeof ReplicationService.WINDOW_DAYS,    'number');
  });

});
