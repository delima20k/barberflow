'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const ProfessionalVoucherService = require('../services/ProfessionalVoucherService');

class FakeVoucherRepo {
  constructor(voucher = null) {
    this.voucher = voucher;
    this.codes = [];
  }

  async getByCode(code) {
    this.codes.push(code);
    return this.voucher;
  }
}

test('valida voucher ativo e disponivel sem consumir', async () => {
  const repo = new FakeVoucherRepo({
    code: 'ABC123',
    trial_days: 30,
    is_active: true,
    used_at: null,
    used_by: null,
    expires_at: null,
  });
  const service = new ProfessionalVoucherService(repo);

  const result = await service.validar({ code: ' abc123 ' });

  assert.equal(result.ok, true);
  assert.equal(result.valid, true);
  assert.equal(result.code, 'ABC123');
  assert.equal(result.trialDays, 30);
  assert.deepEqual(repo.codes, ['ABC123']);
});

test('retorna not_found quando voucher nao existe', async () => {
  const service = new ProfessionalVoucherService(new FakeVoucherRepo(null));

  const result = await service.validar({ code: 'ABC123' });

  assert.equal(result.ok, false);
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'not_found');
  assert.equal(result.message, 'Esse voucher nao existe.');
});

test('retorna already_used quando voucher ja foi aplicado', async () => {
  const service = new ProfessionalVoucherService(new FakeVoucherRepo({
    code: 'ABC123',
    trial_days: 30,
    is_active: true,
    used_at: '2026-07-02T12:00:00.000Z',
    used_by: '11111111-1111-4111-8111-111111111111',
    expires_at: null,
  }));

  const result = await service.validar({ code: 'ABC123' });

  assert.equal(result.reason, 'already_used');
  assert.equal(result.message, 'Esse voucher ja foi aplicado.');
});

test('retorna invalid para formato, inativo ou expirado', async () => {
  const formato = await new ProfessionalVoucherService(new FakeVoucherRepo()).validar({ code: '123' });
  assert.equal(formato.reason, 'invalid');

  const inativo = await new ProfessionalVoucherService(new FakeVoucherRepo({
    code: 'ABC123',
    trial_days: 30,
    is_active: false,
    used_at: null,
    used_by: null,
    expires_at: null,
  })).validar({ code: 'ABC123' });
  assert.equal(inativo.reason, 'invalid');

  const expirado = await new ProfessionalVoucherService(new FakeVoucherRepo({
    code: 'ABC123',
    trial_days: 30,
    is_active: true,
    used_at: null,
    used_by: null,
    expires_at: '2020-01-01T00:00:00.000Z',
  })).validar({ code: 'ABC123' });
  assert.equal(expirado.reason, 'invalid');
});
