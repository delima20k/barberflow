'use strict';

/**
 * _app-helper.js — Infraestrutura compartilhada para testes E2E.
 *
 * Estratégia de mock:
 *  - JWT: `SUPABASE_JWT_SECRET` setado → AuthMiddleware verifica localmente (zero rede).
 *  - fetch global: interceptado para simular Supabase Auth REST API.
 *  - SupabaseClient: módulo substituído no require.cache para DI lazy (auth/agendamentos).
 *  - Rotas DI explícita (chat, media, feed): recebem `db` via criarApp(db).
 *
 * API pública:
 *   createTestServer(dbOverrides?)  — aceita chaves de tabela + __auth_signIn/__auth_refresh
 *   request(server, method, path, opts?)
 *   gerarToken(claims?)
 *   mockDb(overrides?)
 *   TEST_USER_ID
 */

const http = require('node:http');
const path = require('node:path');
const jwt  = require('jsonwebtoken');

const SUPA_SECRET  = 'test-supabase-jwt-secret-for-testing-only-32chars';
const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const SUPABASE_URL = 'https://test.supabase.co';

const LAZY_ROUTE_PATHS = [
  'routes/auth.js',
  'routes/agendamentos.js',
  'routes/notificacoes.js',
].map(p => path.resolve(__dirname, '../../', p));

// ── ENV ───────────────────────────────────────────────────────────
process.env.APP_ENV                   = 'test';
process.env.SUPABASE_URL              = SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.SUPABASE_ANON_KEY         = 'test-anon-key';
process.env.SUPABASE_JWT_SECRET       = SUPA_SECRET;

// ── JWT ───────────────────────────────────────────────────────────

function gerarToken(claims = {}) {
  return jwt.sign(
    {
      sub:   claims.sub   ?? TEST_USER_ID,
      email: claims.email ?? 'test@barberflow.com',
      role:  'authenticated',
      iat:   Math.floor(Date.now() / 1000),
      ...(claims.exp != null ? { exp: claims.exp } : {}),
    },
    SUPA_SECRET,
    { algorithm: 'HS256' },
  );
}

// ── Fetch mock ────────────────────────────────────────────────────
// Intercepta chamadas fetch para simular respostas da Supabase Auth REST API.
// __auth_signIn(body) → { data: { user, session }, error }  (compat. SDK)
// __auth_refresh(body) → { data: { session }, error }       (compat. SDK)

const _originalFetch = globalThis.fetch;

function _fakeResponse(status, body) {
  const text = JSON.stringify(body);
  return {
    ok:      status >= 200 && status < 300,
    status,
    json:    async () => JSON.parse(text),
    text:    async () => text,
    headers: new Map(),
  };
}

/**
 * Instala mock de fetch. Recebe handlers no formato do Supabase SDK:
 *   signInHandler({ email, password }) → { data: { user, session }, error }
 *   refreshHandler({ refresh_token })  → { data: { session }, error }
 */
function _installFetchMock(signInHandler, refreshHandler) {
  globalThis.fetch = async (url, opts = {}) => {
    const sUrl = String(url);

    // ── Auth REST /token ──────────────────────────────────────────
    if (sUrl.includes('/auth/v1/token')) {
      let body = {};
      try { body = JSON.parse(opts.body ?? '{}'); } catch { /* noop */ }

      const isPassword = sUrl.includes('grant_type=password');

      if (isPassword) {
        const result = signInHandler
          ? await signInHandler({ email: body.email, password: body.password })
          : {
              data: {
                user:    { id: TEST_USER_ID, email: body.email },
                session: { access_token: gerarToken(), refresh_token: 'rt-default' },
              },
              error: null,
            };

        if (result.error) {
          return _fakeResponse(400, {
            error:             'invalid_grant',
            error_description: result.error.message ?? 'Invalid login credentials',
          });
        }
        return _fakeResponse(200, {
          access_token:  result.data.session.access_token,
          refresh_token: result.data.session.refresh_token,
          expires_at:    Math.floor(Date.now() / 1000) + 3600,
          user:          result.data.user,
        });
      }

      // grant_type=refresh_token
      const result = refreshHandler
        ? await refreshHandler({ refresh_token: body.refresh_token })
        : {
            data: { session: { access_token: gerarToken(), refresh_token: 'rt-new' } },
            error: null,
          };

      if (result.error) {
        return _fakeResponse(400, {
          error:             'invalid_grant',
          error_description: result.error.message ?? 'Invalid refresh token',
        });
      }
      return _fakeResponse(200, {
        access_token:  result.data.session.access_token,
        refresh_token: result.data.session.refresh_token,
        expires_at:    Math.floor(Date.now() / 1000) + 3600,
        user:          { id: TEST_USER_ID, email: 'test@barberflow.com' },
      });
    }

    // ── Logout ────────────────────────────────────────────────────
    if (sUrl.includes('/auth/v1/logout')) {
      return _fakeResponse(204, {});
    }

    // ── REST API (tabelas) ────────────────────────────────────────
    if (sUrl.includes(SUPABASE_URL) && sUrl.includes('/rest/v1/')) {
      return _fakeResponse(200, []);
    }

    // Bloquear rede real em testes
    return _fakeResponse(503, { error: 'mock: rede indisponível em testes' });
  };
}

function _uninstallFetchMock() {
  globalThis.fetch = _originalFetch;
}

// ── Mock DB ───────────────────────────────────────────────────────

function mockDb(overrides = {}) {
  const noop = () => ({ data: [], error: null });

  function chain(result) {
    const p = Promise.resolve(result);
    return new Proxy(p, {
      get(target, prop) {
        if (prop === 'then' || prop === 'catch' || prop === 'finally') {
          return target[prop].bind(target);
        }
        // Allow chaining .single() etc. after rpc()
        if (prop === 'single') return () => chain({ data: result.data, error: result.error });
        if (prop === 'maybeSingle') return () => chain({ data: result.data ?? null, error: result.error });
        return () => chain(result);
      },
    });
  }

  function _unwrapSingle(result) {
    // single() must return the item directly, not an array
    const d = result.data;
    return { data: Array.isArray(d) ? (d[0] ?? null) : d, error: result.error };
  }

  function _resultFor(handler, fallback, context) {
    const result = handler(context);
    if (result && result.__useMockResult === true) {
      const { __useMockResult, ...clean } = result;
      return clean;
    }
    return fallback;
  }

  return {
    from(table) {
      const handler = overrides[table] ?? noop;
      const chainable = {
        select:      () => chainable,
        insert:      (d) => chain(_resultFor(
          handler,
          { data: Array.isArray(d) ? d : [d], error: null },
          { table, operation: 'insert', data: d },
        )),
        update:      () => chainable,
        upsert:      (d) => chain(_resultFor(
          handler,
          { data: Array.isArray(d) ? d : [d], error: null },
          { table, operation: 'upsert', data: d },
        )),
        delete:      () => chainable,
        eq:          () => chainable,
        neq:         () => chainable,
        in:          () => chainable,
        is:          () => chainable,
        lt:          () => chainable,
        lte:         () => chainable,
        gte:         () => chainable,
        order:       () => chainable,
        limit:       () => chainable,
        range:       () => chainable,
        single:      () => chain(_unwrapSingle(handler({ table }))),
        maybeSingle: () => chain(_unwrapSingle(handler({ table }))),
        then:        (res, rej) => chain(handler({ table })).then(res, rej),
        catch:       (fn) => chain(handler({ table })).catch(fn),
      };
      return chainable;
    },
    rpc(fnName, params) {
      const key = `__rpc_${fnName}`;
      const rpcHandler = overrides[key];
      if (rpcHandler) {
        const result = rpcHandler(params);
        return chain(result);
      }
      // Fallback: RPC retorna dados vazios sem erro
      return chain({ data: null, error: null });
    },
    auth: {
      getUser: async () => ({
        data:  { user: { id: TEST_USER_ID, email: 'test@barberflow.com' } },
        error: null,
      }),
    },
    storage: {
      from: () => ({
        createSignedUploadUrl: async () => ({
          data: { signedUrl: 'https://storage.test/upload', path: 'uploads/test.jpg' },
          error: null,
        }),
        createSignedUrl: async () => ({
          data: { signedUrl: 'https://storage.test/download?token=abc' },
          error: null,
        }),
        getPublicUrl: () => ({
          data: { publicUrl: 'https://storage.test/public/test.jpg' },
        }),
        move: async () => ({ error: null }),
        copy: async () => ({ error: null }),
        remove: async () => ({ data: [], error: null }),
      }),
    },
  };
}

// ── Module injection ──────────────────────────────────────────────

function _injectSupabaseMock(db) {
  const supaPath = path.resolve(__dirname, '../../utils/SupabaseClient.js');
  require.cache[supaPath] = {
    id: supaPath, filename: supaPath, loaded: true,
    exports: { getInstance: () => db },
  };
}

function _resetLazyRoutes() {
  for (const p of LAZY_ROUTE_PATHS) delete require.cache[p];
  delete require.cache[path.resolve(__dirname, '../../app.js')];
}

// ── Server factory ────────────────────────────────────────────────

/**
 * Cria servidor de teste isolado.
 *
 * @param {object} [dbOverrides]  — chaves: nome de tabela → handler, ou
 *   `__auth_signIn(body)` / `__auth_refresh(body)` para mock de Auth REST.
 * @returns {{ port: number, close: () => Promise<void> }}
 */
async function createTestServer(dbOverrides = {}) {
  const { __auth_signIn: signInHandler, __auth_refresh: refreshHandler, ...tableOverrides } = dbOverrides;

  const db = mockDb(tableOverrides);

  _installFetchMock(signInHandler, refreshHandler);
  _injectSupabaseMock(db);
  _resetLazyRoutes();

  const criarApp = require('../../app');
  const app      = criarApp(db);

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  return {
    port:  server.address().port,
    close: async () => {
      _uninstallFetchMock();
      await new Promise((res, rej) => server.close(err => err ? rej(err) : res()));
    },
  };
}

// ── HTTP helper ───────────────────────────────────────────────────

function request(server, method, reqPath, opts = {}) {
  return new Promise((resolve, reject) => {
    const body = opts.body ? JSON.stringify(opts.body) : null;
    const req  = http.request(
      {
        hostname: '127.0.0.1',
        port:     server.port,
        path:     reqPath,
        method,
        headers: {
          'Content-Type':   'application/json',
          ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
          ...opts.headers,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', c => { raw += c; });
        res.on('end', () => {
          let parsedBody;
          try { parsedBody = JSON.parse(raw); } catch { parsedBody = raw; }
          resolve({ status: res.statusCode, headers: res.headers, body: parsedBody });
        });
      },
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

module.exports = { createTestServer, request, gerarToken, mockDb, TEST_USER_ID };
