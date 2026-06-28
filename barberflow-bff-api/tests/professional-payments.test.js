'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const ProfessionalPaymentService = require('../services/ProfessionalPaymentService');
const AsaasClient = require('../infrastructure/payments/AsaasClient');

const USER_ID = '11111111-1111-4111-8111-111111111111';

class FakeRepo {
  constructor({
    profileRole = 'professional',
    existingCustomer = null,
    profilePhone = '11999999999',
    authMetadata = {},
    authMetadataError = null,
  } = {}) {
    this.profileRole = profileRole;
    this.profilePhone = profilePhone;
    this.authMetadata = authMetadata;
    this.authMetadataError = authMetadataError;
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
  assert.equal(result.value, 5.00);
  assert.equal(repo.createdPayments[0].billing_type, 'PIX');
  assert.equal(repo.createdPayments[0].barbershop_id, null);
  assert.equal(asaas.customers[0].name, 'Profissional Teste');
});

test('cria cobranca com callback seguro para voltar ao app profissional', async () => {
  const repo = new FakeRepo({ authMetadata: { cpf_cnpj: '529.982.247-25' } });
  const asaas = new FakeAsaas();
  const service = new ProfessionalPaymentService(repo, asaas, { webhookToken: 'x'.repeat(32) });

  await service.criarCobranca(
    { id: USER_ID, email: 'teste@barberflow.test' },
    { proType: 'barbeiro', planType: 'mensal', billingType: 'UNDEFINED' },
    { ip: '127.0.0.1', origin: 'https://pro.berberflow.shop' },
  );

  assert.deepEqual(asaas.payments[0].callback, {
    successUrl: 'https://pro.berberflow.shop/?bf_pagamento=retorno',
    autoRedirect: true,
  });
});

test('nao cria callback de pagamento para origem nao permitida', async () => {
  const repo = new FakeRepo({ authMetadata: { cpf_cnpj: '529.982.247-25' } });
  const asaas = new FakeAsaas();
  const service = new ProfessionalPaymentService(repo, asaas, { webhookToken: 'x'.repeat(32) });

  await service.criarCobranca(
    { id: USER_ID, email: 'teste@barberflow.test' },
    { proType: 'barbeiro', planType: 'mensal', billingType: 'UNDEFINED' },
    { ip: '127.0.0.1', origin: 'https://pro.berberflow.shop.evil.com' },
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
