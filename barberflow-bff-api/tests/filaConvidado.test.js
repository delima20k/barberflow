'use strict';

const { suite, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http   = require('node:http');

// ── Configura env antes de importar o app ────────────────────────
process.env.APP_ENV                   = 'development';
process.env.SUPABASE_URL              = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.SUPABASE_ANON_KEY         = 'test-anon-key';

// UUID v4-shaped (versão "4" e variante "8") — BarbeariaRepository valida
// formato estrito, não aceita qualquer sequência hex.
const SHOP = '11111111-1111-4111-8111-111111111111';
const PROF = '22222222-2222-4222-8222-222222222222';
const SERV = '44444444-4444-4444-8444-444444444444';

// ── Mock de banco genérico por tabela ─────────────────────────────
// Cada tabela responde de forma fixa, independente dos filtros — suficiente
// para testar a rota (não é um substituto para os testes de unidade do
// use case, que já cobrem as regras de negócio com fakes dedicados).
function criarMockDb(config) {
  return {
    from(table) {
      const cfg = config[table] ?? {};
      let op = 'many';
      const chain = {
        select(_cols, opts) {
          if (opts && opts.count === 'exact' && opts.head) op = 'count';
          return chain;
        },
        eq()     { return chain; },
        in()     { return chain; },
        order()  { return chain; },
        not()    { return chain; },
        limit()  { return chain; },
        insert(rows) { op = 'insert'; chain._rows = rows; return chain; },
        upsert(row)  { op = 'insert'; chain._rows = row;  return chain; },
        maybeSingle() { return Promise.resolve(cfg.maybeSingle ?? { data: null, error: null }); },
        single()      { return Promise.resolve(cfg.single ?? cfg.insertResult ?? { data: null, error: null }); },
        then(resolve, reject) {
          const result = op === 'count'  ? (cfg.count ?? { count: 0, error: null })
                       : op === 'insert' ? (cfg.insertResult ?? { data: null, error: null })
                       :                    (cfg.many ?? { data: [], error: null });
          Promise.resolve(result).then(resolve, reject);
        },
      };
      return chain;
    },
  };
}

const SupabaseClient = require('../utils/SupabaseClient');
const mockDb = criarMockDb({
  barbershops: {
    maybeSingle: { data: { id: SHOP, name: 'Barbearia Teste', is_open: true, close_reason: null, is_active: true }, error: null },
  },
  professional_shop_links: {
    maybeSingle: { data: { professional_id: PROF }, error: null },
  },
  queue_entries: {
    count: { count: 0, error: null },
    single: { data: { id: 'entry-1' }, error: null },
  },
  services: {
    many: { data: [{ id: SERV }], error: null },
  },
  queue_entry_services: {
    insertResult: { data: null, error: null },
  },
});
SupabaseClient.getInstance = () => mockDb;

const criarApp = require('../app');

let server;
let port;

before(async () => {
  const app = criarApp(mockDb);
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  port = server.address().port;
});

after(async () => {
  await new Promise((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

// ── Helper HTTP ────────────────────────────────────────────────────
function post(path, body, { ip = '10.0.0.1' } = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body ?? {});
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method: 'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'X-Forwarded-For': ip,
      },
    }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ── Testes ──────────────────────────────────────────────────────────

suite('POST /api/v1/fila/entrar — validação', () => {
  test('guest_name ausente → 400', async () => {
    const { status, body } = await post('/api/v1/fila/entrar', { barbershop_id: SHOP }, { ip: '10.0.1.1' });
    assert.equal(status, 400);
    assert.equal(body.ok, false);
  });

  test('barbershop_id ausente → 400', async () => {
    const { status } = await post('/api/v1/fila/entrar', { guest_name: 'Alan' }, { ip: '10.0.1.2' });
    assert.equal(status, 400);
  });

  test('guest_phone em formato inválido → 400', async () => {
    const { status } = await post('/api/v1/fila/entrar', {
      barbershop_id: SHOP, guest_name: 'Alan', guest_phone: 'abc',
    }, { ip: '10.0.1.3' });
    assert.equal(status, 400);
  });
});

suite('POST /api/v1/fila/entrar — sucesso', () => {
  test('cria entrada guest com client_id nulo, mesmo enviando client_id no corpo', async () => {
    const { status, body } = await post('/api/v1/fila/entrar', {
      barbershop_id: SHOP, guest_name: 'Alan', guest_phone: '11999998888',
      client_id: '99999999-9999-9999-9999-999999999999', // deve ser ignorado pela rota
    }, { ip: '10.0.2.1' });

    assert.equal(status, 201);
    assert.equal(body.ok, true);
    assert.equal(body.dados.clienteId, null);
    assert.equal(body.dados.guestName, 'Alan');
    assert.equal(body.dados.guestPhone, '11999998888');
    assert.equal(body.dados.status, 'waiting');
  });

  test('cria entrada guest com profissional e serviços escolhidos', async () => {
    const { status, body } = await post('/api/v1/fila/entrar', {
      barbershop_id: SHOP, professional_id: PROF, guest_name: 'Bia', service_ids: [SERV],
    }, { ip: '10.0.2.2' });

    assert.equal(status, 201);
    assert.equal(body.ok, true);
    assert.equal(body.dados.guestName, 'Bia');
  });
});

suite('POST /api/v1/fila/entrar — limite de tentativas por IP', () => {
  test('bloqueia após exceder o limite configurado (5 por 10min) para o mesmo IP', async () => {
    const ip = '10.0.3.1';
    const payload = { barbershop_id: SHOP, guest_name: 'Spam' };

    const respostas = [];
    for (let i = 0; i < 6; i++) {
      respostas.push(await post('/api/v1/fila/entrar', payload, { ip }));
    }

    const sucesso   = respostas.filter(r => r.status === 201);
    const bloqueado = respostas[respostas.length - 1];

    assert.equal(sucesso.length, 5, 'as primeiras 5 requisições devem passar');
    assert.notEqual(bloqueado.status, 201, 'a 6ª requisição do mesmo IP deve ser bloqueada');
    assert.equal(bloqueado.body.ok, false);
  });

  test('IP diferente não é afetado pelo limite do outro', async () => {
    const { status } = await post('/api/v1/fila/entrar', { barbershop_id: SHOP, guest_name: 'Outro' }, { ip: '10.0.3.2' });
    assert.equal(status, 201);
  });
});
