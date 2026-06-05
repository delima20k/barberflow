'use strict';

const BaseRepository = require('./BaseRepository');
const AppError = require('../utils/AppError');

/**
 * FinanceiroRepository concentra as leituras financeiras no Supabase/PostgreSQL.
 */
class FinanceiroRepository extends BaseRepository {
  constructor(db) {
    super('FinanceiroRepository', db);
  }

  async verificarAcesso(userId, barbershopId) {
    this._uuid('userId', userId);
    this._uuid('barbershopId', barbershopId);

    const { data: shop, error: shopError } = await this._db
      .from('barbershops')
      .select('id, owner_id, is_active')
      .eq('id', barbershopId)
      .maybeSingle();

    if (shopError) this._throwDbError(shopError, 'verificarAcesso.shop');
    if (!shop) throw AppError.notFound('Barbearia nao encontrada.');
    if (shop.owner_id === userId) return { papel: 'owner', shop };

    const { data: link, error: linkError } = await this._db
      .from('professional_shop_links')
      .select('professional_id, barbershop_id, is_active')
      .eq('professional_id', userId)
      .eq('barbershop_id', barbershopId)
      .eq('is_active', true)
      .maybeSingle();

    if (linkError) this._throwDbError(linkError, 'verificarAcesso.link');
    if (!link) throw AppError.forbidden('Usuario sem vinculo com a barbearia.');

    return { papel: 'professional', shop, link };
  }

  async listarTransacoes(barbershopId, periodo, professionalId = null) {
    let query = this._db
      .from('transactions')
      .select('id, barbershop_id, professional_id, amount, gross_amount, payment_method, status, type, paid_at, created_at')
      .eq('barbershop_id', barbershopId)
      .eq('type', 'revenue')
      .eq('status', 'paid')
      .gte('paid_at', periodo.inicio.toISOString())
      .lte('paid_at', periodo.fim.toISOString())
      .order('paid_at', { ascending: true })
      .limit(5000);

    if (professionalId) query = query.eq('professional_id', professionalId);

    const { data, error } = await query;
    if (error) this._throwDbError(error, 'listarTransacoes');
    return data || [];
  }

  async listarAgreements(barbershopId, ate, professionalId = null) {
    let query = this._db
      .from('agreements')
      .select('id, professional_id, barbershop_id, type, value, is_active, valid_from, valid_until, notes')
      .eq('barbershop_id', barbershopId)
      .in('type', ['percentage', 'fixed', 'rent', 'chair_rental'])
      .eq('is_active', true)
      .lte('valid_from', ate.toISOString())
      .or(`valid_until.is.null,valid_until.gte.${ate.toISOString()}`)
      .order('valid_from', { ascending: false });

    if (professionalId) query = query.eq('professional_id', professionalId);

    const { data, error } = await query;
    if (error) this._throwDbError(error, 'listarAgreements');
    return data || [];
  }

  async listarDespesas(barbershopId, periodo) {
    const { data, error } = await this._db
      .from('transactions')
      .select('id, barbershop_id, amount, gross_amount, payment_method, status, type, paid_at, created_at')
      .eq('barbershop_id', barbershopId)
      .eq('type', 'expense')
      .eq('status', 'paid')
      .gte('paid_at', periodo.inicio.toISOString())
      .lte('paid_at', periodo.fim.toISOString())
      .order('paid_at', { ascending: true })
      .limit(5000);

    if (error) this._throwDbError(error, 'listarDespesas');
    return data || [];
  }

  async listarTaxasMetodoPagamento(barbershopId) {
    this._uuid('barbershop_id', barbershopId);
    const { data, error } = await this._db
      .from('financial_payment_method_fees')
      .select('barbershop_id, payment_method, fee_percent')
      .eq('barbershop_id', barbershopId);

    if (error) this._throwDbError(error, 'listarTaxasMetodoPagamento');
    return data || [];
  }

  async listarPayoutItemsRegistrados(barbershopId, periodo, professionalId = null) {
    let payoutQuery = this._db
      .from('professional_payouts')
      .select('id, barbershop_id, professional_id, status, period_start, period_end')
      .eq('barbershop_id', barbershopId)
      .eq('status', 'confirmed')
      .lte('period_start', periodo.fim.toISOString())
      .gte('period_end', periodo.inicio.toISOString())
      .limit(5000);

    if (professionalId) payoutQuery = payoutQuery.eq('professional_id', professionalId);

    const { data: payouts, error: payoutError } = await payoutQuery;
    if (payoutError) this._throwDbError(payoutError, 'listarPayoutItemsRegistrados.payouts');

    const ids = (payouts || []).map(row => row.id).filter(Boolean);
    if (ids.length === 0) return [];

    const { data: items, error: itemError } = await this._db
      .from('professional_payout_items')
      .select('payout_id, transaction_id, amount')
      .in('payout_id', ids)
      .limit(5000);

    if (itemError) this._throwDbError(itemError, 'listarPayoutItemsRegistrados.items');

    const payoutMap = new Map((payouts || []).map(row => [row.id, row]));
    return (items || []).map(item => {
      const payout = payoutMap.get(item.payout_id) || {};
      return {
        payout_id: item.payout_id,
        transaction_id: item.transaction_id,
        amount: item.amount,
        status: payout.status,
        barbershop_id: payout.barbershop_id,
        professional_id: payout.professional_id,
      };
    });
  }

  async listarAcertosSemanais(barbershopId, professionalId, limite = 8) {
    this._uuid('barbershop_id', barbershopId);
    this._uuid('professional_id', professionalId);

    const { data, error } = await this._db
      .from('professional_weekly_settlements')
      .select('id, barbershop_id, professional_id, period_start, period_end, gross_amount, shop_amount, barber_amount, fees_amount, net_amount, status, confirmed_at, confirmed_by, created_at, updated_at')
      .eq('barbershop_id', barbershopId)
      .eq('professional_id', professionalId)
      .order('period_start', { ascending: false })
      .limit(limite);

    if (error) this._throwDbError(error, 'listarAcertosSemanais');
    return data || [];
  }

  async listarProfissionais(barbershopId, professionalId = null) {
    const [{ data: shop, error: shopError }, { data: links, error: linksError }] = await Promise.all([
      this._db
        .from('barbershops')
        .select('owner_id')
        .eq('id', barbershopId)
        .maybeSingle(),
      this._db
        .from('professional_shop_links')
        .select('professional_id, is_active')
        .eq('barbershop_id', barbershopId)
        .eq('is_active', true),
    ]);

    if (shopError) this._throwDbError(shopError, 'listarProfissionais.shop');
    if (linksError) this._throwDbError(linksError, 'listarProfissionais.links');

    let ids = [...new Set([
      shop?.owner_id,
      ...(links || []).map(link => link.professional_id),
    ].filter(Boolean))];
    if (professionalId) ids = ids.filter(id => id === professionalId);
    if (ids.length === 0) return [];

    const [{ data: profissionais, error: profError }, { data: perfis, error: perfisError }] = await Promise.all([
      this._db
        .from('professionals')
        .select('id, avatar_path, is_active')
        .in('id', ids),
      this._db
        .from('profiles')
        .select('id, full_name, avatar_path, is_active')
        .in('id', ids),
    ]);

    if (profError) this._throwDbError(profError, 'listarProfissionais.professionals');
    if (perfisError) this._throwDbError(perfisError, 'listarProfissionais.profiles');

    const profissionaisMap = new Map((profissionais || []).map(item => [item.id, item]));
    const perfisMap = new Map((perfis || []).map(item => [item.id, item]));

    const linkMap = new Map((links || []).map(link => [link.professional_id, link]));
    return ids.map(id => {
      const link = linkMap.get(id);
      const profissional = profissionaisMap.get(id) || {};
      const perfil = perfisMap.get(id) || {};
      return {
        professionalId: id,
        papel: id === shop?.owner_id ? 'owner' : 'professional',
        vinculado: Boolean(link),
        nome: perfil.full_name || 'Profissional',
        avatarUrl: profissional.avatar_path || perfil.avatar_path || '',
        ativo: (link?.is_active ?? true) !== false && profissional.is_active !== false && perfil.is_active !== false,
      };
    });
  }

  async listarStatusEquipe(barbershopId) {
    const [
      { data: shop, error: shopError },
      { data: presencas, error: presencaError },
    ] = await Promise.all([
      this._db
        .from('barbershops')
        .select('owner_id, is_open')
        .eq('id', barbershopId)
        .maybeSingle(),
      this._db
        .from('professional_barbershop_presence')
        .select('professional_id, is_available')
        .eq('barbershop_id', barbershopId)
        .eq('is_available', true),
    ]);

    if (shopError) this._throwDbError(shopError, 'listarStatusEquipe.shop');

    if (!presencaError) {
      const onlineSet = new Set((presencas || []).map(item => item.professional_id).filter(Boolean));
      if (shop?.is_open === true && shop?.owner_id) onlineSet.add(shop.owner_id);
      const onlineIds = [...onlineSet];
      return { online: onlineIds.length, onlineIds };
    }

    try {
      const { data, error } = await this._db
        .from('attendance_sessions')
        .select('professional_id, finished_at, chair:chairs!chair_id(barbershop_id)')
        .is('finished_at', null);

      if (error) throw error;

      const onlineIds = [...new Set((data || [])
        .filter(item => item?.chair?.barbershop_id === barbershopId)
        .map(item => item.professional_id)
        .filter(Boolean))];

      return { online: onlineIds.length, onlineIds };
    } catch (error) {
      this._warn('listarStatusEquipe', error);
      return { online: 0, onlineIds: [] };
    }
  }

  async listarTotalMensalistas(barbershopId) {
    this._uuid('barbershop_id', barbershopId);
    const agora = new Date().toISOString();
    const { data, error } = await this._db
      .from('barbershop_mensalistas')
      .select('monthly_fee')
      .eq('barbershop_id', barbershopId)
      .gte('ends_at', agora);

    if (error) this._throwDbError(error, 'listarTotalMensalistas');
    const rows = data || [];
    const total = rows.reduce((acc, row) => acc + Number(row.monthly_fee || 0), 0);
    return { total: Math.round(total * 100) / 100, count: rows.length };
  }

  async salvarTaxaMetodoPagamento(userId, barbershopId, metodo, porcentagem) {
    this._uuid('userId', userId);
    this._uuid('barbershop_id', barbershopId);

    const payload = {
      barbershop_id: barbershopId,
      payment_method: metodo,
      fee_percent: porcentagem,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await this._db
      .from('financial_payment_method_fees')
      .upsert(payload, { onConflict: 'barbershop_id,payment_method' })
      .select('barbershop_id, payment_method, fee_percent, updated_at')
      .single();

    if (error) this._throwDbError(error, 'salvarTaxaMetodoPagamento');
    return data;
  }

  async criarPayoutComItens({ createdBy, barbershopId, professionalId, amount, periodo, items }) {
    this._uuid('createdBy', createdBy);
    this._uuid('barbershop_id', barbershopId);
    this._uuid('professional_id', professionalId);

    const { data, error } = await this._db.rpc('confirmar_professional_payout_atomic', {
      p_barbershop_id: barbershopId,
      p_professional_id: professionalId,
      p_amount: amount,
      p_period_start: periodo.inicio.toISOString(),
      p_period_end: periodo.fim.toISOString(),
      p_created_by: createdBy,
      p_transaction_ids: (items || []).map(item => item.transactionId),
      p_item_amounts: (items || []).map(item => item.amount),
    });

    if (error) {
      if (error.code === '23505') {
        throw AppError.conflict('Pagamento ja registrado para um ou mais cortes finalizados/recebidos no periodo.');
      }
      this._throwDbError(error, 'criarPayoutComItens.rpc');
    }
    return data;
  }

  async confirmarAcertoSemanal({ confirmedBy, barbershopId, professionalId, periodo, resumo }) {
    this._uuid('confirmedBy', confirmedBy);
    this._uuid('barbershop_id', barbershopId);
    this._uuid('professional_id', professionalId);

    const payload = {
      barbershop_id: barbershopId,
      professional_id: professionalId,
      period_start: periodo.inicio.toISOString(),
      period_end: periodo.fim.toISOString(),
      gross_amount: resumo.producaoBrutaSemana,
      shop_amount: resumo.valorARepassarBarbearia,
      barber_amount: resumo.participacaoBarbeiro,
      fees_amount: resumo.taxasMaquininha,
      net_amount: resumo.valorLiquidoBarbeiro,
      status: 'paid',
      confirmed_at: new Date().toISOString(),
      confirmed_by: confirmedBy,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await this._db
      .from('professional_weekly_settlements')
      .upsert(payload, { onConflict: 'barbershop_id,professional_id,period_start,period_end' })
      .select('id, barbershop_id, professional_id, period_start, period_end, gross_amount, shop_amount, barber_amount, fees_amount, net_amount, status, confirmed_at, confirmed_by, created_at, updated_at')
      .single();

    if (error) this._throwDbError(error, 'confirmarAcertoSemanal');
    return data;
  }
}

module.exports = FinanceiroRepository;
