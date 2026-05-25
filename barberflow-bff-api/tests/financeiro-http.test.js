'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { after, before, suite, test } = require('node:test');
const jwt = require('jsonwebtoken');

process.env.APP_ENV = 'test';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_JWT_SECRET = 'financeiro-test-secret';

const criarApp = require('../app');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const SHOP_ID = '22222222-2222-4222-8222-222222222222';
const PROF_ID = '33333333-3333-4333-8333-333333333333';

class FakeQuery {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.filters = {};
    this.single = false;
  }

  select() { return this; }
  order() { return this; }
  limit() { return this; }
  or() { return this; }
  gte(key, value) { this.filters[`${key}:gte`] = value; return this; }
  lte(key, value) { this.filters[`${key}:lte`] = value; return this; }
  is(key, value) { this.filters[key] = value; return this; }
  in(key, value) { this.filters[key] = value; return this; }
  eq(key, value) { this.filters[key] = value; return this; }
  maybeSingle() { this.single = true; return this; }

  then(resolve, reject) {
    return Promise.resolve(this.#execute()).then(resolve, reject);
  }

  #execute() {
    if (this.table === 'barbershops') {
      const shop = { id: SHOP_ID, owner_id: this.db.forbidden ? '99999999-9999-4999-8999-999999999999' : USER_ID, is_active: true };
      return { data: this.single ? shop : [shop], error: null };
    }

    if (this.table === 'professional_shop_links') {
      if (this.filters.professional_id) {
        const link = this.db.forbidden ? null : { professional_id: USER_ID, barbershop_id: SHOP_ID, is_active: true };
        return { data: this.single ? link : (link ? [link] : []), error: null };
      }
      return { data: [{ professional_id: PROF_ID, is_active: true }], error: null };
    }

    if (this.table === 'transactions') {
      const items = [{
        id: '44444444-4444-4444-8444-444444444444',
        barbershop_id: SHOP_ID,
        professional_id: PROF_ID,
        gross_amount: 500,
        amount: 480,
        payment_method: 'credito',
        status: 'paid',
        type: 'revenue',
        paid_at: '2026-05-20T12:00:00.000Z',
        created_at: '2026-05-20T12:00:00.000Z',
      }];
      return { data: items.filter(item => !this.filters.professional_id || item.professional_id === this.filters.professional_id), error: null };
    }

    if (this.table === 'agreements') {
      return { data: [{ professional_id: PROF_ID, barbershop_id: SHOP_ID, type: 'percentage', value: 40, is_active: true }], error: null };
    }

    if (this.table === 'professionals') {
      return { data: [{ id: PROF_ID, avatar_path: '', is_active: true }], error: null };
    }

    if (this.table === 'profiles') {
      return { data: [{ id: PROF_ID, full_name: 'Joao Premium', avatar_path: '', is_active: true }], error: null };
    }

    if (this.table === 'attendance_sessions') {
      return { data: [{ professional_id: PROF_ID, finished_at: null, chair: { barbershop_id: SHOP_ID } }], error: null };
    }

    return { data: [], error: null };
  }
}

class FakeDb {
  constructor({ forbidden = false } = {}) {
    this.forbidden = forbidden;
    this.rpcCalls = [];
  }

  from(table) {
    return new FakeQuery(this, table);
  }

  async rpc(name, payload) {
    this.rpcCalls.push({ name, payload });
    return { data: { updated: 2 }, error: null };
  }
}

function token() {
  return jwt.sign({ sub: USER_ID, email: 'teste@barberflow.local' }, process.env.SUPABASE_JWT_SECRET, { algorithm: 'HS256' });
}

function request(port, method, path, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: { 'Content-Type': 'application/json', ...opts.headers },
    }, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, body }); }
      });
    });
    req.on('error', reject);
    if (opts.body) req.write(JSON.stringify(opts.body));
    req.end();
  });
}

suite('Financeiro BFF HTTP', () => {
  let server;
  let port;
  let fakeDb;

  before(async () => {
    fakeDb = new FakeDb();
    const app = criarApp(fakeDb);
    await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    port = server.address().port;
  });

  after(async () => {
    await new Promise((resolve, reject) => server.close(err => (err ? reject(err) : resolve())));
  });

  test('GET /dashboard retorna 401 sem auth', async () => {
    const res = await request(port, 'GET', `/api/v1/financeiro/dashboard?barbershop_id=${SHOP_ID}`);
    assert.equal(res.status, 401);
  });

  test('GET /dashboard retorna 400 sem barbershop_id', async () => {
    const res = await request(port, 'GET', '/api/v1/financeiro/dashboard', {
      headers: { Authorization: `Bearer ${token()}` },
    });
    assert.equal(res.status, 400);
  });

  test('GET /dashboard retorna 200 para usuario vinculado e dados agregados', async () => {
    const res = await request(port, 'GET', `/api/v1/financeiro/dashboard?barbershop_id=${SHOP_ID}&periodo=mes`, {
      headers: { Authorization: `Bearer ${token()}` },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    // USER_ID é owner da barbearia → lucroBarbearia = 100% da receitaLiquida
    assert.equal(res.body.dados.isOwner, true);
    assert.equal(res.body.dados.cards.receitaBruta.total, 500);
    assert.equal(res.body.dados.cards.receitaLiquida.total, 480);
    assert.equal(res.body.dados.cards.lucroBarbearia.total, 480);
    assert.equal(res.body.dados.cards.meuLucro, null);
    assert.equal(res.body.dados.barbeiros[0].nome, 'Joao Premium');
  });

  test('PATCH /taxas-metodo valida metodo e porcentagem', async () => {
    const invalid = await request(port, 'PATCH', '/api/v1/financeiro/taxas-metodo', {
      headers: { Authorization: `Bearer ${token()}` },
      body: { barbershop_id: SHOP_ID, metodo: 'cheque', porcentagem: 4 },
    });
    assert.equal(invalid.status, 400);

    const valid = await request(port, 'PATCH', '/api/v1/financeiro/taxas-metodo', {
      headers: { Authorization: `Bearer ${token()}` },
      body: { barbershop_id: SHOP_ID, metodo: 'credito', porcentagem: 4, periodo: 'mes' },
    });
    assert.equal(valid.status, 200);
    const rpc = fakeDb.rpcCalls[0];
    assert.equal(rpc.name, 'aplicar_desconto_metodo');
    // BFF deve passar p_user_id para que o RPC possa verificar acesso sem auth.uid()
    assert.equal(rpc.payload.p_user_id, USER_ID);
  });
});

test('GET /dashboard retorna 403 sem vinculo com a barbearia', async () => {
  const app = criarApp(new FakeDb({ forbidden: true }));
  const server = await new Promise(resolve => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });
  const port = server.address().port;
  const res = await request(port, 'GET', `/api/v1/financeiro/dashboard?barbershop_id=${SHOP_ID}`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  await new Promise((resolve, reject) => server.close(err => (err ? reject(err) : resolve())));
  assert.equal(res.status, 403);
});

test('GET /dashboard nao-dono: isOwner=false e meuLucro com porcentagem do acordo', async () => {
  // FakeDb com owner_id diferente de USER_ID → papel = 'professional'
  class FakeDbNaoOwner extends FakeDb {
    from(table) {
      const query = super.from(table);
      if (table === 'barbershops') {
        const orig = query.then.bind(query);
        query.then = (resolve, reject) =>
          Promise.resolve({ data: { id: SHOP_ID, owner_id: '00000000-0000-4000-8000-000000000000', is_active: true }, error: null }).then(resolve, reject);
      }
      if (table === 'transactions') {
        // transacoes do próprio viewer (USER_ID) com 40% barbearia
        const orig = query.then.bind(query);
        query.then = (resolve, reject) =>
          Promise.resolve({ data: [{ id: '55555555-5555-4555-8555-555555555555', barbershop_id: SHOP_ID, professional_id: USER_ID, gross_amount: 500, amount: 480, payment_method: 'credito', status: 'paid', type: 'revenue', paid_at: '2026-05-20T12:00:00.000Z', created_at: '2026-05-20T12:00:00.000Z' }], error: null }).then(resolve, reject);
      }
      if (table === 'agreements') {
        const orig = query.then.bind(query);
        query.then = (resolve, reject) =>
          Promise.resolve({ data: [{ professional_id: USER_ID, barbershop_id: SHOP_ID, type: 'percentage', value: 40, is_active: true }], error: null }).then(resolve, reject);
      }
      return query;
    }
  }

  const app2 = criarApp(new FakeDbNaoOwner());
  const server2 = await new Promise(resolve => {
    const srv = app2.listen(0, '127.0.0.1', () => resolve(srv));
  });
  const port2 = server2.address().port;
  const res = await request(port2, 'GET', `/api/v1/financeiro/dashboard?barbershop_id=${SHOP_ID}&periodo=mes`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  await new Promise((resolve, reject) => server2.close(err => (err ? reject(err) : resolve())));
  assert.equal(res.status, 200);
  assert.equal(res.body.dados.isOwner, false);
  assert.equal(res.body.dados.cards.lucroBarbearia.total, 192);
  assert.ok(res.body.dados.cards.meuLucro !== null);
  assert.equal(res.body.dados.cards.meuLucro.total, 288);
});
