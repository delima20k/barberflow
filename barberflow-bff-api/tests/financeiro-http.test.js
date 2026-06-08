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
const INACTIVE_PROF_ID = '77777777-7777-4777-8777-777777777777';

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
      const rows = this.db.linkRows.filter(row =>
        (!this.filters.barbershop_id || row.barbershop_id === this.filters.barbershop_id)
        && (this.filters.is_active === undefined || row.is_active === this.filters.is_active)
      );
      return { data: rows, error: null };
    }

    if (this.table === 'transactions') {
      const filtered = this.db.transactionRows.filter(item =>
        (!this.filters.professional_id || item.professional_id === this.filters.professional_id)
        && (!this.filters.type || item.type === this.filters.type)
        && (!this.filters.status || item.status === this.filters.status)
      );
      return { data: filtered, error: null };
    }

    if (this.table === 'agreements') {
      return {
        data: [
          { professional_id: PROF_ID, barbershop_id: SHOP_ID, type: 'percentage', value: 40, is_active: true, valid_from: '2026-01-01' },
          { professional_id: PROF_ID, barbershop_id: SHOP_ID, type: 'rent', value: 310, is_active: true, valid_from: '2026-01-01' },
          { professional_id: PROF_ID, barbershop_id: SHOP_ID, type: 'fixed', value: 999, is_active: true, valid_from: '2026-01-01', notes: 'bonus operacional' },
        ],
        error: null,
      };
    }

    if (this.table === 'professionals') {
      return {
        data: [
          { id: PROF_ID, avatar_path: 'professionals/joao-antigo.webp', is_active: true },
          { id: INACTIVE_PROF_ID, avatar_path: '', is_active: true },
        ],
        error: null,
      };
    }

    if (this.table === 'profiles') {
      return {
        data: [
          { id: PROF_ID, full_name: 'Joao Premium', avatar_path: 'avatars/joao-premium.webp', is_active: true },
          { id: INACTIVE_PROF_ID, full_name: 'Parceiro Desativado', avatar_path: '', is_active: true },
        ],
        error: null,
      };
    }

    if (this.table === 'attendance_sessions') {
      return { data: [{ professional_id: PROF_ID, finished_at: null, chair: { barbershop_id: SHOP_ID } }], error: null };
    }

    if (this.table === 'barbershop_mensalistas') {
      return { data: [{ monthly_fee: 100 }, { monthly_fee: 80 }], error: null };
    }

    if (this.table === 'professional_barbershop_presence') {
      const rows = this.db.presenceRows.length
        ? this.db.presenceRows
        : [];
      const filtered = rows.filter(row =>
        (!this.filters.barbershop_id || row.barbershop_id === this.filters.barbershop_id)
        && (!this.filters.professional_id || row.professional_id === this.filters.professional_id)
      );
      return { data: this.single ? (filtered[0] ?? null) : filtered, error: null };
    }

    if (this.table === 'financial_payment_method_fees') {
      const rows = this.db.feeRows.filter(row =>
        (!this.filters.barbershop_id || row.barbershop_id === this.filters.barbershop_id)
      );
      return { data: this.single ? (rows[0] ?? null) : rows, error: null };
    }

    if (this.table === 'professional_payouts') {
      const rows = this.db.payoutRows.filter(row =>
        (!this.filters.barbershop_id || row.barbershop_id === this.filters.barbershop_id)
        && (!this.filters.professional_id || row.professional_id === this.filters.professional_id)
        && (!this.filters.status || Array.isArray(this.filters.status) || row.status === this.filters.status)
        && (!Array.isArray(this.filters.status) || this.filters.status.includes(row.status))
      );
      return { data: this.single ? (rows[0] ?? null) : rows, error: null };
    }

    if (this.table === 'professional_payout_items') {
      const rows = this.db.payoutItemRows.filter(row =>
        (!this.filters.payout_id || this.filters.payout_id.includes(row.payout_id))
      );
      return { data: this.single ? (rows[0] ?? null) : rows, error: null };
    }

    if (this.table === 'professional_weekly_settlements') {
      if (this.db.failWeeklySettlementSelect) {
        return {
          data: null,
          error: {
            code: this.db.failWeeklySettlementSelect,
            message: 'relation "public.professional_weekly_settlements" does not exist',
          },
        };
      }
      const rows = this.db.weeklySettlementRows.filter(row =>
        (!this.filters.barbershop_id || row.barbershop_id === this.filters.barbershop_id)
        && (!this.filters.professional_id || row.professional_id === this.filters.professional_id)
        && (!this.filters['period_start:gte'] || row.period_start >= this.filters['period_start:gte'])
        && (!this.filters['period_end:lte'] || row.period_end <= this.filters['period_end:lte'])
      );
      return { data: this.single ? (rows[0] ?? null) : rows, error: null };
    }

    return { data: [], error: null };
  }
}

class FakeDb {
  constructor({ forbidden = false, failWeeklySettlementSelect = null } = {}) {
    this.forbidden = forbidden;
    this.rpcCalls = [];
    this.presenceRows = [];
    this.upsertCalls = [];
    this.feeRows = [{ barbershop_id: SHOP_ID, payment_method: 'credit', fee_percent: 4 }];
    this.feeUpsertCalls = [];
    this.payoutRows = [];
    this.payoutItemRows = [];
    this.weeklySettlementRows = [];
    this.weeklySettlementUpsertCalls = [];
    this.failWeeklySettlementSelect = failWeeklySettlementSelect;
    this.failedPayouts = [];
    this.rpcErrors = {};
    this.transactionRows = [
      {
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
      },
      {
        id: '66666666-6666-4666-8666-666666666666',
        barbershop_id: SHOP_ID,
        professional_id: null,
        gross_amount: 50,
        amount: 50,
        payment_method: 'pix',
        status: 'paid',
        type: 'expense',
        paid_at: '2026-05-22T12:00:00.000Z',
        created_at: '2026-05-22T12:00:00.000Z',
      },
    ];
    this.linkRows = [
      { professional_id: PROF_ID, barbershop_id: SHOP_ID, is_active: true },
      { professional_id: INACTIVE_PROF_ID, barbershop_id: SHOP_ID, is_active: false },
    ];
  }

  from(table) {
    if (table === 'professional_payouts') {
      return {
        select: () => new FakeQuery(this, table),
        insert: (payload) => {
          const row = {
            id: `payout-${this.payoutRows.length + 1}`,
            ...payload,
            created_at: payload.created_at || new Date().toISOString(),
            updated_at: payload.updated_at || new Date().toISOString(),
          };
          this.payoutRows.push(row);
          return {
            select: () => ({
              single: async () => ({ data: row, error: null }),
            }),
          };
        },
        update: (payload) => ({
          eq: (key, value) => ({
            select: () => ({
              single: async () => {
                const row = this.payoutRows.find(item => item[key] === value);
                if (!row) return { data: null, error: { message: 'not found' } };
                Object.assign(row, payload);
                if (payload.status === 'failed') this.failedPayouts.push(row.id);
                return { data: row, error: null };
              },
            }),
          }),
        }),
      };
    }
    if (table === 'professional_payout_items') {
      return {
        select: () => new FakeQuery(this, table),
        insert: (payload) => {
          const rows = Array.isArray(payload) ? payload : [payload];
          const conflito = rows.find(row =>
            this.payoutItemRows.some(item => item.transaction_id === row.transaction_id)
          );
          if (conflito) {
            return {
              select: async () => ({ data: null, error: { code: '23505', message: 'duplicate key value' } }),
            };
          }
          const inserted = rows.map((row, index) => ({
            id: `payout-item-${this.payoutItemRows.length + index + 1}`,
            ...row,
            created_at: row.created_at || new Date().toISOString(),
          }));
          this.payoutItemRows.push(...inserted);
          return {
            select: async () => ({ data: inserted, error: null }),
          };
        },
      };
    }
    if (table === 'financial_payment_method_fees') {
      return {
        select: () => new FakeQuery(this, table),
        upsert: (payload) => {
          this.feeUpsertCalls.push(payload);
          const index = this.feeRows.findIndex(row =>
            row.barbershop_id === payload.barbershop_id
            && row.payment_method === payload.payment_method
          );
          const next = { ...payload };
          if (index >= 0) this.feeRows[index] = next;
          else this.feeRows.push(next);
          return {
            select: () => ({
              single: async () => ({ data: next, error: null }),
            }),
          };
        },
      };
    }
    if (table === 'professional_barbershop_presence') {
      return {
        upsert: (payload) => {
          this.upsertCalls.push(payload);
          const index = this.presenceRows.findIndex(row =>
            row.barbershop_id === payload.barbershop_id
            && row.professional_id === payload.professional_id
          );
          const next = { ...payload };
          if (index >= 0) this.presenceRows[index] = next;
          else this.presenceRows.push(next);
          return {
            select: () => ({
              single: async () => ({ data: next, error: null }),
            }),
          };
        },
        select: () => new FakeQuery(this, table),
      };
    }
    if (table === 'professional_weekly_settlements') {
      return {
        select: () => new FakeQuery(this, table),
        upsert: (payload) => {
          this.weeklySettlementUpsertCalls.push(payload);
          const index = this.weeklySettlementRows.findIndex(row =>
            row.barbershop_id === payload.barbershop_id
            && row.professional_id === payload.professional_id
            && row.period_start === payload.period_start
            && row.period_end === payload.period_end
          );
          const row = {
            id: index >= 0 ? this.weeklySettlementRows[index].id : `settlement-${this.weeklySettlementRows.length + 1}`,
            ...payload,
            created_at: payload.created_at || new Date().toISOString(),
            updated_at: payload.updated_at || new Date().toISOString(),
          };
          if (index >= 0) this.weeklySettlementRows[index] = row;
          else this.weeklySettlementRows.push(row);
          return {
            select: () => ({
              single: async () => ({ data: row, error: null }),
            }),
          };
        },
      };
    }
    return new FakeQuery(this, table);
  }

  async rpc(name, payload) {
    this.rpcCalls.push({ name, payload });
    if (this.rpcErrors[name]) {
      return { data: null, error: this.rpcErrors[name] };
    }
    if (name === 'get_professional_unpaid_transactions') {
      const paidIds = new Set(this.payoutItemRows.map(item => item.transaction_id));
      const rows = this.transactionRows.filter(item =>
        item.barbershop_id === payload.p_barbershop_id
        && (!payload.p_professional_id || item.professional_id === payload.p_professional_id)
        && item.type === 'revenue'
        && item.status === 'paid'
        && !paidIds.has(item.id)
      );
      return { data: rows, error: null };
    }
    if (name === 'get_professional_financial_history_summary') {
      const professionals = new Set([
        PROF_ID,
        ...this.linkRows
          .filter(row => row.barbershop_id === payload.p_barbershop_id && row.is_active === true)
          .map(row => row.professional_id),
      ]);
      const rows = [...professionals]
        .filter(professionalId => !payload.p_professional_id || professionalId === payload.p_professional_id)
        .map(professionalId => {
          const faturamentoHistorico = this.transactionRows
            .filter(item =>
              item.barbershop_id === payload.p_barbershop_id
              && item.professional_id === professionalId
              && item.type === 'revenue'
              && item.status === 'paid'
            )
            .reduce((sum, item) => sum + Number(item.gross_amount ?? item.amount ?? 0), 0);
          const payouts = this.payoutRows.filter(item =>
            item.barbershop_id === payload.p_barbershop_id
            && item.professional_id === professionalId
            && item.status === 'confirmed'
          );
          return {
            professional_id: professionalId,
            faturamento_historico: faturamentoHistorico,
            total_recebido: payouts.reduce((sum, item) => sum + Number(item.amount || 0), 0),
            payouts_count: payouts.length,
            last_payout_at: payouts.reduce((last, item) => {
              const paidAt = item.paid_at || item.created_at || null;
              return !last || String(paidAt) > String(last) ? paidAt : last;
            }, null),
          };
        });
      return { data: rows, error: null };
    }
    if (name === 'confirmar_professional_payout_atomic') {
      const conflito = (payload.p_transaction_ids || []).find(id =>
        this.payoutItemRows.some(item => item.transaction_id === id)
      );
      if (conflito) return { data: null, error: { code: '23505', message: 'duplicate key value' } };

      const payout = {
        id: `payout-${this.payoutRows.length + 1}`,
        barbershop_id: payload.p_barbershop_id,
        professional_id: payload.p_professional_id,
        amount: payload.p_amount,
        period_start: payload.p_period_start,
        period_end: payload.p_period_end,
        status: 'confirmed',
        paid_at: new Date().toISOString(),
        created_by: payload.p_created_by,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const items = (payload.p_transaction_ids || []).map((transactionId, index) => ({
        id: `payout-item-${this.payoutItemRows.length + index + 1}`,
        payout_id: payout.id,
        transaction_id: transactionId,
        amount: payload.p_item_amounts[index],
        created_at: new Date().toISOString(),
      }));
      this.payoutRows.push(payout);
      this.payoutItemRows.push(...items);
      return { data: payout, error: null };
    }
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
    fakeDb.presenceRows = [{ barbershop_id: SHOP_ID, professional_id: PROF_ID, is_available: true }];
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
    const res = await request(port, 'GET', `/api/v1/financeiro/dashboard?barbershop_id=${SHOP_ID}&periodo=custom&de=2026-05-01&ate=2026-05-31`, {
      headers: { Authorization: `Bearer ${token()}` },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    // Owner ve participacao da barbearia, aluguel de cadeira e despesas reais.
    assert.equal(res.body.dados.isOwner, true);
    assert.equal(res.body.dados.cards.receitaBruta.total, 500);
    assert.equal(res.body.dados.cards.receitaLiquida.total, 598);
    assert.equal(res.body.dados.cards.lucroBarbearia.total, 548);
    assert.equal(res.body.dados.cards.lucroBarbearia.despesas, 50);
    assert.equal(res.body.dados.cards.lucroBarbearia.limitacaoDespesas, false);
    assert.equal(res.body.dados.cards.meuLucro, null);
    assert.equal(res.body.dados.cards.mensalistas.total, 310);
    assert.equal(res.body.dados.cards.mensalistas.count, 1);
    assert.equal(res.body.dados.cards.totalBarbeiros.total, 2);
    assert.equal(res.body.dados.cards.totalBarbeiros.online, 1);
    assert.equal(res.body.dados.cards.totalBarbeiros.inativos, 1);
    assert.equal(res.body.dados.barbeiros[0].nome, 'Joao Premium');
    assert.equal(res.body.dados.barbeiros[0].avatarPath, 'avatars/joao-premium.webp');
    assert.equal(res.body.dados.barbeiros[0].pendingPayoutAmount, 192);
    assert.equal(res.body.dados.barbeiros[0].cutsPendingPayout, 1);
  });

  test('POST /pagamentos-barbeiro registra payout e atualiza saldo do dashboard', async () => {
    const created = await request(port, 'POST', '/api/v1/financeiro/pagamentos-barbeiro', {
      headers: { Authorization: `Bearer ${token()}` },
      body: {
        barbershop_id: SHOP_ID,
        professional_id: PROF_ID,
        periodo: 'custom',
        de: '2026-05-01',
        ate: '2026-05-31',
        displayed_amount: 192,
      },
    });
    assert.equal(created.status, 200);
    assert.equal(created.body.dados.payout.amount, 192);
    assert.equal(created.body.dados.updatedBalance.pendingPayoutAmount, 0);
    assert.equal(fakeDb.payoutRows[0].status, 'confirmed');
    assert.equal(fakeDb.payoutItemRows[0].transaction_id, '44444444-4444-4444-8444-444444444444');

    const dashboard = await request(port, 'GET', `/api/v1/financeiro/dashboard?barbershop_id=${SHOP_ID}&periodo=custom&de=2026-05-01&ate=2026-05-31`, {
      headers: { Authorization: `Bearer ${token()}` },
    });
    assert.equal(dashboard.body.dados.barbeiros[0].pendingPayoutAmount, 0);
    assert.equal(dashboard.body.dados.barbeiros[0].cutsPendingPayout, 0);
  });

  test('POST /pagamentos-barbeiro protege contra pagamento duplicado do mesmo corte', async () => {
    const res = await request(port, 'POST', '/api/v1/financeiro/pagamentos-barbeiro', {
      headers: { Authorization: `Bearer ${token()}` },
      body: {
        barbershop_id: SHOP_ID,
        professional_id: PROF_ID,
        periodo: 'custom',
        de: '2026-05-01',
        ate: '2026-05-31',
        displayed_amount: 192,
      },
    });
    assert.equal(res.status, 409);
    assert.equal(fakeDb.payoutItemRows.length, 1);
  });

  test('GET /dashboard e POST /pagamentos-barbeiro mantem ciclo aberto separado do historico', async () => {
    const db = new FakeDb();
    const app = criarApp(db);
    const localServer = await new Promise(resolve => {
      const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
    });
    const localPort = localServer.address().port;
    try {
      const antes = await request(localPort, 'GET', `/api/v1/financeiro/dashboard?barbershop_id=${SHOP_ID}&periodo=custom&de=2026-05-01&ate=2026-05-31`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      assert.equal(antes.status, 200);
      assert.equal(antes.body.dados.barbeiros[0].saldoPendenteAtual, 192);
      assert.equal(antes.body.dados.barbeiros[0].totalRecebido, 0);
      assert.equal(antes.body.dados.barbeiros[0].faturamentoHistorico, 500);

      const payout = await request(localPort, 'POST', '/api/v1/financeiro/pagamentos-barbeiro', {
        headers: { Authorization: `Bearer ${token()}` },
        body: {
          barbershop_id: SHOP_ID,
          professional_id: PROF_ID,
          periodo: 'custom',
          de: '2026-05-01',
          ate: '2026-05-31',
          displayed_amount: 192,
        },
      });
      assert.equal(payout.status, 200);
      assert.equal(payout.body.dados.updatedBalance.saldoPendenteAtual, 0);
      assert.equal(payout.body.dados.updatedBalance.totalRecebido, 192);

      const depois = await request(localPort, 'GET', `/api/v1/financeiro/dashboard?barbershop_id=${SHOP_ID}&periodo=custom&de=2026-05-01&ate=2026-05-31`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      assert.equal(depois.body.dados.barbeiros[0].saldoPendenteAtual, 0);
      assert.equal(depois.body.dados.barbeiros[0].totalRecebido, 192);
      assert.equal(depois.body.dados.barbeiros[0].faturamentoHistorico, 500);

      db.transactionRows.push({
        id: '88888888-8888-4888-8888-888888888888',
        barbershop_id: SHOP_ID,
        professional_id: PROF_ID,
        gross_amount: 100,
        amount: 100,
        payment_method: 'pix',
        status: 'paid',
        type: 'revenue',
        paid_at: '2026-06-02T12:00:00.000Z',
        created_at: '2026-06-02T12:00:00.000Z',
      });

      const novoCiclo = await request(localPort, 'GET', `/api/v1/financeiro/dashboard?barbershop_id=${SHOP_ID}&periodo=custom&de=2026-05-01&ate=2026-05-31`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      assert.equal(novoCiclo.body.dados.barbeiros[0].saldoPendenteAtual, 40);
      assert.equal(novoCiclo.body.dados.barbeiros[0].totalRecebido, 192);
      assert.equal(novoCiclo.body.dados.barbeiros[0].faturamentoHistorico, 600);
    } finally {
      await new Promise((resolve, reject) => localServer.close(err => (err ? reject(err) : resolve())));
    }
  });

  test('GET /dashboard e POST /pagamentos-barbeiro usam fallback quando RPCs financeiras ainda nao existem', async () => {
    const db = new FakeDb();
    db.rpcErrors = {
      get_professional_unpaid_transactions: { code: 'PGRST202', message: 'Could not find the function' },
      get_professional_financial_history_summary: { code: '42883', message: 'function does not exist' },
      confirmar_professional_payout_atomic: { code: 'PGRST202', message: 'Could not find the function' },
    };
    const app = criarApp(db);
    const localServer = await new Promise(resolve => {
      const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
    });
    const localPort = localServer.address().port;
    try {
      const dashboard = await request(localPort, 'GET', `/api/v1/financeiro/dashboard?barbershop_id=${SHOP_ID}&periodo=custom&de=2026-05-01&ate=2026-05-31`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      assert.equal(dashboard.status, 200);
      assert.equal(dashboard.body.dados.barbeiros[0].saldoPendenteAtual, 192);
      assert.equal(dashboard.body.dados.barbeiros[0].faturamentoHistorico, 500);

      const payout = await request(localPort, 'POST', '/api/v1/financeiro/pagamentos-barbeiro', {
        headers: { Authorization: `Bearer ${token()}` },
        body: {
          barbershop_id: SHOP_ID,
          professional_id: PROF_ID,
          periodo: 'custom',
          de: '2026-05-01',
          ate: '2026-05-31',
          displayed_amount: 192,
        },
      });
      assert.equal(payout.status, 200);
      assert.equal(payout.body.dados.updatedBalance.saldoPendenteAtual, 0);
      assert.equal(payout.body.dados.updatedBalance.totalRecebido, 192);
    } finally {
      await new Promise((resolve, reject) => localServer.close(err => (err ? reject(err) : resolve())));
    }
  });

  test('PATCH /taxas-metodo valida metodo e porcentagem', async () => {
    const invalid = await request(port, 'PATCH', '/api/v1/financeiro/taxas-metodo', {
      headers: { Authorization: `Bearer ${token()}` },
      body: { barbershop_id: SHOP_ID, metodo: 'cheque', porcentagem: 4 },
    });
    assert.equal(invalid.status, 400);

    const invalidPix = await request(port, 'PATCH', '/api/v1/financeiro/taxas-metodo', {
      headers: { Authorization: `Bearer ${token()}` },
      body: { barbershop_id: SHOP_ID, metodo: 'pix', porcentagem: 4 },
    });
    assert.equal(invalidPix.status, 400);

    const invalidPct = await request(port, 'PATCH', '/api/v1/financeiro/taxas-metodo', {
      headers: { Authorization: `Bearer ${token()}` },
      body: { barbershop_id: SHOP_ID, metodo: 'credito', porcentagem: 31 },
    });
    assert.equal(invalidPct.status, 400);

    const valid = await request(port, 'PATCH', '/api/v1/financeiro/taxas-metodo', {
      headers: { Authorization: `Bearer ${token()}` },
      body: { barbershop_id: SHOP_ID, metodo: 'crédito', porcentagem: '4,5', periodo: 'mes' },
    });
    assert.equal(valid.status, 200);
    assert.equal(fakeDb.rpcCalls.filter(call =>
      ![
        'confirmar_professional_payout_atomic',
        'get_professional_unpaid_transactions',
        'get_professional_financial_history_summary',
      ].includes(call.name)
    ).length, 0);
    assert.equal(fakeDb.feeUpsertCalls[0].payment_method, 'credit');
    assert.equal(fakeDb.feeUpsertCalls[0].fee_percent, 4.5);
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
    constructor() {
      super();
      this.transactionRows = [
        { id: '55555555-5555-4555-8555-555555555555', barbershop_id: SHOP_ID, professional_id: USER_ID, gross_amount: 500, amount: 480, payment_method: 'credito', status: 'paid', type: 'revenue', paid_at: '2026-05-20T12:00:00.000Z', created_at: '2026-05-20T12:00:00.000Z' },
        { id: '88888888-8888-4888-8888-888888888888', barbershop_id: SHOP_ID, professional_id: PROF_ID, gross_amount: 900, amount: 900, payment_method: 'pix', status: 'paid', type: 'revenue', paid_at: '2026-05-20T12:00:00.000Z', created_at: '2026-05-20T12:00:00.000Z' },
      ];
      this.linkRows = [
        { professional_id: USER_ID, barbershop_id: SHOP_ID, is_active: true },
        { professional_id: PROF_ID, barbershop_id: SHOP_ID, is_active: true },
      ];
    }

    from(table) {
      const query = super.from(table);
      if (table === 'barbershops') {
        const orig = query.then.bind(query);
        query.then = (resolve, reject) =>
          Promise.resolve({ data: { id: SHOP_ID, owner_id: '00000000-0000-4000-8000-000000000000', is_active: true }, error: null }).then(resolve, reject);
      }
      if (table === 'transactions') {
        // transacoes do proprio viewer (USER_ID) com 40% para o barbeiro
        query.then = (resolve, reject) =>
          Promise.resolve({ data: [
            { id: '55555555-5555-4555-8555-555555555555', barbershop_id: SHOP_ID, professional_id: USER_ID, gross_amount: 500, amount: 480, payment_method: 'credito', status: 'paid', type: 'revenue', paid_at: '2026-05-20T12:00:00.000Z', created_at: '2026-05-20T12:00:00.000Z' },
            { id: '88888888-8888-4888-8888-888888888888', barbershop_id: SHOP_ID, professional_id: PROF_ID, gross_amount: 900, amount: 900, payment_method: 'pix', status: 'paid', type: 'revenue', paid_at: '2026-05-20T12:00:00.000Z', created_at: '2026-05-20T12:00:00.000Z' },
          ].filter(item => !query.filters.professional_id || item.professional_id === query.filters.professional_id), error: null }).then(resolve, reject);
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
  assert.equal(res.body.dados.cards.lucroBarbearia.total, 288);
  assert.ok(res.body.dados.cards.meuLucro !== null);
  assert.equal(res.body.dados.cards.meuLucro.total, 192);
  assert.equal(res.body.dados.barbeiros.length, 1);
  assert.equal(res.body.dados.barbeiros[0].professionalId, USER_ID);
  assert.equal(res.body.dados.barbeiros[0].pendingPayoutAmount, 192);
  assert.equal(res.body.dados.acertoSemanal.resumo.valorARepassarBarbearia, 288);
  assert.equal(res.body.dados.acertoSemanal.resumo.valorLiquidoBarbeiro, 192);
  assert.equal(res.body.dados.acertoSemanal.resumo.status, 'pending');
  assert.equal(res.body.dados.acertoSemanal.historico.length, 1);
});

test('GET /dashboard owner nao recebe acertoSemanal de parceiro', async () => {
  const db = new FakeDb();
  const app = criarApp(db);
  const server = await new Promise(resolve => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });
  const port = server.address().port;
  const res = await request(port, 'GET', `/api/v1/financeiro/dashboard?barbershop_id=${SHOP_ID}&periodo=semana`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  await new Promise((resolve, reject) => server.close(err => (err ? reject(err) : resolve())));
  assert.equal(res.status, 200);
  assert.equal(res.body.dados.isOwner, true);
  assert.equal(res.body.dados.acertoSemanal, undefined);
});

test('GET /dashboard parceiro nao quebra quando tabela de acerto semanal ainda nao existe', async () => {
  class FakeDbParceiro extends FakeDb {
    from(table) {
      const query = super.from(table);
      if (table === 'barbershops') {
        query.then = (resolve, reject) =>
          Promise.resolve({ data: { id: SHOP_ID, owner_id: '00000000-0000-4000-8000-000000000000', is_active: true }, error: null }).then(resolve, reject);
      }
      return query;
    }
  }

  const db = new FakeDbParceiro({ failWeeklySettlementSelect: '42P01' });
  const app = criarApp(db);
  const server = await new Promise(resolve => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });
  const port = server.address().port;
  const res = await request(port, 'GET', `/api/v1/financeiro/dashboard?barbershop_id=${SHOP_ID}&periodo=semana`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  await new Promise((resolve, reject) => server.close(err => (err ? reject(err) : resolve())));
  assert.equal(res.status, 200);
  assert.equal(res.body.dados.isOwner, false);
  assert.equal(res.body.dados.acertoSemanal.resumo.status, 'pending');
  assert.equal(res.body.dados.acertoSemanal.historico[0].status, 'pending');
});

test('POST /acertos-semanais/confirmar permite parceiro confirmar repasse semanal e e idempotente', async () => {
  class FakeDbParceiro extends FakeDb {
    from(table) {
      const query = super.from(table);
      if (table === 'barbershops') {
        query.then = (resolve, reject) =>
          Promise.resolve({ data: { id: SHOP_ID, owner_id: '00000000-0000-4000-8000-000000000000', is_active: true }, error: null }).then(resolve, reject);
      }
      if (table === 'transactions') {
        query.then = (resolve, reject) =>
          Promise.resolve({ data: [
            { id: '55555555-5555-4555-8555-555555555555', barbershop_id: SHOP_ID, professional_id: USER_ID, gross_amount: 500, amount: 480, payment_method: 'credito', status: 'paid', type: 'revenue', paid_at: '2026-05-20T12:00:00.000Z', created_at: '2026-05-20T12:00:00.000Z' },
          ].filter(item => !query.filters.professional_id || item.professional_id === query.filters.professional_id), error: null }).then(resolve, reject);
      }
      if (table === 'agreements') {
        query.then = (resolve, reject) =>
          Promise.resolve({ data: [{ professional_id: USER_ID, barbershop_id: SHOP_ID, type: 'percentage', value: 40, is_active: true }], error: null }).then(resolve, reject);
      }
      return query;
    }
  }

  const db = new FakeDbParceiro();
  const app = criarApp(db);
  const server = await new Promise(resolve => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });
  const port = server.address().port;
  const body = {
    barbershop_id: SHOP_ID,
    periodo: 'semana',
    displayed_amount: 288,
  };

  const first = await request(port, 'POST', '/api/v1/financeiro/acertos-semanais/confirmar', {
    headers: { Authorization: `Bearer ${token()}` },
    body,
  });
  const second = await request(port, 'POST', '/api/v1/financeiro/acertos-semanais/confirmar', {
    headers: { Authorization: `Bearer ${token()}` },
    body,
  });

  await new Promise((resolve, reject) => server.close(err => (err ? reject(err) : resolve())));
  assert.equal(first.status, 200);
  assert.equal(first.body.dados.settlement.status, 'paid');
  assert.equal(second.status, 200);
  assert.equal(db.weeklySettlementRows.length, 1);
  assert.equal(db.weeklySettlementRows[0].shop_amount, 288);
  assert.equal(db.weeklySettlementRows[0].confirmed_by, USER_ID);
});

test('POST /acertos-semanais/confirmar rejeita owner, sem vinculo e valor desatualizado', async () => {
  const ownerDb = new FakeDb();
  const ownerApp = criarApp(ownerDb);
  const ownerServer = await new Promise(resolve => {
    const srv = ownerApp.listen(0, '127.0.0.1', () => resolve(srv));
  });
  const ownerPort = ownerServer.address().port;
  const ownerRes = await request(ownerPort, 'POST', '/api/v1/financeiro/acertos-semanais/confirmar', {
    headers: { Authorization: `Bearer ${token()}` },
    body: { barbershop_id: SHOP_ID, periodo: 'semana', displayed_amount: 288 },
  });
  await new Promise((resolve, reject) => ownerServer.close(err => (err ? reject(err) : resolve())));
  assert.equal(ownerRes.status, 403);
  assert.equal(ownerDb.weeklySettlementRows.length, 0);

  const forbiddenApp = criarApp(new FakeDb({ forbidden: true }));
  const forbiddenServer = await new Promise(resolve => {
    const srv = forbiddenApp.listen(0, '127.0.0.1', () => resolve(srv));
  });
  const forbiddenPort = forbiddenServer.address().port;
  const forbiddenRes = await request(forbiddenPort, 'POST', '/api/v1/financeiro/acertos-semanais/confirmar', {
    headers: { Authorization: `Bearer ${token()}` },
    body: { barbershop_id: SHOP_ID, periodo: 'semana', displayed_amount: 288 },
  });
  await new Promise((resolve, reject) => forbiddenServer.close(err => (err ? reject(err) : resolve())));
  assert.equal(forbiddenRes.status, 403);

  class FakeDbParceiro extends FakeDb {
    from(table) {
      const query = super.from(table);
      if (table === 'barbershops') {
        query.then = (resolve, reject) =>
          Promise.resolve({ data: { id: SHOP_ID, owner_id: '00000000-0000-4000-8000-000000000000', is_active: true }, error: null }).then(resolve, reject);
      }
      if (table === 'transactions') {
        query.then = (resolve, reject) =>
          Promise.resolve({ data: [{ id: '55555555-5555-4555-8555-555555555555', barbershop_id: SHOP_ID, professional_id: USER_ID, gross_amount: 500, payment_method: 'credito', status: 'paid', type: 'revenue', paid_at: '2026-05-20T12:00:00.000Z' }], error: null }).then(resolve, reject);
      }
      if (table === 'agreements') {
        query.then = (resolve, reject) =>
          Promise.resolve({ data: [{ professional_id: USER_ID, barbershop_id: SHOP_ID, type: 'percentage', value: 40, is_active: true }], error: null }).then(resolve, reject);
      }
      return query;
    }
  }

  const staleDb = new FakeDbParceiro();
  const staleApp = criarApp(staleDb);
  const staleServer = await new Promise(resolve => {
    const srv = staleApp.listen(0, '127.0.0.1', () => resolve(srv));
  });
  const stalePort = staleServer.address().port;
  const staleRes = await request(stalePort, 'POST', '/api/v1/financeiro/acertos-semanais/confirmar', {
    headers: { Authorization: `Bearer ${token()}` },
    body: { barbershop_id: SHOP_ID, periodo: 'semana', displayed_amount: 287 },
  });
  await new Promise((resolve, reject) => staleServer.close(err => (err ? reject(err) : resolve())));
  assert.equal(staleRes.status, 409);
  assert.equal(staleDb.weeklySettlementRows.length, 0);
});

test('POST /pagamentos-barbeiro retorna 403 para parceiro nao-dono', async () => {
  class FakeDbParceiro extends FakeDb {
    from(table) {
      const query = super.from(table);
      if (table === 'barbershops') {
        query.then = (resolve, reject) =>
          Promise.resolve({ data: { id: SHOP_ID, owner_id: '00000000-0000-4000-8000-000000000000', is_active: true }, error: null }).then(resolve, reject);
      }
      return query;
    }
  }

  const db = new FakeDbParceiro();
  const app = criarApp(db);
  const server = await new Promise(resolve => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });
  const port = server.address().port;
  const res = await request(port, 'POST', '/api/v1/financeiro/pagamentos-barbeiro', {
    headers: { Authorization: `Bearer ${token()}` },
    body: {
      barbershop_id: SHOP_ID,
      professional_id: PROF_ID,
      periodo: 'custom',
      de: '2026-05-01',
      ate: '2026-05-31',
      displayed_amount: 192,
    },
  });
  await new Promise((resolve, reject) => server.close(err => (err ? reject(err) : resolve())));
  assert.equal(res.status, 403);
  assert.equal(db.payoutRows.length, 0);
});

test('POST /pagamentos-barbeiro rejeita payout para o dono da barbearia', async () => {
  const db = new FakeDb();
  const app = criarApp(db);
  const server = await new Promise(resolve => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });
  const port = server.address().port;
  const res = await request(port, 'POST', '/api/v1/financeiro/pagamentos-barbeiro', {
    headers: { Authorization: `Bearer ${token()}` },
    body: {
      barbershop_id: SHOP_ID,
      professional_id: USER_ID,
      periodo: 'custom',
      de: '2026-05-01',
      ate: '2026-05-31',
      displayed_amount: 192,
    },
  });
  await new Promise((resolve, reject) => server.close(err => (err ? reject(err) : resolve())));
  assert.equal(res.status, 403);
  assert.equal(db.payoutRows.length, 0);
  assert.equal(db.payoutItemRows.length, 0);
});

test('POST /pagamentos-barbeiro rejeita valor exibido desatualizado sem criar payout', async () => {
  const db = new FakeDb();
  const app = criarApp(db);
  const server = await new Promise(resolve => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });
  const port = server.address().port;
  const res = await request(port, 'POST', '/api/v1/financeiro/pagamentos-barbeiro', {
    headers: { Authorization: `Bearer ${token()}` },
    body: {
      barbershop_id: SHOP_ID,
      professional_id: PROF_ID,
      periodo: 'custom',
      de: '2026-05-01',
      ate: '2026-05-31',
      displayed_amount: 191,
    },
  });
  await new Promise((resolve, reject) => server.close(err => (err ? reject(err) : resolve())));
  assert.equal(res.status, 409);
  assert.equal(db.payoutRows.length, 0);
  assert.equal(db.payoutItemRows.length, 0);
});

test('GET /barbearias/:id/barbeiros-status retorna default false quando ausente', async () => {
  const app = criarApp(new FakeDb());
  const server = await new Promise(resolve => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });
  const port = server.address().port;
  const res = await request(port, 'GET', `/api/v1/barbearias/${SHOP_ID}/barbeiros-status`);
  await new Promise((resolve, reject) => server.close(err => (err ? reject(err) : resolve())));
  assert.equal(res.status, 200);
  assert.equal(res.body.dados[0].professional_id, PROF_ID);
  assert.equal(res.body.dados[0].is_available, false);
});

test('PATCH /barbearias/:id/me/status valida boolean e vínculo', async () => {
  const db = new FakeDb();
  const app = criarApp(db);
  const server = await new Promise(resolve => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });
  const port = server.address().port;

  const invalid = await request(port, 'PATCH', `/api/v1/barbearias/${SHOP_ID}/me/status`, {
    headers: { Authorization: `Bearer ${token()}` },
    body: { is_available: 'sim' },
  });
  assert.equal(invalid.status, 400);

  const valid = await request(port, 'PATCH', `/api/v1/barbearias/${SHOP_ID}/me/status`, {
    headers: { Authorization: `Bearer ${token()}` },
    body: { is_available: true },
  });

  await new Promise((resolve, reject) => server.close(err => (err ? reject(err) : resolve())));
  assert.equal(valid.status, 200);
  assert.equal(valid.body.dados.is_available, true);
  assert.equal(db.upsertCalls[0].professional_id, USER_ID);
});

test('PATCH /barbearias/:id/me/status retorna 403 sem vínculo', async () => {
  const app = criarApp(new FakeDb({ forbidden: true }));
  const server = await new Promise(resolve => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });
  const port = server.address().port;
  const res = await request(port, 'PATCH', `/api/v1/barbearias/${SHOP_ID}/me/status`, {
    headers: { Authorization: `Bearer ${token()}` },
    body: { is_available: true },
  });
  await new Promise((resolve, reject) => server.close(err => (err ? reject(err) : resolve())));
  assert.equal(res.status, 403);
});
