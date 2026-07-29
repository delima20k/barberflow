'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');

const ProfessionalVoucherService = require('../services/ProfessionalVoucherService');
const criarProfessionalVouchersRoute = require('../routes/professionalVouchers');

class VoucherIssuanceRepositoryStub {
  constructor({ remaining = 58, issuance = null } = {}) {
    this.remaining = remaining;
    this.issuance = issuance ?? {
      result_status: 'issued',
      voucher_code: 'ABC123',
      voucher_trial_days: 30,
      remaining_count: 57,
    };
    this.calls = [];
  }

  async countAvailable() {
    return this.remaining;
  }

  async issueAvailableVoucher(claim) {
    this.calls.push(claim);
    return this.issuance;
  }
}

describe('ProfessionalVoucherService emissao', () => {
  it('deve informar a quantidade real disponivel', async () => {
    const service = new ProfessionalVoucherService(
      new VoucherIssuanceRepositoryStub({ remaining: 58 }),
    );

    assert.deepEqual(await service.consultarDisponibilidade(), {
      ok: true,
      status: 'available',
      remaining: 58,
    });
  });

  it('deve emitir usando hash do email e sem persistir dados pessoais', async () => {
    const repository = new VoucherIssuanceRepositoryStub();
    const service = new ProfessionalVoucherService(repository);
    const result = await service.emitir({
      email: ' ANA@EXAMPLE.COM ',
      campaignConsent: true,
      company: '',
    });

    assert.deepEqual(result, {
      ok: true,
      status: 'issued',
      code: 'ABC123',
      trialDays: 30,
      remaining: 57,
    });
    assert.deepEqual(repository.calls, [{
      emailHash: crypto.createHash('sha256').update('ana@example.com').digest('hex'),
    }]);
  });

  it('deve bloquear um segundo voucher para o mesmo email', async () => {
    const service = new ProfessionalVoucherService(new VoucherIssuanceRepositoryStub({
      issuance: {
        result_status: 'duplicate_email',
        voucher_code: null,
        voucher_trial_days: null,
        remaining_count: 57,
      },
    }));

    const result = await service.emitir({
      email: 'ana@example.com',
      campaignConsent: true,
      company: '',
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 'duplicate_email');
    assert.match(result.message, /e-mail.*voucher/i);
  });

  it('deve exigir somente email valido e aceite explicito', async () => {
    const service = new ProfessionalVoucherService(new VoucherIssuanceRepositoryStub());

    await assert.rejects(
      service.emitir({ email: 'invalido', campaignConsent: true }),
      /e-mail valido/i,
    );
    await assert.rejects(
      service.emitir({ email: 'ana@example.com', campaignConsent: false }),
      /aceite as regras/i,
    );
  });
});

describe('Professional voucher issuance HTTP', () => {
  it('deve expor disponibilidade e emissao na rota publica de vouchers', async (context) => {
    const repository = new VoucherIssuanceRepositoryStub({ remaining: 58 });
    const app = express();
    app.use(express.json());
    app.use(
      '/api/v1/professional-vouchers',
      criarProfessionalVouchersRoute(null, {
        repository,
        voucherRateLimiter: (_req, _res, next) => next(),
      }),
    );

    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    context.after(() => new Promise((resolve) => server.close(resolve)));
    const endpoint = `http://127.0.0.1:${server.address().port}/api/v1/professional-vouchers`;

    const availabilityResponse = await fetch(`${endpoint}/availability`);
    const availability = await availabilityResponse.json();
    assert.equal(availabilityResponse.status, 200);
    assert.equal(availability.dados.remaining, 58);

    const issuanceResponse = await fetch(`${endpoint}/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'ana@example.com',
        campaignConsent: true,
        company: '',
      }),
    });
    const issuance = await issuanceResponse.json();
    assert.equal(issuanceResponse.status, 200);
    assert.equal(issuance.dados.code, 'ABC123');
  });
});
