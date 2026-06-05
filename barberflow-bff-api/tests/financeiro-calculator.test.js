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

test('FinanceiroCalculator divide pelo percentual do barbeiro apos taxas de metodo', () => {
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
    taxasMetodoPagamento: [{ payment_method: 'credit', fee_percent: 4 }],
  });

  const barbeiro = dashboard.barbeiros[0];
  assert.equal(dashboard.cards.receitaBruta.total, 500);
  assert.equal(dashboard.cards.receitaLiquida.total, 480);
  assert.equal(dashboard.cards.lucroBarbearia.total, 288);
  assert.equal(barbeiro.valorBarbeiro, 192);
  assert.equal(barbeiro.valorBarbearia, 288);
  assert.equal(barbeiro.taxas, 20);
  assert.equal(barbeiro.receitaLiquida, 480);
  assert.equal(barbeiro.porcentagemBarbearia, 60);
  assert.equal(barbeiro.porcentagemBarbeiro, 40);
  assert.equal(barbeiro.agreementConfigured, true);
});

test('FinanceiroCalculator usa o acordo percentual mais recente do profissional', () => {
  const calculator = new FinanceiroCalculator();
  const dashboard = calculator.calcularDashboard({
    periodo: { tipo: 'mes', de: '2026-05-01', ate: '2026-05-24' },
    transacoes: [
      { professional_id: 'prof-parceiro', gross_amount: 100, amount: 100, paid_at: '2026-05-10T12:00:00.000Z' },
    ],
    transacoesAnteriores: [],
    agreements: [
      { professional_id: 'prof-parceiro', type: 'percentage', value: 40, is_active: true, valid_from: '2026-05-01' },
      { professional_id: 'prof-parceiro', type: 'percentage', value: 20, is_active: true, valid_from: '2026-04-01' },
    ],
    profissionais: [{ professionalId: 'prof-parceiro', nome: 'Parceiro', ativo: true }],
  });

  const barbeiro = dashboard.barbeiros[0];
  assert.equal(barbeiro.porcentagemBarbearia, 60);
  assert.equal(barbeiro.porcentagemBarbeiro, 40);
  assert.equal(barbeiro.valorBarbearia, 60);
  assert.equal(barbeiro.valorBarbeiro, 40);
});

test('FinanceiroCalculator nao inventa percentual quando parceiro nao tem agreement ativo', () => {
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
  assert.equal(barbeiro.valorBarbeiro, 0);
  assert.equal(barbeiro.valorBarbearia, 0);
  assert.equal(barbeiro.porcentagemBarbearia, 0);
  assert.equal(barbeiro.porcentagemBarbeiro, 0);
  assert.equal(barbeiro.agreementConfigured, false);
});

test('FinanceiroCalculator respeita acordos 50/50 e 80/20 como percentual do barbeiro', () => {
  const calculator = new FinanceiroCalculator();
  const dashboard = calculator.calcularDashboard({
    periodo: { tipo: 'mes', de: '2026-05-01', ate: '2026-05-24' },
    transacoes: [
      { professional_id: 'prof-50', gross_amount: 100, amount: 100, paid_at: '2026-05-10T12:00:00.000Z' },
      { professional_id: 'prof-80', gross_amount: 100, amount: 100, paid_at: '2026-05-10T12:00:00.000Z' },
    ],
    transacoesAnteriores: [],
    agreements: [
      { professional_id: 'prof-50', type: 'percentage', value: 50, is_active: true },
      { professional_id: 'prof-80', type: 'percentage', value: 80, is_active: true },
    ],
    profissionais: [
      { professionalId: 'prof-50', nome: 'Meio a meio', ativo: true },
      { professionalId: 'prof-80', nome: 'Oitenta', ativo: true },
    ],
  });

  const meio = dashboard.barbeiros.find(item => item.professionalId === 'prof-50');
  const oitenta = dashboard.barbeiros.find(item => item.professionalId === 'prof-80');
  assert.equal(meio.valorBarbeiro, 50);
  assert.equal(meio.valorBarbearia, 50);
  assert.equal(oitenta.valorBarbeiro, 80);
  assert.equal(oitenta.valorBarbearia, 20);
});

test('FinanceiroCalculator calcula comparativos positivos, negativos e base zero', () => {
  const calculator = new FinanceiroCalculator();
  assert.equal(calculator.comparativo(Money.from(118), Money.from(100)), 18);
  assert.equal(calculator.comparativo(Money.from(94), Money.from(100)), -6);
  assert.equal(calculator.comparativo(Money.from(50), Money.zero()), 100);
  assert.equal(calculator.comparativo(Money.zero(), Money.zero()), 0);
});

test('FinanceiroCalculator isOwner: lucroBarbearia = participacao da barbearia', () => {
  const calculator = new FinanceiroCalculator();
  const dashboard = calculator.calcularDashboard({
    periodo: { tipo: 'mes', de: '2026-05-01', ate: '2026-05-24' },
    transacoes: [
      { professional_id: 'prof-dono', gross_amount: 500, amount: 480, payment_method: 'credito', paid_at: '2026-05-10T12:00:00.000Z' },
    ],
    transacoesAnteriores: [],
    agreements: [{ professional_id: 'prof-dono', type: 'percentage', value: 40, is_active: true }],
    profissionais: [{ professionalId: 'prof-dono', nome: 'Dono', papel: 'owner', ativo: true }],
    statusEquipe: { online: 1, onlineIds: ['prof-dono'] },
    isOwner: true,
    taxasMetodoPagamento: [{ payment_method: 'credit', fee_percent: 4 }],
  });

  assert.equal(dashboard.isOwner, true);
  assert.equal(dashboard.cards.receitaLiquida.total, 480);
  assert.equal(dashboard.cards.lucroBarbearia.total, 480);
  assert.equal(dashboard.cards.meuLucro, null);
  assert.equal(dashboard.barbeiros[0].porcentagemBarbeiro, 100);
  assert.equal(dashboard.barbeiros[0].porcentagemBarbearia, 100);
  assert.equal(dashboard.barbeiros[0].agreementConfigured, true);
});

test('FinanceiroCalculator owner: dono sem cortes nao mostra acordo ausente', () => {
  const calculator = new FinanceiroCalculator();
  const dashboard = calculator.calcularDashboard({
    periodo: { tipo: 'mes', de: '2026-05-01', ate: '2026-05-24' },
    transacoes: [],
    transacoesAnteriores: [],
    agreements: [],
    profissionais: [{ professionalId: 'owner-id', nome: 'Dono', papel: 'owner', ativo: true }],
    isOwner: true,
  });

  const dono = dashboard.barbeiros[0];
  assert.equal(dono.porcentagemBarbeiro, 100);
  assert.equal(dono.porcentagemBarbearia, 100);
  assert.equal(dono.agreementConfigured, true);
});

test('FinanceiroCalculator owner: resumo usa participacao da barbearia e aluguel proporcional', () => {
  const calculator = new FinanceiroCalculator();
  const dashboard = calculator.calcularDashboard({
    periodo: {
      tipo: 'semana',
      de: '2026-05-01',
      ate: '2026-05-07',
      inicio: new Date('2026-05-01T00:00:00'),
      fim: new Date('2026-05-07T23:59:59'),
    },
    transacoes: [
      { professional_id: 'prof-a', gross_amount: 100, amount: 100, payment_method: 'pix', paid_at: '2026-05-02T12:00:00.000Z' },
      { professional_id: 'prof-b', gross_amount: 200, amount: 190, payment_method: 'credito', paid_at: '2026-05-03T12:00:00.000Z' },
    ],
    transacoesAnteriores: [],
    agreements: [
      { professional_id: 'prof-a', type: 'percentage', value: 40, is_active: true },
      { professional_id: 'prof-b', type: 'percentage', value: 50, is_active: true },
      { professional_id: 'prof-rent', type: 'rent', value: 310, is_active: true },
      { professional_id: 'prof-fixed', type: 'fixed', value: 999, notes: 'bonus operacional', is_active: true },
    ],
    profissionais: [
      { professionalId: 'prof-a', nome: 'Ana', ativo: true },
      { professionalId: 'prof-b', nome: 'Bia', ativo: true },
      { professionalId: 'prof-rent', nome: 'Rafa', ativo: true },
    ],
    statusEquipe: { online: 2, onlineIds: ['prof-a', 'prof-rent'] },
    isOwner: true,
    taxasMetodoPagamento: [{ payment_method: 'credit', fee_percent: 5 }],
  });

  assert.equal(dashboard.cards.totalCortes.total, 2);
  assert.equal(dashboard.cards.receitaBruta.total, 300);
  assert.equal(dashboard.cards.receitaLiquida.total, 225);
  assert.equal(dashboard.cards.lucroBarbearia.total, 225);
  assert.equal(dashboard.cards.lucroBarbearia.limitacaoDespesas, false);
  assert.equal(dashboard.cards.mensalistas.total, 70);
  assert.equal(dashboard.cards.mensalistas.count, 1);
});

test('FinanceiroCalculator owner: lucro desconta despesas reais', () => {
  const calculator = new FinanceiroCalculator();
  const dashboard = calculator.calcularDashboard({
    periodo: {
      tipo: 'mes',
      de: '2026-05-01',
      ate: '2026-05-31',
      inicio: new Date('2026-05-01T00:00:00'),
      fim: new Date('2026-05-31T23:59:59'),
    },
    transacoes: [
      { professional_id: 'prof-a', gross_amount: 100, amount: 100, payment_method: 'pix', paid_at: '2026-05-02T12:00:00.000Z' },
    ],
    transacoesAnteriores: [],
    agreements: [
      { professional_id: 'prof-a', type: 'percentage', value: 40, is_active: true },
      { professional_id: 'prof-rent', type: 'rent', value: 310, is_active: true },
    ],
    despesas: [
      { amount: 25, type: 'expense', status: 'paid', paid_at: '2026-05-10T12:00:00.000Z' },
    ],
    profissionais: [
      { professionalId: 'prof-a', nome: 'Ana', ativo: true },
      { professionalId: 'prof-rent', nome: 'Rafa', ativo: true, vinculado: true },
    ],
    isOwner: true,
  });

  assert.equal(dashboard.cards.receitaLiquida.total, 370);
  assert.equal(dashboard.cards.lucroBarbearia.total, 345);
  assert.equal(dashboard.cards.lucroBarbearia.despesas, 25);
  assert.equal(dashboard.cards.lucroBarbearia.limitacaoDespesas, false);
});

test('FinanceiroCalculator owner: mensalistas inclui apenas parceiro ativo vinculado', () => {
  const calculator = new FinanceiroCalculator();
  const dashboard = calculator.calcularDashboard({
    periodo: {
      tipo: 'mes',
      de: '2026-05-01',
      ate: '2026-05-31',
      inicio: new Date('2026-05-01T00:00:00'),
      fim: new Date('2026-05-31T23:59:59'),
    },
    transacoes: [],
    transacoesAnteriores: [],
    agreements: [
      { professional_id: 'prof-ativo', type: 'chair_rental', value: 300, is_active: true },
      { professional_id: 'prof-inativo', type: 'chair_rental', value: 200, is_active: true },
      { professional_id: 'owner-id', type: 'chair_rental', value: 999, is_active: true },
      { professional_id: 'cliente-ou-solto', type: 'chair_rental', value: 700, is_active: true },
    ],
    profissionais: [
      { professionalId: 'owner-id', nome: 'Dono', papel: 'owner', ativo: true, vinculado: false },
      { professionalId: 'prof-ativo', nome: 'Ana', papel: 'professional', ativo: true, vinculado: true },
      { professionalId: 'prof-inativo', nome: 'Bia', papel: 'professional', ativo: false, vinculado: true },
    ],
    isOwner: true,
  });

  assert.equal(dashboard.cards.mensalistas.total, 300);
  assert.equal(dashboard.cards.mensalistas.count, 1);
});

test('FinanceiroCalculator statusEquipe: ativos acompanham profissionais trabalhando', () => {
  const calculator = new FinanceiroCalculator();
  const dashboard = calculator.calcularDashboard({
    periodo: { tipo: 'mes', de: '2026-05-01', ate: '2026-05-31' },
    transacoes: [],
    transacoesAnteriores: [],
    agreements: [],
    profissionais: [
      { professionalId: 'owner-id', nome: 'Dono', papel: 'owner', ativo: true, vinculado: false },
      { professionalId: 'prof-online', nome: 'Parceiro Online', papel: 'professional', ativo: true, vinculado: true },
      { professionalId: 'prof-offline', nome: 'Parceiro Offline', papel: 'professional', ativo: true, vinculado: true },
    ],
    statusEquipe: { onlineIds: ['owner-id', 'prof-online'] },
    isOwner: true,
  });

  assert.equal(dashboard.cards.totalBarbeiros.total, 3);
  assert.equal(dashboard.cards.totalBarbeiros.online, 2);
  assert.equal(dashboard.cards.totalBarbeiros.ativos, 2);
  assert.equal(dashboard.cards.totalBarbeiros.inativos, 1);
  assert.equal(dashboard.statusEquipe.online, 2);
  assert.equal(dashboard.statusEquipe.ativos, 2);
  assert.equal(dashboard.statusEquipe.inativos, 1);
});

test('FinanceiroCalculator statusEquipe: nao duplica dono e ignora online fora da barbearia', () => {
  const calculator = new FinanceiroCalculator();
  const dashboard = calculator.calcularDashboard({
    periodo: { tipo: 'mes', de: '2026-05-01', ate: '2026-05-31' },
    transacoes: [],
    transacoesAnteriores: [],
    agreements: [],
    profissionais: [
      { professionalId: 'owner-id', nome: 'Dono', papel: 'owner', ativo: true },
      { professionalId: 'prof-offline', nome: 'Parceiro Offline', papel: 'professional', ativo: true },
    ],
    statusEquipe: { onlineIds: ['owner-id', 'owner-id', 'prof-outra-barbearia'] },
    isOwner: true,
  });

  assert.equal(dashboard.cards.totalBarbeiros.total, 2);
  assert.equal(dashboard.cards.totalBarbeiros.online, 1);
  assert.equal(dashboard.cards.totalBarbeiros.ativos, 1);
  assert.equal(dashboard.cards.totalBarbeiros.inativos, 1);
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
    taxasMetodoPagamento: [{ payment_method: 'credit', fee_percent: 4 }],
  });

  assert.equal(dashboard.isOwner, false);
  assert.equal(dashboard.cards.lucroBarbearia.total, 288);
  assert.ok(dashboard.cards.meuLucro !== null);
  assert.equal(dashboard.cards.meuLucro.total, 192);
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

test('FinanceiroCalculator calcula metodosPagamento com taxas configuradas sem mutar amount', () => {
  const calculator = new FinanceiroCalculator();
  const dashboard = calculator.calcularDashboard({
    periodo: { tipo: 'mes', de: '2026-05-01', ate: '2026-05-24' },
    transacoes: [
      { professional_id: 'p1', gross_amount: 100, amount: 90, payment_method: 'credit_card', paid_at: '2026-05-10T12:00:00.000Z' },
      { professional_id: 'p1', gross_amount: 50, amount: 50, payment_method: 'débito', paid_at: '2026-05-11T12:00:00.000Z' },
      { professional_id: 'p1', gross_amount: 40, amount: 30, payment_method: 'money', paid_at: '2026-05-12T12:00:00.000Z' },
      { professional_id: 'p1', gross_amount: 30, amount: 25, payment_method: 'PIX', paid_at: '2026-05-13T12:00:00.000Z' },
    ],
    transacoesAnteriores: [],
    agreements: [],
    profissionais: [],
    statusEquipe: {},
    taxasMetodoPagamento: [
      { payment_method: 'credit', fee_percent: 5 },
      { payment_method: 'debit', fee_percent: 2 },
    ],
  });

  const metodos = new Map(dashboard.metodosPagamento.map(item => [item.metodo, item]));
  assert.equal(metodos.get('credit').receitaBruta, 100);
  assert.equal(metodos.get('credit').taxas, 5);
  assert.equal(metodos.get('credit').receitaLiquida, 95);
  assert.equal(metodos.get('credit').feePercent, 5);
  assert.equal(metodos.get('debit').receitaBruta, 50);
  assert.equal(metodos.get('debit').taxas, 1);
  assert.equal(metodos.get('debit').receitaLiquida, 49);
  assert.equal(metodos.get('dinheiro').taxas, 0);
  assert.equal(metodos.get('dinheiro').receitaLiquida, 40);
  assert.equal(metodos.get('pix').taxas, 0);
  assert.equal(metodos.get('pix').receitaLiquida, 30);
});

test('FinanceiroCalculator divide dono e parceiro sobre liquido apos taxa de cartao', () => {
  const calculator = new FinanceiroCalculator();
  const dashboard = calculator.calcularDashboard({
    periodo: { tipo: 'mes', de: '2026-05-01', ate: '2026-05-24' },
    transacoes: [
      { professional_id: 'owner-id', gross_amount: 100, amount: 100, payment_method: 'credito', paid_at: '2026-05-10T12:00:00.000Z' },
      { professional_id: 'partner-id', gross_amount: 100, amount: 100, payment_method: 'credito', paid_at: '2026-05-10T12:00:00.000Z' },
    ],
    transacoesAnteriores: [],
    agreements: [{ professional_id: 'partner-id', type: 'percentage', value: 40, is_active: true }],
    profissionais: [
      { professionalId: 'owner-id', nome: 'Alan', papel: 'owner', ativo: true },
      { professionalId: 'partner-id', nome: 'Lima', papel: 'professional', ativo: true, vinculado: true },
    ],
    statusEquipe: {},
    isOwner: true,
    taxasMetodoPagamento: [{ payment_method: 'credit', fee_percent: 5 }],
  });

  const dono = dashboard.barbeiros.find(item => item.professionalId === 'owner-id');
  const parceiro = dashboard.barbeiros.find(item => item.professionalId === 'partner-id');

  assert.equal(dashboard.cards.receitaBruta.total, 200);
  assert.equal(dashboard.cards.receitaLiquida.total, 152);
  assert.equal(dashboard.donut.find(item => item.label === 'Taxas').value, 10);
  assert.equal(dono.receitaBruta, 100);
  assert.equal(dono.taxas, 5);
  assert.equal(dono.receitaLiquida, 95);
  assert.equal(dono.valorBarbeiro, 95);
  assert.equal(dono.valorBarbearia, 95);
  assert.equal(dono.agreementConfigured, true);
  assert.equal(parceiro.receitaBruta, 100);
  assert.equal(parceiro.taxas, 5);
  assert.equal(parceiro.receitaLiquida, 95);
  assert.equal(parceiro.valorBarbeiro, 38);
  assert.equal(parceiro.valorBarbearia, 57);
  assert.equal(parceiro.valorBarbeiro + parceiro.valorBarbearia, parceiro.receitaLiquida);
});
