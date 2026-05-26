'use strict';

const BaseRepository = require('./BaseRepository');
const AppError       = require('../utils/AppError');

class ConviteRepository extends BaseRepository {

  /** @param {import('@supabase/supabase-js').SupabaseClient} db */
  constructor(db) {
    super('ConviteRepository', db);
  }

  /**
   * Lista convites recebidos pelo profissional autenticado.
   * @param {string} profissionalId
   * @returns {Promise<object[]>}
   */
  async getConvites(profissionalId) {
    this._uuid('profissionalId', profissionalId);

    const { data, error } = await this._db
      .from('barbershop_invites')
      .select('id, commission_pct, message, status, created_at, barbershop:barbershops!barbershop_id(id, name, logo_path, address)')
      .eq('barbeiro_id', profissionalId)
      .neq('status', 'recusado')
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      this._warn('getConvites', error);
      this._throwDbError(error, 'getConvites');
    }
    return data ?? [];
  }

  /**
   * Aceita convite: cria vínculo, registra acordo e atualiza status.
   * @param {string} profissionalId
   * @param {string} inviteId
   * @returns {Promise<{aceito: true}>}
   */
  async aceitarConvite(profissionalId, inviteId) {
    this._uuid('profissionalId', profissionalId);
    this._uuid('inviteId', inviteId);

    const { data: invite, error: errGet } = await this._db
      .from('barbershop_invites')
      .select('id, barbershop_id, barbeiro_id, commission_pct, message, status')
      .eq('id', inviteId)
      .eq('barbeiro_id', profissionalId)
      .maybeSingle();

    if (errGet) {
      this._warn('aceitarConvite fetch', errGet);
      this._throwDbError(errGet, 'aceitarConvite fetch');
    }
    if (!invite) throw AppError.notFound('Convite não encontrado.');
    if (invite.status !== 'pendente') throw AppError.conflict('Convite já respondido.');

    const { data: linkExist } = await this._db
      .from('professional_shop_links')
      .select('professional_id')
      .eq('professional_id', profissionalId)
      .eq('barbershop_id', invite.barbershop_id)
      .eq('is_active', true)
      .maybeSingle();

    if (linkExist) throw AppError.conflict('Barbeiro já vinculado a esta barbearia.');

    const { error: errLink } = await this._db
      .from('professional_shop_links')
      .insert({ professional_id: profissionalId, barbershop_id: invite.barbershop_id, is_active: true });

    if (errLink) {
      this._warn('aceitarConvite link', errLink);
      this._throwDbError(errLink, 'aceitarConvite link');
    }

    const tipo = (invite.message ?? '').startsWith('[Aluguel de Cadeira]')
      ? 'rent'
      : 'percentage';

    const { error: errAgree } = await this._db
      .from('agreements')
      .insert({
        professional_id: profissionalId,
        barbershop_id:   invite.barbershop_id,
        type:            tipo,
        value:           invite.commission_pct,
        is_active:       true,
        valid_from:      new Date().toISOString(),
      });

    if (errAgree) {
      this._warn('aceitarConvite agreement', errAgree);
      this._throwDbError(errAgree, 'aceitarConvite agreement');
    }

    const { error: errUpd } = await this._db
      .from('barbershop_invites')
      .update({ status: 'aceito' })
      .eq('id', inviteId);

    if (errUpd) {
      this._warn('aceitarConvite status', errUpd);
      this._throwDbError(errUpd, 'aceitarConvite status');
    }

    return { aceito: true };
  }

  /**
   * Recusa convite: apenas atualiza status.
   * @param {string} profissionalId
   * @param {string} inviteId
   * @returns {Promise<{recusado: true}>}
   */
  async recusarConvite(profissionalId, inviteId) {
    this._uuid('profissionalId', profissionalId);
    this._uuid('inviteId', inviteId);

    const { data: invite, error: errGet } = await this._db
      .from('barbershop_invites')
      .select('id, barbeiro_id, status')
      .eq('id', inviteId)
      .eq('barbeiro_id', profissionalId)
      .maybeSingle();

    if (errGet) {
      this._warn('recusarConvite fetch', errGet);
      this._throwDbError(errGet, 'recusarConvite fetch');
    }
    if (!invite) throw AppError.notFound('Convite não encontrado.');
    if (invite.status !== 'pendente') throw AppError.conflict('Convite já respondido.');

    const { error: errUpd } = await this._db
      .from('barbershop_invites')
      .update({ status: 'recusado' })
      .eq('id', inviteId);

    if (errUpd) {
      this._warn('recusarConvite status', errUpd);
      this._throwDbError(errUpd, 'recusarConvite status');
    }

    return { recusado: true };
  }
}

module.exports = ConviteRepository;
