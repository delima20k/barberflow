'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const SOURCE = fs.readFileSync(
  path.join(__dirname, '..', 'shared', 'js', 'PaymentFlowHandler.js'),
  'utf8',
);

function createDocumentMock() {
  const body = {
    appended: [],
    appendChild(el) {
      this.appended.push(el);
    },
  };
  return {
    referrer: '',
    body,
    getElementById() {
      return null;
    },
    createElement(tag) {
      return {
        tagName: tag.toUpperCase(),
        className: '',
        textContent: '',
        classList: {
          add() {},
          remove() {},
        },
      };
    },
  };
}

function loadPaymentFlowHandler({
  twa = false,
  getDigitalGoodsService,
  bffResponse = {
    data: {
      id: 'pay-row-1',
      asaasPaymentId: 'pay_123',
      invoiceUrl: 'https://www.asaas.com/i/pay_123',
      reused: false,
    },
    error: null,
  },
} = {}) {
  const assignedUrls = [];
  const bffCalls = [];
  const warnings = [];
  const storage = new Map();
  const document = createDocumentMock();
  const context = {
    console: {
      warn: (...args) => warnings.push(args),
    },
    document,
    window: {
      location: {
        href: 'https://pro.barberflow.live/',
        assign: (url) => assignedUrls.push(url),
      },
      history: { replaceState() {} },
      getDigitalGoodsService: twa ? getDigitalGoodsService : undefined,
    },
    location: {
      href: 'https://pro.barberflow.live/',
    },
    sessionStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key),
    },
    setTimeout: (fn) => {
      if (typeof fn === 'function') fn();
      return 1;
    },
    clearTimeout() {},
    DOMException,
    SupabaseService: {
      getSession: async () => ({ access_token: 'session-token' }),
      getUser: async () => ({ id: 'user-1' }),
    },
    ProfessionalDocumentGuard: {
      ensure: async () => true,
    },
    BffApiService: {
      pagamentosProfissional: {
        criarCobranca: async (payload) => {
          bffCalls.push(payload);
          return bffResponse;
        },
      },
    },
  };

  vm.createContext(context);
  vm.runInContext(`${SOURCE}\nglobalThis.PaymentFlowHandler = PaymentFlowHandler;`, context);
  return {
    PaymentFlowHandler: context.PaymentFlowHandler,
    assignedUrls,
    bffCalls,
    warnings,
    document,
    storage,
  };
}

test('PaymentFlowHandler redireciona browser normal para invoiceUrl', async () => {
  const { PaymentFlowHandler, assignedUrls, bffCalls } = loadPaymentFlowHandler();
  const errors = [];

  await PaymentFlowHandler.iniciarFluxo('mensal', () => {}, err => errors.push(err), {
    tipo: 'barbeiro',
  });

  assert.deepEqual(errors, []);
  assert.equal(bffCalls.length, 1);
  assert.equal(bffCalls[0].billingType, 'UNDEFINED');
  assert.deepEqual(assignedUrls, ['https://www.asaas.com/i/pay_123']);
});

test('PaymentFlowHandler faz fallback para checkout Asaas quando TWA falha por unsupported context', async () => {
  const { PaymentFlowHandler, assignedUrls, bffCalls, warnings } = loadPaymentFlowHandler({
    twa: true,
    getDigitalGoodsService: async () => {
      throw new DOMException('unsupported context', 'OperationError');
    },
    bffResponse: {
      data: {
        id: 'pay-row-1',
        asaasPaymentId: 'pay_reused',
        invoiceUrl: 'https://www.asaas.com/i/pay_reused',
        reused: true,
      },
      error: null,
    },
  });
  const errors = [];

  await PaymentFlowHandler.iniciarFluxo('mensal', () => {}, err => errors.push(err), {
    tipo: 'barbeiro',
  });

  assert.deepEqual(errors, []);
  assert.equal(bffCalls.length, 1);
  assert.equal(bffCalls[0].planType, 'mensal');
  assert.deepEqual(assignedUrls, ['https://www.asaas.com/i/pay_reused']);
  assert.ok(
    warnings.some(args => String(args[0]).includes('TWA billing indisponivel')),
    'deve logar fallback seguro sem expor URL completa',
  );
});

test('PaymentFlowHandler mostra erro claro quando BFF nao retorna invoiceUrl', async () => {
  const { PaymentFlowHandler, assignedUrls } = loadPaymentFlowHandler({
    bffResponse: {
      data: { id: 'pay-row-1', reused: true },
      error: null,
    },
  });
  const errors = [];

  await PaymentFlowHandler.iniciarFluxo('mensal', () => {}, err => errors.push(err), {
    tipo: 'barbeiro',
  });

  assert.deepEqual(assignedUrls, []);
  assert.deepEqual(errors, [
    'Cobranca criada sem link de pagamento. Tente novamente ou fale com suporte.',
  ]);
});
