'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const Money = require('../domain/financeiro/Money');
const FinanceiroCalculator = require('../domain/financeiro/FinanceiroCalculator');

test('Money opera em centavos e evita erro de ponto flutuante', () => {
  const total = Money.from(0.1).plus(0.2);
  assert.equal(total.toNumber(), 0.3);
  assert.equal(Money.from(480).timesPercent(40).toNumber(), 192);
});

test('FinanceiroCalculator desconta taxas antes de dividir entre barbearia e barbeiro', () => {
  const calculator = new FinanceiroCalculator();
  const dashboard = calculator.calcularDashboard({
    periodo: { tipo: 'mes', de: '2026-05-01', ate: '2026-05-24' },
    transacoes: [
      {
        professional_id: 'prof-joao',
        gross_amount: 500,
        amount: 480,
        payment_method: 'credito',
        paid_at: '2026-05-10T12:00:00.000Z',
      },
    ],
    transacoesAnteriores: [],
    agreements: [{ professional_id: 'prof-joao', type: 'percentage', value: 40, is_active: true }],
    profissionais: [{ professionalId: 'prof-joao', nome: 'Joao', ativo: true }],
    statusEquipe: { online: 1, onlineIds: ['prof-joao'] },
  });

  const barbeiro = dashboard.barbeiros[0];
  assert.equal(dashboard.cards.receitaBruta.total, 500);
  assert.equal(dashboard.cards.receitaLiquida.total, 480);
  assert.equal(dashboard.cards.lucroBarbearia.total, 192);
  assert.equal(barbeiro.valorBarbeiro, 288);
  assert.equal(barbeiro.valorBarbearia, 192);
  assert.equal(barbeiro.taxas, 20);
  assert.equal(barbeiro.porcentagemBarbearia, 40);
  assert.equal(barbeiro.porcentagemBarbeiro, 60);
  assert.equal(barbeiro.agreementConfigured, true);
});

test('FinanceiroCalculator usa 0% para barbearia quando nao ha agreement ativo', () => {
  const calculator = new FinanceiroCalculator();
  const dashboard = calculator.calcularDashboard({
    periodo: { tipo: 'semana', de: '2026-05-18', ate: '2026-05-24' },
    transacoes: [
      { professional_id: 'prof-sem-acordo', gross_amount: 100, amount: 95, paid_at: '2026-05-20T12:00:00.000Z' },
    ],
    agreements: [],
    profissionais: [{ professionalId: 'prof-sem-acordo', nome: 'Sem Acordo' }],
  });

  const barbeiro = dashboard.barbeiros[0];
  assert.equal(dashboard.cards.lucroBarbearia.total, 0);
  assert.equal(barbeiro.valorBarbeiro, 95);
  assert.equal(barbeiro.valorBarbearia, 0);
  assert.equal(barbeiro.agreementConfigured, false);
});

test('FinanceiroCalculator calcula comparativos positivos, negativos e base zero', () => {
  const calculator = new FinanceiroCalculator();
  assert.equal(calculator.comparativo(Money.from(118), Money.from(100)), 18);
  assert.equal(calculator.comparativo(Money.from(94), Money.from(100)), -6);
  assert.equal(calculator.comparativo(Money.from(50), Money.zero()), 100);
  assert.equal(calculator.comparativo(Money.zero(), Money.zero()), 0);
});

test('FinanceiroCalculator isOwner: lucroBarbearia = receitaLiquida (100%)', () => {
  const calculator = new FinanceiroCalculator();
  const dashboard = calculator.calcularDashboard({
    periodo: { tipo: 'mes', de: '2026-05-01', ate: '2026-05-24' },
    transacoes: [
      { professional_id: 'prof-dono', gross_amount: 500, amount: 480, payment_method: 'dinheiro', paid_at: '2026-05-10T12:00:00.000Z' },
    ],
    transacoesAnteriores: [],
    agreements: [{ professional_id: 'prof-dono', type: 'percentage', value: 40, is_active: true }],
    profissionais: [{ professionalId: 'prof-dono', nome: 'Dono', ativo: true }],
    statusEquipe: { online: 1, onlineIds: ['prof-dono'] },
    isOwner: true,
  });

  assert.equal(dashboard.isOwner, true);
  assert.equal(dashboard.cards.lucroBarbearia.total, 480);
  assert.equal(dashboard.cards.meuLucro, null);
});

test('FinanceiroCalculator nao-dono: meuLucro = porcentagem do barbeiro viewer', () => {
  const calculator = new FinanceiroCalculator();
  const dashboard = calculator.calcularDashboard({
    periodo: { tipo: 'mes', de: '2026-05-01', ate: '2026-05-24' },
    transacoes: [
      { professional_id: 'prof-viewer', gross_amount: 500, amount: 480, payment_method: 'credito', paid_at: '2026-05-10T12:00:00.000Z' },
    ],
    transacoesAnteriores: [],
    agreements: [{ professional_id: 'prof-viewer', type: 'percentage', value: 40, is_active: true }],
    profissionais: [{ professionalId: 'prof-viewer', nome: 'Barbeiro', ativo: true }],
    statusEquipe: {},
    isOwner: false,
    viewerProfessionalId: 'prof-viewer',
  });

  assert.equal(dashboard.isOwner, false);
  assert.equal(dashboard.cards.lucroBarbearia.total, 192);
  assert.ok(dashboard.cards.meuLucro !== null);
  assert.equal(dashboard.cards.meuLucro.total, 288);
});

test('FinanceiroCalculator valida periodo custom com de e ate', () => {
  const calculator = new FinanceiroCalculator();
  assert.throws(() => calculator.resolverPeriodo('custom'), /custom exige/);
  assert.throws(() => calculator.resolverPeriodo('custom', '2026-05-24', '2026-05-01'), /invalido/);

  const periodo = calculator.resolverPeriodo('custom', '2026-05-01', '2026-05-24', new Date('2026-05-24T12:00:00.000Z'));
  assert.equal(periodo.tipo, 'custom');
  assert.equal(periodo.de, '2026-05-01');
  assert.equal(periodo.ate, '2026-05-24');
});

test('FinanceiroCalculator inclui cards.mensalistas com total e count', () => {
  const calculator = new FinanceiroCalculator();
  const dashboard = calculator.calcularDashboard({
    periodo: { tipo: 'mes', de: '2026-05-01', ate: '2026-05-24' },
    transacoes: [],
    transacoesAnteriores: [],
    agreements: [],
    profissionais: [],
    statusEquipe: {},
    mensalistas: { total: 200, count: 2 },
  });

  assert.equal(dashboard.cards.mensalistas.total, 200);
  assert.equal(dashboard.cards.mensalistas.count, 2);
});

test('FinanceiroCalculator exclui entradas "outros" de metodosPagamento', () => {
  const calculator = new FinanceiroCalculator();
  const dashboard = calculator.calcularDashboard({
    periodo: { tipo: 'mes', de: '2026-05-01', ate: '2026-05-24' },
    transacoes: [
      { professional_id: 'p1', gross_amount: 100, amount: 100, payment_method: null, paid_at: '2026-05-10T12:00:00.000Z' },
      { professional_id: 'p1', gross_amount: 50,  amount: 50,  payment_method: 'pix', paid_at: '2026-05-11T12:00:00.000Z' },
    ],
    transacoesAnteriores: [],
    agreements: [],
    profissionais: [],
    statusEquipe: {},
  });

  const metodos = dashboard.metodosPagamento;
  const outrosEntry = metodos.find(m => m.metodo === 'outros');
  assert.equal(outrosEntry, undefined, 'metodo "outros" nao deve aparecer em metodosPagamento');
});

