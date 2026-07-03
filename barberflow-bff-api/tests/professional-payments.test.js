'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const ProfessionalPaymentService = require('../services/ProfessionalPaymentService');
const AsaasClient = require('../infrastructure/payments/AsaasClient');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_ASAAS_PAYMENT_SUCCESS_ORIGIN = process.env.ASAAS_PAYMENT_SUCCESS_ORIGIN;

class FakeRepo {
  constructor({
    profileRole = 'professional',
    existingCustomer = null,
    profilePhone = '11999999999',
    profileCpfCnpj = null,
    profileCpfCnpjEncPresent = false,
    authMetadata = {},
    authMetadataError = null,
    pendingPayment = null,
  } = {}) {
    this.profileRole = profileRole;
    this.profilePhone = profilePhone;
    this.profileCpfCnpj = profileCpfCnpj;
    this.profileCpfCnpjEncPresent = profileCpfCnpjEncPresent;
    this.authMetadata = authMetadata;
    this.authMetadataError = authMetadataError;
    this.pendingPayment = pendingPayment;
    this.pendingPaymentLookup = null;
    this.customer = existingCustomer;
    this.createdPayments = [];
    this.events = [];
    this.payment = null;
    this.subscription = null;
    this.expiredSubscriptions = 0;
  }

  async getProfile() {
    return {
      id: USER_ID,
      full_name: 'Profissional Teste',
      phone: this.profilePhone,
      role: this.profileRole,
      pro_type: 'barbeiro',
      is_active: true,
      cpf_cnpj: this.profileCpfCnpj,
      cpf_cnpj_enc_present: this.profileCpfCnpjEncPresent,
    };
  }

  async getCustomerByUser() {
    return this.customer;
  }

  async getAuthUserMetadata() {
    if (this.authMetadataError) throw this.authMetadataError;
    return this.authMetadata;
  }

  async salvarCustomer(payload) {
    this.customer = {
      id: '22222222-2222-4222-8222-222222222222',
      user_id: payload.userId,
      asaas_customer_id: payload.asaasCustomerId,
      name: payload.name,
      email: payload.email,
      mobile_phone: payload.mobilePhone,
    };
    return this.customer;
  }

  async criarPagamento(payload) {
    const row = {
      id: '33333333-3333-4333-8333-333333333333',
      created_at: '2026-06-26T12:00:00.000Z',
      paid_at: null,
      ...payload,
    };
    this.payment = row;
    this.createdPayments.push(row);
    return row;
  }

  async getReusablePendingPayment({ userId, planType, proType, statuses, dueDateMin }) {
    this.pendingPaymentLookup = { userId, planType, proType, statuses, dueDateMin };
    const payment = this.pendingPayment ?? this.payment;
    if (!payment) return null;
    if (payment.user_id !== userId) return null;
    if (payment.plan_type !== planType) return null;
    if (payment.pro_type !== proType) return null;
    if (!statuses.includes(payment.status)) return null;
    if (payment.paid_at) return null;
    if (!payment.invoice_url) return null;
    if (payment.due_date && payment.due_date < dueDateMin) return null;
    return payment;
  }

  async getPaymentByAsaasId(id) {
    return this.payment?.asaas_payment_id === id ? this.payment : null;
  }

  async getPaymentForUser(userId, id) {
    if (this.payment?.id === id && this.payment?.user_id === userId) return this.payment;
    return null;
  }

  async atualizarPagamentoPorAsaasId(_id, payload) {
    this.payment = { ...this.payment, ...payload };
    return this.payment;
  }

  async registrarWebhookEvento(payload) {
    if (this.events.some(event => event.eventId === payload.eventId)) {
      return { duplicate: true };
    }
    this.events.push(payload);
    return { duplicate: false, data: payload };
  }

  async getSubscriptionByPurchaseToken(purchaseToken) {
    return this.subscription?.purchase_token === purchaseToken ? this.subscription : null;
  }

  async getCurrentSubscription() {
    return this.subscription;
  }

  async ativarTrial(userId) {
    this.expiredSubscriptions += 1;
    this.subscription = {
      id: '55555555-5555-4555-8555-555555555555',
      user_id: userId,
      plan_type: 'trial',
      status: 'trial',
      starts_at: '2026-06-26T12:00:00.000Z',
      ends_at: '2026-07-10T12:00:00.000Z',
      price: 0,
    };
    return this.subscription;
  }

  async ativarAssinaturaPorPagamento(payment) {
    const existing = await this.getSubscriptionByPurchaseToken(payment.asaas_payment_id);
    if (existing) return existing;
    this.expiredSubscriptions += 1;
    this.subscription = {
      id: '44444444-4444-4444-8444-444444444444',
      user_id: payment.user_id,
      plan_type: payment.plan_type,
      status: 'active',
      purchase_token: payment.asaas_payment_id,
    };
    return this.subscription;
  }
}

class FakeAsaas {
  constructor() {
    this.customers = [];
    this.updatedCustomers = [];
    this.payments = [];
  }

  async criarCliente(payload) {
    this.customers.push(payload);
    return { id: 'cus_123' };
  }

  async atualizarCliente(customerId, payload) {
    this.updatedCustomers.push({ customerId, payload });
    return { id: customerId, ...payload };
  }

  async criarCobranca(payload) {
    this.payments.push(payload);
    return {
      id: 'pay_123',
      status: 'PENDING',
      invoiceUrl: 'https://sandbox.asaas.com/i/pay_123',
      bankSlipUrl: null,
    };
  }

  async buscarCobranca(paymentId) {
    return {
      id: paymentId,
      status: 'RECEIVED',
      invoiceUrl: 'https://sandbox.asaas.com/i/pay_123',
      bankSlipUrl: null,
      paymentDate: '2026-06-26',
    };
  }

  async buscarPixQrCode() {
    return {
      payload: '000201010212',
      expirationDate: '2026-06-27T12:00:00.000Z',
    };
  }
}

function pendingPayment(overrides = {}) {
  return {
    id: '66666666-6666-4666-8666-666666666666',
    user_id: USER_ID,
    barbershop_id: null,
    asaas_customer_id: 'cus_pendente',
    asaas_payment_id: 'pay_pendente',
    plan_type: 'mensal',
    pro_type: 'barbeiro',
    billing_type: 'UNDEFINED',
    status: 'PENDING',
    value: 5.00,
    due_date: '2099-01-01',
    description: 'BarberFlow Pro Barbeiro - Plano Mensal',
    invoice_url: 'https://sandbox.asaas.com/i/pay_pendente',
    bank_slip_url: null,
    pix_payload: null,
    pix_expiration_date: null,
    paid_at: null,
    created_at: '2026-07-03T12:00:00.000Z',
    updated_at: '2026-07-03T12:00:00.000Z',
    ...overrides,
  };
}

test('AsaasClient mapeia credencial recusada como configuracao indisponivel', async () => {
  const client = new AsaasClient({
    apiKey: 'fake',
    baseUrl: 'https://asaas.test',
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      json: async () => ({ errors: [{ description: 'Access token invalido' }] }),
    }),
  });

  await assert.rejects(
    () => client.criarCobranca({}),
    err => err.status === 503 && /credencial/.test(err.message),
  );
});

test('AsaasClient preserva motivo seguro de payload rejeitado', async () => {
  const client = new AsaasClient({
    apiKey: 'fake',
    baseUrl: 'https://asaas.test',
    fetchImpl: async () => ({
      ok: false,
      status: 400,
      json: async () => ({ errors: [{ description: 'O campo customer e obrigatorio.' }] }),
    }),
  });

  await assert.rejects(
    () => client.criarCobranca({}),
    err => err.status === 400 && /customer/.test(err.message),
  );
});

test('cria cobranca Asaas para profissional autenticado', async () => {
  const repo = new FakeRepo({ authMetadata: { cpf_cnpj: '529.982.247-25' } });
  const asaas = new FakeAsaas();
  const service = new ProfessionalPaymentService(repo, asaas, { webhookToken: 'x'.repeat(32) });

  const result = await service.criarCobranca(
    { id: USER_ID, email: 'teste@barberflow.test' },
    { proType: 'barbeiro', planType: 'mensal', billingType: 'PIX' },
    { ip: '127.0.0.1' },
  );

  assert.equal(result.asaasPaymentId, 'pay_123');
  assert.equal(result.invoiceUrl, 'https://sandbox.asaas.com/i/pay_123');
  assert.equal(result.reused, false);
  assert.equal(result.value, 5.00);
  assert.equal(repo.createdPayments[0].billing_type, 'PIX');
  assert.equal(repo.createdPayments[0].barbershop_id, null);
  assert.equal(asaas.customers[0].name, 'Profissional Teste');
});

test('reaproveita cobranca pendente valida sem criar nova no Asaas', async () => {
  const repo = new FakeRepo({
    authMetadata: { cpf_cnpj: '529.982.247-25' },
    pendingPayment: pendingPayment(),
  });
  const asaas = new FakeAsaas();
  const service = new ProfessionalPaymentService(repo, asaas, { webhookToken: 'x'.repeat(32) });

  const result = await service.criarCobranca(
    { id: USER_ID, email: 'teste@barberflow.test' },
    { proType: 'barbeiro', planType: 'mensal', billingType: 'UNDEFINED', dueDate: '2099-01-01' },
    { ip: '127.0.0.1' },
  );

  assert.equal(result.asaasPaymentId, 'pay_pendente');
  assert.equal(result.invoiceUrl, 'https://sandbox.asaas.com/i/pay_pendente');
  assert.equal(result.reused, true);
  assert.equal(asaas.payments.length, 0);
  assert.equal(repo.createdPayments.length, 0);
});

test('segunda tentativa em outro dispositivo recebe mesma invoiceUrl pendente', async () => {
  const repo = new FakeRepo({ authMetadata: { cpf_cnpj: '529.982.247-25' } });
  const asaas = new FakeAsaas();
  const service = new ProfessionalPaymentService(repo, asaas, { webhookToken: 'x'.repeat(32) });

  const first = await service.criarCobranca(
    { id: USER_ID, email: 'teste@barberflow.test' },
    { proType: 'barbeiro', planType: 'mensal', billingType: 'UNDEFINED', dueDate: '2099-01-01' },
    { ip: '127.0.0.1' },
  );
  const second = await service.criarCobranca(
    { id: USER_ID, email: 'teste@barberflow.test' },
    { proType: 'barbeiro', planType: 'mensal', billingType: 'UNDEFINED', dueDate: '2099-01-01' },
    { ip: '127.0.0.1' },
  );

  assert.equal(asaas.payments.length, 1);
  assert.equal(second.id, first.id);
  assert.equal(second.invoiceUrl, first.invoiceUrl);
  assert.equal(second.reused, true);
});

test('ignora pendencia sem invoiceUrl e cria nova cobranca valida', async () => {
  const repo = new FakeRepo({
    authMetadata: { cpf_cnpj: '529.982.247-25' },
    pendingPayment: pendingPayment({ invoice_url: null }),
  });
  const asaas = new FakeAsaas();
  const service = new ProfessionalPaymentService(repo, asaas, { webhookToken: 'x'.repeat(32) });

  const result = await service.criarCobranca(
    { id: USER_ID, email: 'teste@barberflow.test' },
    { proType: 'barbeiro', planType: 'mensal', billingType: 'UNDEFINED', dueDate: '2099-01-01' },
    { ip: '127.0.0.1' },
  );

  assert.equal(result.asaasPaymentId, 'pay_123');
  assert.equal(result.invoiceUrl, 'https://sandbox.asaas.com/i/pay_123');
  assert.equal(result.reused, false);
  assert.equal(asaas.payments.length, 1);
});

test('nao reaproveita cobranca paga cancelada ou vencida', async () => {
  for (const invalidPayment of [
    pendingPayment({ status: 'RECEIVED', paid_at: '2026-07-03T12:00:00.000Z' }),
    pendingPayment({ status: 'CANCELLED' }),
    pendingPayment({ due_date: '2026-01-01' }),
  ]) {
    const repo = new FakeRepo({
      authMetadata: { cpf_cnpj: '529.982.247-25' },
      pendingPayment: invalidPayment,
    });
    const asaas = new FakeAsaas();
    const service = new ProfessionalPaymentService(repo, asaas, { webhookToken: 'x'.repeat(32) });

    const result = await service.criarCobranca(
      { id: USER_ID, email: 'teste@barberflow.test' },
      { proType: 'barbeiro', planType: 'mensal', billingType: 'UNDEFINED', dueDate: '2099-01-01' },
      { ip: '127.0.0.1' },
    );

    assert.equal(result.asaasPaymentId, 'pay_123');
    assert.equal(result.reused, false);
    assert.equal(asaas.payments.length, 1);
  }
});

test('cria cobranca com callback seguro para voltar ao app profissional', async () => {
  const repo = new FakeRepo({ authMetadata: { cpf_cnpj: '529.982.247-25' } });
  const asaas = new FakeAsaas();
  const service = new ProfessionalPaymentService(repo, asaas, { webhookToken: 'x'.repeat(32) });

  await service.criarCobranca(
    { id: USER_ID, email: 'teste@barberflow.test' },
    { proType: 'barbeiro', planType: 'mensal', billingType: 'UNDEFINED' },
    { ip: '127.0.0.1', origin: 'https://pro.barberflow.live' },
  );

  assert.deepEqual(asaas.payments[0].callback, {
    successUrl: 'https://pro.barberflow.live/?bf_pagamento=retorno',
    autoRedirect: true,
  });
});

test('em producao sem ASAAS_SUCCESS_URL nao envia callback (evita rejeicao Asaas por dominio)', async () => {
  process.env.NODE_ENV = 'production';
  const origSuccessUrl = process.env.ASAAS_SUCCESS_URL;
  delete process.env.ASAAS_SUCCESS_URL;
  try {
    const repo = new FakeRepo({ authMetadata: { cpf_cnpj: '529.982.247-25' } });
    const asaas = new FakeAsaas();
    const service = new ProfessionalPaymentService(repo, asaas, { webhookToken: 'x'.repeat(32) });

    await service.criarCobranca(
      { id: USER_ID, email: 'teste@barberflow.test' },
      { proType: 'barbeiro', planType: 'mensal', billingType: 'UNDEFINED' },
      { ip: '127.0.0.1', origin: 'https://pro.barberflow.live' },
    );

    assert.equal('callback' in asaas.payments[0], false);
  } finally {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    if (origSuccessUrl !== undefined) process.env.ASAAS_SUCCESS_URL = origSuccessUrl;
    else delete process.env.ASAAS_SUCCESS_URL;
  }
});

test('em producao com ASAAS_SUCCESS_URL envia callback canonico', async () => {
  process.env.NODE_ENV = 'production';
  const origSuccessUrl = process.env.ASAAS_SUCCESS_URL;
  process.env.ASAAS_SUCCESS_URL = 'https://pro.barberflow.live/?bf_pagamento=retorno';
  try {
    const repo = new FakeRepo({ authMetadata: { cpf_cnpj: '529.982.247-25' } });
    const asaas = new FakeAsaas();
    const service = new ProfessionalPaymentService(repo, asaas, { webhookToken: 'x'.repeat(32) });

    await service.criarCobranca(
      { id: USER_ID, email: 'teste@barberflow.test' },
      { proType: 'barbeiro', planType: 'mensal', billingType: 'UNDEFINED' },
      { ip: '127.0.0.1', origin: 'https://pro.barberflow.live' },
    );

    assert.deepEqual(asaas.payments[0].callback, {
      successUrl: 'https://pro.barberflow.live/?bf_pagamento=retorno',
      autoRedirect: true,
    });
  } finally {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    if (origSuccessUrl !== undefined) process.env.ASAAS_SUCCESS_URL = origSuccessUrl;
    else delete process.env.ASAAS_SUCCESS_URL;
  }
});

test('nao cria callback de pagamento para origem nao permitida', async () => {
  const repo = new FakeRepo({ authMetadata: { cpf_cnpj: '529.982.247-25' } });
  const asaas = new FakeAsaas();
  const service = new ProfessionalPaymentService(repo, asaas, { webhookToken: 'x'.repeat(32) });

  await service.criarCobranca(
    { id: USER_ID, email: 'teste@barberflow.test' },
    { proType: 'barbeiro', planType: 'mensal', billingType: 'UNDEFINED' },
    { ip: '127.0.0.1', origin: 'https://pro.barberflow.live.evil.com' },
  );

  assert.equal('callback' in asaas.payments[0], false);
});

test('envia CPF/CNPJ ao criar cliente Asaas', async () => {
  const repo = new FakeRepo();
  const asaas = new FakeAsaas();
  const service = new ProfessionalPaymentService(repo, asaas, { webhookToken: 'x'.repeat(32) });

  await service.criarCobranca(
    { id: USER_ID, email: 'teste@barberflow.test' },
    {
      proType: 'barbeiro',
      planType: 'mensal',
      billingType: 'PIX',
      customer: { cpfCnpj: '529.982.247-25' },
    },
    { ip: '127.0.0.1' },
  );

  assert.equal(asaas.customers[0].cpfCnpj, '52998224725');
  assert.equal(asaas.updatedCustomers.length, 0);
});

test('usa CPF/CNPJ do cadastro do usuario quando payload nao envia customer', async () => {
  const repo = new FakeRepo({ authMetadata: { cpf_cnpj: '529.982.247-25' } });
  const asaas = new FakeAsaas();
  const service = new ProfessionalPaymentService(repo, asaas, { webhookToken: 'x'.repeat(32) });

  await service.criarCobranca(
    { id: USER_ID, email: 'teste@barberflow.test' },
    { proType: 'barbeiro', planType: 'mensal', billingType: 'PIX' },
    { ip: '127.0.0.1' },
  );

  assert.equal(asaas.customers[0].cpfCnpj, '52998224725');
});

test('usa CPF/CNPJ cifrado do perfil quando JWT nao possui documento', async () => {
  const repo = new FakeRepo({ profileCpfCnpj: '52998224725' });
  const asaas = new FakeAsaas();
  const service = new ProfessionalPaymentService(repo, asaas, { webhookToken: 'x'.repeat(32) });

  await service.criarCobranca(
    { id: USER_ID, email: 'teste@barberflow.test' },
    { proType: 'barbeiro', planType: 'mensal', billingType: 'UNDEFINED' },
    { ip: '127.0.0.1' },
  );

  assert.equal(asaas.customers[0].cpfCnpj, '52998224725');
});

test('diferencia documento cifrado ilegivel de documento ausente', async () => {
  const repo = new FakeRepo({ profileCpfCnpjEncPresent: true });
  const asaas = new FakeAsaas();
  const service = new ProfessionalPaymentService(repo, asaas, { webhookToken: 'x'.repeat(32) });

  await assert.rejects(
    () => service.criarCobranca(
      { id: USER_ID, email: 'teste@barberflow.test' },
      { proType: 'barbeiro', planType: 'mensal', billingType: 'UNDEFINED' },
      { ip: '127.0.0.1' },
    ),
    err => err.status === 503 && /Documento profissional cadastrado/.test(err.message),
  );
  assert.equal(asaas.customers.length, 0);
  assert.equal(asaas.payments.length, 0);
});

test('atualiza cliente Asaas existente com CPF/CNPJ antes da cobranca', async () => {
  const repo = new FakeRepo({
    existingCustomer: {
      id: '22222222-2222-4222-8222-222222222222',
      user_id: USER_ID,
      asaas_customer_id: 'cus_existente',
      name: 'Profissional Teste',
      email: 'teste@barberflow.test',
      mobile_phone: '11999999999',
    },
  });
  const asaas = new FakeAsaas();
  const service = new ProfessionalPaymentService(repo, asaas, { webhookToken: 'x'.repeat(32) });

  await service.criarCobranca(
    { id: USER_ID, email: 'teste@barberflow.test' },
    {
      proType: 'barbeiro',
      planType: 'mensal',
      billingType: 'PIX',
      customer: { cpfCnpj: '11.444.777/0001-61' },
    },
    { ip: '127.0.0.1' },
  );

  assert.equal(asaas.customers.length, 0);
  assert.equal(asaas.updatedCustomers[0].customerId, 'cus_existente');
  assert.equal(asaas.updatedCustomers[0].payload.cpfCnpj, '11444777000161');
  assert.equal(asaas.payments[0].customer, 'cus_existente');
});

test('renovacao usa cliente Asaas existente mesmo se metadata do documento falhar', async () => {
  const repo = new FakeRepo({
    authMetadataError: new Error('auth metadata indisponivel'),
    existingCustomer: {
      id: '22222222-2222-4222-8222-222222222222',
      user_id: USER_ID,
      asaas_customer_id: 'cus_existente',
      name: 'Profissional Teste',
      email: 'teste@barberflow.test',
      mobile_phone: '11999999999',
    },
  });
  const asaas = new FakeAsaas();
  const service = new ProfessionalPaymentService(repo, asaas, { webhookToken: 'x'.repeat(32) });

  const result = await service.criarCobranca(
    { id: USER_ID, email: 'teste@barberflow.test' },
    { proType: 'barbeiro', planType: 'mensal', billingType: 'PIX' },
    { ip: '127.0.0.1' },
  );

  assert.equal(result.asaasPaymentId, 'pay_123');
  assert.equal(asaas.customers.length, 0);
  assert.equal(asaas.updatedCustomers.length, 0);
  assert.equal(asaas.payments[0].customer, 'cus_existente');
});

test('renovacao usa cliente Asaas recuperado de pagamento anterior sem CPF/CNPJ', async () => {
  const repo = new FakeRepo({
    existingCustomer: {
      id: null,
      user_id: USER_ID,
      asaas_customer_id: 'cus_pagamento_antigo',
      name: null,
      email: null,
      mobile_phone: null,
      recovered_from_payment: true,
    },
  });
  const asaas = new FakeAsaas();
  const service = new ProfessionalPaymentService(repo, asaas, { webhookToken: 'x'.repeat(32) });

  const result = await service.criarCobranca(
    { id: USER_ID, email: 'teste@barberflow.test' },
    { proType: 'barbearia', planType: 'mensal', billingType: 'UNDEFINED' },
    { ip: '127.0.0.1' },
  );

  assert.equal(result.asaasPaymentId, 'pay_123');
  assert.equal(asaas.customers.length, 0);
  assert.equal(asaas.updatedCustomers.length, 0);
  assert.equal(asaas.payments[0].customer, 'cus_pagamento_antigo');
});

test('normaliza dados opcionais antes de enviar ao Asaas', async () => {
  const repo = new FakeRepo({
    profilePhone: '+55 (11) 99999-9999',
    authMetadata: { cpf_cnpj: '529.982.247-25' },
  });
  const asaas = new FakeAsaas();
  const service = new ProfessionalPaymentService(repo, asaas, { webhookToken: 'x'.repeat(32) });

  await service.criarCobranca(
    { id: USER_ID, email: 'teste@barberflow.test' },
    {
      proType: 'barbeiro',
      planType: 'mensal',
      billingType: 'PIX',
      customer: { cpfCnpj: '123' },
    },
    { ip: '::1' },
  );

  assert.equal(asaas.customers[0].mobilePhone, '11999999999');
  assert.equal(asaas.customers[0].cpfCnpj, '52998224725');
  assert.equal('remoteIp' in asaas.payments[0], false);
});

test('bloqueia cobranca sem CPF/CNPJ antes de chamar Asaas', async () => {
  const repo = new FakeRepo();
  const asaas = new FakeAsaas();
  const service = new ProfessionalPaymentService(repo, asaas, { webhookToken: 'x'.repeat(32) });

  await assert.rejects(
    () => service.criarCobranca(
      { id: USER_ID, email: 'teste@barberflow.test' },
      { proType: 'barbeiro', planType: 'mensal', billingType: 'PIX' },
      { ip: '127.0.0.1' },
    ),
    err => err.status === 400 && /CPF ou CNPJ/.test(err.message),
  );
  assert.equal(asaas.customers.length, 0);
  assert.equal(asaas.payments.length, 0);
});

test('bloqueia plano invalido antes de chamar Asaas', async () => {
  const repo = new FakeRepo();
  const asaas = new FakeAsaas();
  const service = new ProfessionalPaymentService(repo, asaas, { webhookToken: 'x'.repeat(32) });

  await assert.rejects(
    () => service.criarCobranca({ id: USER_ID }, { proType: 'barbeiro', planType: 'anual' }),
    err => err.status === 400,
  );
  assert.equal(asaas.payments.length, 0);
});

test('bloqueia cobranca para usuario que nao e profissional', async () => {
  const repo = new FakeRepo({ profileRole: 'client' });
  const service = new ProfessionalPaymentService(repo, new FakeAsaas(), { webhookToken: 'x'.repeat(32) });

  await assert.rejects(
    () => service.criarCobranca({ id: USER_ID }, { planType: 'mensal' }),
    err => err.status === 403,
  );
});

test('ativa trial para profissional autenticado', async () => {
  const repo = new FakeRepo();
  const service = new ProfessionalPaymentService(repo, new FakeAsaas(), { webhookToken: 'x'.repeat(32) });

  const result = await service.ativarTrial({ id: USER_ID, email: 'teste@barberflow.test' });

  assert.equal(result.planType, 'trial');
  assert.equal(result.status, 'trial');
  assert.equal(result.price, 0);
  assert.equal(repo.expiredSubscriptions, 1);
});

test('bloqueia trial para usuario que nao e profissional', async () => {
  const repo = new FakeRepo({ profileRole: 'client' });
  const service = new ProfessionalPaymentService(repo, new FakeAsaas(), { webhookToken: 'x'.repeat(32) });

  await assert.rejects(
    () => service.ativarTrial({ id: USER_ID }),
    err => err.status === 403,
  );
});

test('status de assinatura permite acesso quando plano esta ativo e vigente', async () => {
  const repo = new FakeRepo();
  repo.subscription = {
    id: '55555555-5555-4555-8555-555555555555',
    user_id: USER_ID,
    plan_type: 'mensal',
    status: 'active',
    starts_at: '2026-06-26T12:00:00.000Z',
    ends_at: new Date(Date.now() + 86400000).toISOString(),
    price: 5.00,
    purchase_token: 'pay_123',
  };
  const service = new ProfessionalPaymentService(repo, new FakeAsaas(), { webhookToken: 'x'.repeat(32) });

  const status = await service.buscarStatusAssinatura({ id: USER_ID });

  assert.equal(status.accessAllowed, true);
  assert.equal(status.reason, 'active_subscription');
  assert.equal(status.subscription.planType, 'mensal');
});

test('status de assinatura bloqueia quando plano esta expirado', async () => {
  const repo = new FakeRepo();
  repo.subscription = {
    id: '55555555-5555-4555-8555-555555555555',
    user_id: USER_ID,
    plan_type: 'mensal',
    status: 'active',
    starts_at: '2026-06-26T12:00:00.000Z',
    ends_at: new Date(Date.now() - 86400000).toISOString(),
    price: 5.00,
    purchase_token: 'pay_123',
  };
  const service = new ProfessionalPaymentService(repo, new FakeAsaas(), { webhookToken: 'x'.repeat(32) });

  const status = await service.buscarStatusAssinatura({ id: USER_ID });

  assert.equal(status.accessAllowed, false);
  assert.equal(status.reason, 'expired_subscription');
});

test('status de assinatura bloqueia quando nao existe assinatura', async () => {
  const service = new ProfessionalPaymentService(new FakeRepo(), new FakeAsaas(), { webhookToken: 'x'.repeat(32) });

  const status = await service.buscarStatusAssinatura({ id: USER_ID });

  assert.equal(status.accessAllowed, false);
  assert.equal(status.reason, 'missing_subscription');
});

test('consulta cobranca somente do profissional autenticado', async () => {
  const repo = new FakeRepo();
  const service = new ProfessionalPaymentService(repo, new FakeAsaas(), { webhookToken: 'x'.repeat(32) });
  repo.payment = {
    id: '33333333-3333-4333-8333-333333333333',
    user_id: USER_ID,
    asaas_payment_id: 'pay_123',
    plan_type: 'mensal',
    pro_type: 'barbeiro',
    billing_type: 'PIX',
    status: 'PENDING',
    value: 5.00,
    due_date: '2026-06-26',
    invoice_url: 'https://sandbox.asaas.com/i/pay_123',
    bank_slip_url: null,
    pix_payload: null,
    pix_expiration_date: null,
    paid_at: null,
    created_at: '2026-06-26T12:00:00.000Z',
  };

  const own = await service.buscarCobranca({ id: USER_ID }, repo.payment.id);
  assert.equal(own.asaasPaymentId, 'pay_123');

  await assert.rejects(
    () => service.buscarCobranca(
      { id: '99999999-9999-4999-8999-999999999999' },
      repo.payment.id,
    ),
    err => err.status === 404,
  );
});

test('consulta cobranca sincroniza pagamento recebido e ativa assinatura', async () => {
  const repo = new FakeRepo();
  const service = new ProfessionalPaymentService(repo, new FakeAsaas(), { webhookToken: 'x'.repeat(32) });
  repo.payment = {
    id: '33333333-3333-4333-8333-333333333333',
    user_id: USER_ID,
    asaas_payment_id: 'pay_123',
    plan_type: 'mensal',
    pro_type: 'barbeiro',
    billing_type: 'UNDEFINED',
    status: 'PENDING',
    value: 5.00,
    due_date: '2026-06-26',
    invoice_url: 'https://sandbox.asaas.com/i/pay_123',
    bank_slip_url: null,
    pix_payload: null,
    pix_expiration_date: null,
    paid_at: null,
    created_at: '2026-06-26T12:00:00.000Z',
  };

  const own = await service.buscarCobranca({ id: USER_ID }, repo.payment.id);

  assert.equal(own.status, 'RECEIVED');
  assert.equal(repo.subscription.status, 'active');
  assert.equal(repo.subscription.purchase_token, 'pay_123');
});

test('webhook Asaas exige token configurado', async () => {
  const service = new ProfessionalPaymentService(new FakeRepo(), new FakeAsaas(), {
    webhookToken: 'token-seguro-token-seguro-123456',
  });

  await assert.rejects(
    () => service.receberWebhook({}, { id: 'evt_1', event: 'PAYMENT_RECEIVED' }),
    err => err.status === 401,
  );
});

test('webhook Asaas rejeita token invalido', async () => {
  const service = new ProfessionalPaymentService(new FakeRepo(), new FakeAsaas(), {
    webhookToken: 'token-seguro-token-seguro-123456',
  });

  await assert.rejects(
    () => service.receberWebhook(
      { 'asaas-access-token': 'token-invalido-token-invalido-000' },
      { id: 'evt_1', event: 'PAYMENT_RECEIVED' },
    ),
    err => err.status === 401,
  );
});

test('webhook pago atualiza pagamento e ativa assinatura', async () => {
  const repo = new FakeRepo();
  const service = new ProfessionalPaymentService(repo, new FakeAsaas(), {
    webhookToken: 'token-seguro-token-seguro-123456',
  });
  repo.payment = {
    id: '33333333-3333-4333-8333-333333333333',
    user_id: USER_ID,
    asaas_payment_id: 'pay_123',
    plan_type: 'mensal',
    pro_type: 'barbeiro',
    billing_type: 'PIX',
    status: 'PENDING',
    value: 5.00,
    due_date: '2026-06-26',
    invoice_url: 'https://sandbox.asaas.com/i/pay_123',
    bank_slip_url: null,
    pix_payload: null,
    pix_expiration_date: null,
    paid_at: null,
    created_at: '2026-06-26T12:00:00.000Z',
  };

  const result = await service.receberWebhook(
    { 'asaas-access-token': 'token-seguro-token-seguro-123456' },
    {
      id: 'evt_1',
      event: 'PAYMENT_RECEIVED',
      payment: { id: 'pay_123', status: 'RECEIVED', invoiceUrl: 'https://sandbox.asaas.com/i/pay_123' },
    },
  );

  assert.equal(result.received, true);
  assert.equal(result.subscriptionActivated, true);
  assert.equal(repo.payment.status, 'RECEIVED');
  assert.equal(repo.subscription.status, 'active');
});

test('webhook duplicado nao ativa assinatura duas vezes', async () => {
  const repo = new FakeRepo();
  const service = new ProfessionalPaymentService(repo, new FakeAsaas(), {
    webhookToken: 'token-seguro-token-seguro-123456',
  });
  repo.payment = {
    id: '33333333-3333-4333-8333-333333333333',
    user_id: USER_ID,
    asaas_payment_id: 'pay_123',
    plan_type: 'mensal',
    pro_type: 'barbeiro',
    billing_type: 'PIX',
    status: 'PENDING',
    value: 5.00,
    due_date: '2026-06-26',
    invoice_url: 'https://sandbox.asaas.com/i/pay_123',
    bank_slip_url: null,
    pix_payload: null,
    pix_expiration_date: null,
    paid_at: null,
    created_at: '2026-06-26T12:00:00.000Z',
  };
  const headers = { 'asaas-access-token': 'token-seguro-token-seguro-123456' };
  const body = {
    id: 'evt_1',
    event: 'PAYMENT_RECEIVED',
    payment: { id: 'pay_123', status: 'RECEIVED' },
  };

  const first = await service.receberWebhook(headers, body);
  const second = await service.receberWebhook(headers, body);

  assert.equal(first.subscriptionActivated, true);
  assert.equal(second.duplicate, true);
  assert.equal(repo.expiredSubscriptions, 1);
  assert.equal(repo.subscription.purchase_token, 'pay_123');
});

test('webhook com novo evento para pagamento ja ativado reutiliza assinatura existente', async () => {
  const repo = new FakeRepo();
  const service = new ProfessionalPaymentService(repo, new FakeAsaas(), {
    webhookToken: 'token-seguro-token-seguro-123456',
  });
  repo.payment = {
    id: '33333333-3333-4333-8333-333333333333',
    user_id: USER_ID,
    asaas_payment_id: 'pay_123',
    plan_type: 'mensal',
    pro_type: 'barbeiro',
    billing_type: 'PIX',
    status: 'RECEIVED',
    value: 5.00,
    due_date: '2026-06-26',
    invoice_url: 'https://sandbox.asaas.com/i/pay_123',
    bank_slip_url: null,
    pix_payload: null,
    pix_expiration_date: null,
    paid_at: '2026-06-26T12:00:00.000Z',
    created_at: '2026-06-26T12:00:00.000Z',
  };
  const headers = { 'asaas-access-token': 'token-seguro-token-seguro-123456' };

  await service.receberWebhook(headers, {
    id: 'evt_1',
    event: 'PAYMENT_RECEIVED',
    payment: { id: 'pay_123', status: 'RECEIVED' },
  });
  await service.receberWebhook(headers, {
    id: 'evt_2',
    event: 'PAYMENT_CONFIRMED',
    payment: { id: 'pay_123', status: 'CONFIRMED' },
  });

  assert.equal(repo.expiredSubscriptions, 1);
  assert.equal(repo.subscription.purchase_token, 'pay_123');
});
