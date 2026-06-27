'use strict';

const crypto = require('node:crypto');

const BaseService = require('./BaseService');
const AppError = require('../utils/AppError');

const PLANOS = {
  barbeiro: {
    mensal: { value: 24.90, months: 1, description: 'BarberFlow Pro Barbeiro - Plano Mensal' },
    trimestral: { value: 59.90, months: 3, description: 'BarberFlow Pro Barbeiro - Plano Trimestral' },
  },
  barbearia: {
    mensal: { value: 54.90, months: 1, description: 'BarberFlow Pro Barbearia - Plano Mensal' },
    trimestral: { value: 139.90, months: 3, description: 'BarberFlow Pro Barbearia - Plano Trimestral' },
  },
};

const STATUS_PAGO = new Set(['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH']);

class ProfessionalPaymentService extends BaseService {
  #repo;
  #asaas;
  #webhookToken;

  constructor(repo, asaasClient, { webhookToken = process.env.ASAAS_WEBHOOK_TOKEN } = {}) {
    super('ProfessionalPaymentService');
    this.#repo = repo;
    this.#asaas = asaasClient;
    this.#webhookToken = webhookToken ?? '';
  }

  async criarCobranca(user, body = {}, meta = {}) {
    const userId = user?.id;
    this._uuid('userId', userId);

    const proType = this.#normalizarProType(body.proType ?? body.pro_type ?? 'barbeiro');
    const planType = this.#normalizarPlanType(body.planType ?? body.plan_type ?? body.plano);
    const billingType = this.#normalizarBillingType(body.billingType ?? body.billing_type ?? 'PIX');
    const plano = PLANOS[proType]?.[planType];
    if (!plano) throw AppError.badRequest('Plano invalido.');

    const profile = await this.#repo.getProfile(userId);
    this.#assertProfessional(profile);

    const authMetadata = typeof this.#repo.getAuthUserMetadata === 'function'
      ? await this.#repo.getAuthUserMetadata(userId)
      : {};
    const dadosCliente = this.#montarDadosCliente({ profile, user, body, authMetadata });
    if (!dadosCliente.cpfCnpj) {
      throw AppError.badRequest('CPF ou CNPJ do cadastro profissional e obrigatorio para gerar cobranca.');
    }
    let customer = await this.#repo.getCustomerByUser(userId);
    if (!customer) {
      const asaasCustomer = await this.#asaas.criarCliente(dadosCliente);
      customer = await this.#repo.salvarCustomer({
        userId,
        asaasCustomerId: asaasCustomer.id,
        name: dadosCliente.name,
        email: dadosCliente.email ?? null,
        mobilePhone: dadosCliente.mobilePhone ?? null,
      });
    } else if (dadosCliente.cpfCnpj && typeof this.#asaas.atualizarCliente === 'function') {
      await this.#asaas.atualizarCliente(customer.asaas_customer_id, {
        cpfCnpj: dadosCliente.cpfCnpj,
        name: customer.name || dadosCliente.name,
        ...(customer.email || dadosCliente.email ? { email: customer.email || dadosCliente.email } : {}),
        ...(customer.mobile_phone || dadosCliente.mobilePhone
          ? { mobilePhone: customer.mobile_phone || dadosCliente.mobilePhone }
          : {}),
      });
    }

    const dueDate = this.#normalizarDueDate(body.dueDate ?? body.due_date);
    const description = this._texto('description', body.description ?? plano.description, 240, false)
      || plano.description;

    const remoteIp = this.#normalizarRemoteIp(meta.ip);
    const payloadCobranca = {
      customer: customer.asaas_customer_id,
      billingType,
      value: plano.value,
      dueDate,
      description,
      externalReference: `${userId}:${proType}:${planType}:${Date.now()}`,
    };
    if (remoteIp) payloadCobranca.remoteIp = remoteIp;

    const asaasPayment = await this.#asaas.criarCobranca(payloadCobranca);

    let pix = null;
    if (billingType === 'PIX' && asaasPayment?.id) {
      pix = await this.#asaas.buscarPixQrCode(asaasPayment.id).catch(() => null);
    }

    const payment = await this.#repo.criarPagamento({
      user_id: userId,
      barbershop_id: null,
      asaas_customer_id: customer.asaas_customer_id,
      asaas_payment_id: asaasPayment.id,
      plan_type: planType,
      pro_type: proType,
      billing_type: billingType,
      status: asaasPayment.status ?? 'PENDING',
      value: plano.value,
      due_date: dueDate,
      description,
      invoice_url: asaasPayment.invoiceUrl ?? null,
      bank_slip_url: asaasPayment.bankSlipUrl ?? null,
      pix_payload: pix?.payload ?? null,
      pix_expiration_date: pix?.expirationDate ?? null,
      raw_payload: this.#safeRawPayload(asaasPayment),
    });

    return this.#toPaymentDto(payment);
  }

  async buscarCobranca(user, paymentId) {
    const userId = user?.id;
    this._uuid('userId', userId);
    this._uuid('paymentId', paymentId);
    const payment = await this.#repo.getPaymentForUser(userId, paymentId);
    if (!payment) throw AppError.notFound('Cobranca nao encontrada.');
    return this.#toPaymentDto(payment);
  }

  async ativarTrial(user) {
    const userId = user?.id;
    this._uuid('userId', userId);

    const profile = await this.#repo.getProfile(userId);
    this.#assertProfessional(profile);

    const subscription = await this.#repo.ativarTrial(userId);
    return this.#toSubscriptionDto(subscription);
  }

  async receberWebhook(headers = {}, body = {}) {
    this.#validarWebhookToken(headers);
    const eventId = this._texto('eventId', body.id, 120, true);
    const eventType = this._texto('event', body.event, 80, true);
    const asaasPayment = body.payment ?? null;
    const asaasPaymentId = asaasPayment?.id ?? null;

    let payment = asaasPaymentId ? await this.#repo.getPaymentByAsaasId(asaasPaymentId) : null;
    const registered = await this.#repo.registrarWebhookEvento({
      eventId,
      eventType,
      asaasPaymentId,
      paymentId: payment?.id ?? null,
      payload: this.#safeWebhookPayload(body),
    });
    if (registered.duplicate) return { received: true, duplicate: true };

    let subscription = null;
    if (payment && asaasPayment) {
      payment = await this.#repo.atualizarPagamentoPorAsaasId(asaasPaymentId, {
        status: asaasPayment.status ?? payment.status,
        invoice_url: asaasPayment.invoiceUrl ?? payment.invoice_url,
        bank_slip_url: asaasPayment.bankSlipUrl ?? payment.bank_slip_url,
        paid_at: STATUS_PAGO.has(asaasPayment.status)
          ? (asaasPayment.paymentDate ?? asaasPayment.clientPaymentDate ?? new Date().toISOString())
          : payment.paid_at,
        raw_payload: this.#safeRawPayload(asaasPayment),
      });

      if (payment && STATUS_PAGO.has(payment.status)) {
        subscription = await this.#repo.ativarAssinaturaPorPagamento(payment);
      }
    }

    return {
      received: true,
      duplicate: false,
      paymentKnown: Boolean(payment),
      subscriptionActivated: Boolean(subscription),
    };
  }

  #assertProfessional(profile) {
    if (!profile) throw AppError.forbidden('Perfil profissional nao encontrado.');
    if (profile.is_active === false) throw AppError.forbidden('Perfil profissional inativo.');
    if (profile.role !== 'professional') {
      throw AppError.forbidden('Pagamento disponivel apenas no app profissional.');
    }
  }

  #montarDadosCliente({ profile, user, body, authMetadata = {} }) {
    const customer = body.customer ?? {};
    const name = this._texto('customer.name', customer.name ?? profile.full_name, 120, true);
    const cpfCnpj = this.#normalizarCpfCnpjDeCandidatos([
      customer.cpfCnpj,
      customer.cpf_cnpj,
      body.cpfCnpj,
      body.cpf_cnpj,
      user?.user_metadata?.cpf_cnpj,
      user?.user_metadata?.cpfCnpj,
      user?.user_metadata?.cpf,
      user?.user_metadata?.cnpj,
      authMetadata.cpf_cnpj,
      authMetadata.cpfCnpj,
      authMetadata.cpf,
      authMetadata.cnpj,
    ]);
    const mobilePhone = this.#normalizarMobilePhone(customer.mobilePhone ?? customer.mobile_phone ?? profile.phone);
    const email = this._texto('customer.email', customer.email ?? user?.email ?? '', 160, false);

    const payload = { name };
    if (cpfCnpj) payload.cpfCnpj = cpfCnpj;
    if (mobilePhone) payload.mobilePhone = mobilePhone;
    if (email) payload.email = email;
    return payload;
  }

  #normalizarProType(value) {
    const normalized = String(value ?? '').toLowerCase();
    if (!['barbeiro', 'barbearia'].includes(normalized)) {
      throw AppError.badRequest('Tipo profissional invalido.');
    }
    return normalized;
  }

  #normalizarPlanType(value) {
    const normalized = String(value ?? '').toLowerCase();
    if (!['mensal', 'trimestral'].includes(normalized)) {
      throw AppError.badRequest('Plano invalido para cobranca Asaas.');
    }
    return normalized;
  }

  #normalizarBillingType(value) {
    const normalized = String(value ?? '').toUpperCase();
    if (!['PIX', 'BOLETO', 'CREDIT_CARD', 'UNDEFINED'].includes(normalized)) {
      throw AppError.badRequest('Metodo de pagamento invalido.');
    }
    return normalized;
  }

  #normalizarDueDate(value) {
    if (!value) return new Date().toISOString().slice(0, 10);
    const text = String(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      throw AppError.badRequest('dueDate deve estar no formato YYYY-MM-DD.');
    }
    return text;
  }

  #validarWebhookToken(headers) {
    if (!this.#webhookToken) {
      throw AppError.unavailable('Webhook Asaas sem token configurado.');
    }
    const received = headers['asaas-access-token'] ?? headers['Asaas-Access-Token'] ?? '';
    const expected = Buffer.from(String(this.#webhookToken));
    const provided = Buffer.from(String(received));
    if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
      throw AppError.unauthorized('Webhook Asaas nao autorizado.');
    }
  }

  #safeRawPayload(payment) {
    if (!payment || typeof payment !== 'object') return {};
    const { creditCard, creditCardHolderInfo, ...safe } = payment;
    return safe;
  }

  #safeWebhookPayload(body) {
    if (!body || typeof body !== 'object') return {};
    const safe = { ...body };
    if (safe.payment) safe.payment = this.#safeRawPayload(safe.payment);
    return safe;
  }

  #somenteDigitos(value) {
    return String(value ?? '').replace(/\D/g, '');
  }

  #normalizarCpfCnpj(value) {
    const digits = this.#somenteDigitos(value);
    return [11, 14].includes(digits.length) ? digits : null;
  }

  #normalizarCpfCnpjDeCandidatos(candidates) {
    for (const candidate of candidates) {
      const normalized = this.#normalizarCpfCnpj(candidate);
      if (normalized) return normalized;
    }
    return null;
  }

  #normalizarMobilePhone(value) {
    let digits = this.#somenteDigitos(value);
    if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
      digits = digits.slice(2);
    }
    return [10, 11].includes(digits.length) ? digits : null;
  }

  #normalizarRemoteIp(value) {
    const text = String(value ?? '').trim().replace(/^::ffff:/, '');
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(text)) return null;
    const octets = text.split('.').map(Number);
    return octets.every(octet => Number.isInteger(octet) && octet >= 0 && octet <= 255)
      ? text
      : null;
  }

  #toPaymentDto(row) {
    return {
      id: row.id,
      asaasPaymentId: row.asaas_payment_id,
      planType: row.plan_type,
      proType: row.pro_type,
      billingType: row.billing_type,
      status: row.status,
      value: Number(row.value),
      dueDate: row.due_date,
      invoiceUrl: row.invoice_url,
      bankSlipUrl: row.bank_slip_url,
      pix: row.pix_payload ? {
        payload: row.pix_payload,
        expirationDate: row.pix_expiration_date,
      } : null,
      paidAt: row.paid_at,
      createdAt: row.created_at,
    };
  }

  #toSubscriptionDto(row) {
    return {
      id: row.id,
      userId: row.user_id,
      planType: row.plan_type,
      status: row.status,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      price: Number(row.price ?? 0),
    };
  }
}

module.exports = ProfessionalPaymentService;
