'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

function criarSandbox(overrides = {}) {
  const store = {};
  const sessionStorage = {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };

  const sandbox = vm.createContext({
    console,
    Error,
    TypeError,
    sessionStorage,
    LoggerService: { warn: fn(), error: fn(), info: fn() },
    ...overrides,
  });

  carregar(sandbox, 'apps/profissional/assets/js/MonetizationGuard.js');
  carregar(sandbox, 'apps/profissional/assets/js/PlanosService.js');
  return sandbox;
}

describe('PlanosService document guard', () => {
  test('plano pago exige documento profissional antes de iniciar pagamento', async () => {
    const spyDoc = fn().mockResolvedValue(true);
    const spyFluxo = fn();
    const sb = criarSandbox({
      ProfessionalDocumentGuard: { ensure: spyDoc },
      PaymentFlowHandler: { iniciarFluxo: spyFluxo },
    });

    sb.PlanosService.selecionarPlano('barbeiro', 'mensal');
    await sb.PlanosService.confirmarPlano(fn(), fn());

    assert.equal(spyDoc.calls.length, 1);
    assert.equal(spyFluxo.calls.length, 1);
  });

  test('plano pago nao chama pagamento se documento profissional falhar', async () => {
    const spyDoc = fn().mockRejectedValue(new Error('Documento invalido.'));
    const spyFluxo = fn();
    const onErro = fn();
    const sb = criarSandbox({
      ProfessionalDocumentGuard: { ensure: spyDoc },
      PaymentFlowHandler: { iniciarFluxo: spyFluxo },
    });

    sb.PlanosService.selecionarPlano('barbeiro', 'mensal');
    await sb.PlanosService.confirmarPlano(fn(), onErro);

    assert.equal(spyDoc.calls.length, 1);
    assert.equal(spyFluxo.calls.length, 0);
    assert.equal(onErro.calls[0][0], 'Documento invalido.');
  });
});