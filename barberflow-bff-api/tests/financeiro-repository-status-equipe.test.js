'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

require.cache[require.resolve('../middlewares/logger')] = {
  exports: {
    logger: {
      error() {},
      warn() {},
    },
  },
};

const FinanceiroRepository = require('../repositories/FinanceiroRepository');

const SHOP_ID = '11111111-1111-4111-8111-111111111111';
const OWNER_ID = '22222222-2222-4222-8222-222222222222';
const PROF_ID = '33333333-3333-4333-8333-333333333333';

class FakeQuery {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.filters = {};
    this.selected = '';
    this.limitValue = null;
    this.single = false;
  }

  select(cols) { this.selected = cols; this.db.selects.push({ table: this.table, cols }); return this; }
  eq(key, value) { this.filters[key] = value; return this; }
  in(key, value) { this.filters[key] = value; return this; }
  gte(key, value) { this.filters[`${key}:gte`] = value; return this; }
  lte(key, value) { this.filters[`${key}:lte`] = value; return this; }
  order() { return this; }
  limit(value) { this.limitValue = value; return this; }
  maybeSingle() { this.single = true; return this; }

  then(resolve, reject) {
    return Promise.resolve(this.#execute()).then(resolve, reject);
  }

  #execute() {
    if (this.table === 'barbershops') {
      return { data: this.db.shop, error: null };
    }

    if (this.table === 'professional_barbershop_presence') {
      const rows = this.db.presencas.filter(row =>
        (!this.filters.barbershop_id || row.barbershop_id === this.filters.barbershop_id)
        && (this.filters.is_available === undefined || row.is_available === this.filters.is_available)
      );
      return { data: rows, error: null };
    }

    if (this.table === 'professional_shop_links') {
      return { data: this.db.links, error: null };
    }

    if (this.table === 'professionals') {
      return {
        data: this.db.profissionais.filter(item => this.filters.id.includes(item.id)),
        error: null,
      };
    }

    if (this.table === 'profiles') {
      return {
        data: this.db.perfis.filter(item => this.filters.id.includes(item.id)),
        error: null,
      };
    }

    if (this.table === 'transactions') {
      this.db.lastTransactionsQuery = this;
      return { data: this.db.transactions, error: null };
    }

    return { data: [], error: null };
  }
}

class FakeDb {
  constructor({ isOpen, presencas }) {
    this.shop = { owner_id: OWNER_ID, is_open: isOpen };
    this.presencas = presencas;
    this.transactions = [];
    this.links = [];
    this.profissionais = [];
    this.perfis = [];
    this.selects = [];
    this.fromCalls = [];
    this.lastTransactionsQuery = null;
  }

  from(table) {
    this.fromCalls.push(table);
    return new FakeQuery(this, table);
  }
}

test('FinanceiroRepository.listarStatusEquipe inclui dono quando barbearia esta aberta', async () => {
  const repo = new FinanceiroRepository(new FakeDb({
    isOpen: true,
    presencas: [
      { barbershop_id: SHOP_ID, professional_id: PROF_ID, is_available: true },
    ],
  }));

  const status = await repo.listarStatusEquipe(SHOP_ID);

  assert.equal(status.online, 2);
  assert.deepEqual(new Set(status.onlineIds), new Set([OWNER_ID, PROF_ID]));
});

test('FinanceiroRepository.listarStatusEquipe nao inclui dono quando barbearia esta fechada', async () => {
  const repo = new FinanceiroRepository(new FakeDb({
    isOpen: false,
    presencas: [
      { barbershop_id: SHOP_ID, professional_id: PROF_ID, is_available: true },
    ],
  }));

  const status = await repo.listarStatusEquipe(SHOP_ID);

  assert.equal(status.online, 1);
  assert.deepEqual(status.onlineIds, [PROF_ID]);
});

test('FinanceiroRepository.listarStatusEquipe nao duplica dono com presenca ativa', async () => {
  const repo = new FinanceiroRepository(new FakeDb({
    isOpen: true,
    presencas: [
      { barbershop_id: SHOP_ID, professional_id: OWNER_ID, is_available: true },
      { barbershop_id: SHOP_ID, professional_id: OWNER_ID, is_available: true },
    ],
  }));

  const status = await repo.listarStatusEquipe(SHOP_ID);

  assert.equal(status.online, 1);
  assert.deepEqual(status.onlineIds, [OWNER_ID]);
});

test('FinanceiroRepository.listarTransacoes filtra receita paga da barbearia e periodo sem SELECT star', async () => {
  const db = new FakeDb({ isOpen: true, presencas: [] });
  const repo = new FinanceiroRepository(db);
  const periodo = {
    inicio: new Date('2026-05-01T00:00:00.000Z'),
    fim: new Date('2026-05-31T23:59:59.999Z'),
  };

  await repo.listarTransacoes(SHOP_ID, periodo);

  const query = db.lastTransactionsQuery;
  assert.equal(query.filters.barbershop_id, SHOP_ID);
  assert.equal(query.filters.type, 'revenue');
  assert.equal(query.filters.status, 'paid');
  assert.equal(query.filters['paid_at:gte'], periodo.inicio.toISOString());
  assert.equal(query.filters['paid_at:lte'], periodo.fim.toISOString());
  assert.notEqual(query.selected, '*');
  assert.equal(query.limitValue, 5000);
});

test('FinanceiroRepository lista 1, 5, 20 e 100 membros com quatro consultas em lote', async () => {
  for (const quantidade of [1, 5, 20, 100]) {
    const db = new FakeDb({ isOpen: true, presencas: [] });
    const ids = Array.from(
      { length: quantidade },
      (_, index) => `prof-${String(index + 1).padStart(3, '0')}`,
    );
    db.shop.owner_id = ids[0];
    db.links = ids.slice(1).map(professionalId => ({
      barbershop_id: SHOP_ID,
      professional_id: professionalId,
      is_active: true,
    }));
    db.profissionais = ids.map(id => ({ id, avatar_path: '', is_active: true }));
    db.perfis = ids.map(id => ({ id, full_name: id, avatar_path: '', is_active: true }));

    const membros = await new FinanceiroRepository(db).listarProfissionais(SHOP_ID);

    assert.equal(membros.length, quantidade);
    assert.deepEqual(
      db.fromCalls,
      ['barbershops', 'professional_shop_links', 'professionals', 'profiles'],
    );
  }
});
