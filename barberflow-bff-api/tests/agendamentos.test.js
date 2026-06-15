'use strict';

// =============================================================
// agendamentos.test.js — Testes de integração HTTP para /api/agendamentos.
//
// Cobre:
//   GET    /api/agendamentos          — listar agendamentos do usuário autenticado
//   POST   /api/agendamentos          — criar novo agendamento
//   PATCH  /api/agendamentos/:id      — atualizar status
//   DELETE /api/agendamentos/:id      — cancelar agendamento
//
// Estratégia:
//   - Sobe o Express em porta aleatória (before/after)
//   - Stub SupabaseClient.getInstance com builder fluente configurável
//   - Token JWT local via SUPABASE_JWT_SECRET
//   - mockCfg mutável para cenários de erro por teste
// =============================================================

const { suite, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http   = require('node:http');
const jwt    = require('jsonwebtoken');

// ── Env vars (antes de qualquer require do app) ──────────────────
process.env.APP_ENV                   = 'development';
process.env.SUPABASE_URL              = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.SUPABASE_ANON_KEY         = 'test-anon-key';
process.env.SUPABASE_JWT_SECRET       = 'test-jwt-secret-at-least-32-chars!!';

// ── IDs de teste ──────────────────────────────────────────────────
const TEST_USER_ID = 'a1b2c3d4-e5f6-4890-abcd-ef1234567890';
const UUID_PRO     = 'b1b2c3d4-e5f6-4890-abcd-ef1234567891';
const UUID_SHOP    = 'c1b2c3d4-e5f6-4890-abcd-ef1234567892';
const UUID_SVC     = 'd1b2c3d4-e5f6-4890-abcd-ef1234567893';
const UUID_AG      = 'e1b2c3d4-e5f6-4890-abcd-ef1234567894';
const FUTURO       = new Date(Date.now() + 7 * 24 * 3_600_000).toISOString();

const AG_MOCK = {
  id:              UUID_AG,
  client_id:       TEST_USER_ID,
  professional_id: UUID_PRO,
  barbershop_id:   UUID_SHOP,
  service_id:      UUID_SVC,
  scheduled_at:    FUTURO,
  duration_min:    30,
  status:          'pending',
  notes:           null,
  price_charged:   50,
  client:       { id: TEST_USER_ID, full_name: 'Test User',     avatar_path: null },
  professional: { id: UUID_PRO,     profile: { full_name: 'Barbeiro Test', avatar_path: null } },
  service:      { name: 'Corte', category: 'hair', duration_min: 30, price: 50 },
  barbershop:   { id: UUID_SHOP, name: 'Barbearia Test', address: 'Rua X, 1' },
};

// ── Configuração mutável do mock de banco ─────────────────────────
// Cada teste pode alterar e restaurar para simular cenários específicos.
const mockCfg = {
  listaCliente: [AG_MOCK],
  porId:        AG_MOCK,
  criado:       AG_MOCK,
  atualizado:   { ...AG_MOCK, status: 'confirmed' },
  conflitos:    [],
  fromCalls:    [],
};

// ── Builder fluente do Supabase (detecta operação pelo método chamado) ──
function criarBuilder() {
  let modo = 'getById';   // default: .select().eq('id', ...).single()

  const b = {};
  b.select = ()  => b;
  b.eq     = ()  => b;
  b.neq    = ()  => b;
  b.gte    = ()  => b;
  b.lte    = ()  => b;
  b.in     = ()  => { modo = 'conflito'; return b; };
  b.order  = ()  => { modo = 'list';     return b; };
  b.limit  = ()  => b;
  b.insert = ()  => { modo = 'insert';   return b; };
  b.update = ()  => { modo = 'update';   return b; };

  b.single = () => {
    if (modo === 'insert') return Promise.resolve({ data: mockCfg.criado,    error: null });
    if (modo === 'update') return Promise.resolve({ data: mockCfg.atualizado, error: null });
    return Promise.resolve({ data: mockCfg.porId, error: null });
  };

  // Para queries awaited diretamente (sem .single()): list e conflitos
  Object.defineProperty(b, 'then', {
    get() {
      const data = modo === 'conflito' ? mockCfg.conflitos : mockCfg.listaCliente;
      const p    = Promise.resolve({ data, error: null });
      return p.then.bind(p);
    },
  });

  return b;
}

// ── Stub SupabaseClient antes de carregar o app ──────────────────
const SupabaseClient = require('../utils/SupabaseClient');

// Builder para chamadas .rpc() — simula criar_agendamento_atomico
function criarRpcBuilder() {
  const b = {};
  b.single = () => {
    if (mockCfg.conflitos.length > 0) {
      // P0001 = SCHEDULE_CONFLICT (mapeado para 409 no AgendamentoRepository)
      return Promise.resolve({ data: null, error: { code: 'P0001', message: 'SCHEDULE_CONFLICT' } });
    }
    return Promise.resolve({ data: mockCfg.criado, error: null });
  };
  return b;
}

SupabaseClient.getInstance = () => ({
  from: (table) => {
    mockCfg.fromCalls.push(table);
    return criarBuilder();
  },
  rpc:  () => criarRpcBuilder(),
});

const criarApp = require('../app');

let server;
let port;

before(async () => {
  const app = criarApp();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  port = server.address().port;
});

after(() => new Promise((resolve) => server.close(resolve)));

// ── Token JWT válido ─────────────────────────────────────────────
const TOKEN = jwt.sign(
  { sub: TEST_USER_ID, email: 'test@barberflow.app' },
  process.env.SUPABASE_JWT_SECRET,
  { algorithm: 'HS256', expiresIn: '1h' },
);
const AUTH = { Authorization: `Bearer ${TOKEN}` };
const DIAGNOSTIC_AUTH = {
  ...AUTH,
  'X-Barberflow-Diagnostics': 'appointment',
};

// ── HTTP helpers ──────────────────────────────────────────────────
function criarReq(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
        ...headers,
      },
    };
    const r = http.request(opts, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        try   { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, headers: res.headers, body: raw }); }
      });
    });
    r.on('error', reject);
    if (bodyStr) r.write(bodyStr);
    r.end();
  });
}

const get   = (path, hdrs)       => criarReq('GET',    path, null,  hdrs);
const post  = (path, body, hdrs) => criarReq('POST',   path, body,  hdrs);
const patch = (path, body, hdrs) => criarReq('PATCH',  path, body,  hdrs);
const del   = (path, hdrs)       => criarReq('DELETE', path, null,  hdrs);

const BASE = '/api/agendamentos';

// ─── Suite 1: GET /api/agendamentos ──────────────────────────────

suite('AgendamentoController — GET /api/agendamentos', () => {

  test('retorna 401 sem Authorization', async () => {
    const { status } = await get(BASE);
    assert.strictEqual(status, 401);
  });

  test('retorna 200 com lista de agendamentos (ok: true, dados: array)', async () => {
    const { status, body } = await get(BASE, AUTH);
    assert.strictEqual(status, 200);
    assert.strictEqual(body.ok, true);
    assert.ok(Array.isArray(body.dados), 'dados deve ser um array');
    assert.ok(body.dados.length >= 1,    'deve retornar ao menos 1 item');
  });

  test('retorna array vazio quando não há agendamentos', async () => {
    mockCfg.listaCliente = [];
    const { status, body } = await get(BASE, AUTH);
    assert.strictEqual(status, 200);
    assert.deepStrictEqual(body.dados, []);
    mockCfg.listaCliente = [AG_MOCK];
  });

});

// ─── Suite 2: POST /api/agendamentos ─────────────────────────────

suite('AgendamentoController — POST /api/agendamentos', () => {

  const PAYLOAD = {
    professional_id: UUID_PRO,
    barbershop_id:   UUID_SHOP,
    service_id:      UUID_SVC,
    scheduled_at:    FUTURO,
    duration_min:    30,
    price_charged:   50,
  };

  test('retorna 401 sem Authorization', async () => {
    const { status } = await post(BASE, PAYLOAD);
    assert.strictEqual(status, 401);
  });

  test('cria agendamento com payload válido → 201', async () => {
    mockCfg.fromCalls = [];
    const { status, headers, body } = await post(BASE, PAYLOAD, AUTH);
    assert.strictEqual(status, 201);
    assert.strictEqual(body.ok, true);
    assert.ok(body.dados?.id, 'id ausente na resposta');
    assert.strictEqual(body.dados.client_id, TEST_USER_ID);
    assert.strictEqual(body.dados.professional_id, UUID_PRO);
    assert.strictEqual(body.dados.client, undefined, 'POST nao deve carregar joins completos');
    assert.strictEqual(body.dados.professional, undefined, 'POST nao deve carregar joins completos');
    assert.deepStrictEqual(mockCfg.fromCalls, [], 'POST deve usar apenas RPC atomica, sem getById com joins');
    assert.strictEqual(headers['x-appointment-diagnostics'], undefined);
    assert.strictEqual(headers['server-timing'], undefined);
  });

  test('retorna 400 com professional_id inválido (não é UUID)', async () => {
    const { status: statusDiag, headers, body: bodyDiag } = await post(BASE, PAYLOAD, DIAGNOSTIC_AUTH);
    assert.strictEqual(statusDiag, 201);
    assert.strictEqual(bodyDiag.ok, true);
    assert.match(headers['x-appointment-diagnostics'], /auth=/);
    assert.match(headers['x-appointment-diagnostics'], /payload_validation=/);
    assert.match(headers['x-appointment-diagnostics'], /service_validation=/);
    assert.match(headers['x-appointment-diagnostics'], /availability_check=/);
    assert.match(headers['x-appointment-diagnostics'], /appointment_write=/);
    assert.match(headers['x-appointment-diagnostics'], /rpc_criar_agendamento_atomico=/);
    assert.match(headers['x-appointment-diagnostics'], /response_assembly=/);
    assert.match(headers['x-appointment-diagnostics'], /rpc_return_light=/);
    assert.doesNotMatch(headers['x-appointment-diagnostics'], /get_by_id_joins=/);
    assert.match(headers['x-appointment-diagnostics'], /total_handler=/);
    assert.match(headers['server-timing'], /rpc_criar_agendamento_atomico;dur=/);

    const { status } = await post(BASE, { ...PAYLOAD, professional_id: 'nao-e-uuid' }, AUTH);
    assert.strictEqual(status, 400);
  });

  test('retorna 400 quando scheduled_at está no passado', async () => {
    const passado = new Date(Date.now() - 60_000).toISOString();
    const { status } = await post(BASE, { ...PAYLOAD, scheduled_at: passado }, AUTH);
    assert.strictEqual(status, 400);
  });

  test('retorna 409 quando há conflito de horário', async () => {
    mockCfg.conflitos = [{
      id:           'ffffffff-ffff-4fff-8fff-ffffffffffff',
      scheduled_at: FUTURO,
      duration_min: 60,
      status:       'confirmed',
    }];
    const { status } = await post(BASE, PAYLOAD, AUTH);
    assert.strictEqual(status, 409);
    mockCfg.conflitos = [];
  });

});

// ─── Suite 3: PATCH /api/agendamentos/:id ────────────────────────

suite('AgendamentoController — PATCH /api/agendamentos/:id', () => {

  test('retorna 401 sem Authorization', async () => {
    const { status } = await patch(`${BASE}/${UUID_AG}`, { status: 'confirmed' });
    assert.strictEqual(status, 401);
  });

  test('retorna 400 para status completamente inválido (string desconhecida)', async () => {
    const { status } = await patch(`${BASE}/${UUID_AG}`, { status: 'invalid-xyz' }, AUTH);
    assert.strictEqual(status, 400);
  });

  test('atualiza status com transição válida (pending → confirmed) → 200', async () => {
    const { status, body } = await patch(`${BASE}/${UUID_AG}`, { status: 'confirmed' }, AUTH);
    assert.strictEqual(status, 200);
    assert.strictEqual(body.ok, true);
  });

  test('retorna 422 para transição inválida (done → confirmed)', async () => {
    mockCfg.porId = { ...AG_MOCK, status: 'done' };
    const { status } = await patch(`${BASE}/${UUID_AG}`, { status: 'confirmed' }, AUTH);
    assert.strictEqual(status, 422);
    mockCfg.porId = AG_MOCK;
  });

  test('retorna 403 quando usuário não é dono do agendamento', async () => {
    mockCfg.porId = {
      ...AG_MOCK,
      client_id:       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      professional_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    };
    const { status } = await patch(`${BASE}/${UUID_AG}`, { status: 'confirmed' }, AUTH);
    assert.strictEqual(status, 403);
    mockCfg.porId = AG_MOCK;
  });

});

// ─── Suite 4: DELETE /api/agendamentos/:id ───────────────────────

suite('AgendamentoController — DELETE /api/agendamentos/:id', () => {

  test('retorna 401 sem Authorization', async () => {
    const { status } = await del(`${BASE}/${UUID_AG}`);
    assert.strictEqual(status, 401);
  });

  test('cancela agendamento pendente → 200', async () => {
    mockCfg.atualizado = { ...AG_MOCK, status: 'cancelled' };
    const { status, body } = await del(`${BASE}/${UUID_AG}`, AUTH);
    assert.strictEqual(status, 200);
    assert.strictEqual(body.ok, true);
    mockCfg.atualizado = { ...AG_MOCK, status: 'confirmed' };
  });

  test('retorna 422 quando agendamento já está cancelado', async () => {
    mockCfg.porId = { ...AG_MOCK, status: 'cancelled' };
    const { status } = await del(`${BASE}/${UUID_AG}`, AUTH);
    assert.strictEqual(status, 422);
    mockCfg.porId = AG_MOCK;
  });

});
