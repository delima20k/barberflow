'use strict';

const { suite, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http   = require('node:http');
const jwt    = require('jsonwebtoken');

// ── Env vars — ANTES de qualquer require da aplicação ────────────
process.env.APP_ENV                   = 'test';
process.env.SUPABASE_URL              = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.SUPABASE_ANON_KEY         = 'test-anon-key';
process.env.SUPABASE_JWT_SECRET       = 'test-jwt-secret-at-least-32-chars!!';

// ── UUIDs fixos ───────────────────────────────────────────────────
const SHOP_ID    = 'cccccccc-0000-4000-8000-000000000003';
const CLIENT_ID  = 'dddddddd-0000-4000-8000-000000000004';
const OWNER_ID   = 'eeeeeeee-0000-4000-8000-000000000005';
const OTHER_ID   = 'ffffffff-0000-4000-8000-000000000006';
const MENSAL_ID  = '11111111-0000-4000-8000-000000000007';

const _now    = new Date();
const _endsAt = new Date(_now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

const MOCK_ROW = {
  id:             MENSAL_ID,
  barbershop_id:  SHOP_ID,
  client_id:      CLIENT_ID,
  starts_at:      _now.toISOString(),
  ends_at:        _endsAt,
  monthly_fee:    149.9,
  haircuts_count: 5,
};

const MOCK_SHOP_OWNER    = { id: SHOP_ID, owner_id: OWNER_ID };
const MOCK_SHOP_OTHER    = { id: SHOP_ID, owner_id: OTHER_ID };
const MOCK_PROFILE       = { id: CLIENT_ID, full_name: 'João Silva', avatar_path: null, email: 'joao@test.com' };

// ── Estado mutável por cenário ───────────────────────────────────
let _mockShop    = MOCK_SHOP_OWNER; // troca para simular não-owner
let _mockRow     = MOCK_ROW;        // null = não encontrado (getById)
let _mockLista   = [MOCK_ROW];
let _mockAtivo   = true;
let _mockProfiles = [MOCK_PROFILE];

// ── Mock Supabase (injeta antes de require da app) ────────────────
const SupabaseClient = require('../utils/SupabaseClient');
{
  const criarQB = (table) => {
    const q = {
      _op:        null,
      _select:    null,
      _filters:   [],
      _data:      null,
      _hasUpsert: false,

      select:      (s)        => { q._op = 'select'; q._select = s; return q; },
      upsert:      (data)     => { q._op = 'upsert'; q._hasUpsert = true; q._data = data; return q; },
      insert:      (data)     => { q._op = 'insert'; q._data = data; return q; },
      delete:      ()         => { q._op = 'delete'; return q; },
      update:      (data)     => { q._op = 'update'; q._data = data; return q; },
      eq:          (col, val) => { q._filters.push(['eq', col, val]); return q; },
      gt:          (col, val) => { q._filters.push(['gt', col, val]); return q; },
      ilike:       (col, val) => { q._filters.push(['ilike', col, val]); return q; },
      not:         ()         => q, // ignora filtro no mock
      in:          ()         => q,
      limit:       ()         => q,
      order:       ()         => q,

      // .maybeSingle() — retorna { data: row|null, error: null }
      maybeSingle: () => {
        if (table === 'barbershops') {
          return Promise.resolve({ data: _mockShop ?? null, error: null });
        }
        if (table === 'barbershop_mensalistas') {
          if (q._select === 'id, monthly_fee, haircuts_count') {
            // verificar — retorna objeto completo ou null
            return Promise.resolve({
              data: _mockAtivo
                ? { id: MENSAL_ID, monthly_fee: 149.9, haircuts_count: 5 }
                : null,
              error: null,
            });
          }
          // getById
          return Promise.resolve({ data: _mockRow, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },

      // .single() — usado no upsert/adicionar (.upsert().select().single())
      single: () => {
        if (table === 'barbershop_mensalistas' && q._hasUpsert) {
          return Promise.resolve({ data: { ...MOCK_ROW, ...q._data }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },

      // .then() — para queries sem terminal explícito (SELECT lista, DELETE, UPDATE)
      then: (resolve) => {
        if (table === 'barbershop_mensalistas') {
          if (q._op === 'delete') return resolve({ data: null, error: null });
          if (q._op === 'update') return resolve({ data: null, error: null });
          if (q._op === 'select' && q._select === 'client_id') {
            // buscarClientesDisponiveis — sub-query de ativos
            return resolve({ data: [], error: null });
          }
          // listar
          return resolve({ data: _mockLista, error: null });
        }
        if (table === 'profiles') {
          return resolve({ data: _mockProfiles, error: null });
        }
        return resolve({ data: null, error: null });
      },
    };
    return q;
  };

  SupabaseClient.getInstance = () => ({ from: criarQB });
}

const criarApp = require('../app');

// ─────────────────────────────────────────────────────────────────
// Helpers HTTP
// ─────────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

/**
 * Gera JWT válido (mesmo secret que AuthMiddleware usa).
 * @param {string} userId
 * @returns {string}
 */
function gerarToken(userId) {
  return jwt.sign({ sub: userId, role: 'authenticated' }, JWT_SECRET, { expiresIn: '1h' });
}

/**
 * Faz request HTTP para o servidor de teste.
 * @param {http.Server} servidor
 * @param {object}      opts
 * @returns {Promise<{status:number, body:object}>}
 */
function request(servidor, { method, path, body, token }) {
  return new Promise((resolve, reject) => {
    const addr  = servidor.address();
    const porta = addr.port;
    const dados = body ? JSON.stringify(body) : null;

    const opts = {
      hostname: '127.0.0.1',
      port:     porta,
      path,
      method,
      headers: {
        'Content-Type':  'application/json',
        'Content-Length': dados ? Buffer.byteLength(dados) : 0,
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
    };

    const req = http.request(opts, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        try   { resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : {} }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (dados) req.write(dados);
    req.end();
  });
}

// ═════════════════════════════════════════════════════════════════
// SUITE 1 — Unit: MensalistaService (sem HTTP, mocks injetados)
// ═════════════════════════════════════════════════════════════════
suite('MensalistaService — unit', () => {
  const MensalistaService    = require('../services/MensalistaService');
  const MensalistaRepository = require('../repositories/MensalistaRepository');

  /** Cria um db mock simples para injetar no service/repo. */
  function criarDbMock({ shop = null, row = null, ativo = true, lista = [] } = {}) {
    return {
      from: (table) => {
        const q = {
          _op: null,
          select:      () => { q._op = 'select'; return q; },
          upsert:      () => { q._op = 'upsert'; return q; },
          delete:      () => { q._op = 'delete'; return q; },
          update:      (data) => { q._op = 'update'; q._data = data; return q; },
          eq:          () => q,
          gt:          () => q,
          ilike:       () => q,
          not:         () => q,
          limit:       () => q,
          order:       () => q,
          maybeSingle: () => {
            if (table === 'barbershops')          return Promise.resolve({ data: shop, error: null });
            if (table === 'barbershop_mensalistas') {
              if (q._op === 'select') return Promise.resolve({ data: ativo ? { id: MENSAL_ID, monthly_fee: 149.9, haircuts_count: 5 } : null, error: null });
              return Promise.resolve({ data: row, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          },
          single: () => Promise.resolve({ data: row, error: null }),
          then: (resolve) => {
            if (table === 'barbershop_mensalistas') {
              if (q._op === 'delete') return resolve({ data: null, error: null });
              if (q._op === 'update') return resolve({ data: null, error: null });
              return resolve({ data: lista, error: null });
            }
            return resolve({ data: [], error: null });
          },
        };
        return q;
      },
    };
  }

  test('adicionar — owner válido: retorna row', async () => {
    const db   = criarDbMock({ shop: MOCK_SHOP_OWNER, row: MOCK_ROW });
    const repo = new MensalistaRepository(db);
    const svc  = new MensalistaService(repo, db);

    // Monkey-patch repo.adicionar para retornar MOCK_ROW sem chamar Supabase
    repo.adicionar = async () => MOCK_ROW;

    const resultado = await svc.adicionar(OWNER_ID, SHOP_ID, CLIENT_ID);
    assert.strictEqual(resultado.id, MENSAL_ID);
    assert.strictEqual(resultado.barbershop_id, SHOP_ID);
  });

  test('adicionar — mensalidade: normaliza e envia para o repository', async () => {
    const db   = criarDbMock({ shop: MOCK_SHOP_OWNER, row: MOCK_ROW });
    const repo = new MensalistaRepository(db);
    const svc  = new MensalistaService(repo, db);
    let monthlyFeeRecebido = null;

    repo.adicionar = async (_shopId, _clientId, monthlyFee) => {
      monthlyFeeRecebido = monthlyFee;
      return { ...MOCK_ROW, monthly_fee: monthlyFee };
    };

    const resultado = await svc.adicionar(OWNER_ID, SHOP_ID, CLIENT_ID, '149.899');
    assert.strictEqual(monthlyFeeRecebido, 149.9);
    assert.strictEqual(resultado.monthly_fee, 149.9);
  });

  test('adicionar — mensalidade negativa: lança AppError 400', async () => {
    const db   = criarDbMock({ shop: MOCK_SHOP_OWNER, row: MOCK_ROW });
    const repo = new MensalistaRepository(db);
    const svc  = new MensalistaService(repo, db);

    await assert.rejects(
      () => svc.adicionar(OWNER_ID, SHOP_ID, CLIENT_ID, -1),
      (err) => { assert.strictEqual(err.status, 400); return true; },
    );
  });

  test('adicionar — não-owner: lança AppError 403', async () => {
    const db  = criarDbMock({ shop: MOCK_SHOP_OTHER }); // owner_id = OTHER_ID
    const repo = new MensalistaRepository(db);
    const svc  = new MensalistaService(repo, db);

    await assert.rejects(
      () => svc.adicionar(OWNER_ID, SHOP_ID, CLIENT_ID),
      (err) => {
        assert.strictEqual(err.status, 403);
        return true;
      },
    );
  });

  test('adicionar — shop inexistente: lança AppError 403', async () => {
    const db  = criarDbMock({ shop: null });
    const repo = new MensalistaRepository(db);
    const svc  = new MensalistaService(repo, db);

    await assert.rejects(
      () => svc.adicionar(OWNER_ID, SHOP_ID, CLIENT_ID),
      (err) => { assert.strictEqual(err.status, 403); return true; },
    );
  });

  test('verificar — ativo: retorna { ativo, monthly_fee, haircuts_count }', async () => {
    const db  = criarDbMock({ ativo: true });
    const repo = new MensalistaRepository(db);
    const svc  = new MensalistaService(repo, db);

    repo.verificar = async () => ({ id: MENSAL_ID, monthly_fee: 149.9, haircuts_count: 5 });

    const resultado = await svc.verificar(SHOP_ID, CLIENT_ID);
    assert.deepEqual(resultado, { ativo: true, monthly_fee: 149.9, haircuts_count: 5 });
  });

  test('verificar — cliente não mensalista: retorna { ativo: false, monthly_fee: 0, haircuts_count: 0 }', async () => {
    const db  = criarDbMock({ ativo: false });
    const repo = new MensalistaRepository(db);
    const svc  = new MensalistaService(repo, db);

    repo.verificar = async () => null;

    const resultado = await svc.verificar(SHOP_ID, CLIENT_ID);
    assert.deepEqual(resultado, { ativo: false, monthly_fee: 0, haircuts_count: 0 });
  });

  test('incrementarCortes — sem ownership check: não lança', async () => {
    const db  = criarDbMock({ ativo: true });
    const repo = new MensalistaRepository(db);
    const svc  = new MensalistaService(repo, db);

    repo.incrementarCortes = async () => {};

    await assert.doesNotReject(() => svc.incrementarCortes(SHOP_ID, CLIENT_ID));
  });

  test('remover — owner válido: não lança', async () => {
    const db  = criarDbMock({ shop: MOCK_SHOP_OWNER, row: MOCK_ROW });
    const repo = new MensalistaRepository(db);
    const svc  = new MensalistaService(repo, db);

    repo.getById = async () => MOCK_ROW;
    repo.remover = async () => {};

    await assert.doesNotReject(() => svc.remover(OWNER_ID, MENSAL_ID));
  });

  test('remover — row inexistente: lança AppError 404', async () => {
    const db  = criarDbMock({ shop: MOCK_SHOP_OWNER, row: null });
    const repo = new MensalistaRepository(db);
    const svc  = new MensalistaService(repo, db);

    repo.getById = async () => null;

    await assert.rejects(
      () => svc.remover(OWNER_ID, MENSAL_ID),
      (err) => { assert.strictEqual(err.status, 404); return true; },
    );
  });

  test('remover — não-owner: lança AppError 403', async () => {
    const db  = criarDbMock({ shop: MOCK_SHOP_OTHER, row: MOCK_ROW });
    const repo = new MensalistaRepository(db);
    const svc  = new MensalistaService(repo, db);

    repo.getById = async () => MOCK_ROW;

    await assert.rejects(
      () => svc.remover(OWNER_ID, MENSAL_ID),
      (err) => { assert.strictEqual(err.status, 403); return true; },
    );
  });
});

suite('MensalistaRepository — compatibilidade de schema mensalidade', () => {
  const MensalistaRepository = require('../repositories/MensalistaRepository');

  test('listar — fallback sem monthly_fee quando coluna ainda nao existe', async () => {
    const erroColuna = { code: '42703', message: 'column monthly_fee does not exist' };
    const selects = [];
    const db = {
      from: (table) => {
        const q = {
          _select: '',
          select: (s) => { q._select = s; selects.push([table, s]); return q; },
          eq:     () => q,
          gt:     () => q,
          order:  () => q,
          in:     () => q,
          then: (resolve) => {
            if (table === 'barbershop_mensalistas') {
              if (q._select.includes('monthly_fee')) {
                return resolve({ data: null, error: erroColuna });
              }
              return resolve({ data: [{ ...MOCK_ROW, monthly_fee: undefined }], error: null });
            }
            if (table === 'profiles') {
              return resolve({ data: [MOCK_PROFILE], error: null });
            }
            return resolve({ data: null, error: null });
          },
        };
        return q;
      },
    };
    const repo = new MensalistaRepository(db);

    const lista = await repo.listar(SHOP_ID);

    assert.strictEqual(lista.length, 1);
    assert.strictEqual(lista[0].monthly_fee, 0);
    assert.ok(selects.some(([, s]) => s === 'id, client_id, starts_at, ends_at'));
  });

  test('adicionar — fallback sem monthly_fee quando schema cache ainda nao tem coluna', async () => {
    const erroColuna = { code: 'PGRST204', message: "Could not find the 'monthly_fee' column in the schema cache" };
    const payloads = [];
    const db = {
      from: (table) => {
        const q = {
          _data: null,
          upsert: (data) => { q._data = data; payloads.push(data); return q; },
          select: () => q,
          single: () => {
            if (table === 'barbershop_mensalistas' && q._data.monthly_fee !== undefined) {
              return Promise.resolve({ data: null, error: erroColuna });
            }
            return Promise.resolve({ data: { ...MOCK_ROW, monthly_fee: undefined }, error: null });
          },
        };
        return q;
      },
    };
    const repo = new MensalistaRepository(db);

    const row = await repo.adicionar(SHOP_ID, CLIENT_ID, 149.9);

    assert.strictEqual(payloads.length, 2);
    assert.strictEqual(payloads[0].monthly_fee, 149.9);
    assert.strictEqual(payloads[1].monthly_fee, undefined);
    assert.strictEqual(row.monthly_fee, 0);
  });
});

// ═════════════════════════════════════════════════════════════════
// SUITE 2 — Integração HTTP
// ═════════════════════════════════════════════════════════════════
suite('Mensalistas — integração HTTP', () => {
  let servidor;
  const TOKEN_OWNER = gerarToken(OWNER_ID);
  const TOKEN_OTHER = gerarToken(OTHER_ID);

  before(() => {
    const app = criarApp();
    servidor  = http.createServer(app);
    return new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  });

  after(() => new Promise((ok) => servidor.close(ok)));

  // ─── POST /api/v1/mensalistas ───────────────────────────────
  suite('POST /api/v1/mensalistas', () => {
    test('201 — owner válido: retorna row criada', async () => {
      _mockShop = MOCK_SHOP_OWNER;
      const { status, body } = await request(servidor, {
        method: 'POST',
        path:   '/api/v1/mensalistas',
        token:  TOKEN_OWNER,
        body:   { barbershop_id: SHOP_ID, client_id: CLIENT_ID, monthly_fee: 149.9 },
      });

      assert.strictEqual(status, 201, JSON.stringify(body));
      assert.strictEqual(body.ok, true);
      assert.strictEqual(body.dados.id, MENSAL_ID);
      assert.strictEqual(body.dados.barbershop_id, SHOP_ID);
      assert.strictEqual(body.dados.monthly_fee, 149.9);
    });

    test('401 — sem token: rejeita autenticação', async () => {
      const { status } = await request(servidor, {
        method: 'POST',
        path:   '/api/v1/mensalistas',
        body:   { barbershop_id: SHOP_ID, client_id: CLIENT_ID },
      });
      assert.strictEqual(status, 401);
    });

    test('400 — sem barbershop_id: retorna erro de campo obrigatório', async () => {
      const { status, body } = await request(servidor, {
        method: 'POST',
        path:   '/api/v1/mensalistas',
        token:  TOKEN_OWNER,
        body:   { client_id: CLIENT_ID },
      });
      assert.strictEqual(status, 400, JSON.stringify(body));
    });

    test('400 — sem client_id: retorna erro de campo obrigatório', async () => {
      const { status } = await request(servidor, {
        method: 'POST',
        path:   '/api/v1/mensalistas',
        token:  TOKEN_OWNER,
        body:   { barbershop_id: SHOP_ID },
      });
      assert.strictEqual(status, 400);
    });

    test('403 — token de não-owner: acesso negado', async () => {
      _mockShop = MOCK_SHOP_OWNER; // shop.owner_id = OWNER_ID, mas TOKEN_OTHER tem sub=OTHER_ID
      const { status } = await request(servidor, {
        method: 'POST',
        path:   '/api/v1/mensalistas',
        token:  TOKEN_OTHER,
        body:   { barbershop_id: SHOP_ID, client_id: CLIENT_ID },
      });
      assert.strictEqual(status, 403);
    });
  });

  // ─── GET /api/v1/mensalistas ────────────────────────────────
  suite('GET /api/v1/mensalistas', () => {
    test('200 — owner válido: retorna lista com meta.total', async () => {
      _mockShop  = MOCK_SHOP_OWNER;
      _mockLista = [MOCK_ROW];
      const { status, body } = await request(servidor, {
        method: 'GET',
        path:   `/api/v1/mensalistas?barbershop_id=${SHOP_ID}`,
        token:  TOKEN_OWNER,
      });

      assert.strictEqual(status, 200, JSON.stringify(body));
      assert.strictEqual(body.ok, true);
      assert.ok(Array.isArray(body.dados));
      assert.strictEqual(body.meta.total, 1);
      assert.strictEqual(body.dados[0].monthly_fee, 149.9);
    });

    test('401 — sem token', async () => {
      const { status } = await request(servidor, {
        method: 'GET',
        path:   `/api/v1/mensalistas?barbershop_id=${SHOP_ID}`,
      });
      assert.strictEqual(status, 401);
    });

    test('400 — sem barbershop_id', async () => {
      const { status } = await request(servidor, {
        method: 'GET',
        path:   '/api/v1/mensalistas',
        token:  TOKEN_OWNER,
      });
      assert.strictEqual(status, 400);
    });

    test('403 — não-owner', async () => {
      _mockShop = MOCK_SHOP_OWNER;
      const { status } = await request(servidor, {
        method: 'GET',
        path:   `/api/v1/mensalistas?barbershop_id=${SHOP_ID}`,
        token:  TOKEN_OTHER,
      });
      assert.strictEqual(status, 403);
    });
  });

  // ─── GET /api/v1/mensalistas/verificar ──────────────────────
  suite('GET /api/v1/mensalistas/verificar', () => {
    test('200 ativo=true — cliente é mensalista ativo: retorna dados do plano', async () => {
      _mockAtivo = true;
      const { status, body } = await request(servidor, {
        method: 'GET',
        path:   `/api/v1/mensalistas/verificar?barbershop_id=${SHOP_ID}&client_id=${CLIENT_ID}`,
        token:  TOKEN_OWNER,
      });

      assert.strictEqual(status, 200, JSON.stringify(body));
      assert.strictEqual(body.dados.ativo, true);
      assert.strictEqual(body.dados.monthly_fee, 149.9);
      assert.strictEqual(body.dados.haircuts_count, 5);
    });

    test('200 ativo=false — cliente não é mensalista: zeros', async () => {
      _mockAtivo = false;
      const { status, body } = await request(servidor, {
        method: 'GET',
        path:   `/api/v1/mensalistas/verificar?barbershop_id=${SHOP_ID}&client_id=${CLIENT_ID}`,
        token:  TOKEN_OTHER, // qualquer autenticado pode verificar
      });

      assert.strictEqual(status, 200, JSON.stringify(body));
      assert.strictEqual(body.dados.ativo, false);
      assert.strictEqual(body.dados.monthly_fee, 0);
      assert.strictEqual(body.dados.haircuts_count, 0);
    });

    test('401 — sem token', async () => {
      const { status } = await request(servidor, {
        method: 'GET',
        path:   `/api/v1/mensalistas/verificar?barbershop_id=${SHOP_ID}&client_id=${CLIENT_ID}`,
      });
      assert.strictEqual(status, 401);
    });

    test('400 — sem client_id', async () => {
      const { status } = await request(servidor, {
        method: 'GET',
        path:   `/api/v1/mensalistas/verificar?barbershop_id=${SHOP_ID}`,
        token:  TOKEN_OWNER,
      });
      assert.strictEqual(status, 400);
    });
  });

  // ─── DELETE /api/v1/mensalistas/:id ─────────────────────────
  suite('DELETE /api/v1/mensalistas/:id', () => {
    test('204 — owner válido: deleta e retorna sem body', async () => {
      _mockShop = MOCK_SHOP_OWNER;
      _mockRow  = MOCK_ROW;
      const { status } = await request(servidor, {
        method: 'DELETE',
        path:   `/api/v1/mensalistas/${MENSAL_ID}`,
        token:  TOKEN_OWNER,
      });
      assert.strictEqual(status, 204);
    });

    test('401 — sem token', async () => {
      const { status } = await request(servidor, {
        method: 'DELETE',
        path:   `/api/v1/mensalistas/${MENSAL_ID}`,
      });
      assert.strictEqual(status, 401);
    });

    test('404 — ID inexistente', async () => {
      _mockRow = null; // getById retorna null
      const { status } = await request(servidor, {
        method: 'DELETE',
        path:   `/api/v1/mensalistas/${MENSAL_ID}`,
        token:  TOKEN_OWNER,
      });
      assert.strictEqual(status, 404);
    });

    test('403 — não-owner tenta deletar', async () => {
      _mockRow  = MOCK_ROW;
      _mockShop = MOCK_SHOP_OWNER;
      const { status } = await request(servidor, {
        method: 'DELETE',
        path:   `/api/v1/mensalistas/${MENSAL_ID}`,
        token:  TOKEN_OTHER, // OTHER_ID !== OWNER_ID → 403
      });
      assert.strictEqual(status, 403);
    });
  });

  // ─── POST /api/v1/mensalistas/incrementar-cortes ────────────
  suite('POST /api/v1/mensalistas/incrementar-cortes', () => {
    test('204 — mensalista ativo: incrementa e retorna sem body', async () => {
      _mockAtivo = true;
      const { status } = await request(servidor, {
        method: 'POST',
        path:   '/api/v1/mensalistas/incrementar-cortes',
        token:  TOKEN_OWNER,
        body:   { barbershop_id: SHOP_ID, client_id: CLIENT_ID },
      });
      assert.strictEqual(status, 204);
    });

    test('204 — qualquer autenticado pode incrementar (sem ownership check)', async () => {
      _mockAtivo = true;
      const { status } = await request(servidor, {
        method: 'POST',
        path:   '/api/v1/mensalistas/incrementar-cortes',
        token:  TOKEN_OTHER,
        body:   { barbershop_id: SHOP_ID, client_id: CLIENT_ID },
      });
      assert.strictEqual(status, 204);
    });

    test('400 — sem barbershop_id', async () => {
      const { status } = await request(servidor, {
        method: 'POST',
        path:   '/api/v1/mensalistas/incrementar-cortes',
        token:  TOKEN_OWNER,
        body:   { client_id: CLIENT_ID },
      });
      assert.strictEqual(status, 400);
    });

    test('400 — sem client_id', async () => {
      const { status } = await request(servidor, {
        method: 'POST',
        path:   '/api/v1/mensalistas/incrementar-cortes',
        token:  TOKEN_OWNER,
        body:   { barbershop_id: SHOP_ID },
      });
      assert.strictEqual(status, 400);
    });

    test('401 — sem token', async () => {
      const { status } = await request(servidor, {
        method: 'POST',
        path:   '/api/v1/mensalistas/incrementar-cortes',
        body:   { barbershop_id: SHOP_ID, client_id: CLIENT_ID },
      });
      assert.strictEqual(status, 401);
    });
  });

  // ─── GET /api/v1/mensalistas/clientes-disponiveis ───────────
  suite('GET /api/v1/mensalistas/clientes-disponiveis', () => {
    test('200 — retorna perfis disponíveis com meta.total', async () => {
      _mockShop     = MOCK_SHOP_OWNER;
      _mockProfiles = [MOCK_PROFILE];
      const { status, body } = await request(servidor, {
        method: 'GET',
        path:   `/api/v1/mensalistas/clientes-disponiveis?barbershop_id=${SHOP_ID}&q=Joao`,
        token:  TOKEN_OWNER,
      });

      assert.strictEqual(status, 200, JSON.stringify(body));
      assert.strictEqual(body.ok, true);
      assert.ok(Array.isArray(body.dados));
      assert.strictEqual(body.meta.total, 1);
    });

    test('200 — sem q: usa string vazia', async () => {
      _mockShop     = MOCK_SHOP_OWNER;
      _mockProfiles = [MOCK_PROFILE];
      const { status, body } = await request(servidor, {
        method: 'GET',
        path:   `/api/v1/mensalistas/clientes-disponiveis?barbershop_id=${SHOP_ID}`,
        token:  TOKEN_OWNER,
      });
      assert.strictEqual(status, 200, JSON.stringify(body));
    });

    test('401 — sem token', async () => {
      const { status } = await request(servidor, {
        method: 'GET',
        path:   `/api/v1/mensalistas/clientes-disponiveis?barbershop_id=${SHOP_ID}`,
      });
      assert.strictEqual(status, 401);
    });

    test('400 — sem barbershop_id', async () => {
      const { status } = await request(servidor, {
        method: 'GET',
        path:   '/api/v1/mensalistas/clientes-disponiveis?q=João',
        token:  TOKEN_OWNER,
      });
      assert.strictEqual(status, 400);
    });

    test('403 — não-owner', async () => {
      _mockShop = MOCK_SHOP_OWNER;
      const { status } = await request(servidor, {
        method: 'GET',
        path:   `/api/v1/mensalistas/clientes-disponiveis?barbershop_id=${SHOP_ID}`,
        token:  TOKEN_OTHER,
      });
      assert.strictEqual(status, 403);
    });
  });
});
