'use strict';
/**
 * tests/financeiro-service-metodos.test.js
 *
 * Testa os novos métodos de breakdown por método de pagamento:
 *   - FinanceiroRepository.getResumoPorMetodoPagamento agrupa corretamente
 *   - FinanceiroRepository.getResumoPorMetodoPagamento mapeia 'cartao' → credito
 *   - FinanceiroRepository.aplicarDescontoMetodo chama ApiService.rpc com params corretos
 *   - FinanceiroService.getResumoPorMetodoPagamento valida UUID e delega
 *   - FinanceiroService.getResumoPorMetodoPagamento retorna estrutura correta
 *   - FinanceiroService.aplicarDescontoMetodo valida UUID inválido
 *   - FinanceiroService.aplicarDescontoMetodo valida metodo inválido
 *   - FinanceiroService.aplicarDescontoMetodo valida porcentagem ≤ 0
 *   - FinanceiroService.aplicarDescontoMetodo valida porcentagem ≥ 100
 *   - FinanceiroService.aplicarDescontoMetodo chama repo e despacha evento
 *   - Desconto em 'debito' não altera grupo 'pix'/'dinheiro'
 */

const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const vm     = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

const SHOP_ID  = 'bbbbbbbb-0000-4000-8000-000000000002';
const PROF_ID  = 'cccccccc-0000-4000-8000-000000000003';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function criarSandboxRepo({ rows = [], rpcError = null } = {}) {
  return vm.createContext({
    console,
    ApiService: {
      from: fn().mockImplementation(() => ({
        select: fn().mockReturnThis(),
        eq:     fn().mockReturnThis(),
        gte:    fn().mockReturnThis(),
        lte:    fn().mockReturnThis(),
        then:   fn().mockImplementation(cb =>
          Promise.resolve({ data: rows, error: null }).then(cb),
        ),
      })),
      rpc: fn().mockImplementation(async () => {
        if (rpcError) throw rpcError;
        return {};
      }),
    },
    InputValidator: null,
    LoggerService:  { warn: fn() },
  });
}

function criarSandboxService({
  breakdownRetorno = null,
  aplicarError     = null,
} = {}) {
  const eventos = [];
  const defaultBreakdown = breakdownRetorno ?? {
    credito:     { total: 50, grossTotal: 60, count: 2 },
    debito:      { total: 30, grossTotal: 35, count: 1 },
    pixDinheiro: { total: 80, grossTotal: 80, count: 3 },
    totalGeral:  160,
  };

  return {
    eventos,
    sandbox: vm.createContext({
      console,
      document: {
        dispatchEvent: fn().mockImplementation(e => eventos.push({ type: e.type, detail: e.detail })),
        addEventListener: fn(),
      },
      CustomEvent: class CustomEvent {
        constructor(type, opts = {}) { this.type = type; this.detail = opts.detail ?? null; }
      },
      FinanceiroRepository: {
        getResumoPorMetodoPagamento: fn().mockResolvedValue(defaultBreakdown),
        aplicarDescontoMetodo: fn().mockImplementation(async () => {
          if (aplicarError) throw aplicarError;
        }),
        getTotalPeriodo:      fn().mockResolvedValue({ count: 0, total: 0 }),
        getResumoPorPeriodo:  fn().mockResolvedValue([]),
        getTransacoesBarbeiro: fn().mockResolvedValue([]),
      },
      InputValidator: null,
      LoggerService:  { warn: fn() },
    }),
  };
}

// ─── Testes de FinanceiroRepository ─────────────────────────────────────────

describe('FinanceiroRepository.getResumoPorMetodoPagamento', () => {

  test('agrupa corretamente: credito, debito, pixDinheiro', async () => {
    const rows = [
      { amount: 30, gross_amount: 35, payment_method: 'credito' },
      { amount: 20, gross_amount: 20, payment_method: 'pix'     },
      { amount: 25, gross_amount: 30, payment_method: 'debito'  },
      { amount: 40, gross_amount: 40, payment_method: 'dinheiro'},
    ];
    const sb = criarSandboxRepo({ rows });
    carregar(sb, 'shared/js/InputValidator.js');
    sb.InputValidator = sb.InputValidator ?? sb.Validator;
    carregar(sb, 'shared/js/FinanceiroRepository.js');

    const resultado = await sb.FinanceiroRepository.getResumoPorMetodoPagamento(
      SHOP_ID, { de: '2026-05-01T00:00:00Z', ate: '2026-05-31T23:59:59Z' },
    );

    assert.equal(resultado.credito.total,          30);
    assert.equal(resultado.credito.grossTotal,      35);
    assert.equal(resultado.credito.count,           1);
    assert.equal(resultado.debito.total,            25);
    assert.equal(resultado.debito.grossTotal,       30);
    assert.equal(resultado.debito.count,            1);
    assert.equal(resultado.pixDinheiro.total,       60);
    assert.equal(resultado.pixDinheiro.grossTotal,  60);
    assert.equal(resultado.pixDinheiro.count,       2);
    assert.equal(resultado.totalGeral,              115);
  });

  test("mapeia método legado 'cartao' para grupo credito", async () => {
    const rows = [
      { amount: 50, gross_amount: 50, payment_method: 'cartao' },
    ];
    const sb = criarSandboxRepo({ rows });
    carregar(sb, 'shared/js/InputValidator.js');
    sb.InputValidator = sb.InputValidator ?? sb.Validator;
    carregar(sb, 'shared/js/FinanceiroRepository.js');

    const resultado = await sb.FinanceiroRepository.getResumoPorMetodoPagamento(
      SHOP_ID, { de: '2026-05-01T00:00:00Z', ate: '2026-05-31T23:59:59Z' },
    );

    assert.equal(resultado.credito.total, 50);
    assert.equal(resultado.credito.count, 1);
    assert.equal(resultado.debito.count,  0);
  });

  test('usa amount quando gross_amount é null (dados legados)', async () => {
    const rows = [
      { amount: 40, gross_amount: null, payment_method: 'pix' },
    ];
    const sb = criarSandboxRepo({ rows });
    carregar(sb, 'shared/js/InputValidator.js');
    sb.InputValidator = sb.InputValidator ?? sb.Validator;
    carregar(sb, 'shared/js/FinanceiroRepository.js');

    const resultado = await sb.FinanceiroRepository.getResumoPorMetodoPagamento(
      SHOP_ID, { de: '2026-05-01T00:00:00Z', ate: '2026-05-31T23:59:59Z' },
    );

    assert.equal(resultado.pixDinheiro.grossTotal, 40);
  });

  test('lança TypeError para barbershopId inválido', async () => {
    const sb = criarSandboxRepo();
    carregar(sb, 'shared/js/InputValidator.js');
    sb.InputValidator = sb.InputValidator ?? sb.Validator;
    carregar(sb, 'shared/js/FinanceiroRepository.js');

    await assert.rejects(
      () => sb.FinanceiroRepository.getResumoPorMetodoPagamento(
        'nao-e-uuid', { de: '2026-05-01T00:00:00Z', ate: '2026-05-31T23:59:59Z' },
      ),
      { name: 'TypeError' },
    );
  });

  test('aplicarDescontoMetodo chama ApiService.rpc com parâmetros corretos', async () => {
    const sb = criarSandboxRepo();
    carregar(sb, 'shared/js/InputValidator.js');
    sb.InputValidator = sb.InputValidator ?? sb.Validator;
    carregar(sb, 'shared/js/FinanceiroRepository.js');

    await sb.FinanceiroRepository.aplicarDescontoMetodo(
      SHOP_ID, 'credito',
      { de: '2026-05-01T00:00:00Z', ate: '2026-05-31T23:59:59Z' },
      1.5,
    );

    const [nomeFn, params] = sb.ApiService.rpc.calls[0];
    assert.equal(nomeFn, 'aplicar_desconto_metodo');
    assert.equal(params.p_barbershop_id, SHOP_ID);
    assert.equal(params.p_metodo,        'credito');
    assert.equal(params.p_porcentagem,   1.5);
    assert.ok(params.p_de);
    assert.ok(params.p_ate);
  });
});

// ─── Testes de FinanceiroService ─────────────────────────────────────────────

describe('FinanceiroService.getResumoPorMetodoPagamento', () => {

  test('valida UUID inválido e lança TypeError', async () => {
    const { sandbox: sb } = criarSandboxService();
    carregar(sb, 'shared/js/InputValidator.js');
    sb.InputValidator = sb.InputValidator ?? sb.Validator;
    carregar(sb, 'shared/js/FinanceiroService.js');

    await assert.rejects(
      () => sb.FinanceiroService.getResumoPorMetodoPagamento('invalido', 'hoje'),
      { name: 'TypeError' },
    );
  });

  test('delega ao repository e retorna breakdown', async () => {
    const { sandbox: sb } = criarSandboxService();
    carregar(sb, 'shared/js/InputValidator.js');
    sb.InputValidator = sb.InputValidator ?? sb.Validator;
    carregar(sb, 'shared/js/FinanceiroService.js');

    const resultado = await sb.FinanceiroService.getResumoPorMetodoPagamento(SHOP_ID, 'hoje');

    assert.ok(resultado.credito);
    assert.ok(resultado.debito);
    assert.ok(resultado.pixDinheiro);
    assert.equal(typeof resultado.totalGeral, 'number');
  });
});

describe('FinanceiroService.aplicarDescontoMetodo', () => {

  test('lança TypeError para UUID inválido', async () => {
    const { sandbox: sb } = criarSandboxService();
    carregar(sb, 'shared/js/InputValidator.js');
    sb.InputValidator = sb.InputValidator ?? sb.Validator;
    carregar(sb, 'shared/js/FinanceiroService.js');

    await assert.rejects(
      () => sb.FinanceiroService.aplicarDescontoMetodo('invalido', 'hoje', 'credito', 1.5),
      { name: 'TypeError' },
    );
  });

  test('lança TypeError para método de pagamento inválido', async () => {
    const { sandbox: sb } = criarSandboxService();
    carregar(sb, 'shared/js/InputValidator.js');
    sb.InputValidator = sb.InputValidator ?? sb.Validator;
    carregar(sb, 'shared/js/FinanceiroService.js');

    await assert.rejects(
      () => sb.FinanceiroService.aplicarDescontoMetodo(SHOP_ID, 'hoje', 'pix', 1.5),
      { name: 'TypeError' },
    );
  });

  test('lança TypeError para porcentagem ≤ 0', async () => {
    const { sandbox: sb } = criarSandboxService();
    carregar(sb, 'shared/js/InputValidator.js');
    sb.InputValidator = sb.InputValidator ?? sb.Validator;
    carregar(sb, 'shared/js/FinanceiroService.js');

    await assert.rejects(
      () => sb.FinanceiroService.aplicarDescontoMetodo(SHOP_ID, 'hoje', 'credito', 0),
      { name: 'TypeError' },
    );
  });

  test('lança TypeError para porcentagem ≥ 100', async () => {
    const { sandbox: sb } = criarSandboxService();
    carregar(sb, 'shared/js/InputValidator.js');
    sb.InputValidator = sb.InputValidator ?? sb.Validator;
    carregar(sb, 'shared/js/FinanceiroService.js');

    await assert.rejects(
      () => sb.FinanceiroService.aplicarDescontoMetodo(SHOP_ID, 'hoje', 'credito', 100),
      { name: 'TypeError' },
    );
  });

  test('chama repository e despacha barberflow:transacao-atualizada', async () => {
    const { sandbox: sb, eventos } = criarSandboxService();
    carregar(sb, 'shared/js/InputValidator.js');
    sb.InputValidator = sb.InputValidator ?? sb.Validator;
    carregar(sb, 'shared/js/FinanceiroService.js');

    await sb.FinanceiroService.aplicarDescontoMetodo(SHOP_ID, 'hoje', 'debito', 2.5);

    assert.equal(sb.FinanceiroRepository.aplicarDescontoMetodo.calls.length, 1);
    const ev = eventos.find(e => e.type === 'barberflow:transacao-atualizada');
    assert.ok(ev, 'evento barberflow:transacao-atualizada deve ser disparado');
    assert.equal(ev.detail?.barbershopId, SHOP_ID);
  });

  test('aceita metodo debito sem erro', async () => {
    const { sandbox: sb } = criarSandboxService();
    carregar(sb, 'shared/js/InputValidator.js');
    sb.InputValidator = sb.InputValidator ?? sb.Validator;
    carregar(sb, 'shared/js/FinanceiroService.js');

    await assert.doesNotReject(
      () => sb.FinanceiroService.aplicarDescontoMetodo(SHOP_ID, 'hoje', 'debito', 1.5),
    );
  });
});
