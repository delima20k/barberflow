'use strict';
/**
 * tests/bff-api-service.test.js
 *
 * Testa BffApiService:
 *   - temTokenValido(): leitura de token no localStorage com validação de expiração
 *   - patch(): expõe error.status HTTP para que chamadores possam distinguir 401 de 5xx
 *   - authHeaders: Bearer enviado quando token válido, ausente quando não há token
 */

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

const STORAGE_KEY = 'sb-jfvjisqnzapxxagkbxcu-auth-token';

/**
 * Monta sandbox com localStorage injetado e fetch mockado.
 * @param {Record<string,string>} lsStore  — chaves iniciais do localStorage
 * @param {Function}              fetchImpl — mock de fetch (opcional)
 * @param {Object|null}           session — sessão Supabase mockada (opcional)
 */
function criarSandbox(lsStore = {}, fetchImpl, session = null) {
  const lsMap = new Map(Object.entries(lsStore));
  const sb = vm.createContext({
    console,
    Error,
    TypeError,
    Promise,
    window: { location: { hostname: 'localhost' } },
    localStorage: {
      getItem:    fn((k) => lsMap.get(k) ?? null),
      setItem:    fn((k, v) => lsMap.set(k, String(v))),
      removeItem: fn((k) => lsMap.delete(k)),
    },
    AbortController: class {
      constructor() { this.signal = {}; }
      abort() {}
    },
    setTimeout:   fn((cb) => { try { cb(); } catch {} }),
    clearTimeout: fn(),
    fetch: fetchImpl ?? fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
    SupabaseService: {
      getSession: fn().mockResolvedValue(session),
    },
  });
  carregar(sb, 'shared/js/BffApiService.js');
  return sb;
}

/** Gera JSON de sessão válida com access_token e expires_at configuráveis. */
function sessao(expiresAt, token = 'tok-abc-123') {
  return JSON.stringify({
    access_token: token,
    token_type:   'bearer',
    expires_in:   3600,
    expires_at:   expiresAt ?? Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'rt-abc',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// BffApiService.temTokenValido()
// ─────────────────────────────────────────────────────────────────────────────
suite('BffApiService.temTokenValido()', () => {

  test('retorna false quando localStorage não tem sessão', () => {
    const sb = criarSandbox();
    assert.strictEqual(sb.BffApiService.temTokenValido(), false);
  });

  test('retorna false quando sessão não tem access_token', () => {
    const ls = { [STORAGE_KEY]: JSON.stringify({ expires_at: Math.floor(Date.now() / 1000) + 3600 }) };
    const sb = criarSandbox(ls);
    assert.strictEqual(sb.BffApiService.temTokenValido(), false);
  });

  test('retorna false quando sessão não tem expires_at', () => {
    const ls = { [STORAGE_KEY]: JSON.stringify({ access_token: 'tok' }) };
    const sb = criarSandbox(ls);
    assert.strictEqual(sb.BffApiService.temTokenValido(), false);
  });

  test('retorna false quando token está expirado', () => {
    const expirado = Math.floor(Date.now() / 1000) - 100;
    const ls = { [STORAGE_KEY]: sessao(expirado) };
    const sb = criarSandbox(ls);
    assert.strictEqual(sb.BffApiService.temTokenValido(), false);
  });

  test('retorna false quando token expira em menos de 60s (buffer de segurança)', () => {
    const quaseExpirado = Math.floor(Date.now() / 1000) + 30;
    const ls = { [STORAGE_KEY]: sessao(quaseExpirado) };
    const sb = criarSandbox(ls);
    assert.strictEqual(sb.BffApiService.temTokenValido(), false);
  });

  test('retorna true quando token tem mais de 60s de validade', () => {
    const ls = { [STORAGE_KEY]: sessao() }; // +1h
    const sb = criarSandbox(ls);
    assert.strictEqual(sb.BffApiService.temTokenValido(), true);
  });

  test('retorna false quando JSON do localStorage é inválido', () => {
    const ls = { [STORAGE_KEY]: 'json-invalido-{{{' };
    const sb = criarSandbox(ls);
    assert.strictEqual(sb.BffApiService.temTokenValido(), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BffApiService.patch() — header Authorization e status no erro
// ─────────────────────────────────────────────────────────────────────────────
suite('BffApiService.patch()', () => {

  test('inclui header Authorization Bearer quando token válido', async () => {
    const capturedOpts = [];
    const fetchMock = fn(async (_url, opts) => {
      capturedOpts.push(opts);
      return { ok: true, status: 200, json: async () => ({}) };
    });
    const ls = { [STORAGE_KEY]: sessao() };
    const sb = criarSandbox(ls, fetchMock);

    await sb.BffApiService.patch('/api/v1/clientes/localizacao', { lat: 0, lng: 0 });

    assert.ok(capturedOpts.length > 0, 'fetch deve ter sido chamado');
    assert.ok(
      String(capturedOpts[0].headers?.['Authorization'] ?? '').startsWith('Bearer '),
      'header Authorization deve começar com "Bearer "'
    );
  });

  test('não inclui header Authorization quando token ausente', async () => {
    const capturedOpts = [];
    const fetchMock = fn(async (_url, opts) => {
      capturedOpts.push(opts);
      return { ok: true, status: 200, json: async () => ({}) };
    });
    const sb = criarSandbox({}, fetchMock);

    await sb.BffApiService.patch('/api/v1/test', {});

    assert.strictEqual(
      capturedOpts[0]?.headers?.['Authorization'],
      undefined,
      'header Authorization não deve estar presente sem token'
    );
  });

  test('retorna error.status=401 quando BFF responde 401', async () => {
    const fetchMock = fn(async () => ({
      ok: false, status: 401,
      json: async () => ({ error: 'Token inválido.' }),
    }));
    const ls = { [STORAGE_KEY]: sessao() };
    const sb = criarSandbox(ls, fetchMock);

    const { error } = await sb.BffApiService.patch('/api/v1/clientes/localizacao', { lat: 0, lng: 0 });

    assert.ok(error instanceof Error, 'deve retornar Error');
    assert.strictEqual(error.status, 401, 'error.status deve ser 401');
  });

  test('retorna error.status=503 quando BFF retorna 503', async () => {
    const fetchMock = fn(async () => ({
      ok: false, status: 503,
      json: async () => ({}),
    }));
    const ls = { [STORAGE_KEY]: sessao() };
    const sb = criarSandbox(ls, fetchMock);

    const { error } = await sb.BffApiService.patch('/api/v1/test', {});

    assert.strictEqual(error.status, 503);
  });

  test('retorna error sem lançar exceção quando fetch falha', async () => {
    const fetchMock = fn(async () => { throw new Error('network error'); });
    const ls = { [STORAGE_KEY]: sessao() };
    const sb = criarSandbox(ls, fetchMock);

    const { error } = await sb.BffApiService.patch('/api/v1/test', {});
    assert.ok(error instanceof Error);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BffApiService.post() — status no erro (simetria com patch)
// ─────────────────────────────────────────────────────────────────────────────
suite('BffApiService.post()', () => {

  test('inclui Bearer vindo de SupabaseService.getSession() antes do fallback localStorage', async () => {
    const capturedOpts = [];
    const fetchMock = fn(async (_url, opts) => {
      capturedOpts.push(opts);
      return { ok: true, status: 200, json: async () => ({}) };
    });
    const sb = criarSandbox({}, fetchMock, { access_token: 'tok-supabase-session' });

    await sb.BffApiService.post('/api/v1/notificacoes/push-barbeiro', {});

    assert.strictEqual(
      capturedOpts[0]?.headers?.['Authorization'],
      'Bearer tok-supabase-session',
    );
  });

  test('mantém fallback para localStorage quando SupabaseService não tem sessão', async () => {
    const capturedOpts = [];
    const fetchMock = fn(async (_url, opts) => {
      capturedOpts.push(opts);
      return { ok: true, status: 200, json: async () => ({}) };
    });
    const ls = { [STORAGE_KEY]: sessao(undefined, 'tok-localstorage') };
    const sb = criarSandbox(ls, fetchMock, null);

    await sb.BffApiService.post('/api/v1/notificacoes/push-barbeiro', {});

    assert.strictEqual(
      capturedOpts[0]?.headers?.['Authorization'],
      'Bearer tok-localstorage',
    );
  });

  test('não inclui Authorization sem sessão Supabase nem token local válido', async () => {
    const capturedOpts = [];
    const fetchMock = fn(async (_url, opts) => {
      capturedOpts.push(opts);
      return { ok: true, status: 200, json: async () => ({}) };
    });
    const sb = criarSandbox({}, fetchMock, null);

    await sb.BffApiService.post('/api/v1/notificacoes/push-barbeiro', {});

    assert.strictEqual(capturedOpts[0]?.headers?.['Authorization'], undefined);
  });

  test('retorna error.status=401 quando BFF responde 401', async () => {
    const fetchMock = fn(async () => ({
      ok: false, status: 401,
      json: async () => ({ error: 'Não autorizado.' }),
    }));
    const ls = { [STORAGE_KEY]: sessao() };
    const sb = criarSandbox(ls, fetchMock);

    const { error } = await sb.BffApiService.post('/api/v1/test', {});

    assert.strictEqual(error.status, 401);
  });
});

suite('BffApiService.mensalistas', () => {

  test('adicionar envia monthly_fee no payload', async () => {
    const capturedOpts = [];
    const fetchMock = fn(async (_url, opts) => {
      capturedOpts.push(opts);
      return { ok: true, status: 201, json: async () => ({ dados: {} }) };
    });
    const sb = criarSandbox({}, fetchMock, null);

    await sb.BffApiService.mensalistas.adicionar('shop-1', 'client-1', 149.9);

    const payload = JSON.parse(capturedOpts[0].body);
    assert.deepStrictEqual(payload, {
      barbershop_id: 'shop-1',
      client_id:     'client-1',
      monthly_fee:   149.9,
    });
  });
});
