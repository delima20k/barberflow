'use strict';

// =============================================================
// QueueRepository.js — Repositório da fila ao vivo.
// Abstrai todas as queries Supabase da tabela queue_entries
// e o canal Realtime para atualização sem reload.
//
// Reutilizável pelos apps cliente e profissional.
// Dependências: SupabaseService.js
// =============================================================

class QueueRepository {

  static #SELECT_LIST =
    `id, position, status, check_in_at, served_at,
     client:profiles!client_id(id, full_name, avatar_path),
     professional:professionals!professional_id(id,
       profile:profiles!id(full_name)),
     chair:chairs!chair_id(id, label, status)`;

  // Canal Realtime ativo (um por barbershop_id)
  static #canais = new Map(); // shopId → channel

  // ═══════════════════════════════════════════════════════════
  // LEITURA
  // ═══════════════════════════════════════════════════════════

  /**
   * Retorna a fila ativa (waiting + in_service) de uma barbearia,
   * ordenada por posição.
   * @param {string} barbershopId
   * @returns {Promise<object[]>}
   */
  static async getByBarbershop(barbershopId) {
    const { data, error } = await SupabaseService.queueEntries()
      .select(QueueRepository.#SELECT_LIST)
      .eq('barbershop_id', barbershopId)
      .in('status', ['waiting', 'in_service'])
      .order('position', { ascending: true });

    if (error) throw error;
    return data ?? [];
  }

  /**
   * Retorna as cadeiras de uma barbearia com status ao vivo.
   * @param {string} barbershopId
   * @returns {Promise<object[]>}
   */
  static async getCadeiras(barbershopId) {
    const { data, error } = await SupabaseService.chairs()
      .select('id, label, status, professional:professionals!professional_id(profile:profiles!id(full_name))')
      .eq('barbershop_id', barbershopId)
      .neq('status', 'inativa')
      .order('label', { ascending: true });

    if (error) throw error;
    return data ?? [];
  }

  // ═══════════════════════════════════════════════════════════
  // ESCRITA
  // ═══════════════════════════════════════════════════════════

  /**
   * Atualiza o status de uma entrada da fila.
   * @param {string} id     — UUID da entrada
   * @param {string} status — 'waiting' | 'in_service' | 'done' | 'cancelled'
   * @returns {Promise<object>}
   */
  static async updateStatus(id, status) {
    const validos = ['waiting', 'in_service', 'done', 'cancelled'];
    if (!validos.includes(status)) throw new Error(`Status inválido: ${status}`);

    const patch = { status };
    if (status === 'in_service') patch.served_at = new Date().toISOString();
    if (status === 'done')       patch.done_at   = new Date().toISOString();

    const { data, error } = await SupabaseService.queueEntries()
      .update(patch)
      .eq('id', id)
      .select('id, status, position')
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Adiciona um cliente à fila.
   * @param {object} payload — { barbershop_id, client_id, professional_id?, chair_id?, position }
   * @returns {Promise<object>}
   */
  static async entrar(payload) {
    const { data, error } = await SupabaseService.queueEntries()
      .insert(payload)
      .select('id, position')
      .single();

    if (error) throw error;
    return data;
  }

  // ═══════════════════════════════════════════════════════════
  // REALTIME
  // ═══════════════════════════════════════════════════════════

  /**
   * Inscreve para receber atualizações em tempo real da fila de uma barbearia.
   * Chama o callback com (tipo, payload) a cada evento INSERT/UPDATE/DELETE.
   * @param {string}   barbershopId
   * @param {Function} callback — (tipo: 'INSERT'|'UPDATE'|'DELETE', row: object) => void
   */
  static subscribe(barbershopId, callback) {
    if (QueueRepository.#canais.has(barbershopId)) return; // já inscrito

    const canal = SupabaseService.channel(`queue:${barbershopId}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'queue_entries',
          filter: `barbershop_id=eq.${barbershopId}`,
        },
        (payload) => callback(payload.eventType, payload.new ?? payload.old)
      )
      .subscribe();

    QueueRepository.#canais.set(barbershopId, canal);
  }

  /**
   * Cancela a inscrição Realtime de uma barbearia.
   * @param {string} barbershopId
   */
  static unsubscribe(barbershopId) {
    const canal = QueueRepository.#canais.get(barbershopId);
    if (!canal) return;
    try {
      SupabaseService.removeChannel(canal);
    } catch (_) {}
    QueueRepository.#canais.delete(barbershopId);
  }
}
