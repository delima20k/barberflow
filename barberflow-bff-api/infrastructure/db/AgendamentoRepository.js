'use strict';

const { BaseRepository }  = require('../shared/BaseRepository');
const { Result }          = require('../../domain/shared/Result');
const { Agendamento }     = require('../../domain/agendamento/Agendamento');

/**
 * AgendamentoRepository — Adaptador Supabase para IAgendamentoRepository.
 * @implements {import('../../domain/agendamento/ports/IAgendamentoRepository').IAgendamentoRepository}
 */
class AgendamentoRepository extends BaseRepository {
  constructor({ supabaseClient }) {
    super({ supabaseClient, tableName: 'appointments' });
  }

  // ── IAgendamentoRepository ─────────────────────────────────────

  async findById(id) {
    const result = await this._findOne(id);
    if (result.isFail()) return result;
    const row = result.getValue();
    if (!row) return Result.ok(null);
    return this._toDomain(row);
  }

  /**
   * @param {string} clienteId
   * @param {{ limit?: number, cursor?: string }} [options]
   */
  async findByCliente(clienteId, options = {}) {
    const { limit = 20, cursor } = options;
    return this._run(async () => {
      let query = this._client
        .from(this._table)
        .select('*')
        .eq('client_id', clienteId)
        .order('scheduled_at', { ascending: false })
        .limit(limit);

      if (cursor) query = query.lt('scheduled_at', cursor);

      const { data, error } = await query;
      if (error) return { data: null, error };

      const domainResults = data.map(row => this._toDomain(row));
      const failed = domainResults.find(r => r.isFail());
      if (failed) return { data: null, error: { message: failed.getError() } };

      return { data: domainResults.map(r => r.getValue()), error: null };
    });
  }

  async save(agendamento) {
    const row    = this._toRow(agendamento);
    const result = await this._upsert(row);
    return result.isOk() ? Result.ok() : result;
  }

  async findConflitos(profissionalId, start, end) {
    return this._run(async () => {
      const { data, error } = await this._client
        .from(this._table)
        .select('id')
        .eq('professional_id', profissionalId)
        .in('status', ['pending', 'confirmed', 'in_progress'])
        .gte('scheduled_at', start.toISOString())
        .lt('scheduled_at', end.toISOString());

      return { data: data ?? [], error };
    });
  }

  // ── Mapeamento ─────────────────────────────────────────────────

  _toRow(agendamento) {
    return {
      id:              agendamento.id,
      client_id:       agendamento.clienteId,
      professional_id: agendamento.profissionalId,
      barbershop_id:   agendamento.barbershopId,
      service_id:      agendamento.serviceId,
      scheduled_at:    agendamento.scheduledAt.toISOString(),
      status:          agendamento.status.value,
      notes:           agendamento.notes ?? null,
      created_at:      agendamento.createdAt.toISOString(),
      updated_at:      agendamento.updatedAt.toISOString(),
    };
  }

  _toDomain(row) {
    return Agendamento.reconstitute({
      id:             row.id,
      clienteId:      row.client_id,
      profissionalId: row.professional_id,
      barbershopId:   row.barbershop_id,
      serviceId:      row.service_id,
      scheduledAt:    new Date(row.scheduled_at),
      status:         row.status,
      notes:          row.notes ?? null,
      createdAt:      new Date(row.created_at),
      updatedAt:      new Date(row.updated_at),
    });
  }
}

module.exports = { AgendamentoRepository };
