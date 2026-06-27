'use strict';

const BaseRepository = require('./BaseRepository');

class ProfessionalPaymentRepository extends BaseRepository {
  constructor(db) {
    super('ProfessionalPaymentRepository', db);
  }

  async getProfile(userId) {
    this._uuid('userId', userId);
    const { data, error } = await this._db
      .from('profiles')
      .select('id, full_name, phone, role, pro_type, is_active')
      .eq('id', userId)
      .maybeSingle();
    if (error) this._throwDbError(error, 'getProfile');
    return data ?? null;
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
    return data ?? null;
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
      .select('id, user_id, plan_type, status, starts_at, ends_at, price, purchase_token')
      .eq('purchase_token', purchaseToken)
      .maybeSingle();
    if (error) this._throwDbError(error, 'getSubscriptionByPurchaseToken');
    return data ?? null;
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
        price: payment.value,
      })
      .select('id, user_id, plan_type, status, starts_at, ends_at, price')
      .single();
    if (error?.code === '23505') {
      return this.getSubscriptionByPurchaseToken(payment.asaas_payment_id);
    }
    if (error) this._throwDbError(error, 'ativarAssinaturaPorPagamento');
    return data;
  }
}

module.exports = ProfessionalPaymentRepository;
