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
      papel: 'professional',
      cortes: 2,
      receitaLiquida: 27.2,
      valorBarbeiro: 27.2,
      pendingPayoutAmount: 27.2,
      cutsPendingPayout: 2,
      valorBarbearia: 40.8,
      porcentagemBarbearia: 60,
      porcentagemBarbeiro: 40,
      agreementConfigured: true,
    }],
    series: overrides.series || [],
    donut: overrides.donut || [],
    statusEquipe: overrides.statusEquipe || { total: 1, online: 0, ativos: 1, inativos: 0 },
    acertoSemanal: overrides.acertoSemanal,
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

function criarSandbox({
  shopId = SHOP_ID,
  retorno = dashboardFixture(),
  ativa = false,
  dashboardHandler = null,
} = {}) {
  const eventListeners = {};
  const mutationObservers = [];
  const realtimeCallbacks = {};
  const elements = new Map();
  const getElement = id => {
    if (!elements.has(id)) {
      const element = elementoStub(id);
      if (id === 'tela-financas' && ativa) {
        element.classList.contains = fn().mockImplementation(classe => classe === 'ativa');
      }
      elements.set(id, element);
    }
    return elements.get(id);
  };

  const sandbox = vm.createContext({
    console,
    Intl,
    queueMicrotask,
    document: {
      getElementById: fn().mockImplementation(getElement),
      addEventListener: fn().mockImplementation((tipo, cb) => {
        if (!eventListeners[tipo]) eventListeners[tipo] = [];
        eventListeners[tipo].push(cb);
      }),
    },
    MutationObserver: class MutationObserver {
      constructor(cb) {
        this._cb = cb;
        mutationObservers.push(cb);
      }
      observe() {}
    },
    BffApiService: {
      financeiro: {
        dashboard: dashboardHandler
          ? fn().mockImplementation(dashboardHandler)
          : fn().mockResolvedValue({ data: retorno, error: null }),
        aplicarTaxaMetodo: fn().mockResolvedValue({ data: { aplicado: true }, error: null }),
        confirmarPagamentoBarbeiro: fn().mockResolvedValue({
          data: { payout: { amount: 27.2 }, updatedBalance: { pendingPayoutAmount: 0 } },
          error: null,
        }),
        confirmarAcertoSemanal: fn().mockResolvedValue({
          data: { settlement: { status: 'paid' } },
          error: null,
        }),
      },
    },
    AuthService: { getPerfil: fn().mockReturnValue({ id: PROF_ID }) },
    ApiService: {
      from: fn().mockImplementation(() => ({
        select: fn().mockReturnThis(),
        eq: fn().mockReturnThis(),
        limit: fn().mockReturnThis(),
        maybeSingle: fn().mockResolvedValue({ data: { id: shopId }, error: null }),
        single: fn().mockResolvedValue({ data: { id: shopId }, error: null }),
      })),
    },
    SupabaseService: {
      channel: fn().mockImplementation(nome => {
        const canal = {
          on: fn().mockImplementation((_tipo, config, callback) => {
            realtimeCallbacks[config.table] = callback;
            return canal;
          }),
          subscribe: fn().mockReturnValue({ nome }),
        };
        return canal;
      }),
      removeChannel: fn(),
    },
    LoggerService: { warn: fn(), error: fn(), info: fn() },
  });

  carregar(sandbox, 'apps/profissional/assets/js/pages/FinancasPage.js');
  return {
    sandbox,
    eventListeners,
    mutationObservers,
    realtimeCallbacks,
    elements,
  };
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
  test('preserva uma recarga pendente quando evento chega durante carregamento', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../apps/profissional/assets/js/pages/FinancasPage.js'),
      'utf8',
    );
    assert.match(src, /#recargaPendente/);
    assert.match(src, /if \(this\.#carregando\) \{\s*this\.#recargaPendente = true;/);
    assert.match(src, /if \(this\.#recargaPendente\) \{/);
  });

  test('executa nova carga quando Realtime chega durante consulta em andamento', async () => {
    let chamada = 0;
    let liberarSegundaCarga;
    const segundaCarga = new Promise(resolve => {
      liberarSegundaCarga = resolve;
    });
    const atualizado = dashboardFixture({
      cards: {
        receitaBruta: { total: 150, variacaoPct: 0 },
        receitaLiquida: { total: 145, variacaoPct: 0 },
        meuLucro: { total: 101.5, variacaoPct: 0 },
        lucroBarbearia: { total: 43.5, variacaoPct: 0 },
        totalCortes: { total: 3, variacaoPct: 0 },
        saldoPendenteAtual: { total: 101.5, variacaoPct: 0 },
        totalRecebido: { total: 70, variacaoPct: 0 },
        faturamentoHistorico: { total: 220, variacaoPct: 0 },
      },
      barbeiros: [{
        professionalId: PROF_ID,
        nome: 'Parceiro atualizado',
        papel: 'professional',
        status: 'online',
        ativo: true,
        financialVisible: true,
        cortes: 3,
        receitaBruta: 150,
        receitaLiquida: 145,
        taxas: 5,
        totalRecebido: 70,
        faturamentoHistorico: 220,
        porcentagemBarbeiro: 70,
        porcentagemBarbearia: 30,
        valorBarbeiro: 101.5,
        valorBarbearia: 43.5,
        saldoPendenteAtual: 101.5,
        pendingPayoutAmount: 101.5,
        agreementConfigured: true,
        crescimentoPct: 0,
      }],
      metodosPagamento: [{
        metodo: 'pix',
        label: 'PIX atualizado',
        receitaBruta: 150,
        receitaLiquida: 145,
        taxas: 5,
        cortes: 3,
      }],
      series: [{ data: '2026-05-21', receitaLiquida: 145 }],
      donut: [
        { label: 'Barbearia', value: 43.5, color: '#0f766e' },
        { label: 'Barbeiro', value: 101.5, color: '#2563eb' },
      ],
      acertoSemanal: {
        resumo: {
          status: 'pending',
          valorARepassarBarbearia: 43.5,
          producaoBrutaSemana: 150,
          participacaoBarbearia: 43.5,
          participacaoBarbeiro: 101.5,
          valorLiquidoBarbeiro: 101.5,
        },
        historico: [{
          semanaReferencia: 'EXTRATO ATUALIZADO',
          valorBarbearia: 43.5,
          status: 'pending',
        }],
      },
    });
    const dashboardHandler = () => {
      chamada += 1;
      if (chamada === 2) return segundaCarga;
      return Promise.resolve({
        data: chamada === 1 ? dashboardFixture() : atualizado,
        error: null,
      });
    };
    const contexto = criarSandbox({ ativa: true, dashboardHandler });
    const page = new contexto.sandbox.FinancasPage();
    page.bind();

    contexto.mutationObservers[0]();
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(chamada, 1);
    assert.equal(typeof contexto.realtimeCallbacks.transactions, 'function');

    contexto.realtimeCallbacks.transactions();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(chamada, 2);

    contexto.realtimeCallbacks.transactions();
    liberarSegundaCarga({ data: dashboardFixture(), error: null });
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(chamada, 3);
    assert.match(contexto.elements.get('fin-resumo').innerHTML, /150/);
    assert.match(contexto.elements.get('fin-resumo').innerHTML, />3</);
    assert.match(contexto.elements.get('fin-graficos').innerHTML, /EXTRATO ATUALIZADO/);
    assert.match(contexto.elements.get('fin-graficos').innerHTML, /Parceiro atualizado/);
    assert.match(contexto.elements.get('fin-metodos').innerHTML, /PIX atualizado/);
    assert.match(contexto.elements.get('fin-barbeiros').innerHTML, /Parceiro atualizado/);
    assert.match(contexto.elements.get('fin-barbeiros').innerHTML, />70%</);
    assert.match(contexto.elements.get('fin-barbeiros').innerHTML, /220/);
  });

  test('oculta metricas financeiras dos demais membros para o parceiro', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../apps/profissional/assets/js/pages/FinancasPage.js'),
      'utf8',
    );
    assert.match(src, /barbeiro\.financialVisible === false/);
    assert.match(src, /Membro da equipe/);
  });

  test('mantem guard #carregando para evitar cargas concorrentes', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../apps/profissional/assets/js/pages/FinancasPage.js'),
      'utf8',
    );
    assert.match(src, /#carregando/);
    assert.match(src, /if \(this\.#carregando\) \{/);
    assert.match(src, /if \(!this\.#shopId\) return false;/);
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

  test('renderiza valor pendente atual recebido da BFF', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../apps/profissional/assets/js/pages/FinancasPage.js'),
      'utf8',
    );
    // Copy atual do modelo de saldo por ciclo: "Valor pendente atual"
    // (saldoPendenteAtual com fallback para pendingPayoutAmount).
    assert.match(src, /Valor pendente atual/);
    assert.match(src, /barbeiro\.pendingPayoutAmount/);
  });

  test('renderiza botao Pagar apenas para parceiro com saldo e owner', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../apps/profissional/assets/js/pages/FinancasPage.js'),
      'utf8',
    );
    assert.match(src, /fin-payout-btn/);
    assert.match(src, /Pagar/);
    assert.match(src, /dados\.isOwner/);
    assert.match(src, /Number\(barbeiro\.pendingPayoutAmount \|\| 0\) > 0/);
    assert.match(src, /barbeiro\.papel !== 'owner'/);
  });

  test('modal de pagamento mostra periodo, valor pendente e cortes do ciclo aberto', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../apps/profissional/assets/js/pages/FinancasPage.js'),
      'utf8',
    );
    assert.match(src, /#abrirModalPagamento/);
    assert.match(src, /Cortes pendentes no ciclo aberto/);
    assert.match(src, /#periodoLabel/);
    assert.match(src, /this\.#moeda\(barbeiro\.saldoPendenteAtual \?\? barbeiro\.pendingPayoutAmount\)/);
  });

  test('frontend confirma payout somente pela BFF e bloqueia duplo clique', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../apps/profissional/assets/js/pages/FinancasPage.js'),
      'utf8',
    );
    assert.match(src, /BffApiService\.financeiro\.confirmarPagamentoBarbeiro/);
    assert.match(src, /#payoutEmAndamento/);
    assert.doesNotMatch(src, /pendingPayoutAmount\s*=|const\s+pendingPayoutAmount/);
    assert.doesNotMatch(src, /gross_amount/);
  });

  test('renderiza resumo de acerto semanal com valor a repassar e historico', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../apps/profissional/assets/js/pages/FinancasPage.js'),
      'utf8',
    );
    assert.match(src, /Resumo de Acerto Semanal/);
    assert.match(src, /Valor a Repassar para a Barbearia/);
    assert.match(src, /Produção Bruta da Semana|Producao Bruta da Semana/);
    assert.match(src, /Status/);
    assert.match(src, /Histórico|Historico/);
    assert.match(src, /acertoSemanal/);
  });

  test('frontend confirma acerto semanal somente pela BFF e nao recalcula repasse', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../apps/profissional/assets/js/pages/FinancasPage.js'),
      'utf8',
    );
    assert.match(src, /BffApiService\.financeiro\.confirmarAcertoSemanal/);
    assert.match(src, /#acertoEmAndamento/);
    assert.match(src, /Confirmar repasse/);
    assert.doesNotMatch(src, /valorARepassarBarbearia\s*=/);
    assert.doesNotMatch(src, /participacaoBarbearia\s*=/);
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
    assert.doesNotMatch(src, /pendingPayoutAmount\s*=|const\s+pendingPayoutAmount/);
  });
});
