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
}

module.exports = ProfessionalVoucherRepository;
