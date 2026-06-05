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
    this.single = false;
  }

  select() { return this; }
  eq(key, value) { this.filters[key] = value; return this; }
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

    return { data: [], error: null };
  }
}

class FakeDb {
  constructor({ isOpen, presencas }) {
    this.shop = { owner_id: OWNER_ID, is_open: isOpen };
    this.presencas = presencas;
  }

  from(table) {
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
