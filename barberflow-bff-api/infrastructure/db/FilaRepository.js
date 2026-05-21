'use strict';

const { BaseRepository } = require('../shared/BaseRepository');
const { Result }         = require('../../domain/shared/Result');
const { FilaEntrada }    = require('../../domain/fila/FilaEntrada');

/**
 * FilaRepository — Adaptador Supabase para IFilaRepository.
 * @implements {import('../../domain/fila/ports/IFilaRepository').IFilaRepository}
 */
class FilaRepository extends BaseRepository {
  constructor({ supabaseClient }) {
    super({ supabaseClient, tableName: 'queue_entries' });
  }

  // ── IFilaRepository ────────────────────────────────────────────

  async findById(id) {
    const result = await this._findOne(id);
    if (result.isFail()) return result;
    const row = result.getValue();
    if (!row) return Result.ok(null);
    return this._toDomain(row);
  }

  async findByBarbershop(barbershopId) {
    return this._run(async () => {
      const { data, error } = await this._client
        .from(this._table)
        .select('*')
        .eq('barbershop_id', barbershopId)
        .not('status', 'in', '("done","absent","cancelled")')
        .order('posicao', { ascending: true });

      if (error) return { data: null, error };

      const domainResults = data.map(row => this._toDomain(row));
      const failed = domainResults.find(r => r.isFail());
      if (failed) return { data: null, error: { message: failed.getError() } };

      return { data: domainResults.map(r => r.getValue()), error: null };
    });
  }

  async save(entrada) {
    const row    = this._toRow(entrada);
    const result = await this._upsert(row);
    return result.isOk() ? Result.ok() : result;
  }

  async delete(id) {
    return this._delete(id);
  }

  async countAtivos(barbershopId) {
    return this._run(async () => {
      const { count, error } = await this._client
        .from(this._table)
        .select('id', { count: 'exact', head: true })
        .eq('barbershop_id', barbershopId)
        .not('status', 'in', '("done","absent","cancelled")');

      return { data: count ?? 0, error };
    });
  }

  // ── Mapeamento ─────────────────────────────────────────────────

  _toRow(entrada) {
    return {
      id:              entrada.id,
      barbershop_id:   entrada.barbershopId,
      client_id:       entrada.clienteId,
      professional_id: entrada.profissionalId ?? null,
      service_id:      entrada.serviceId ?? null,
      posicao:         entrada.posicao,
      status:          entrada.status.value,
      confirmacao:     entrada.clienteConfirmado ?? null,
      created_at:      entrada.createdAt.toISOString(),
      updated_at:      entrada.updatedAt.toISOString(),
    };
  }

  _toDomain(row) {
    return FilaEntrada.reconstitute({
      id:              row.id,
      barbershopId:    row.barbershop_id,
      clienteId:       row.client_id,
      profissionalId:  row.professional_id ?? null,
      serviceId:       row.service_id ?? null,
      posicao:         row.posicao,
      status:          row.status,
      clienteConfirmado: row.confirmacao ?? null,
      createdAt:       new Date(row.created_at),
      updatedAt:       new Date(row.updated_at),
    });
  }
}

module.exports = { FilaRepository };
