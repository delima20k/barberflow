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
        .order('position', { ascending: true });

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

  /**
   * Confere se todos os serviceIds existem, pertencem à barbearia e estão ativos.
   * @param {string} barbershopId
   * @param {string[]} serviceIds
   * @returns {Promise<Result<boolean, string>>}
   */
  async servicosValidos(barbershopId, serviceIds) {
    return this._run(async () => {
      const { data, error } = await this._client
        .from('services')
        .select('id')
        .eq('barbershop_id', barbershopId)
        .eq('is_active', true)
        .in('id', serviceIds);

      if (error) return { data: null, error };

      const encontrados = new Set((data ?? []).map(row => row.id));
      return { data: serviceIds.every(id => encontrados.has(id)), error: null };
    });
  }

  /**
   * Vincula os serviços escolhidos a uma entrada da fila (queue_entry_services).
   * @param {string} queueEntryId
   * @param {string} barbershopId
   * @param {string[]} serviceIds
   * @returns {Promise<Result<void, string>>}
   */
  async linkServicos(queueEntryId, barbershopId, serviceIds) {
    const result = await this._run(async () => {
      const rows = serviceIds.map(serviceId => ({
        queue_entry_id: queueEntryId,
        barbershop_id:  barbershopId,
        service_id:     serviceId,
      }));
      const { error } = await this._client.from('queue_entry_services').insert(rows);
      return { data: null, error };
    });
    return result.isOk() ? Result.ok() : result;
  }

  // ── Mapeamento ─────────────────────────────────────────────────
  // Atenção: a tabela real (queue_entries) usa `position` e `client_confirmed`
  // — não `posicao`/`confirmacao` — e não tem colunas created_at/updated_at
  // (usa check_in_at, populada por default no banco). Serviços escolhidos
  // vivem em queue_entry_services (tabela à parte), não numa coluna aqui.

  _toRow(entrada) {
    const row = {
      id:              entrada.id,
      barbershop_id:   entrada.barbershopId,
      client_id:       entrada.clienteId,
      professional_id: entrada.profissionalId ?? null,
      guest_name:      entrada.guestName ?? null,
      guest_phone:     entrada.guestPhone ?? null,
      position:        entrada.posicao,
      status:          entrada.status.value,
    };
    if (entrada.clienteConfirmado) row.client_confirmed = entrada.clienteConfirmado;
    return row;
  }

  _toDomain(row) {
    return FilaEntrada.reconstitute({
      id:                row.id,
      barbershopId:      row.barbershop_id,
      clienteId:         row.client_id ?? null,
      guestName:         row.guest_name ?? null,
      guestPhone:        row.guest_phone ?? null,
      profissionalId:    row.professional_id ?? null,
      posicao:           row.position,
      status:            row.status,
      clienteConfirmado: row.client_confirmed ?? null,
      createdAt:         new Date(row.check_in_at ?? Date.now()),
      updatedAt:         new Date(row.check_in_at ?? Date.now()),
    });
  }
}

module.exports = { FilaRepository };
