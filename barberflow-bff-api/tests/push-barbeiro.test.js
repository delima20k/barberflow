'use strict';

const { suite, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http   = require('node:http');
const jwt    = require('jsonwebtoken');
const Module = require('node:module');

// ── Env vars — ANTES de qualquer require da aplicação ────────────
process.env.APP_ENV                   = 'test';
process.env.SUPABASE_URL              = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.SUPABASE_ANON_KEY         = 'test-anon-key';
process.env.SUPABASE_JWT_SECRET       = 'test-jwt-secret-at-least-32-chars!!';
process.env.VAPID_PUBLIC_KEY          = 'BN4vBEVfakeVapidPublicKeyForTestsOnly000000000000000000000000000000000000000000000000000';
process.env.VAPID_PRIVATE_KEY         = 'fakeVapidPrivateKeyForTests00000000000=';
process.env.VAPID_SUBJECT             = 'mailto:test@barberflow.app';

// ── UUIDs fixos ───────────────────────────────────────────────────
const ENTRY_ID  = 'aaaaaaaa-0000-4000-8000-000000000001';
const PROF_ID   = 'bbbbbbbb-0000-4000-8000-000000000002';
const SHOP_ID   = 'cccccccc-0000-4000-8000-000000000003';
const CLIENT_ID = 'dddddddd-0000-4000-8000-000000000004';
const OWNER_ID  = 'eeeeeeee-0000-4000-8000-000000000005';

const MOCK_SUB = {
  user_id:   PROF_ID,
  app_id:    'profissional',
  is_valid:  true,
  endpoint: 'https://fcm.googleapis.com/fcm/send/fake-token',
  p256dh:   'BFakeP256DH==',
  auth_key: 'FakeAuth==',
};
const OWNER_SUB = {
  user_id:   OWNER_ID,
  app_id:    'profissional',
  is_valid:  true,
  endpoint: 'https://fcm.googleapis.com/fcm/send/fake-owner-token',
  p256dh:   'BOwnerP256DH==',
  auth_key: 'OwnerAuth==',
};

// ── Mock web-push — injeta no require.cache ANTES de require('../app') ──
// Requer que `npm install` já tenha sido executado na BFF.
const mockWebPush = {
  setVapidDetails:  () => {},
  sendNotification: async () => ({ statusCode: 201 }),
};
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'web-push') return mockWebPush;
  return originalLoad.call(this, request, parent, isMain);
};

// ── Mock Supabase ─────────────────────────────────────────────────
// _mockEntrada pode ser mutado por testes específicos (ex: cenário 403).
let _mockEntrada = { id: ENTRY_ID, professional_id: PROF_ID, barbershop_id: SHOP_ID };
let _mockBarbershop = { id: SHOP_ID, owner_id: OWNER_ID };
let _mockSubs = [MOCK_SUB];
// Erro simulado do INSERT em push_notification_dedup — null = sucesso (não duplicado).
// Testes de idempotência mutam para { code: '23505' } para simular evento já enviado.
let _mockPushDedupError = null;

const SupabaseClient = require('../utils/SupabaseClient');
{
  const criarQB = (table) => {
    const q = {
      _op:      null,
      _filters: [],
      select: () => { q._op = 'select'; return q; },
      insert: (dados) => { q._op = 'insert'; q._data = dados; return q; },
      update: (dados) => {
        q._op   = 'update';
        q._data = dados;
        return q;
      },
      eq:     (col, val) => { q._filters.push([col, 'eq', val]); return q; },
      in:     (col, val) => { q._filters.push([col, 'in', val]); return q; },
      single: () => {
        if (table === 'queue_entries') {
          const ok = _mockEntrada && q._filters.every(([col, op, val]) => op === 'eq' && _mockEntrada[col] === val);
          return Promise.resolve({ data: ok ? _mockEntrada : null, error: null });
        }
        if (table === 'barbershops') {
          const ok = _mockBarbershop && q._filters.every(([col, op, val]) => op === 'eq' && _mockBarbershop[col] === val);
          return Promise.resolve({ data: ok ? _mockBarbershop : null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      then: (resolve) => {
        if (table === 'push_subscriptions' && q._op === 'select') {
          const data = _mockSubs
            .filter((row) => q._filters.every(([col, op, val]) => {
              if (op === 'eq') return row[col] === val;
              if (op === 'in') return Array.isArray(val) && val.includes(row[col]);
              return true;
            }))
            .map(({ user_id, ...sub }) => sub);
          return resolve({ data, error: null });
        }
        if (table === 'push_notification_dedup' && q._op === 'insert') {
          return resolve({ data: null, error: _mockPushDedupError });
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
          insert: () => { q._op = 'insert'; return q; },
          update: () => { q._op = 'update'; return q; },
          eq:     () => q,
          then:   (resolve) => {
            if (table === 'push_subscriptions' && q._op === 'select') {
              return resolve({ data: [MOCK_SUB].map(({ user_id, ...sub }) => sub), error: null });
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
    assert.strictEqual(resultado.destinatarios, 1);
  });

  test('sem subscription do professionalId: envia para owner_id validado', async () => {
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
          _op: null,
          _filters: [],
          select: () => { q._op = 'select'; return q; },
          insert: () => { q._op = 'insert'; return q; },
          update: () => { q._op = 'update'; return q; },
          eq: (col, val) => { q._filters.push([col, 'eq', val]); return q; },
          in: (col, val) => { q._filters.push([col, 'in', val]); return q; },
          then: (resolve) => {
            if (table === 'push_subscriptions' && q._op === 'select') {
              const rows = [OWNER_SUB].filter((row) => q._filters.every(([col, op, val]) => {
                if (op === 'eq') return row[col] === val;
                if (op === 'in') return val.includes(row[col]);
                return true;
              }));
              return resolve({ data: rows.map(({ user_id, ...sub }) => sub), error: null });
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
      ownerId:        OWNER_ID,
      entradaId:      ENTRY_ID,
      barbershopId:   SHOP_ID,
      type:           'client_not_seated',
      clienteNome:    'João Silva',
    });

    assert.strictEqual(chamadas.length, 1);
    assert.strictEqual(chamadas[0].sub.endpoint, OWNER_SUB.endpoint);
    assert.strictEqual(resultado.enviados, 1);
    assert.strictEqual(resultado.destinatarios, 2);
  });

  test('deduplica endpoint entre profissional e owner', async () => {
    const chamadas = [];
    const wpMock = {
      setVapidDetails:  () => {},
      sendNotification: async (sub, payload) => {
        chamadas.push({ sub, payload });
        return { statusCode: 201 };
      },
    };
    const subDuplicada = { ...OWNER_SUB, endpoint: MOCK_SUB.endpoint };
    const sbMock = {
      from: (table) => {
        const q = {
          _op: null,
          select: () => { q._op = 'select'; return q; },
          insert: () => { q._op = 'insert'; return q; },
          update: () => q,
          eq: () => q,
          in: () => q,
          then: (resolve) => {
            if (table === 'push_subscriptions' && q._op === 'select') {
              return resolve({ data: [MOCK_SUB, subDuplicada].map(({ user_id, ...sub }) => sub), error: null });
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
      ownerId:        OWNER_ID,
      entradaId:      ENTRY_ID,
      barbershopId:   SHOP_ID,
      type:           'client_at_shop',
      clienteNome:    'Ana',
    });

    assert.strictEqual(chamadas.length, 1);
    assert.strictEqual(resultado.enviados, 1);
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
          insert: () => { q._op = 'insert'; return q; },
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
          insert: () => { q._op = 'insert'; return q; },
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
        const q = { select: () => q, insert: () => q, eq: () => q, then: (r) => r({ data: [MOCK_SUB], error: null }) };
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
    assert.strictEqual(chamadas[0].data.statusLabel, 'Cliente ja chegou');
    assert.strictEqual(chamadas[0].data.cadeira, 'Cadeira de producao');
    assert.strictEqual(chamadas[0].data.destino, 'profissional');
    assert.strictEqual(chamadas[0].data.eventId, `queue:${ENTRY_ID}:client_at_shop`);
    assert.strictEqual(chamadas[0].data.dedupeKey, `queue:${ENTRY_ID}:client_at_shop`);
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
        const q = { select: () => q, insert: () => q, eq: () => q, then: (r) => r({ data: [MOCK_SUB], error: null }) };
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
    assert.strictEqual(chamadas[0].data.statusLabel, 'Cliente esta a caminho');
    assert.strictEqual(chamadas[0].data.cadeira, 'Cadeira de producao');
    assert.strictEqual(chamadas[0].data.destino, 'profissional');
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
          const q = { select: () => q, insert: () => q, eq: () => q, then: (r) => r({ data: [MOCK_SUB], error: null }) };
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

  test('sem subscriptions válidas: emite console.warn com professionalId', async () => {
    const warnCalls = [];
    const origWarn  = console.warn;
    console.warn = (...args) => warnCalls.push(args);
    try {
      const sbVazio = {
        from: () => {
          const q = { select: () => q, eq: () => q, then: (r) => r({ data: [], error: null }) };
          return q;
        },
      };
      const wpNoop = { setVapidDetails: () => {}, sendNotification: async () => {} };
      const svc = new PushService(sbVazio, wpNoop);
      await svc.enviarAoBarbeiro({
        professionalId: PROF_ID, entradaId: ENTRY_ID, barbershopId: SHOP_ID,
        type: 'client_at_shop', clienteNome: 'Test',
      });
      const logou = warnCalls.some(args =>
        args.some(a => typeof a === 'string' && a.includes(PROF_ID)),
      );
      assert.ok(logou, 'console.warn deve ser chamado com professionalId quando sem subscriptions');
    } finally {
      console.warn = origWarn;
    }
  });

  test('query Supabase retorna error → loga com console.error e retorna enviados:0', async () => {
    const errorCalls = [];
    const origError  = console.error;
    console.error = (...args) => errorCalls.push(args);
    try {
      const sbErro = {
        from: () => {
          const q = {
            select: () => q,
            eq:     () => q,
            in:     () => q,
            then:   (resolve) => resolve({ data: null, error: { message: 'connection timeout', code: 'PGRST000' } }),
          };
          return q;
        },
      };
      const wpNoop = { setVapidDetails: () => {}, sendNotification: async () => {} };
      const svc = new PushService(sbErro, wpNoop);
      const resultado = await svc.enviarAoBarbeiro({
        professionalId: PROF_ID, entradaId: ENTRY_ID, barbershopId: SHOP_ID,
        type: 'client_not_seated', clienteNome: 'João',
      });

      assert.strictEqual(resultado.enviados, 0, 'deve retornar enviados:0 quando a query falha');
      const logouErro = errorCalls.some(args =>
        args.some(a => typeof a === 'string' && a.includes('connection timeout')),
      );
      assert.ok(logouErro, 'console.error deve ser chamado com a mensagem do erro Supabase');
    } finally {
      console.error = origError;
    }
  });
});

// =================================================================
// SUITE 1b — Unit: PushService — idempotência (push_notification_dedup)
// =================================================================
suite('PushService — enviarAoBarbeiro() idempotência', () => {
  const PushService = require('../services/PushService');

  function criarSbMock({ dedupError = null } = {}) {
    return {
      from: (table) => {
        const q = {
          _op: null,
          select: () => { q._op = 'select'; return q; },
          insert: (dados) => { q._op = 'insert'; q._data = dados; return q; },
          update: () => { q._op = 'update'; return q; },
          eq:     () => q,
          then:   (resolve) => {
            if (table === 'push_subscriptions' && q._op === 'select') {
              return resolve({ data: [MOCK_SUB].map(({ user_id, ...sub }) => sub), error: null });
            }
            if (table === 'push_notification_dedup' && q._op === 'insert') {
              return resolve({ data: null, error: dedupError });
            }
            return resolve({ data: null, error: null });
          },
        };
        return q;
      },
    };
  }

  test('1ª chamada com dedupeKey: insere no dedup e envia normalmente', async () => {
    const chamadas = [];
    const wpMock = {
      setVapidDetails:  () => {},
      sendNotification: async (sub, payload) => { chamadas.push({ sub, payload }); return { statusCode: 201 }; },
    };
    const svc = new PushService(criarSbMock({ dedupError: null }), wpMock);
    const resultado = await svc.enviarAoBarbeiro({
      professionalId: PROF_ID, entradaId: ENTRY_ID, barbershopId: SHOP_ID,
      type: 'client_not_seated', clienteNome: 'João', dedupeKey: 'queue:teste-1:client_not_seated',
    });

    assert.strictEqual(chamadas.length, 1, 'sendNotification deve ser chamado quando não é duplicado');
    assert.strictEqual(resultado.enviados, 1);
    assert.strictEqual(resultado.duplicate, undefined, 'não deve marcar duplicate na 1ª chamada');
  });

  test('2ª chamada com o MESMO dedupeKey: não chama sendNotification, retorna duplicate:true', async () => {
    const chamadas = [];
    const wpMock = {
      setVapidDetails:  () => {},
      sendNotification: async (sub, payload) => { chamadas.push({ sub, payload }); return { statusCode: 201 }; },
    };
    // Simula unique_violation — o INSERT já existe para (user_id, dedupe_key).
    const svc = new PushService(criarSbMock({ dedupError: { code: '23505' } }), wpMock);
    const resultado = await svc.enviarAoBarbeiro({
      professionalId: PROF_ID, entradaId: ENTRY_ID, barbershopId: SHOP_ID,
      type: 'client_not_seated', clienteNome: 'João', dedupeKey: 'queue:teste-2:client_not_seated',
    });

    assert.strictEqual(chamadas.length, 0, 'sendNotification NUNCA deve ser chamado quando já foi enviado');
    assert.strictEqual(resultado.enviados, 0);
    assert.strictEqual(resultado.duplicate, true);
  });

  test('erro não-23505 no insert de dedup não bloqueia envio (fail-open)', async () => {
    const chamadas = [];
    const wpMock = {
      setVapidDetails:  () => {},
      sendNotification: async (sub, payload) => { chamadas.push({ sub, payload }); return { statusCode: 201 }; },
    };
    const errosLogados = [];
    const origError = console.error;
    console.error = (...args) => errosLogados.push(args.join(' '));
    try {
      const svc = new PushService(criarSbMock({ dedupError: { code: 'PGRST000', message: 'connection timeout' } }), wpMock);
      const resultado = await svc.enviarAoBarbeiro({
        professionalId: PROF_ID, entradaId: ENTRY_ID, barbershopId: SHOP_ID,
        type: 'client_not_seated', clienteNome: 'João', dedupeKey: 'queue:teste-3:client_not_seated',
      });

      assert.strictEqual(chamadas.length, 1, 'deve seguir enviando quando a checagem de dedup falha por erro diferente de 23505');
      assert.strictEqual(resultado.enviados, 1);
      assert.strictEqual(resultado.duplicate, undefined);
      assert.ok(errosLogados.length > 0, 'erro da checagem de dedup deve ser logado');
    } finally {
      console.error = origError;
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

  test('retorna 400 com UUID invalido', async () => {
    const { status } = await criarReq({ ...BODY_VALIDO, entradaId: 'id-invalido' }, AUTH);
    assert.strictEqual(status, 400);
  });

  test('retorna 403 quando entradaId não pertence ao profissional', async () => {
    _mockEntrada = null;
    try {
      const { status } = await criarReq(BODY_VALIDO, AUTH);
      assert.strictEqual(status, 403);
    } finally {
      _mockEntrada = { id: ENTRY_ID, professional_id: PROF_ID, barbershop_id: SHOP_ID };
    }
  });

  test('retorna 403 quando entradaId pertence a outra barbearia', async () => {
    const { status } = await criarReq({
      ...BODY_VALIDO,
      barbershopId: 'cccccccc-0000-4000-8000-000000000099',
    }, AUTH);
    assert.strictEqual(status, 403);
  });

  test('retorna 200 com ok:true e enviados numérico para dados válidos', async () => {
    const { status, body } = await criarReq(BODY_VALIDO, AUTH);
    assert.strictEqual(status, 200);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(typeof body.dados?.enviados, 'number');
  });

  test('retorna 200 com ok:false e reason NO_SUBSCRIPTION quando sem subscriptions', async () => {
    _mockSubs = [];
    try {
      const { status, body } = await criarReq(BODY_VALIDO, AUTH);
      assert.strictEqual(status, 200);
      assert.strictEqual(body.ok, false);
      assert.strictEqual(body.reason, 'NO_SUBSCRIPTION');
    } finally {
      _mockSubs = [MOCK_SUB];
    }
  });

  test('aceita type client_at_shop', async () => {
    const { status } = await criarReq({ ...BODY_VALIDO, type: 'client_at_shop' }, AUTH);
    assert.strictEqual(status, 200);
  });

  test('2 POSTs com o mesmo dedupeKey: 2ª resposta é ok:true reason:DUPLICATE', async () => {
    _mockPushDedupError = null;
    try {
      const body = { ...BODY_VALIDO, dedupeKey: 'queue:integracao-dedup:client_not_seated' };
      const primeira = await criarReq(body, AUTH);
      assert.strictEqual(primeira.status, 200);
      assert.strictEqual(primeira.body.ok, true);

      _mockPushDedupError = { code: '23505' };
      const segunda = await criarReq(body, AUTH);
      assert.strictEqual(segunda.status, 200);
      assert.strictEqual(segunda.body.ok, true);
      assert.strictEqual(segunda.body.reason, 'DUPLICATE');
    } finally {
      _mockPushDedupError = null;
    }
  });
});

// =================================================================
// SUITE 3 — Integration: 503 quando VAPID não configurado
// =================================================================
suite('POST /push-barbeiro — 200 PUSH_UNAVAILABLE quando VAPID não configurado', () => {
  let server503;
  let port503;
  let origPub;
  let origPriv;

  before(async () => {
    origPub  = process.env.VAPID_PUBLIC_KEY;
    origPriv = process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;

    const sep = require('node:path').sep;
    for (const k of Object.keys(require.cache)) {
      if (
        k.includes(`${sep}routes${sep}notificacoes`) ||
        (k.endsWith(`${sep}app.js`) && k.includes(`barberflow-bff-api`))
      ) {
        delete require.cache[k];
      }
    }

    const criarApp503 = require('../app');
    const app503      = criarApp503();
    await new Promise((r) => {
      server503 = app503.listen(0, '127.0.0.1', r);
    });
    port503 = server503.address().port;
  });

  after(async () => {
    process.env.VAPID_PUBLIC_KEY  = origPub;
    process.env.VAPID_PRIVATE_KEY = origPriv;
    await new Promise((r) => server503.close(r));

    // Limpar módulos recarregados para não contaminar outros requires futuros
    const sep = require('node:path').sep;
    for (const k of Object.keys(require.cache)) {
      if (
        k.includes(`${sep}routes${sep}notificacoes`) ||
        (k.endsWith(`${sep}app.js`) && k.includes(`barberflow-bff-api`))
      ) {
        delete require.cache[k];
      }
    }
  });

  test('retorna 200 PUSH_UNAVAILABLE quando VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY não configuradas', async () => {
    const token    = jwt.sign(
      { sub: CLIENT_ID, email: 'cli@test.com' },
      process.env.SUPABASE_JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' },
    );
    const bodyStr = JSON.stringify({
      professionalId: PROF_ID,
      entradaId:      ENTRY_ID,
      barbershopId:   SHOP_ID,
      type:           'client_at_shop',
      clienteNome:    'Teste',
    });

    const { status, body } = await new Promise((resolve, reject) => {
      const opts = {
        hostname: '127.0.0.1',
        port:     port503,
        path:     '/api/v1/notificacoes/push-barbeiro',
        method:   'POST',
        headers: {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
          Authorization:    `Bearer ${token}`,
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

    assert.strictEqual(status, 200);
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.reason, 'PUSH_UNAVAILABLE');
  });
});
