'use strict';

/**
 * ProfissionalPublicProfileDto - contrato publico controlado do perfil do barbeiro.
 *
 * Mantem dados pessoais fora de views publicas do banco e expostos apenas pelo BFF.
 */
class ProfissionalPublicProfileDto {
  /**
   * @param {object} row
   * @returns {object}
   */
  static fromRow(row) {
    return {
      id: row.id ?? row.professional_id,
      fullName: row.full_name ?? null,
      avatarPath: row.avatar_path ?? null,
      bio: row.bio ?? null,
      ratingAvg: row.rating_avg ?? null,
      ratingCount: row.rating_count ?? 0,
      birthDate: row.birth_date ?? null,
      gender: row.gender ?? null,
      sinceYear: row.since_year ?? null,
      barbershop: row.barbershop_id ? {
        id: row.barbershop_id,
        name: row.barbershop_name ?? null,
        address: row.barbershop_address ?? null,
        city: row.barbershop_city ?? null,
        state: row.barbershop_state ?? null,
        ownerId: row.barbershop_owner_id ?? row.owner_id ?? null,
        logoPath: row.barbershop_logo_path ?? row.logo_path ?? null,
        coverPath: row.barbershop_cover_path ?? row.cover_path ?? null,
        isOwnerWorkplace: Boolean(row.barbershop_is_owner_workplace),
        professionalId: row.id ?? row.professional_id,
      } : null,
    };
  }

  /**
   * @param {object} payload
   * @returns {object}
   */
  static fromUpdate(payload) {
    return {
      sinceYear: payload.since_year ?? null,
      birthDate: payload.birth_date ?? null,
      gender: payload.gender ?? null,
    };
  }
}

module.exports = ProfissionalPublicProfileDto;
