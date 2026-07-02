'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  ProfessionalVoucherGeneratorConfig,
  ProfessionalVoucherCodeGenerator,
  ProfessionalVoucherCli,
} = require('../scripts/generate-professional-vouchers');

test('ProfessionalVoucherGeneratorConfig valida argumentos e ambiente', () => {
  const config = new ProfessionalVoucherGeneratorConfig(
    ['--count=2', '--trial-days=30', '--expires-at=2026-12-31T23:59:59Z'],
    {
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    },
  );

  assert.doesNotThrow(() => config.validar());
  assert.equal(config.count, 2);
  assert.equal(config.trialDays, 30);
  assert.equal(config.expiresAt, '2026-12-31T23:59:59Z');
});

test('ProfessionalVoucherGeneratorConfig bloqueia ambiente ausente', () => {
  const config = new ProfessionalVoucherGeneratorConfig(['--count=1'], {});

  assert.throws(
    () => config.validar(),
    /Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY/,
  );
});

test('ProfessionalVoucherCodeGenerator gera codigo alfanumerico de 6 chars', () => {
  const code = new ProfessionalVoucherCodeGenerator().next();

  assert.match(code, /^[A-Z0-9]{6}$/);
});

test('ProfessionalVoucherCli cria vouchers e ignora colisao unica', async () => {
  const inserted = [];
  const generator = {
    codes: ['ABC123', 'ABC123', 'DEF456'],
    next() {
      return this.codes.shift();
    },
  };
  const db = {
    from(table) {
      assert.equal(table, 'professional_trial_vouchers');
      return {
        insert(payload) {
          if (payload.code === 'ABC123' && inserted.includes('ABC123')) {
            return {
              select: () => ({
                single: async () => ({ data: null, error: { code: '23505' } }),
              }),
            };
          }
          inserted.push(payload.code);
          return {
            select: () => ({
              single: async () => ({ data: { code: payload.code }, error: null }),
            }),
          };
        },
      };
    },
  };
  const config = {
    count: 2,
    trialDays: 30,
    expiresAt: null,
  };

  await new ProfessionalVoucherCli(config, db, generator).run();

  assert.deepEqual(inserted, ['ABC123', 'DEF456']);
});
