'use strict';

const BaseRepository = require('./BaseRepository');

/**
 * QueuePresenceRepository — candidatos e controle do lembrete recorrente de
 * presenca (cliente em 1o lugar na fila de espera, pergunta "voce ja esta
 * na barbearia?" a cada 10 minutos ate confirmar ou sair da posicao).
 *
 * Camada: infra (usada pela task queue.presence-nudge do Scheduler).
 */
class QueuePresenceRepository extends BaseRepository {

  static #INTERVALO_LEMBRETE_MS = 10 * 60 * 1000;

  constructor(db) {
    super('QueuePresenceRepository', db);
  }

  /**
   * Clientes em 1o lugar na fila de espera, ainda nao confirmados, cujo
   * ultimo lembrete (se houve) foi ha 10 minutos ou mais.
   *
   * @param {number} [limit=50]
   * @returns {Promise<Array<{ entryId: string, clientId: string, barbershopId: string, clientName: string|null }>>}
   */
  async listarCandidatosParaLembrete(limit = 50) {
    const cutoffIso = new Date(Date.now() - QueuePresenceRepository.#INTERVALO_LEMBRETE_MS).toISOString();

    const { data, error } = await this._db
      .from('queue_entries')
      .select('id, client_id, barbershop_id')
      .eq('status', 'waiting')
      .eq('position', 1)
      .not('client_id', 'is', null)
      .is('presence_confirmed_at', null)
      .or(`last_presence_prompt_at.is.null,last_presence_prompt_at.lte.${cutoffIso}`)
      .limit(limit);

    if (error) this._throwDbError(error, 'listarCandidatosParaLembrete');

    const entradas = data ?? [];
    if (!entradas.length) return [];

    const clientIds = [...new Set(entradas.map(e => e.client_id))];
    const { data: perfis, error: perfisErr } = await this._db
      .from('profiles')
      .select('id, full_name')
      .in('id', clientIds);

    if (perfisErr) this._warn('listarCandidatosParaLembrete:profiles', perfisErr);

    const nomesPorId = new Map((perfis ?? []).map(p => [p.id, p.full_name]));

    return entradas.map(e => ({
      entryId:      e.id,
      clientId:     e.client_id,
      barbershopId: e.barbershop_id,
      clientName:   nomesPorId.get(e.client_id) ?? null,
    }));
  }

  /**
   * Registra que um lembrete acabou de ser enviado — reinicia a janela de 10 min.
   * @param {string} entryId
   */
  async marcarLembreteEnviado(entryId) {
    this._uuid('entryId', entryId);
    const { error } = await this._db
      .from('queue_entries')
      .update({ last_presence_prompt_at: new Date().toISOString() })
      .eq('id', entryId);
    if (error) this._throwDbError(error, 'marcarLembreteEnviado');
  }
}

module.exports = { QueuePresenceRepository };
