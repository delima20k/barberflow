'use strict';

const { describe, it } = require('node:test');
const assert           = require('node:assert/strict');
const {
  NewAccountHighActivityRule,
  GeoVelocityRule,
  ContentSimilarityRule,
  BotSignatureRule,
  AndSpecification,
  OrSpecification,
  NotSpecification,
} = require('../../../middlewares/abuse/Specification');

// ── NewAccountHighActivityRule ───────────────────────────────────────────────
describe('NewAccountHighActivityRule', () => {
  const rule = new NewAccountHighActivityRule({ accountMaxAgeMs: 60_000, maxRequests: 5 });

  it('dispara para conta nova com alta atividade', async () => {
    assert.ok(await rule.isSatisfiedBy({ accountAgeMs: 30_000, requestCount: 6 }));
  });

  it('não dispara para conta nova com atividade normal', async () => {
    assert.equal(await rule.isSatisfiedBy({ accountAgeMs: 30_000, requestCount: 4 }), false);
  });

  it('não dispara para conta estabelecida com alta atividade', async () => {
    assert.equal(await rule.isSatisfiedBy({ accountAgeMs: 120_000, requestCount: 100 }), false);
  });

  it('não dispara com contexto incompleto', async () => {
    assert.equal(await rule.isSatisfiedBy({}), false);
  });
});

// ── GeoVelocityRule ──────────────────────────────────────────────────────────
describe('GeoVelocityRule', () => {
  // São Paulo → Nova York em 1 minuto (impossível)
  const SP = { lat: -23.55, lng: -46.63, ts: 1_000_000 };
  const NY = { lat: 40.71,  lng: -74.00, ts: 1_060_000 }; // +1 min

  // SP → RJ em 4 horas (viagem de avião lenta, < 900 km/h)
  const RJ = { lat: -22.90, lng: -43.17, ts: 1_000_000 + 4 * 3_600_000 };

  const rule = new GeoVelocityRule({ maxSpeedKmh: 900 });

  it('dispara para salto geográfico impossível (SP→NY em 1 min)', async () => {
    assert.ok(await rule.isSatisfiedBy({ lastLocations: [SP, NY] }));
  });

  it('não dispara para deslocamento razoável (SP→RJ em 4h)', async () => {
    assert.equal(await rule.isSatisfiedBy({ lastLocations: [SP, RJ] }), false);
  });

  it('não dispara com menos de 2 localizações', async () => {
    assert.equal(await rule.isSatisfiedBy({ lastLocations: [SP] }), false);
  });

  it('não dispara com array vazio', async () => {
    assert.equal(await rule.isSatisfiedBy({ lastLocations: [] }), false);
  });

  it('não dispara com contexto sem lastLocations', async () => {
    assert.equal(await rule.isSatisfiedBy({}), false);
  });
});

// ── ContentSimilarityRule ────────────────────────────────────────────────────
describe('ContentSimilarityRule', () => {
  const rule = new ContentSimilarityRule({ threshold: 0.8, maxHistory: 3 });

  it('dispara para conteúdo idêntico repetido', async () => {
    const ctx = {
      contentHistory: ['compre agora baratos produtos', 'compre agora baratos produtos'],
      currentContent: 'compre agora baratos produtos',
    };
    assert.ok(await rule.isSatisfiedBy(ctx));
  });

  it('não dispara para conteúdo diferente', async () => {
    const ctx = {
      contentHistory: ['oi tudo bem', 'como vai você'],
      currentContent: 'qual o horário de funcionamento',
    };
    assert.equal(await rule.isSatisfiedBy(ctx), false);
  });

  it('não dispara sem histórico', async () => {
    assert.equal(await rule.isSatisfiedBy({ contentHistory: [], currentContent: 'msg' }), false);
  });

  it('não dispara sem currentContent', async () => {
    assert.equal(await rule.isSatisfiedBy({ contentHistory: ['oi'], currentContent: null }), false);
  });

  it('usa apenas os últimos maxHistory=3 itens', async () => {
    // 4 msgs antigas diferentes + 1 igual à atual: a mais antiga deve ser ignorada
    const ctx = {
      contentHistory: ['igual igual igual igual', 'a', 'b', 'c'],
      currentContent: 'igual igual igual igual',
    };
    // Com maxHistory=3, compara apenas ['a','b','c'] — nenhum é similar
    assert.equal(await rule.isSatisfiedBy(ctx), false);
  });
});

// ── BotSignatureRule ─────────────────────────────────────────────────────────
describe('BotSignatureRule', () => {
  const rule = new BotSignatureRule({ minIntervalMs: 100, regularityThreshold: 0.95 });

  it('dispara para User-Agent de bot conhecido (python-requests)', async () => {
    assert.ok(await rule.isSatisfiedBy({ userAgent: 'python-requests/2.28.0' }));
  });

  it('dispara para User-Agent de headless browser', async () => {
    assert.ok(await rule.isSatisfiedBy({ userAgent: 'HeadlessChrome/100.0' }));
  });

  it('não dispara para User-Agent de browser legítimo', async () => {
    assert.equal(
      await rule.isSatisfiedBy({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0)' }),
      false,
    );
  });

  it('dispara para timing ultra-regular (bot de requisições)', async () => {
    // 10 requisições exatamente a cada 200ms (regularidade > 0.95)
    const ts = Array.from({ length: 10 }, (_, i) => i * 200);
    assert.ok(await rule.isSatisfiedBy({ userAgent: 'Mozilla/5.0', requestTimestamps: ts }));
  });

  it('não dispara para timing humano variável', async () => {
    // Intervalos variados: 150, 340, 210, 670, 430ms (humano) — todos > minIntervalMs=100
    // coef. de variação ≈ 0.51 >> 0.05 (threshold) → NÃO deve disparar
    const ts = [0, 150, 490, 700, 1370, 1800];
    assert.equal(await rule.isSatisfiedBy({ userAgent: 'Mozilla/5.0', requestTimestamps: ts }), false);
  });

  it('não dispara com UA ausente e sem timestamps suficientes', async () => {
    assert.equal(await rule.isSatisfiedBy({ userAgent: null, requestTimestamps: [0, 100] }), false);
  });
});

// ── Composição de Specifications ─────────────────────────────────────────────
describe('Specification composição (and/or/not)', () => {
  const always = { isSatisfiedBy: async () => true };
  const never  = { isSatisfiedBy: async () => false };

  it('AndSpecification retorna true somente se ambos são true', async () => {
    const and = new AndSpecification(always, always);
    assert.ok(await and.isSatisfiedBy({}));
    const andF = new AndSpecification(always, never);
    assert.equal(await andF.isSatisfiedBy({}), false);
  });

  it('OrSpecification retorna true se pelo menos um é true', async () => {
    const or = new OrSpecification(never, always);
    assert.ok(await or.isSatisfiedBy({}));
    const orF = new OrSpecification(never, never);
    assert.equal(await orF.isSatisfiedBy({}), false);
  });

  it('NotSpecification inverte o resultado', async () => {
    const notAlways = new NotSpecification(always);
    const notNever  = new NotSpecification(never);
    assert.equal(await notAlways.isSatisfiedBy({}), false);
    assert.ok(await notNever.isSatisfiedBy({}));
  });
});
