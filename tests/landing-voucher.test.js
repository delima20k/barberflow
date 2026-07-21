'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const ROOT = join(__dirname, '..');
const LANDING_ROOT = join(ROOT, 'apps', 'landing-page');

class VoucherAdapterStub {
  constructor() {
    this.calls = [];
  }

  async checkAvailability() {
    this.calls.push({ method: 'checkAvailability' });
    return { ok: true, status: 'available', remaining: 7 };
  }

  async generateVoucher(data) {
    this.calls.push({ method: 'generateVoucher', data });
    return { ok: true, status: 'issued', code: 'SERVER1' };
  }

  async validateVoucher(code) {
    this.calls.push({ method: 'validateVoucher', code });
    return { ok: true, status: 'issued', valid: true };
  }
}

class VoucherServiceFixture {
  static createContext(fetchImpl = null) {
    const context = vm.createContext({
      console,
      document: {},
      fetch: fetchImpl,
      AbortSignal,
    });
    const source = readFileSync(
      join(LANDING_ROOT, 'js', 'voucher-service.js'),
      'utf8',
    );
    vm.runInContext(source, context);
    return context;
  }
}

function createElement(overrides = {}) {
  return {
    hidden: false,
    disabled: false,
    textContent: '',
    dataset: {},
    attributes: new Map(),
    addEventListener() {},
    removeEventListener() {},
    setAttribute(name, value) { this.attributes.set(name, String(value)); },
    getAttribute(name) { return this.attributes.get(name) ?? null; },
    focus() { this.focused = true; },
    ...overrides,
  };
}

function createVoucherModalFixture(service) {
  const elements = {
    form: createElement({
      checkValidity: () => true,
      reportValidity() {},
    }),
    formView: createElement(),
    successView: createElement({ hidden: true }),
    availability: createElement(),
    availabilityNote: createElement(),
    error: createElement({ hidden: true }),
    loading: createElement({ hidden: true }),
    submitButton: createElement(),
    copyButton: createElement(),
    copyStatus: createElement(),
    code: createElement(),
    successTitle: createElement(),
    appLink: createElement({ href: 'https://pro.barberflow.live/' }),
  };
  const selectors = new Map([
    ['[data-voucher-form]', elements.form],
    ['[data-voucher-form-view]', elements.formView],
    ['[data-voucher-success]', elements.successView],
    ['[data-voucher-availability]', elements.availability],
    ['[data-voucher-mode]', elements.availabilityNote],
    ['[data-voucher-error]', elements.error],
    ['[data-voucher-loading]', elements.loading],
    ['[data-voucher-submit]', elements.submitButton],
    ['[data-copy-voucher]', elements.copyButton],
    ['[data-copy-status]', elements.copyStatus],
    ['[data-voucher-code]', elements.code],
    ['[data-voucher-success-title]', elements.successTitle],
    ['[data-voucher-app-link]', elements.appLink],
  ]);
  const modal = createElement({
    querySelector: (selector) => selectors.get(selector) ?? null,
    querySelectorAll: () => [],
  });
  const root = {
    body: { classList: { add() {}, remove() {} } },
    querySelector: (selector) => (selector === '[data-voucher-modal]' ? modal : null),
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {},
  };
  const copied = [];
  const context = VoucherServiceFixture.createContext(null);
  context.FormData = function FormDataFixture() {
    this.get = (name) => ({
      name: 'Ana Silva',
      email: 'ana@example.com',
      phone: '11999999999',
      campaignConsent: 'on',
      company: '',
    })[name] ?? null;
  };
  vm.runInContext(
    readFileSync(join(LANDING_ROOT, 'js', 'voucher-modal.js'), 'utf8'),
    context,
  );
  const voucherModal = new context.VoucherModal(root, service, {
    clipboard: { writeText: async (value) => copied.push(value) },
  });
  return { voucherModal, elements, copied };
}

describe('VoucherService', () => {
  it('deve manter disponibilidade e geracao indisponiveis no modo de desenvolvimento', async () => {
    const { VoucherService } = VoucherServiceFixture.createContext();
    const service = new VoucherService({ enabled: false });

    const availability = await service.checkAvailability();
    const generation = await service.generateVoucher({
      name: 'Ana',
      email: 'ana@example.com',
      phone: '11999999999',
    });

    assert.deepEqual(
      JSON.parse(JSON.stringify({ availability, generation })),
      {
        availability: {
          ok: false,
          status: 'unavailable',
          remaining: null,
          mode: 'development',
          message: 'A campanha ainda não está conectada a uma API segura.',
        },
        generation: {
          ok: false,
          status: 'unavailable',
          remaining: null,
          mode: 'development',
          message: 'A campanha ainda não está conectada a uma API segura.',
        },
      },
    );
  });

  it('deve delegar disponibilidade, geracao e validacao ao adapter injetado', async () => {
    const { VoucherService } = VoucherServiceFixture.createContext();
    const adapter = new VoucherAdapterStub();
    const service = new VoucherService({ enabled: true, adapter });
    const data = {
      name: 'João Silva',
      email: 'joao@example.com',
      phone: '11988887777',
    };

    const availability = await service.checkAvailability();
    const generation = await service.generateVoucher(data);
    const validation = await service.validateVoucher('SERVER1');

    assert.deepEqual(
      JSON.parse(JSON.stringify({ availability, generation, validation })),
      {
        availability: { ok: true, status: 'available', remaining: 7 },
        generation: { ok: true, status: 'issued', code: 'SERVER1' },
        validation: { ok: true, status: 'issued', valid: true },
      },
    );
    assert.deepEqual(adapter.calls, [
      { method: 'checkAvailability' },
      { method: 'generateVoucher', data },
      { method: 'validateVoucher', code: 'SERVER1' },
    ]);
  });

  it('deve rejeitar campanha ativa sem adapter seguro', async () => {
    const { VoucherService } = VoucherServiceFixture.createContext();
    const service = new VoucherService({ enabled: true });

    await assert.rejects(
      service.generateVoucher({}),
      /adapter seguro de vouchers não foi configurado/i,
    );
  });

  it('deve emitir pela API usando somente os campos permitidos', async () => {
    const calls = [];
    let fetchReceiver;
    const fetchImpl = async function fetchVoucher(url, options = {}) {
      fetchReceiver = this;
      calls.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          ok: true,
          dados: options.method === 'POST'
            ? { ok: true, status: 'issued', code: 'ABC123', remaining: 57 }
            : { ok: true, status: 'available', remaining: 58 },
        }),
      };
    };
    const { VoucherApiAdapter } = VoucherServiceFixture.createContext(fetchImpl);
    const adapter = new VoucherApiAdapter(
      'https://bff.barberflow.live/api/v1/professional-vouchers',
      { fetchImpl },
    );

    const availability = await adapter.checkAvailability();
    const issuance = await adapter.generateVoucher({
      name: 'Ana',
      email: 'ana@example.com',
      phone: '11999999999',
      campaignConsent: true,
      company: '',
      injectedCode: 'NAO-ENVIAR',
    });

    assert.equal(availability.remaining, 58);
    assert.equal(issuance.code, 'ABC123');
    assert.equal(fetchReceiver, undefined);
    assert.equal(calls[0].url, 'https://bff.barberflow.live/api/v1/professional-vouchers/availability');
    assert.equal(calls[1].url, 'https://bff.barberflow.live/api/v1/professional-vouchers/issue');
    assert.deepEqual(JSON.parse(calls[1].options.body), {
      name: 'Ana',
      email: 'ana@example.com',
      phone: '11999999999',
      campaignConsent: true,
      company: '',
    });
  });

  it('deve exibir e copiar na modal somente o voucher retornado pelo servidor', async () => {
    const calls = [];
    const service = {
      async generateVoucher(data) {
        calls.push(data);
        return { ok: true, status: 'issued', code: 'ABC123', remaining: 57 };
      },
    };
    const { voucherModal, elements, copied } = createVoucherModalFixture(service);

    await voucherModal.handleSubmit({ preventDefault() {} });

    assert.equal(elements.formView.hidden, true);
    assert.equal(elements.successView.hidden, false);
    assert.equal(elements.code.textContent, 'ABC123');
    assert.equal(elements.appLink.href, 'https://pro.barberflow.live/');
    assert.equal(elements.availability.textContent, '57 vouchers restantes');
    assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{
      name: 'Ana Silva',
      email: 'ana@example.com',
      phone: '11999999999',
      campaignConsent: true,
      company: '',
    }]);

    await voucherModal.handleCopy();

    assert.deepEqual(copied, ['ABC123']);
    assert.equal(elements.copyStatus.textContent, 'Código copiado.');
  });
});
