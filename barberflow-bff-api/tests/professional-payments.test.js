'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const ProfessionalPaymentService = require('../services/ProfessionalPaymentService');

const USER_ID = '11111111-1111-4111-8111-111111111111';

class FakeRepo {
  constructor({ profileRole = 'professional', existingCustomer = null, profilePhone = '11999999999' } = {}) {
    this.profileRole = profileRole;
    this.profilePhone = profilePhone;
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
    this.payments = [];
  }

  async criarCliente(payload) {
    this.customers.push(payload);
    return { id: 'cus_123' };
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

  async buscarPixQrCode() {
    return {
      payload: '000201010212',
      expirationDate: '2026-06-27T12:00:00.000Z',
    };
  }
}

test('cria cobranca Asaas para profissional autenticado', async () => {
  const repo = new FakeRepo();
  const asaas = new FakeAsaas();
  const service = new ProfessionalPaymentService(repo, asaas, { webhookToken: 'x'.repeat(32) });

  const result = await service.criarCobranca(
    { id: USER_ID, email: 'teste@barberflow.test' },
    { proType: 'barbeiro', planType: 'mensal', billingType: 'PIX' },
    { ip: '127.0.0.1' },
  );

  assert.equal(result.asaasPaymentId, 'pay_123');
  assert.equal(result.invoiceUrl, 'https://sandbox.asaas.com/i/pay_123');
  assert.equal(result.value, 24.90);
  assert.equal(repo.createdPayments[0].billing_type, 'PIX');
  assert.equal(repo.createdPayments[0].barbershop_id, null);
  assert.equal(asaas.customers[0].name, 'Profissional Teste');
});

test('normaliza dados opcionais antes de enviar ao Asaas', async () => {
  const repo = new FakeRepo({ profilePhone: '+55 (11) 99999-9999' });
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
  assert.equal('cpfCnpj' in asaas.customers[0], false);
  assert.equal('remoteIp' in asaas.payments[0], false);
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
    value: 24.90,
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
    value: 24.90,
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
    value: 24.90,
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
    value: 24.90,
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
