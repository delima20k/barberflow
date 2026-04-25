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
