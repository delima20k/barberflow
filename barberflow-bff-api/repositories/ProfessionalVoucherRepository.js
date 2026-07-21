'use strict';

const BaseRepository = require('./BaseRepository');

class ProfessionalVoucherRepository extends BaseRepository {
  constructor(db) {
    super('ProfessionalVoucherRepository', db);
  }

  async getByCode(code) {
    const normalized = String(code ?? '').trim().toUpperCase();
    const { data, error } = await this._db
      .from('professional_trial_vouchers')
      .select('id, code, trial_days, is_active, used_at, used_by, expires_at')
      .eq('code', normalized)
      .maybeSingle();

    if (error) this._throwDbError(error, 'getByCode');
    return data ?? null;
  }

  async countAvailable(now = new Date()) {
    const timestamp = now instanceof Date ? now.toISOString() : String(now);
    const { count, error } = await this._db
      .from('professional_trial_vouchers')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .is('used_at', null)
      .is('issued_at', null)
      .or(`expires_at.is.null,expires_at.gt.${timestamp}`);

    if (error || !Number.isInteger(count)) {
      this._throwDbError(error ?? new Error('Contagem de vouchers indisponivel.'), 'countAvailable');
    }
    return count;
  }

  async issueAvailableVoucher({ emailHash }) {
    const { data, error } = await this._db.rpc('issue_professional_trial_voucher', {
      p_email_hash: emailHash,
    });

    if (error) this._throwDbError(error, 'issueAvailableVoucher');
    return Array.isArray(data) ? (data[0] ?? null) : data;
  }
}

module.exports = ProfessionalVoucherRepository;
