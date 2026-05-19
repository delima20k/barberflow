'use strict';

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de sandbox
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cria sandbox com sessionStorage stub + MonetizationGuard.
 * PaymentFlowHandler e LoggerService são injetados como stubs.
 */
function criarSandbox(overrides = {}) {
  // sessionStorage simples em memória
  const store = {};
  const sessionStorage = {
    getItem:    (k)    => store[k] ?? null,
    setItem:    (k, v) => { store[k] = String(v); },
    removeItem: (k)    => { delete store[k]; },
  };

  const LoggerService = { warn: fn(), error: fn(), info: fn() };

  const sandbox = vm.createContext({
    console,
    Error,
    TypeError,
    sessionStorage,
    LoggerService,
    ...overrides,
  });

  carregar(sandbox, 'apps/profissional/assets/js/MonetizationGuard.js');
  return sandbox;
}

// ─────────────────────────────────────────────────────────────────────────────

suite('PlanosService — selecionarTipo()', () => {

  test('barbearia → podeAvancar: false (sem persistir sessionStorage)', () => {
    const sb = criarSandbox({
      PaymentFlowHandler: { iniciarFluxo: fn() },
    });
    carregar(sb, 'apps/profissional/assets/js/PlanosService.js');

    const resultado = sb.PlanosService.selecionarTipo('barbearia');

    assert.equal(resultado.podeAvancar, false);
    // Não deve ter escrito bf_tipo
    assert.equal(sb.sessionStorage.getItem('bf_tipo'), null);
  });

  test('barbeiro → podeAvancar: true + persiste bf_tipo em sessionStorage', () => {
    const sb = criarSandbox({
      PaymentFlowHandler: { iniciarFluxo: fn() },
    });
    carregar(sb, 'apps/profissional/assets/js/PlanosService.js');

    const resultado = sb.PlanosService.selecionarTipo('barbeiro');

    assert.equal(resultado.podeAvancar, true);
    assert.equal(sb.sessionStorage.getItem('bf_tipo'), 'barbeiro');
  });

});

// ─────────────────────────────────────────────────────────────────────────────

suite('PlanosService — iniciarFluxo()', () => {

  test('persiste tipo e plano via MonetizationGuard antes de invocar PaymentFlowHandler', () => {
    const spyFluxo = fn();
    const sb = criarSandbox({
      PaymentFlowHandler: { iniciarFluxo: spyFluxo },
    });
    carregar(sb, 'apps/profissional/assets/js/PlanosService.js');

    const onSucesso = fn();
    const onErro    = fn();
    sb.PlanosService.iniciarFluxo('barbeiro', 'mensal', onSucesso, onErro);

    assert.equal(sb.MonetizationGuard.tipoUsuario,     'barbeiro');
    assert.equal(sb.MonetizationGuard.planoSelecionado, 'mensal');
  });

  test('PaymentFlowHandler.iniciarFluxo é chamado com plano, onSucesso e onErro', () => {
    const spyFluxo = fn();
    const sb = criarSandbox({
      PaymentFlowHandler: { iniciarFluxo: spyFluxo },
    });
    carregar(sb, 'apps/profissional/assets/js/PlanosService.js');

    const onSucesso = fn();
    const onErro    = fn();
    sb.PlanosService.iniciarFluxo('barbeiro', 'trimestral', onSucesso, onErro);

    assert.equal(spyFluxo.calls.length, 1);
    const [plano, cbSucesso, cbErro] = spyFluxo.calls[0];
    assert.equal(plano, 'trimestral');
    assert.equal(typeof cbSucesso, 'function');
    assert.equal(typeof cbErro,    'function');
  });

});

// ─────────────────────────────────────────────────────────────────────────────

suite('LegalConsentService — processarAceite()', () => {

  function criarSandboxLegal({ user = null } = {}) {
    const store = {};
    const sessionStorage = {
      getItem:    (k)    => store[k] ?? null,
      setItem:    (k, v) => { store[k] = String(v); },
      removeItem: (k)    => { delete store[k]; },
    };

    const SupabaseService = {
      getUser:        fn().mockResolvedValue(user),
      legalConsents:  fn().mockReturnValue({
        select:   fn().mockReturnThis(),
        eq:       fn().mockReturnThis(),
        maybeSingle: fn().mockResolvedValue({ data: null, error: null }),
        upsert:   fn().mockResolvedValue({ error: null }),
      }),
    };

    const LoggerService = { warn: fn(), error: fn(), info: fn() };

    const sandbox = vm.createContext({
      console, Error, TypeError, Promise,
      sessionStorage, SupabaseService, LoggerService,
    });

    carregar(sandbox, 'apps/profissional/assets/js/LegalConsentService.js');
    return sandbox;
  }

  test('sem usuário logado → marca aceite pendente + ok: true + usuario: null', async () => {
    const sb = criarSandboxLegal({ user: null });

    const resultado = await sb.LegalConsentService.processarAceite('trial', {});

    assert.equal(resultado.ok, true);
    assert.equal(resultado.usuario, null);
    // Pendente salvo em sessionStorage
    const pendente = sb.sessionStorage.getItem('bf_termos_pendentes');
    assert.ok(pendente, 'deveria ter pendente em sessionStorage');
    const parsed = JSON.parse(pendente);
    assert.equal(parsed.planType, 'trial');
  });

  test('com usuário logado → chama registrarAceite e retorna usuario', async () => {
    const user = { id: 'c0000000-0000-4000-8000-000000000001' };
    const sb   = criarSandboxLegal({ user });

    const resultado = await sb.LegalConsentService.processarAceite('mensal', {});

    assert.equal(resultado.ok, true);
    assert.deepEqual(resultado.usuario, user);
    // Não deve ter pendente
    const pendente = sb.sessionStorage.getItem('bf_termos_pendentes');
    assert.equal(pendente, null);
  });

});

// ─────────────────────────────────────────────────────────────────────────────

suite('LegalConsentService — estado pendente', () => {

  function criarSandboxPendente() {
    const store = {};
    const sessionStorage = {
      getItem:    (k)    => store[k] ?? null,
      setItem:    (k, v) => { store[k] = String(v); },
      removeItem: (k)    => { delete store[k]; },
    };

    const SupabaseService = {
      legalConsents: fn().mockReturnValue({
        select:      fn().mockReturnThis(),
        eq:          fn().mockReturnThis(),
        maybeSingle: fn().mockResolvedValue({ data: null, error: null }),
        upsert:      fn().mockResolvedValue({ error: null }),
      }),
    };

    const LoggerService = { warn: fn(), error: fn(), info: fn() };

    const sandbox = vm.createContext({
      console, Error, TypeError, Promise,
      sessionStorage, SupabaseService, LoggerService,
    });

    carregar(sandbox, 'apps/profissional/assets/js/LegalConsentService.js');
    return sandbox;
  }

  test('marcarAceitePendente persiste flags em sessionStorage', () => {
    const sb    = criarSandboxPendente();
    const flags = { direitos_autorais: true, uso_gps: true };

    sb.LegalConsentService.marcarAceitePendente('trial', flags);

    assert.equal(sb.LegalConsentService.temAceitePendente(), true);
    const parsed = JSON.parse(sb.sessionStorage.getItem('bf_termos_pendentes'));
    assert.equal(parsed.planType, 'trial');
    assert.equal(parsed.flags.direitos_autorais, true);
  });

  test('temAceitePendente() retorna false quando não há pendente', () => {
    const sb = criarSandboxPendente();
    assert.equal(sb.LegalConsentService.temAceitePendente(), false);
  });

  test('registrarAceitePendente sem pendente → ok: true (nada a fazer)', async () => {
    const sb     = criarSandboxPendente();
    const result = await sb.LegalConsentService.registrarAceitePendente(
      'c0000000-0000-4000-8000-000000000001',
    );
    assert.equal(result.ok, true);
  });

});
