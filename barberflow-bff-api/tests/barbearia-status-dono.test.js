'use strict';

// =============================================================
// barbearia-status-dono.test.js
//
// Cobre o toggle Ativo/Inativo do DONO na presença operacional:
//   - atualizarMeuStatusBarbeiro aceita o dono (sem vínculo em
//     professional_shop_links) e mantém 403 para não-vinculado comum.
//   - listarStatusBarbeiros inclui o dono; default do dono sem linha
//     de presença = ATIVO; parceiro sem linha segue INATIVO.
//   - ehDonoDaBarbearia true/false.
// =============================================================

const assert = require('node:assert/strict');
const test = require('node:test');

require.cache[require.resolve('../middlewares/logger')] = {
  exports: {
    logger: {
      error() {},
      warn() {},
      info() {},
    },
  },
};

const BarbeariaRepository = require('../repositories/BarbeariaRepository');

const SHOP_ID  = '11111111-1111-4111-8111-111111111111';
const OWNER_ID = '22222222-2222-4222-8222-222222222222';
const PROF_ID  = '33333333-3333-4333-8333-333333333333';
const OUTRO_ID = '44444444-4444-4444-8444-444444444444';

// ─── Fake do cliente Supabase (thenable, padrão dos testes BFF) ───────────────

class FakeQuery {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.filters = {};
    this.inFilters = {};
    this.singleRow = false;
    this.upsertPayload = null;
  }

  select() { return this; }
  eq(key, value) { this.filters[key] = value; return this; }
  in(key, values) { this.inFilters[key] = values; return this; }
  maybeSingle() { this.singleRow = true; return this; }
  single() { this.singleRow = true; return this; }
  upsert(payload) { this.upsertPayload = payload; this.db.upserts.push({ table: this.table, payload }); return this; }

  then(resolve, reject) {
    return Promise.resolve(this.#execute()).then(resolve, reject);
  }

  #execute() {
    if (this.upsertPayload) {
      // upsert(...).select(...).single() → devolve a linha gravada
      return { data: { ...this.upsertPayload }, error: null };
    }

    if (this.table === 'barbershops') {
      return { data: this.db.shop, error: null };
    }

    if (this.table === 'professional_shop_links') {
      const rows = this.db.links.filter(row =>
        (!this.filters.barbershop_id || row.barbershop_id === this.filters.barbershop_id)
        && (!this.filters.professional_id || row.professional_id === this.filters.professional_id)
        && (this.filters.is_active === undefined || row.is_active === this.filters.is_active)
      );
      return this.singleRow
        ? { data: rows[0] ?? null, error: null }
        : { data: rows, error: null };
    }

    if (this.table === 'profiles') {
      const ids = this.inFilters.id ?? [];
      return { data: this.db.perfis.filter(p => ids.includes(p.id)), error: null };
    }

    if (this.table === 'professional_barbershop_presence') {
      const ids = this.inFilters.professional_id ?? null;
      const rows = this.db.presencas.filter(row =>
        (!this.filters.barbershop_id || row.barbershop_id === this.filters.barbershop_id)
        && (!ids || ids.includes(row.professional_id))
      );
      return { data: rows, error: null };
    }

    return { data: this.singleRow ? null : [], error: null };
  }
}

class FakeDb {
  constructor({ links = [], presencas = [], perfis = [] } = {}) {
    this.shop = { owner_id: OWNER_ID };
    this.links = links;
    this.presencas = presencas;
    this.perfis = perfis;
    this.upserts = [];
  }

  from(table) {
    return new FakeQuery(this, table);
  }
}

// ─── atualizarMeuStatusBarbeiro ───────────────────────────────────────────────

test('dono sem vinculo consegue atualizar a propria presenca (upsert ok)', async () => {
  const db = new FakeDb({ links: [] }); // dono NÃO tem linha em professional_shop_links
  const repo = new BarbeariaRepository(db);

  const row = await repo.atualizarMeuStatusBarbeiro(SHOP_ID, OWNER_ID, false);

  assert.equal(db.upserts.length, 1, 'deve gravar a presença do dono');
  assert.equal(db.upserts[0].payload.professional_id, OWNER_ID);
  assert.equal(db.upserts[0].payload.is_available, false);
  assert.equal(row.is_available, false);
});

test('nao-dono sem vinculo continua bloqueado (403)', async () => {
  const db = new FakeDb({ links: [] });
  const repo = new BarbeariaRepository(db);

  await assert.rejects(
    () => repo.atualizarMeuStatusBarbeiro(SHOP_ID, OUTRO_ID, true),
    (err) => err.status === 403,
    'sem vínculo e sem ser dono → forbidden',
  );
  assert.equal(db.upserts.length, 0, 'não deve gravar nada');
});

test('parceiro com vinculo ativo segue funcionando (regressao)', async () => {
  const db = new FakeDb({
    links: [{ barbershop_id: SHOP_ID, professional_id: PROF_ID, is_active: true }],
  });
  const repo = new BarbeariaRepository(db);

  const row = await repo.atualizarMeuStatusBarbeiro(SHOP_ID, PROF_ID, true);

  assert.equal(db.upserts.length, 1);
  assert.equal(row.professional_id, PROF_ID);
  assert.equal(row.is_available, true);
});

// ─── ehDonoDaBarbearia ────────────────────────────────────────────────────────

test('ehDonoDaBarbearia: true para owner_id, false para terceiros', async () => {
  const repo = new BarbeariaRepository(new FakeDb());
  assert.equal(await repo.ehDonoDaBarbearia(SHOP_ID, OWNER_ID), true);
  assert.equal(await repo.ehDonoDaBarbearia(SHOP_ID, OUTRO_ID), false);
});

// ─── listarStatusBarbeiros ────────────────────────────────────────────────────

test('listarStatusBarbeiros inclui o dono com default ATIVO (sem linha de presenca)', async () => {
  const db = new FakeDb({
    links: [{ barbershop_id: SHOP_ID, professional_id: PROF_ID, is_active: true }],
    presencas: [], // ninguém tem linha
    perfis: [
      { id: OWNER_ID, full_name: 'Dono' },
      { id: PROF_ID, full_name: 'Parceiro' },
    ],
  });
  const repo = new BarbeariaRepository(db);

  const lista = await repo.listarStatusBarbeiros(SHOP_ID);
  const dono = lista.find(item => item.professional_id === OWNER_ID);
  const parceiro = lista.find(item => item.professional_id === PROF_ID);

  assert.ok(dono, 'dono deve entrar na listagem');
  assert.equal(dono.is_available, true, 'dono sem linha = ATIVO (default)');
  assert.ok(parceiro, 'parceiro segue na listagem');
  assert.equal(parceiro.is_available, false, 'parceiro sem linha = INATIVO (semântica original)');
});

test('listarStatusBarbeiros respeita a linha do dono quando existe (Inativo persiste)', async () => {
  const db = new FakeDb({
    links: [],
    presencas: [{ barbershop_id: SHOP_ID, professional_id: OWNER_ID, is_available: false }],
    perfis: [{ id: OWNER_ID, full_name: 'Dono' }],
  });
  const repo = new BarbeariaRepository(db);

  const lista = await repo.listarStatusBarbeiros(SHOP_ID);
  const dono = lista.find(item => item.professional_id === OWNER_ID);

  assert.ok(dono);
  assert.equal(dono.is_available, false, 'linha gravada com false vence o default');
});

test('listarStatusBarbeiros retorna so o dono quando nao ha vinculados', async () => {
  const db = new FakeDb({
    links: [],
    presencas: [],
    perfis: [{ id: OWNER_ID, full_name: 'Dono' }],
  });
  const repo = new BarbeariaRepository(db);

  const lista = await repo.listarStatusBarbeiros(SHOP_ID);

  assert.equal(lista.length, 1, 'barbearia sem parceiros ainda lista o dono');
  assert.equal(lista[0].professional_id, OWNER_ID);
  assert.equal(lista[0].is_available, true);
});
