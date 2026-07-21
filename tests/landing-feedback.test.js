'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const ROOT = join(__dirname, '..');
const SERVICE_PATH = join(
  ROOT,
  'apps',
  'landing-page',
  'js',
  'feedback-service.js',
);

class FeedbackAdapterStub {
  constructor() {
    this.calls = [];
  }

  async submit(payload) {
    this.calls.push(payload);
    return { ok: true, status: 'accepted' };
  }
}

function createServiceContext() {
  const context = vm.createContext({ console, AbortSignal });
  vm.runInContext(readFileSync(SERVICE_PATH, 'utf8'), context);
  return context;
}

describe('FeedbackService', () => {
  it('deve manter o envio indisponivel sem integracao segura', async () => {
    const { FeedbackService } = createServiceContext();
    const service = new FeedbackService({ enabled: false });

    const result = await service.submit({
      name: 'Ana',
      email: 'ana@example.com',
      type: 'Sugestão',
      subject: 'Fila',
      message: 'Uma ideia para a fila.',
      privacyConsent: true,
    });

    assert.deepEqual(JSON.parse(JSON.stringify(result)), {
      ok: false,
      status: 'unavailable',
      mode: 'development',
      message: 'O envio seguro de sugestões ainda não está disponível.',
    });
  });

  it('deve validar e normalizar os dados antes de delegar ao adapter', async () => {
    const { FeedbackService } = createServiceContext();
    const adapter = new FeedbackAdapterStub();
    const service = new FeedbackService({ enabled: true, adapter });

    const result = await service.submit({
      name: '  João\u0000 Silva  ',
      email: '  JOAO@EXAMPLE.COM ',
      type: 'Melhoria',
      subject: '  Painel financeiro  ',
      message: '  Mostrar o resumo semanal.\u0007  ',
      privacyConsent: true,
    });

    assert.deepEqual(JSON.parse(JSON.stringify(result)), {
      ok: true,
      status: 'accepted',
    });
    assert.deepEqual(JSON.parse(JSON.stringify(adapter.calls)), [{
      name: 'João Silva',
      email: 'joao@example.com',
      type: 'Melhoria',
      subject: 'Painel financeiro',
      message: 'Mostrar o resumo semanal.',
      privacyConsent: true,
    }]);
  });

  it('deve rejeitar tipo desconhecido, consentimento ausente e adapter inseguro', async () => {
    const { FeedbackService } = createServiceContext();
    const adapter = new FeedbackAdapterStub();
    const service = new FeedbackService({ enabled: true, adapter });

    await assert.rejects(
      service.submit({
        name: 'Ana',
        email: 'ana@example.com',
        type: 'Spam',
        subject: 'Teste',
        message: 'Mensagem de teste válida.',
        privacyConsent: true,
      }),
      /tipo da mensagem/i,
    );

    await assert.rejects(
      service.submit({
        name: 'Ana',
        email: 'ana@example.com',
        type: 'Dúvida',
        subject: 'Teste',
        message: 'Mensagem de teste válida.',
        privacyConsent: false,
      }),
      /política de privacidade/i,
    );

    const serviceWithoutAdapter = new FeedbackService({ enabled: true });
    await assert.rejects(
      serviceWithoutAdapter.submit({
        name: 'Ana',
        email: 'ana@example.com',
        type: 'Dúvida',
        subject: 'Teste',
        message: 'Mensagem de teste válida.',
        privacyConsent: true,
      }),
      /adapter seguro de feedback/i,
    );
  });
});

describe('FeedbackApiAdapter', () => {
  it('deve enviar somente o payload permitido para o endpoint do BFF', async () => {
    const { FeedbackApiAdapter } = createServiceContext();
    let request;
    const adapter = new FeedbackApiAdapter(
      'https://bff.barberflow.live/api/v1/landing/feedback',
      {
        fetchImpl: async (url, options) => {
          request = { url, options, body: JSON.parse(options.body) };
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true, dados: { accepted: true } }),
          };
        },
      },
    );

    const result = await adapter.submit({
      name: 'Ana',
      email: 'ana@example.com',
      type: 'Sugestão',
      subject: 'Fila',
      message: 'Uma ideia para a fila.',
      privacyConsent: true,
      to: 'attacker@example.com',
    });

    assert.deepEqual(JSON.parse(JSON.stringify(result)), {
      ok: true,
      status: 'accepted',
    });
    assert.equal(request.url, 'https://bff.barberflow.live/api/v1/landing/feedback');
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.credentials, 'omit');
    assert.deepEqual(request.body, {
      name: 'Ana',
      email: 'ana@example.com',
      type: 'Sugestão',
      subject: 'Fila',
      message: 'Uma ideia para a fila.',
      privacyConsent: true,
    });
    assert.equal(Object.hasOwn(request.body, 'to'), false);
  });

  it('deve retornar falha controlada quando o BFF rejeitar o envio', async () => {
    const { FeedbackApiAdapter } = createServiceContext();
    const adapter = new FeedbackApiAdapter(
      'https://bff.barberflow.live/api/v1/landing/feedback',
      {
        fetchImpl: async () => ({
          ok: false,
          status: 429,
          json: async () => ({ ok: false, error: 'Muitas requisições.' }),
        }),
      },
    );

    const result = await adapter.submit({ name: 'Ana' });

    assert.deepEqual(JSON.parse(JSON.stringify(result)), {
      ok: false,
      status: 'error',
      message: 'Muitas requisições.',
    });
  });
});
