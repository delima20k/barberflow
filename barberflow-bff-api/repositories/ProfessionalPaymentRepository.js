'use strict';

const BaseRepository  = require('./BaseRepository');
const DocumentCipher  = require('../infrastructure/crypto/DocumentCipher');

class ProfessionalPaymentRepository extends BaseRepository {
  constructor(db) {
    super('ProfessionalPaymentRepository', db);
  }

  async getProfile(userId) {
    this._uuid('userId', userId);
    const { data, error } = await this._db
      .from('profiles')
      .select('id, full_name, phone, role, pro_type, is_active, cpf_cnpj_enc')
      .eq('id', userId)
      .maybeSingle();
    if (error) this._throwDbError(error, 'getProfile');
    if (!data) return null;

    const { cpf_cnpj_enc, ...rest } = data;
    rest.cpf_cnpj = DocumentCipher.tryDecrypt(cpf_cnpj_enc);
    return rest;
  }

  async getAuthUserMetadata(userId) {
    this._uuid('userId', userId);
    if (typeof this._db.auth?.admin?.getUserById !== 'function') return {};

    const { data, error } = await this._db.auth.admin.getUserById(userId);
    if (error) this._throwDbError(error, 'getAuthUserMetadata');
    return data?.user?.user_metadata ?? {};
  }

  async getCustomerByUser(userId) {
    this._uuid('userId', userId);
    const { data, error } = await this._db
      .from('asaas_customers')
      .select('id, user_id, asaas_customer_id, name, email, mobile_phone, created_at, updated_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) this._throwDbError(error, 'getCustomerByUser');
    if (data) return data;

    const { data: paymentCustomer, error: paymentError } = await this._db
      .from('asaas_payments')
      .select('user_id, asaas_customer_id, created_at, updated_at')
      .eq('user_id', userId)
      .not('asaas_customer_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (paymentError) this._throwDbError(paymentError, 'getCustomerByUser.paymentFallback');
    if (!paymentCustomer?.asaas_customer_id) return null;

    return {
      id: null,
      user_id: paymentCustomer.user_id,
      asaas_customer_id: paymentCustomer.asaas_customer_id,
      name: null,
      email: null,
      mobile_phone: null,
      created_at: paymentCustomer.created_at ?? null,
      updated_at: paymentCustomer.updated_at ?? null,
      recovered_from_payment: true,
    };
  }

  async salvarCustomer({ userId, asaasCustomerId, name, email = null, mobilePhone = null }) {
    this._uuid('userId', userId);
    const payload = {
      user_id: userId,
      asaas_customer_id: asaasCustomerId,
      name,
      email,
      mobile_phone: mobilePhone,
    };
    const { data, error } = await this._db
      .from('asaas_customers')
      .upsert(payload, { onConflict: 'user_id' })
      .select('id, user_id, asaas_customer_id, name, email, mobile_phone, created_at, updated_at')
      .single();
    if (error) this._throwDbError(error, 'salvarCustomer');
    return data;
  }

  async criarPagamento(payload) {
    const { data, error } = await this._db
      .from('asaas_payments')
      .insert(payload)
      .select('*')
      .single();
    if (error) this._throwDbError(error, 'criarPagamento');
    return data;
  }

  async getPaymentForUser(userId, id) {
    this._uuid('userId', userId);
    this._uuid('id', id);
    const { data, error } = await this._db
      .from('asaas_payments')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) this._throwDbError(error, 'getPaymentForUser');
    return data ?? null;
  }

  async getPaymentByAsaasId(asaasPaymentId) {
    const { data, error } = await this._db
      .from('asaas_payments')
      .select('*')
      .eq('asaas_payment_id', asaasPaymentId)
      .maybeSingle();
    if (error) this._throwDbError(error, 'getPaymentByAsaasId');
    return data ?? null;
  }

  async getSubscriptionByPurchaseToken(purchaseToken) {
    const { data, error } = await this._db
      .from('subscriptions')
      .select('id, user_id, plan_type, status, starts_at, ends_at, purchase_token')
      .eq('purchase_token', purchaseToken)
      .maybeSingle();
    if (error) this._throwDbError(error, 'getSubscriptionByPurchaseToken');
    return data ?? null;
  }

  async getCurrentSubscription(userId) {
    this._uuid('userId', userId);
    const { data, error } = await this._db
      .from('subscriptions')
      .select('id, user_id, plan_type, status, starts_at, ends_at, purchase_token')
      .eq('user_id', userId)
      .in('status', ['trial', 'active'])
      .order('ends_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) this._throwDbError(error, 'getCurrentSubscription');
    return data ?? null;
  }

  // Força fechar a(s) barbearia(s) do dono quando ele está sem assinatura ativa.
  // Só escreve se houver alguma aberta (evita writes desnecessários). Assim a
  // barbearia pública aparece "fechada" ao cliente ao expirar o teste/plano.
  async fecharBarbeariasSeAbertas(ownerId) {
    this._uuid('ownerId', ownerId);
    const { data, error } = await this._db
      .from('barbershops')
      .update({ is_open: false })
      .eq('owner_id', ownerId)
      .eq('is_open', true)
      .select('id');
    if (error) this._throwDbError(error, 'fecharBarbeariasSeAbertas');
    return data ?? [];
  }

  async ativarTrial(userId) {
    this._uuid('userId', userId);

    const { error: expireError } = await this._db
      .from('subscriptions')
      .update({ status: 'expired' })
      .eq('user_id', userId)
      .in('status', ['trial', 'active']);
    if (expireError) this._throwDbError(expireError, 'ativarTrial.expirarAtivas');

    const startsAt = new Date();
    const endsAt = new Date(startsAt);
    endsAt.setDate(endsAt.getDate() + 7);

    const { data, error } = await this._db
      .from('subscriptions')
      .insert({
        user_id: userId,
        plan_type: 'trial',
        status: 'trial',
        purchase_token: null,
        platform: 'web',
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
      })
      .select('id, user_id, plan_type, status, starts_at, ends_at')
      .single();
    if (error) this._throwDbError(error, 'ativarTrial');
    return data;
  }

  async atualizarPagamentoPorAsaasId(asaasPaymentId, payload) {
    const { data, error } = await this._db
      .from('asaas_payments')
      .update(payload)
      .eq('asaas_payment_id', asaasPaymentId)
      .select('*')
      .maybeSingle();
    if (error) this._throwDbError(error, 'atualizarPagamentoPorAsaasId');
    return data ?? null;
  }

  async registrarWebhookEvento({ eventId, eventType, asaasPaymentId = null, paymentId = null, payload }) {
    const { data, error } = await this._db
      .from('asaas_webhook_events')
      .insert({
        event_id: eventId,
        event_type: eventType,
        asaas_payment_id: asaasPaymentId,
        payment_id: paymentId,
        payload,
        processed_at: new Date().toISOString(),
      })
      .select('*')
      .single();
    if (error?.code === '23505') return { duplicate: true };
    if (error) this._throwDbError(error, 'registrarWebhookEvento');
    return { duplicate: false, data };
  }

  async ativarAssinaturaPorPagamento(payment) {
    if (!payment?.user_id || !payment?.plan_type) return null;

    const existente = await this.getSubscriptionByPurchaseToken(payment.asaas_payment_id);
    if (existente) return existente;

    const { error: expireError } = await this._db
      .from('subscriptions')
      .update({ status: 'expired' })
      .eq('user_id', payment.user_id)
      .in('status', ['trial', 'active'])
      .or(`purchase_token.is.null,purchase_token.neq.${payment.asaas_payment_id}`);
    if (expireError) this._throwDbError(expireError, 'ativarAssinaturaPorPagamento.expirarAtivas');

    const startsAt = new Date();
    const endsAt = new Date(startsAt);
    endsAt.setMonth(endsAt.getMonth() + (payment.plan_type === 'trimestral' ? 3 : 1));

    const { data, error } = await this._db
      .from('subscriptions')
      .insert({
        user_id: payment.user_id,
        plan_type: payment.plan_type,
        status: 'active',
        purchase_token: payment.asaas_payment_id,
        platform: 'web',
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
      })
      .select('id, user_id, plan_type, status, starts_at, ends_at')
      .single();
    if (error?.code === '23505') {
      return this.getSubscriptionByPurchaseToken(payment.asaas_payment_id);
    }
    if (error) this._throwDbError(error, 'ativarAssinaturaPorPagamento');
    return data;
  }
}

module.exports = ProfessionalPaymentRepository;
