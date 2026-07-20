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
  static createContext() {
    const context = vm.createContext({
      console,
      document: {},
    });
    const source = readFileSync(
      join(LANDING_ROOT, 'js', 'voucher-service.js'),
      'utf8',
    );
    vm.runInContext(source, context);
    return context;
  }
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
});
