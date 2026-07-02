'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const vm   = require('node:vm');
const fs   = require('node:fs');
const path = require('node:path');
const { carregar } = require('./_helpers.js');

const ROOT = path.resolve(__dirname, '..');
const SRC_PLANOS = fs.readFileSync(
  path.join(ROOT, 'apps/profissional/assets/js/controllers/PlanosController.js'), 'utf8',
);

describe('PlanosController - dias de expiração do plano pago', () => {
  const sandbox = vm.createContext({ console });
  carregar(sandbox, 'apps/profissional/assets/js/controllers/PlanosController.js');
  const PC  = sandbox.PlanosController;
  const DIA = 24 * 60 * 60 * 1000;
  const now = Date.parse('2026-07-02T12:00:00.000Z');
  const emDias = (d) => new Date(now + d * DIA).toISOString();

  test('mensal recém-pago (30 dias) mostra 30', () => {
    assert.equal(PC.calcularDiasExpiracao(emDias(30), now), 30);
  });

  test('trimestral (90 dias) mostra 90', () => {
    assert.equal(PC.calcularDiasExpiracao(emDias(90), now), 90);
  });

  test('arredonda para cima (5,2 dias -> 6)', () => {
    assert.equal(PC.calcularDiasExpiracao(emDias(5.2), now), 6);
  });

  test('último dia (menos de 24h) mostra 1', () => {
    assert.equal(PC.calcularDiasExpiracao(emDias(0.5), now), 1);
  });

  test('expirado (passado) mostra 0, nunca negativo', () => {
    assert.equal(PC.calcularDiasExpiracao(emDias(-2), now), 0);
  });

  test('data inválida retorna null', () => {
    assert.equal(PC.calcularDiasExpiracao('lixo', now), null);
    assert.equal(PC.calcularDiasExpiracao(null, now), null);
  });
});

describe('PlanosController - selo de plano aplicado (código-fonte)', () => {
  test('só marca plano PAGO ativo — trial não recebe selo', () => {
    assert.match(SRC_PLANOS, /sub\.status !== 'active'/);
    assert.match(SRC_PLANOS, /\['mensal',\s*'trimestral'\]\.includes\(sub\.planType\)/);
  });

  test('injeta selo "Plano aplicado" e linha de expiração', () => {
    assert.match(SRC_PLANOS, /ppp-plano-aplicado/);
    assert.match(SRC_PLANOS, /Plano aplicado/);
    assert.match(SRC_PLANOS, /ppp-plano-expira/);
    assert.match(SRC_PLANOS, /Seu plano expira em/);
  });

  test('preparar tela chama a marcação do plano ativo', () => {
    assert.match(SRC_PLANOS, /this\.#marcarPlanoAtivo\(/);
  });
});
