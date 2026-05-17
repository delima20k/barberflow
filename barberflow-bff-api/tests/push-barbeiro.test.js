'use strict';

const { suite, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http   = require('node:http');
const jwt    = require('jsonwebtoken');

// ── Env vars — ANTES de qualquer require da aplicação ────────────
process.env.APP_ENV                   = 'test';
process.env.SUPABASE_URL              = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.SUPABASE_JWT_SECRET       = 'test-jwt-secret-at-least-32-chars!!';
process.env.VAPID_PUBLIC_KEY          = 'BN4vBEVfakeVapidPublicKeyForTestsOnly000000000000000000000000000000000000000000000000000';
process.env.VAPID_PRIVATE_KEY         = 'fakeVapidPrivateKeyForTests00000000000=';
process.env.VAPID_SUBJECT             = 'mailto:test@barberflow.app';

// ── UUIDs fixos ───────────────────────────────────────────────────
const ENTRY_ID  = 'aaaaaaaa-0000-4000-8000-000000000001';
const PROF_ID   = 'bbbbbbbb-0000-4000-8000-000000000002';
const SHOP_ID   = 'cccccccc-0000-4000-8000-000000000003';
const CLIENT_ID = 'dddddddd-0000-4000-8000-000000000004';

const MOCK_SUB = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/fake-token',
  p256dh:   'BFakeP256DH==',
  auth_key: 'FakeAuth==',
};

// ── Mock web-push — injeta no require.cache ANTES de require('../app') ──
// Requer que `npm install` já tenha sido executado na BFF.
const mockWebPush = {
  setVapidDetails:  () => {},
  sendNotification: async () => ({ statusCode: 201 }),
};
const webpushKey = require.resolve('web-push');
require.cache[webpushKey] = {
  id: webpushKey, filename: webpushKey, loaded: true, exports: mockWebPush,
};

// ── Mock Supabase ─────────────────────────────────────────────────
// _mockEntrada pode ser mutado por testes específicos (ex: cenário 403).
let _mockEntrada = { id: ENTRY_ID, professional_id: PROF_ID };

const SupabaseClient = require('../utils/SupabaseClient');
{
  const criarQB = (table) => {
    const q = {
      _op:    null,
      select: () => { q._op = 'select'; return q; },
      update: (dados) => {
        q._op   = 'update';
        q._data = dados;
        return q;
      },
      eq:     () => q,
      single: () => {
        if (table === 'queue_entries') {
          return Promise.resolve({ data: _mockEntrada, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      then: (resolve) => {
        if (table === 'push_subscriptions' && q._op === 'select') {
          return resolve({ data: [MOCK_SUB], error: null });
        }
        return resolve({ data: null, error: null });
      },
    };
    return q;
  };
  SupabaseClient.getInstance = () => ({ from: criarQB });
}

const criarApp = require('../app');

// =================================================================
// SUITE 1 — Unit: PushService (sem HTTP, injeção de dependências)
// =================================================================
suite('PushService — enviarAoBarbeiro()', () => {
  const PushService = require('../services/PushService');

  test('subscription válida: chama sendNotification 1x, retorna enviados:1', async () => {
    const chamadas = [];
    const wpMock = {
      setVapidDetails:  () => {},
      sendNotification: async (sub, payload) => {
        chamadas.push({ sub, payload });
        return { statusCode: 201 };
      },
    };
    const sbMock = {
      from: (table) => {
        const q = {
          _op:    null,
          select: () => { q._op = 'select'; return q; },
          update: () => { q._op = 'update'; return q; },
          eq:     () => q,
          then:   (resolve) => {
            if (table === 'push_subscriptions' && q._op === 'select') {
              return resolve({ data: [MOCK_SUB], error: null });
            }
            return resolve({ data: null, error: null });
          },
        };
        return q;
      },
    };

    const svc = new PushService(sbMock, wpMock);
    const resultado = await svc.enviarAoBarbeiro({
      professionalId: PROF_ID,
      entradaId:      ENTRY_ID,
      barbershopId:   SHOP_ID,
      type:           'client_not_seated',
      clienteNome:    'João Silva',
    });

    assert.strictEqual(chamadas.length, 1, 'sendNotification deve ser chamado exatamente 1 vez');
    assert.strictEqual(resultado.enviados, 1);
    assert.strictEqual(resultado.invalidas, 0);
  });

  test('sem subscriptions: retorna enviados:0 sem chamar sendNotification', async () => {
    const chamadas = [];
    const wpMock = {
      setVapidDetails:  () => {},
      sendNotification: async (sub, payload) => { chamadas.push({ sub, payload }); return { statusCode: 201 }; },
    };
    const sbMockVazio = {
      from: (table) => {
        const q = {
          _op:    null,
          select: () => { q._op = 'select'; return q; },
          eq:     () => q,
          then:   (resolve) => {
            if (table === 'push_subscriptions') return resolve({ data: [], error: null });
            return resolve({ data: null, error: null });
          },
        };
        return q;
      },
    };

    const svc = new PushService(sbMockVazio, wpMock);
    const resultado = await svc.enviarAoBarbeiro({
      professionalId: PROF_ID,
      entradaId:      ENTRY_ID,
      barbershopId:   SHOP_ID,
      type:           'client_at_shop',
      clienteNome:    'Ana',
    });

    assert.strictEqual(chamadas.length, 0);
    assert.strictEqual(resultado.enviados, 0);
    assert.strictEqual(resultado.invalidas, 0);
  });

  test('sendNotification com erro 410: marca is_valid=false, retorna invalidas:1', async () => {
    const atualizacoes = [];
    const wpMock410 = {
      setVapidDetails:  () => {},
      sendNotification: async () => {
        const err = new Error('Gone');
        err.statusCode = 410;
        throw err;
      },
    };
    const sbMock410 = {
      from: (table) => {
        const q = {
          _op:  null,
          select: () => { q._op = 'select'; return q; },
          update: (dados) => {
            q._op = 'update';
            if (table === 'push_subscriptions') atualizacoes.push(dados);
            return q;
          },
          eq:   () => q,
          then: (resolve) => {
            if (table === 'push_subscriptions' && q._op === 'select') {
              return resolve({ data: [MOCK_SUB], error: null });
            }
            return resolve({ data: null, error: null });
          },
        };
        return q;
      },
    };

    const svc = new PushService(sbMock410, wpMock410);
    const resultado = await svc.enviarAoBarbeiro({
      professionalId: PROF_ID,
      entradaId:      ENTRY_ID,
      barbershopId:   SHOP_ID,
      type:           'client_not_seated',
      clienteNome:    'Maria',
    });

    assert.strictEqual(resultado.invalidas, 1);
    assert.strictEqual(resultado.enviados, 0);
    assert.ok(atualizacoes.length > 0, 'deve ter chamado update para invalidar a subscription');
    assert.strictEqual(atualizacoes[0]?.is_valid, false);
  });

  test('sendNotification com erro 404: invalida subscription, retorna invalidas:1', async () => {
    const atualizacoes = [];
    const wpMock404 = {
      setVapidDetails:  () => {},
      sendNotification: async () => {
        const err = new Error('Not Found');
        err.statusCode = 404;
        throw err;
      },
    };
    const sbMock404 = {
      from: (table) => {
        const q = {
          _op:  null,
          select: () => { q._op = 'select'; return q; },
          update: (dados) => {
            q._op = 'update';
            if (table === 'push_subscriptions') atualizacoes.push(dados);
            return q;
          },
          eq:   () => q,
          then: (resolve) => {
            if (table === 'push_subscriptions' && q._op === 'select') {
              return resolve({ data: [MOCK_SUB], error: null });
            }
            return resolve({ data: null, error: null });
          },
        };
        return q;
      },
    };

    const svc = new PushService(sbMock404, wpMock404);
    const resultado = await svc.enviarAoBarbeiro({
      professionalId: PROF_ID,
      entradaId:      ENTRY_ID,
      barbershopId:   SHOP_ID,
      type:           'client_at_shop',
      clienteNome:    'Carlos',
    });

    assert.strictEqual(resultado.invalidas, 1);
    assert.strictEqual(resultado.enviados, 0);
    assert.ok(atualizacoes.length > 0);
    assert.strictEqual(atualizacoes[0]?.is_valid, false);
  });

  // ── Bug 2: payload deve diferenciar title/body por type ──────────────────

  test('type client_at_shop: title e body refletem que cliente está na barbearia', async () => {
    const chamadas = [];
    const wpMock = {
      setVapidDetails:  () => {},
      sendNotification: async (sub, payloadStr) => {
        chamadas.push(JSON.parse(payloadStr));
        return { statusCode: 201 };
      },
    };
    const sbMock = {
      from: () => {
        const q = { select: () => q, eq: () => q, then: (r) => r({ data: [MOCK_SUB], error: null }) };
        return q;
      },
    };

    const svc = new PushService(sbMock, wpMock);
    await svc.enviarAoBarbeiro({
      professionalId: PROF_ID, entradaId: ENTRY_ID, barbershopId: SHOP_ID,
      type:        'client_at_shop',
      clienteNome: 'Ana',
    });

    assert.strictEqual(chamadas.length, 1);
    assert.ok(
      chamadas[0].title.includes('barbearia') || chamadas[0].title.includes('✅'),
      `title deve indicar que o cliente está na barbearia, recebido: "${chamadas[0].title}"`,
    );
    assert.ok(
      chamadas[0].body.includes('Ana'),
      `body deve conter o nome do cliente, recebido: "${chamadas[0].body}"`,
    );
    assert.ok(
      chamadas[0].body.toLowerCase().includes('barbearia') || chamadas[0].body.toLowerCase().includes('confirm'),
      `body deve indicar confirmação de chegada, recebido: "${chamadas[0].body}"`,
    );
  });

  test('type client_not_seated: title e body refletem que cliente está a caminho', async () => {
    const chamadas = [];
    const wpMock = {
      setVapidDetails:  () => {},
      sendNotification: async (sub, payloadStr) => {
        chamadas.push(JSON.parse(payloadStr));
        return { statusCode: 201 };
      },
    };
    const sbMock = {
      from: () => {
        const q = { select: () => q, eq: () => q, then: (r) => r({ data: [MOCK_SUB], error: null }) };
        return q;
      },
    };

    const svc = new PushService(sbMock, wpMock);
    await svc.enviarAoBarbeiro({
      professionalId: PROF_ID, entradaId: ENTRY_ID, barbershopId: SHOP_ID,
      type:        'client_not_seated',
      clienteNome: 'Bruno',
    });

    assert.strictEqual(chamadas.length, 1);
    assert.ok(
      chamadas[0].title.includes('caminho') || chamadas[0].title.includes('🚶'),
      `title deve indicar que o cliente está a caminho, recebido: "${chamadas[0].title}"`,
    );
    assert.ok(
      chamadas[0].body.includes('Bruno'),
      `body deve conter o nome do cliente, recebido: "${chamadas[0].body}"`,
    );
    assert.ok(
      chamadas[0].body.toLowerCase().includes('caminho') || chamadas[0].body.toLowerCase().includes('chegando'),
      `body deve indicar que está a caminho, recebido: "${chamadas[0].body}"`,
    );
  });

  // ── Bug 1: erros não-410/404 não devem crashar e devem ser logados ────────

  test('sendNotification com erro 500: não lança exceção, retorna enviados:0 invalidas:0', async () => {
    const errosLogados = [];
    const consoleOriginal = console.error;
    console.error = (...args) => errosLogados.push(args.join(' '));

    try {
      const wpMock500 = {
        setVapidDetails:  () => {},
        sendNotification: async () => {
          const err = new Error('Internal Server Error');
          err.statusCode = 500;
          throw err;
        },
      };
      const sbMock500 = {
        from: () => {
          const q = { select: () => q, eq: () => q, then: (r) => r({ data: [MOCK_SUB], error: null }) };
          return q;
        },
      };

      const svc = new PushService(sbMock500, wpMock500);
      const resultado = await svc.enviarAoBarbeiro({
        professionalId: PROF_ID, entradaId: ENTRY_ID, barbershopId: SHOP_ID,
        type:        'client_at_shop',
        clienteNome: 'Cláudia',
      });

      assert.strictEqual(resultado.enviados,  0, 'enviados deve ser 0 após erro');
      assert.strictEqual(resultado.invalidas, 0, 'invalidas deve ser 0 — não é expiração de subscription');
      assert.ok(errosLogados.length > 0, 'erro deve ser logado via console.error');
    } finally {
      console.error = consoleOriginal;
    }
  });
});

// =================================================================
// SUITE 2 — Integration: POST /api/v1/notificacoes/push-barbeiro
// =================================================================
let server;
let port;

const TOKEN_VALIDO = jwt.sign(
  { sub: CLIENT_ID, email: 'cliente@barberflow.app' },
  process.env.SUPABASE_JWT_SECRET,
  { algorithm: 'HS256', expiresIn: '1h' },
);
const AUTH = { Authorization: `Bearer ${TOKEN_VALIDO}` };

before(async () => {
  const app = criarApp();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  port = server.address().port;
});

after(() => new Promise((resolve) => server.close(resolve)));

function criarReq(body, headers = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const opts = {
      hostname: '127.0.0.1',
      port,
      path:     '/api/v1/notificacoes/push-barbeiro',
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        ...headers,
      },
    };
    const r = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try   { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    r.on('error', reject);
    r.write(bodyStr);
    r.end();
  });
}

const BODY_VALIDO = {
  professionalId: PROF_ID,
  entradaId:      ENTRY_ID,
  barbershopId:   SHOP_ID,
  type:           'client_not_seated',
  clienteNome:    'João Silva',
};

suite('POST /api/v1/notificacoes/push-barbeiro', () => {

  test('retorna 401 sem token de autenticação', async () => {
    const { status, body } = await criarReq(BODY_VALIDO);
    assert.strictEqual(status, 401);
    assert.strictEqual(body.ok, false);
  });

  test('retorna 400 com body incompleto (sem professionalId)', async () => {
    const { entradaId, barbershopId, type, clienteNome } = BODY_VALIDO;
    const { status } = await criarReq({ entradaId, barbershopId, type, clienteNome }, AUTH);
    assert.strictEqual(status, 400);
  });

  test('retorna 400 com clienteNome ausente', async () => {
    const { professionalId, entradaId, barbershopId, type } = BODY_VALIDO;
    const { status } = await criarReq({ professionalId, entradaId, barbershopId, type }, AUTH);
    assert.strictEqual(status, 400);
  });

  test('retorna 400 com type inválido', async () => {
    const { status } = await criarReq({ ...BODY_VALIDO, type: 'tipo_inexistente' }, AUTH);
    assert.strictEqual(status, 400);
  });

  test('retorna 403 quando entradaId não pertence ao profissional', async () => {
    _mockEntrada = null;
    try {
      const { status } = await criarReq(BODY_VALIDO, AUTH);
      assert.strictEqual(status, 403);
    } finally {
      _mockEntrada = { id: ENTRY_ID, professional_id: PROF_ID };
    }
  });

  test('retorna 200 com ok:true e enviados numérico para dados válidos', async () => {
    const { status, body } = await criarReq(BODY_VALIDO, AUTH);
    assert.strictEqual(status, 200);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(typeof body.dados?.enviados, 'number');
  });

  test('aceita type client_at_shop', async () => {
    const { status } = await criarReq({ ...BODY_VALIDO, type: 'client_at_shop' }, AUTH);
    assert.strictEqual(status, 200);
  });
});
