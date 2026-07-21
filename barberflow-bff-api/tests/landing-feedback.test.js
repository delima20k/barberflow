'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const express = require('express');

const { LandingFeedbackDto } = require('../application/landing/dto/LandingFeedbackDto');
const { SubmitLandingFeedbackUseCase } = require('../application/landing/use-cases/SubmitLandingFeedbackUseCase');
const { LandingRouteFactory } = require('../routes/landing');

class LandingFeedbackEmailStub {
  constructor(result = { ok: true, providerId: 'email_1' }) {
    this.result = result;
    this.calls = [];
  }

  async sendLandingFeedback(to, feedback) {
    this.calls.push({ to, feedback });
    return this.result;
  }
}

class FixedClock {
  now() {
    return new Date('2026-07-21T12:00:00.000Z');
  }
}

class LandingFeedbackHttpFixture {
  constructor(emailService) {
    this.emailService = emailService;
    this.server = null;
  }

  async start() {
    const app = express();
    app.use(express.json({ limit: '50kb' }));
    app.use('/api/v1/landing', LandingRouteFactory.create({
      emailService: this.emailService,
      feedbackRateLimiter: LandingFeedbackHttpFixture.passThrough,
    }));
    this.server = await new Promise((resolve) => {
      const server = app.listen(0, '127.0.0.1', () => resolve(server));
    });
    return this;
  }

  async post(payload) {
    const response = await fetch(
      `http://127.0.0.1:${this.server.address().port}/api/v1/landing/feedback`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    return { status: response.status, body: await response.json() };
  }

  async stop() {
    if (!this.server) return;
    await new Promise((resolve, reject) => {
      this.server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  static passThrough(_req, _res, next) {
    next();
  }
}

describe('LandingFeedbackDto', () => {
  it('deve normalizar a allowlist e rejeitar campos controlados pelo cliente', () => {
    const dto = LandingFeedbackDto.from({
      name: '  Ana\u0000 Silva ',
      email: ' ANA@EXAMPLE.COM ',
      type: 'Sugestão',
      subject: '  Organização da fila ',
      message: '  Uma sugestão segura para a fila.\u0007 ',
      privacyConsent: true,
      to: 'attacker@example.com',
      destination: 'attacker@example.com',
    });

    assert.deepEqual(dto.toJSON(), {
      name: 'Ana Silva',
      email: 'ana@example.com',
      type: 'Sugestão',
      subject: 'Organização da fila',
      message: 'Uma sugestão segura para a fila.',
      privacyConsent: true,
      company: '',
    });
  });

  it('deve rejeitar email, tipo, mensagem e consentimento invalidos', () => {
    assert.throws(() => LandingFeedbackDto.from({
      name: 'Ana',
      email: 'invalido',
      type: 'Spam',
      subject: 'Oi',
      message: 'curta',
      privacyConsent: false,
    }), /e-mail|email/i);
  });
});

describe('SubmitLandingFeedbackUseCase', () => {
  it('deve enviar para contato@barberflow.live com metadados do servidor', async () => {
    const emailService = new LandingFeedbackEmailStub();
    const useCase = new SubmitLandingFeedbackUseCase(emailService, {
      clock: new FixedClock(),
    });

    const result = await useCase.execute({
      name: 'Ana',
      email: 'ana@example.com',
      type: 'Melhoria',
      subject: 'Painel',
      message: 'Mostrar um resumo mais direto.',
      privacyConsent: true,
      to: 'attacker@example.com',
    });

    assert.deepEqual(result, { accepted: true });
    assert.equal(emailService.calls.length, 1);
    assert.deepEqual(emailService.calls[0], {
      to: 'contato@barberflow.live',
      feedback: {
        name: 'Ana',
        email: 'ana@example.com',
        type: 'Melhoria',
        subject: 'Painel',
        message: 'Mostrar um resumo mais direto.',
        privacyConsent: true,
        submittedAt: '2026-07-21T12:00:00.000Z',
        origin: 'Landing Page BarberFlow',
      },
    });
  });

  it('deve absorver honeypot sem enviar email', async () => {
    const emailService = new LandingFeedbackEmailStub();
    const useCase = new SubmitLandingFeedbackUseCase(emailService, {
      clock: new FixedClock(),
    });

    const result = await useCase.execute({
      name: 'Bot',
      email: 'bot@example.com',
      type: 'Outro',
      subject: 'Mensagem automatizada',
      message: 'Mensagem automatizada para teste.',
      privacyConsent: true,
      company: 'Spam Corp',
    });

    assert.deepEqual(result, { accepted: true });
    assert.equal(emailService.calls.length, 0);
  });

  it('deve retornar indisponibilidade quando o provedor falhar', async () => {
    const emailService = new LandingFeedbackEmailStub({ ok: false, error: 'provider down' });
    const useCase = new SubmitLandingFeedbackUseCase(emailService, {
      clock: new FixedClock(),
    });

    await assert.rejects(
      useCase.execute({
        name: 'Ana',
        email: 'ana@example.com',
        type: 'Dúvida',
        subject: 'Cadastro',
        message: 'Preciso de ajuda com o cadastro.',
        privacyConsent: true,
      }),
      (error) => error.status === 503,
    );
  });
});

describe('POST /api/v1/landing/feedback', () => {
  it('deve estar montado no app com CORS oficial e rate limit dedicado', () => {
    const root = join(__dirname, '..');
    const appSource = readFileSync(join(root, 'app.js'), 'utf8');
    const productionConfig = readFileSync(
      join(root, 'config', 'environments', 'production.js'),
      'utf8',
    );
    const rateLimiter = readFileSync(
      join(root, 'middlewares', 'rateLimiter.js'),
      'utf8',
    );

    assert.match(appSource, /v1Router\.use\('\/landing',\s*LandingRouteFactory\.create\(\)\)/);
    assert.match(productionConfig, /'https:\/\/barberflow\.live'/);
    assert.match(rateLimiter, /static landingFeedback = rateLimit\(\{/);
    assert.match(rateLimiter, /landing-feedback:/);
  });

  it('deve expor o envio publico sem aceitar destinatario do cliente', async () => {
    const emailService = new LandingFeedbackEmailStub();
    const fixture = await new LandingFeedbackHttpFixture(emailService).start();

    try {
      const response = await fixture.post({
        name: 'Ana',
        email: 'ana@example.com',
        type: 'Sugestão',
        subject: 'Fila',
        message: 'Uma sugestão para organizar a fila.',
        privacyConsent: true,
        to: 'attacker@example.com',
      });

      assert.equal(response.status, 200);
      assert.deepEqual(response.body, { ok: true, dados: { accepted: true } });
      assert.equal(emailService.calls[0].to, 'contato@barberflow.live');
    } finally {
      await fixture.stop();
    }
  });

  it('deve rejeitar payload invalido antes de chamar o provedor', async () => {
    const emailService = new LandingFeedbackEmailStub();
    const fixture = await new LandingFeedbackHttpFixture(emailService).start();

    try {
      const response = await fixture.post({
        name: 'A',
        email: 'invalido',
        type: 'Spam',
        subject: '',
        message: 'curta',
        privacyConsent: false,
      });

      assert.equal(response.status, 400);
      assert.equal(response.body.ok, false);
      assert.equal(emailService.calls.length, 0);
    } finally {
      await fixture.stop();
    }
  });
});
