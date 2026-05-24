'use strict';

// =============================================================
// supabase-service-auth-sync.test.js
//
// TDD — verifica que SupabaseService.#initAuthSync() sincroniza
// AppState corretamente para INITIAL_SESSION, SIGNED_IN,
// TOKEN_REFRESHED e SIGNED_OUT.
//
// REGRESSÃO: INITIAL_SESSION era ignorado → AppState.isLogado
// ficava false em reloads com sessão persistida → push subscription
// do barbeiro nunca era renovada → BFF retornava enviados=0.
// =============================================================

const { describe, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { carregar }    = require('./_helpers.js');

const UUID_USER  = 'aabbccdd-0000-4000-8000-000000000001';
const MOCK_USER  = { id: UUID_USER, email: 'barbeiro@barberflow.com' };
const MOCK_SESSION = { user: MOCK_USER, access_token: 'jwt-mock-token' };

// ─── Fábrica de sandbox ───────────────────────────────────────────────────────

/**
 * Cria um sandbox VM isolado com mocks de window.supabase e LoggerService.
 * Captura o callback registrado via onAuthStateChange para disparo manual nos testes.
 *
 * @returns {{ sandbox: vm.Context, authCallbacks: Function[] }}
 */
function criarSandbox() {
  const authCallbacks = [];

  const mockClient = {
    auth: {
      onAuthStateChange: (cb) => {
        authCallbacks.push(cb);
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      getUser:    () => Promise.resolve({ data: { user: null },    error: null }),
    },
  };

  const sandbox = vm.createContext({
    window:        { supabase: { createClient: () => mockClient } },
    LoggerService: { warn: () => {}, error: () => {}, info: () => {} },
    console,
    location: {
      hostname: 'localhost',
      origin:   'http://localhost',
      search:   '',
      pathname: '/',
    },
  });

  carregar(sandbox, 'shared/js/AppState.js');
  carregar(sandbox, 'shared/js/SupabaseService.js');

  return { sandbox, authCallbacks };
}

/**
 * Garante que #getClient() foi chamado (registrando o onAuthStateChange callback)
 * e retorna o primeiro callback capturado.
 */
async function inicializar({ sandbox, authCallbacks }) {
  await sandbox.SupabaseService.getSession().catch(() => {});
  assert.ok(authCallbacks.length >= 1, 'onAuthStateChange deve ter sido registrado após getSession()');
  return authCallbacks[0];
}

// ─── Suíte principal ──────────────────────────────────────────────────────────

describe('SupabaseService.#initAuthSync() — sincronização AppState', () => {

  test('INITIAL_SESSION com user → AppState.isLogado=true e getUserId() correto', async () => {
    const ctx = criarSandbox();
    const cb  = await inicializar(ctx);

    cb('INITIAL_SESSION', MOCK_SESSION);

    assert.strictEqual(
      ctx.sandbox.AppState.get('isLogado'), true,
      'AppState.isLogado deve ser true após INITIAL_SESSION com user válido',
    );
    assert.strictEqual(
      ctx.sandbox.AppState.getUserId(), UUID_USER,
      'AppState.getUserId() deve retornar o id do user da sessão',
    );
  });

  test('INITIAL_SESSION sem user (visitante) → AppState.isLogado permanece false', async () => {
    const ctx = criarSandbox();
    const cb  = await inicializar(ctx);

    cb('INITIAL_SESSION', null);

    assert.strictEqual(
      ctx.sandbox.AppState.get('isLogado'), false,
      'INITIAL_SESSION com session null não deve autenticar o usuário',
    );
  });

  test('SIGNED_IN → AppState.isLogado=true (comportamento existente não quebrado)', async () => {
    const ctx = criarSandbox();
    const cb  = await inicializar(ctx);

    cb('SIGNED_IN', MOCK_SESSION);

    assert.strictEqual(ctx.sandbox.AppState.get('isLogado'), true);
    assert.strictEqual(ctx.sandbox.AppState.getUserId(), UUID_USER);
  });

  test('TOKEN_REFRESHED → AppState.isLogado=true (comportamento existente não quebrado)', async () => {
    const ctx = criarSandbox();
    const cb  = await inicializar(ctx);

    cb('TOKEN_REFRESHED', MOCK_SESSION);

    assert.strictEqual(ctx.sandbox.AppState.get('isLogado'), true);
  });

  test('SIGNED_OUT → AppState.isLogado=false (comportamento existente não quebrado)', async () => {
    const ctx = criarSandbox();
    const cb  = await inicializar(ctx);

    // Simula sessão ativa
    cb('SIGNED_IN', MOCK_SESSION);
    assert.strictEqual(ctx.sandbox.AppState.get('isLogado'), true);

    // Logout
    cb('SIGNED_OUT', null);
    assert.strictEqual(ctx.sandbox.AppState.get('isLogado'), false);
  });

});
