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

  async listarAgreements(barbershopId, ate) {
    const { data, error } = await this._db
      .from('agreements')
      .select('id, professional_id, barbershop_id, type, value, is_active, valid_from, valid_until')
      .eq('barbershop_id', barbershopId)
      .eq('type', 'percentage')
      .eq('is_active', true)
      .lte('valid_from', ate.toISOString())
      .or(`valid_until.is.null,valid_until.gte.${ate.toISOString()}`)
      .order('valid_from', { ascending: false });

    if (error) this._throwDbError(error, 'listarAgreements');
    return data || [];
  }

  async listarProfissionais(barbershopId) {
    const { data: links, error: linksError } = await this._db
      .from('professional_shop_links')
      .select('professional_id, is_active')
      .eq('barbershop_id', barbershopId);

    if (linksError) this._throwDbError(linksError, 'listarProfissionais.links');

    const ids = [...new Set((links || []).map(link => link.professional_id).filter(Boolean))];
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

    return (links || []).map(link => {
      const profissional = profissionaisMap.get(link.professional_id) || {};
      const perfil = perfisMap.get(link.professional_id) || {};
      return {
        professionalId: link.professional_id,
        nome: perfil.full_name || 'Profissional',
        avatarUrl: profissional.avatar_path || perfil.avatar_path || '',
        ativo: link.is_active !== false && profissional.is_active !== false && perfil.is_active !== false,
      };
    });
  }

  async listarStatusEquipe(barbershopId) {
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

  async aplicarTaxaMetodo(userId, barbershopId, metodo, periodo, porcentagem) {    const { data, error } = await this._db.rpc('aplicar_desconto_metodo', {
      p_barbershop_id: barbershopId,
      p_metodo: metodo,
      p_de: periodo.de,
      p_ate: periodo.ate,
      p_porcentagem: porcentagem,
      p_user_id: userId,
    });

    if (error) this._throwDbError(error, 'aplicarTaxaMetodo');
    return data;
  }
}

module.exports = FinanceiroRepository;
