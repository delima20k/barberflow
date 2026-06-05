'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

const SHOP_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const PROF_ID = 'bbbbbbbb-0000-4000-8000-000000000002';
const SHOP_ID2 = 'cccccccc-0000-4000-8000-000000000003';

function dashboardFixture(overrides = {}) {
  return {
    cards: {
      receitaBruta: { total: 70, variacaoPct: 0 },
      receitaLiquida: { total: 68, variacaoPct: 0 },
      lucroBarbearia: { total: 27.2, variacaoPct: 0 },
      totalCortes: { total: 2, variacaoPct: 0 },
      totalBarbeiros: { total: 1, online: 0, inativos: 0 },
      ...(overrides.cards || {}),
    },
    comparativo: { receitaLiquida: 0, ...(overrides.comparativo || {}) },
    metodosPagamento: overrides.metodosPagamento || [],
    barbeiros: overrides.barbeiros || [{
      professionalId: PROF_ID,
      nome: 'Barbeiro',
      cortes: 2,
      receitaLiquida: 27.2,
      valorBarbeiro: 27.2,
      valorBarbearia: 40.8,
      porcentagemBarbearia: 60,
      porcentagemBarbeiro: 40,
      agreementConfigured: true,
    }],
    series: overrides.series || [],
    donut: overrides.donut || [],
    statusEquipe: overrides.statusEquipe || { total: 1, online: 0, ativos: 1, inativos: 0 },
  };
}

function elementoStub(id) {
  return {
    id,
    hidden: false,
    innerHTML: '',
    textContent: '',
    className: '',
    style: {},
    dataset: {},
    querySelectorAll: fn().mockReturnValue([]),
    querySelector: fn().mockReturnValue(null),
    classList: {
      contains: fn().mockReturnValue(false),
      add: fn(),
      remove: fn(),
      toggle: fn(),
    },
    setAttribute: fn(),
    addEventListener: fn(),
  };
}

function criarSandbox({ shopId = SHOP_ID, retorno = dashboardFixture() } = {}) {
  const eventListeners = {};

  const sandbox = vm.createContext({
    console,
    Intl,
    document: {
      getElementById: fn().mockImplementation(id => elementoStub(id)),
      addEventListener: fn().mockImplementation((tipo, cb) => {
        if (!eventListeners[tipo]) eventListeners[tipo] = [];
        eventListeners[tipo].push(cb);
      }),
    },
    MutationObserver: class MutationObserver {
      constructor(cb) { this._cb = cb; }
      observe() {}
    },
    BffApiService: {
      financeiro: {
        dashboard: fn().mockResolvedValue({ data: retorno, error: null }),
        aplicarTaxaMetodo: fn().mockResolvedValue({ data: { aplicado: true }, error: null }),
      },
    },
    AuthService: { getPerfil: fn().mockReturnValue({ id: PROF_ID }) },
    ApiService: {
      from: fn().mockImplementation(() => ({
        select: fn().mockReturnThis(),
        eq: fn().mockReturnThis(),
        limit: fn().mockReturnThis(),
        single: fn().mockResolvedValue({ data: { id: shopId }, error: null }),
      })),
    },
    SupabaseService: {
      channel: fn().mockReturnValue({ on: fn().mockReturnThis(), subscribe: fn() }),
      removeChannel: fn(),
    },
    LoggerService: { warn: fn(), error: fn(), info: fn() },
  });

  carregar(sandbox, 'apps/profissional/assets/js/pages/FinancasPage.js');
  return { sandbox, eventListeners };
}

function disparar(eventListeners, tipo, detail) {
  for (const handler of eventListeners[tipo] || []) {
    handler({ type: tipo, detail });
  }
}

describe('FinancasPage — eventos financeiros', () => {
  test('ignora evento antes de resolver shopId', () => {
    const { sandbox, eventListeners } = criarSandbox();
    const page = new sandbox.FinancasPage();
    page.bind();

    disparar(eventListeners, 'barberflow:transacao-criada', { barbershopId: SHOP_ID });
    assert.equal(sandbox.BffApiService.financeiro.dashboard.calls.length, 0);
  });

  test('ignora evento de outra barbearia', () => {
    const { sandbox, eventListeners } = criarSandbox();
    const page = new sandbox.FinancasPage();
    page.bind();

    disparar(eventListeners, 'barberflow:transacao-criada', { barbershopId: SHOP_ID2 });
    assert.equal(sandbox.BffApiService.financeiro.dashboard.calls.length, 0);
  });

  test('tolera detail ausente', () => {
    const { sandbox, eventListeners } = criarSandbox();
    const page = new sandbox.FinancasPage();
    page.bind();

    assert.doesNotThrow(() => disparar(eventListeners, 'barberflow:transacao-criada', null));
    assert.doesNotThrow(() => disparar(eventListeners, 'barberflow:transacao-criada', {}));
  });
});

describe('FinancasPage — contrato BFF', () => {
  test('mantem guard #carregando para evitar cargas concorrentes', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../apps/profissional/assets/js/pages/FinancasPage.js'),
      'utf8',
    );
    assert.match(src, /#carregando/);
    assert.match(src, /if \(this\.#carregando \|\| !this\.#shopId\)/);
  });

  test('dashboard retorna numeros prontos para renderizacao', async () => {
    const { sandbox } = criarSandbox({
      retorno: dashboardFixture({
        cards: { receitaLiquida: { total: 175.5 } },
        barbeiros: [{ professionalId: PROF_ID, nome: 'Ana', valorBarbeiro: 55 }],
      }),
    });

    const { data } = await sandbox.BffApiService.financeiro.dashboard({ barbershopId: SHOP_ID, periodo: 'mes' });
    assert.equal(typeof data.cards.receitaLiquida.total, 'number');
    assert.equal(data.cards.receitaLiquida.total, 175.5);
    assert.equal(data.barbeiros[0].valorBarbeiro.toFixed(2), '55.00');
  });

  test('assina fontes que afetam o resumo financeiro da barbearia', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../apps/profissional/assets/js/pages/FinancasPage.js'),
      'utf8',
    );
    assert.match(src, /#assinarTabelaResumo\('transactions'\)/);
    assert.match(src, /#assinarTabelaResumo\('agreements'\)/);
    assert.match(src, /#assinarTabelaResumo\('professional_shop_links'\)/);
    assert.match(src, /#assinarTabelaResumo\('professional_barbershop_presence'\)/);
    assert.match(src, /#assinarTabelaResumo\('financial_payment_method_fees'\)/);
    assert.match(src, /#assinarBarbeariaResumo\(\)/);
    assert.match(src, /table:\s+'barbershops'/);
    assert.match(src, /filter:\s+`id=eq\.\$\{this\.#shopId\}`/);
  });

  test('renderiza taxa de metodo vinda da BFF sem recalcular no frontend', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../apps/profissional/assets/js/pages/FinancasPage.js'),
      'utf8',
    );
    assert.match(src, /item\.feePercent/);
    assert.doesNotMatch(src, /gross_amount/);
    assert.doesNotMatch(src, /amount\s*\*\s*\(/);
  });
});
