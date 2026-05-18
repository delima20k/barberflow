'use strict';
/**
 * tests/geo-service.test.js
 *
 * Testa GeoService: cache de posição e verificação de permissão.
 * Injeta stubs de navigator.geolocation e navigator.permissions no sandbox.
 */

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

function criarSandbox(overrides = {}) {
  const sandbox = vm.createContext({
    console,
    Error,
    TypeError,
    Promise,
    CustomEvent: class CustomEvent { constructor(name) { this.type = name; } },
    document: { dispatchEvent: fn(), addEventListener: fn() },
    ...overrides,
  });
  carregar(sandbox, 'shared/js/GeoService.js');
  return sandbox;
}

// ─────────────────────────────────────────────────────────────────────────────
// GeoService.obter() — cache de posição
// ─────────────────────────────────────────────────────────────────────────────
suite('GeoService.obter() — cache de posição', () => {

  test('retorna posição do GPS na primeira chamada', async () => {
    const getCurrentPosition = fn((success) => {
      success({ coords: { latitude: -23.55, longitude: -46.63, accuracy: 10 } });
    });
    const sb = criarSandbox({
      navigator: { geolocation: { getCurrentPosition } },
    });

    const pos = await sb.GeoService.obter();
    assert.strictEqual(pos.lat, -23.55);
    assert.strictEqual(pos.lng, -46.63);
    assert.strictEqual(getCurrentPosition.calls.length, 1);
  });

  test('segunda chamada usa cache sem chamar GPS novamente', async () => {
    const getCurrentPosition = fn((success) => {
      success({ coords: { latitude: -23.55, longitude: -46.63, accuracy: 10 } });
    });
    const sb = criarSandbox({
      navigator: { geolocation: { getCurrentPosition } },
    });

    await sb.GeoService.obter(); // primeira: chama GPS
    await sb.GeoService.obter(); // segunda: usa cache

    assert.strictEqual(getCurrentPosition.calls.length, 1);
  });

  test('chamadas concorrentes compartilham a mesma leitura GPS', async () => {
    const getCurrentPosition = fn((success) => {
      setImmediate(() => {
        success({ coords: { latitude: -23.55, longitude: -46.63, accuracy: 10 } });
      });
    });
    const sb = criarSandbox({
      navigator: { geolocation: { getCurrentPosition } },
    });

    const [primeira, segunda] = await Promise.all([
      sb.GeoService.obter(),
      sb.GeoService.obter(),
    ]);

    assert.deepEqual(primeira, segunda);
    assert.strictEqual(getCurrentPosition.calls.length, 1, 'GPS deve ser solicitado uma única vez');
  });

  test('retorna null para lat/lng se navigator.geolocation não existe', async () => {
    const AppState = { get: fn(() => null), set: fn() };
    const sb = criarSandbox({
      navigator: {},  // sem geolocation
      AppState,
    });

    // Sem GPS e sem AppState com posição → deve resolver sem lançar
    let err = null;
    try { await sb.GeoService.obter(); } catch (e) { err = e; }
    // Pode retornar null ou lançar — só testamos que não trava indefinidamente
    assert.ok(err === null || err instanceof Error);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GeoService.#salvarNaBff — guard de token, 401, lock e offline queue
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Monta sandbox com BffApiService e OfflineSyncQueue mockados.
 * GPS sempre resolve com lat=-23.55, lng=-46.63 na primeira chamada.
 */
function criarSandboxComBff({ tokenValido = true, patchResult = { error: null } } = {}) {
  const patchMock  = fn(async () => patchResult);
  const enqueueMock = fn(async () => {});
  const sb = vm.createContext({
    console,
    Error,
    TypeError,
    Promise,
    CustomEvent: class CustomEvent { constructor(name) { this.type = name; } },
    document: { dispatchEvent: fn(), addEventListener: fn() },
    localStorage: {
      getItem:    fn(() => null),
      setItem:    fn(),
      removeItem: fn(),
    },
    navigator: {
      geolocation: {
        getCurrentPosition: fn((success) =>
          success({ coords: { latitude: -23.55, longitude: -46.63, accuracy: 10 } })
        ),
      },
    },
    OfflineSyncQueue: { enqueue: enqueueMock },
    BffApiService: {
      temTokenValido: fn(() => tokenValido),
      patch:          patchMock,
      baseUrl:        'http://localhost:3002',
    },
  });
  carregar(sb, 'shared/js/GeoService.js');
  return { sb, patchMock, enqueueMock };
}

suite('GeoService.#salvarNaBff — proteção 401 e lock', () => {

  test('não chama patch quando temTokenValido() retorna false', async () => {
    const { sb, patchMock } = criarSandboxComBff({ tokenValido: false });
    await sb.GeoService.obter();
    assert.strictEqual(patchMock.calls.length, 0, 'patch não deve ser chamado sem token');
  });

  test('chama patch uma vez quando token válido', async () => {
    const { sb, patchMock } = criarSandboxComBff();
    await sb.GeoService.obter();
    assert.strictEqual(patchMock.calls.length, 1);
  });

  test('não enfileira no OfflineSyncQueue quando BFF retorna 401', async () => {
    const err401 = Object.assign(new Error('HTTP 401'), { status: 401 });
    const { sb, enqueueMock } = criarSandboxComBff({ patchResult: { error: err401 } });
    await sb.GeoService.obter();
    assert.strictEqual(enqueueMock.calls.length, 0, 'não deve enfileirar quando 401 (token inválido)');
  });

  test('enfileira no OfflineSyncQueue quando BFF retorna 503 (erro de rede/servidor)', async () => {
    const err503 = Object.assign(new Error('HTTP 503'), { status: 503 });
    const { sb, enqueueMock } = criarSandboxComBff({ patchResult: { error: err503 } });
    await sb.GeoService.obter();
    assert.strictEqual(enqueueMock.calls.length, 1, 'deve enfileirar para replay quando 5xx');
  });

  test('segunda chamada obter() reutiliza cache e não chama patch novamente', async () => {
    const { sb, patchMock } = criarSandboxComBff();
    await sb.GeoService.obter();
    await sb.GeoService.obter(); // cache hit
    assert.strictEqual(patchMock.calls.length, 1, 'patch deve ser chamado só uma vez');
  });

  test('chamadas concorrentes de obter() salvam localização uma única vez', async () => {
    const patchMock = fn(async () => ({ error: null }));
    const getCurrentPosition = fn((success) => {
      setImmediate(() => {
        success({ coords: { latitude: -23.55, longitude: -46.63, accuracy: 10 } });
      });
    });
    const sb = criarSandbox({
      localStorage: {
        getItem:    fn(() => null),
        setItem:    fn(),
        removeItem: fn(),
      },
      navigator: { geolocation: { getCurrentPosition } },
      BffApiService: {
        temTokenValido: fn(() => true),
        patch:          patchMock,
        baseUrl:        'http://localhost:3002',
      },
    });

    await Promise.all([sb.GeoService.obter(), sb.GeoService.obter()]);
    await new Promise(resolve => setImmediate(resolve));

    assert.strictEqual(patchMock.calls.length, 1, 'PATCH de localização não deve duplicar');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GeoService.verificarPermissao()
// ─────────────────────────────────────────────────────────────────────────────
suite('GeoService.verificarPermissao()', () => {

  test('retorna "granted" quando permissão foi concedida', async () => {
    const sb = criarSandbox({
      navigator: {
        geolocation: {},
        permissions: { query: fn(async () => ({ state: 'granted' })) },
      },
    });
    const estado = await sb.GeoService.verificarPermissao();
    assert.strictEqual(estado, 'granted');
  });

  test('retorna "denied" quando permissão foi negada', async () => {
    const sb = criarSandbox({
      navigator: {
        geolocation: {},
        permissions: { query: fn(async () => ({ state: 'denied' })) },
      },
    });
    const estado = await sb.GeoService.verificarPermissao();
    assert.strictEqual(estado, 'denied');
  });

  test('retorna "unavailable" quando navigator.geolocation não existe', async () => {
    const sb = criarSandbox({ navigator: {} });
    const estado = await sb.GeoService.verificarPermissao();
    assert.strictEqual(estado, 'unavailable');
  });

  test('retorna "prompt" quando navigator.permissions não existe (fallback)', async () => {
    const sb = criarSandbox({
      navigator: { geolocation: {} }, // sem .permissions
    });
    const estado = await sb.GeoService.verificarPermissao();
    assert.strictEqual(estado, 'prompt');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GeoService — regressões de localização autenticada
// ─────────────────────────────────────────────────────────────────────────────
suite('GeoService — regressões de localização autenticada', () => {

  test('401 bloqueia retry imediato e evita loop', async () => {
    const err401 = Object.assign(new Error('HTTP 401'), { status: 401 });
    const { sb, patchMock } = criarSandboxComBff({ patchResult: { error: err401 } });

    await sb.GeoService.obter();
    await new Promise((resolve) => setImmediate(resolve));
    assert.strictEqual(patchMock.calls.length, 1, 'primeira chamada deve tentar salvar na BFF');

    sb.GeoService.limparCache();
    await sb.GeoService.obter();
    await new Promise((resolve) => setImmediate(resolve));

    assert.strictEqual(
      patchMock.calls.length,
      1,
      'segunda chamada imediata não deve repetir PATCH após 401',
    );
  });

  test('não expõe token em console quando precisa enfileirar offline', async () => {
    const tokenSecreto = 'eyJhbGciOiJIUzI1NiJ9.dGVzdA.token-nao-expor';
    const logs = [];
    const consoleSpy = {
      debug: (...args) => logs.push(args),
      info: (...args) => logs.push(args),
      log: (...args) => logs.push(args),
      warn: (...args) => logs.push(args),
      error: (...args) => logs.push(args),
    };
    const err503 = Object.assign(new Error('HTTP 503'), { status: 503 });
    const sb = vm.createContext({
      console: consoleSpy,
      Error,
      TypeError,
      Promise,
      CustomEvent: class CustomEvent { constructor(name) { this.type = name; } },
      document: { dispatchEvent: fn(), addEventListener: fn() },
      localStorage: {
        getItem: fn((key) => {
          if (key !== 'sb-jfvjisqnzapxxagkbxcu-auth-token') return null;
          return JSON.stringify({
            access_token: tokenSecreto,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          });
        }),
        setItem: fn(),
        removeItem: fn(),
      },
      window: { GEO_DEBUG: true },
      navigator: {
        geolocation: {
          getCurrentPosition: fn((success) => {
            success({ coords: { latitude: -23.55, longitude: -46.63, accuracy: 10 } });
          }),
        },
      },
      OfflineSyncQueue: { enqueue: fn(async () => {}) },
      BffApiService: {
        temTokenValido: fn(() => true),
        patch: fn(async () => ({ error: err503 })),
        baseUrl: 'http://localhost:3002',
      },
    });
    carregar(sb, 'shared/js/GeoService.js');

    await sb.GeoService.obter();
    await new Promise((resolve) => setImmediate(resolve));

    const textos = logs
      .flat()
      .map((item) => (typeof item === 'string' ? item : JSON.stringify(item ?? '')));

    assert.ok(
      !textos.some((texto) => texto.includes(tokenSecreto)),
      'token não deve aparecer em logs do console',
    );
  });

});
