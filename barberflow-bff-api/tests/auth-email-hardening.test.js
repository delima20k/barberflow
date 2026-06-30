'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const AuthBffService = require('../services/AuthBffService');

test('AuthBffService forgot-password retorna sucesso generico quando envio de email falha', async () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);

  try {
    const repo = {
      getPerfilByEmail: async () => ({ full_name: 'User Test' }),
      generatePasswordResetLink: async () => 'https://app.barberflow.live/reset?token=safe-test-token',
    };
    const emailService = {
      sendPasswordReset: async () => {
        throw new Error('Resend 503');
      },
    };

    const service = new AuthBffService(repo, emailService);
    const result = await service.solicitarRecuperacaoSenha({
      email: 'user@example.com',
      redirectTo: 'https://app.barberflow.live/',
    });

    const flattened = JSON.stringify(warnings);
    assert.deepEqual(result, { accepted: true });
    assert.match(flattened, /recuperacao de senha nao enviada/);
    assert.match(flattened, /u\*\*\*@example\.com/);
    assert.doesNotMatch(flattened, /user@example\.com/);
    assert.doesNotMatch(flattened, /safe-test-token/);
  } finally {
    console.warn = originalWarn;
  }
});
