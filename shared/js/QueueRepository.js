'use strict';

// =============================================================
// QueueRepository.js — Repositório da fila ao vivo.
// Abstrai todas as queries Supabase da tabela queue_entries
// e o canal Realtime para atualização sem reload.
//
// Reutilizável pelos apps cliente e profissional.
// Dependências: ApiService.js, SupabaseService.js (Realtime)
// =============================================================

class QueueRepository {

  static #SELECT_LIST =
    'id, position, status, check_in_at, served_at, guest_name, client_confirmed, client_id, professional_id, chair_id';

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
    const { data, error } = await ApiService.from('queue_entries')
      .select(QueueRepository.#SELECT_LIST)
      .eq('barbershop_id', barbershopId)
      .in('status', ['waiting', 'in_service'])
      .order('position', { ascending: true });

    if (error) throw error;
    return QueueRepository.#hidratarFila(data ?? []);
  }

  /**
   * Retorna as cadeiras de uma barbearia com status ao vivo.
   * @param {string} barbershopId
   * @returns {Promise<object[]>}
   */
  static async getCadeiras(barbershopId) {
    const { data, error } = await ApiService.from('chairs')
      .select('id, label, status, professional_id')
      .eq('barbershop_id', barbershopId)
      .neq('status', 'inativa')
      .order('label', { ascending: true });

    if (error) throw error;
    return QueueRepository.#hidratarCadeiras(data ?? []);
  }

  static async #hidratarFila(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return [];

    const clientIds = QueueRepository.#idsUnicos(rows.map(row => row.client_id));
    const professionalIds = QueueRepository.#idsUnicos(rows.map(row => row.professional_id));
    const chairIds = QueueRepository.#idsUnicos(rows.map(row => row.chair_id));

    const [clientes, profissionais, cadeiras] = await Promise.all([
      QueueRepository.#buscarPerfisPublicos(clientIds),
      QueueRepository.#buscarPerfisPublicos(professionalIds),
      QueueRepository.#buscarCadeirasPorIds(chairIds),
    ]);

    return rows.map(row => ({
      ...row,
      client: row.client_id ? (clientes.get(row.client_id) ?? null) : null,
      professional: row.professional_id
        ? {
            id: row.professional_id,
            profile: {
              full_name: profissionais.get(row.professional_id)?.full_name ?? null,
            },
          }
        : null,
      chair: row.chair_id ? (cadeiras.get(row.chair_id) ?? null) : null,
    }));
  }

  static async #hidratarCadeiras(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return [];

    const professionalIds = QueueRepository.#idsUnicos(rows.map(row => row.professional_id));
    const profissionais = await QueueRepository.#buscarPerfisPublicos(professionalIds);

    return rows.map(row => ({
      ...row,
      professional: row.professional_id
        ? {
            id: row.professional_id,
            profile: {
              full_name: profissionais.get(row.professional_id)?.full_name ?? null,
            },
          }
        : null,
    }));
  }

  static async #buscarPerfisPublicos(ids) {
    const map = new Map();
    if (!ids.length) return map;

    const { data, error } = await ApiService.from('profiles_public')
      .select('id, full_name, avatar_path, updated_at')
      .in('id', ids);
    if (error) throw error;

    for (const perfil of (data ?? [])) {
      if (perfil?.id) map.set(perfil.id, perfil);
    }
    return map;
  }

  static async #buscarCadeirasPorIds(ids) {
    const map = new Map();
    if (!ids.length) return map;

    const { data, error } = await ApiService.from('chairs')
      .select('id, label, status')
      .in('id', ids);
    if (error) throw error;

    for (const cadeira of (data ?? [])) {
      if (cadeira?.id) map.set(cadeira.id, cadeira);
    }
    return map;
  }

  static #idsUnicos(values) {
    return [...new Set(values.filter(Boolean))];
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
    const rId = InputValidator.uuid(id);
    if (!rId.ok) throw new TypeError(`[QueueRepository] id: ${rId.msg}`);

    const validos = ['waiting', 'in_service', 'done', 'cancelled'];
    if (!validos.includes(status)) throw new Error(`Status inválido: ${status}`);

    const patch = { status };
    if (status === 'in_service') patch.served_at = new Date().toISOString();
    if (status === 'done')       patch.done_at   = new Date().toISOString();

    const { data, error } = await ApiService.from('queue_entries')
      .update(patch)
      .eq('id', id)
      .select('id, status, position')
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Atualiza o campo client_confirmed de uma entrada da fila.
   * Usado pelo FilaPresencaService (status=waiting) e CadeiraConfirmacaoService (status=in_service).
   *
   * @param {string} entradaId — UUID da queue_entry
   * @param {'yes'|'no_waiting'|'absent'|'arriving'} valor
   * @returns {Promise<object>} — { id, client_confirmed }
   */
  static async updateClientConfirmed(entradaId, valor) {
    const r = InputValidator.uuid(entradaId);
    if (!r.ok) throw new TypeError(`[QueueRepository] entradaId: ${r.msg}`);

    const validos = ['yes', 'no_waiting', 'absent', 'arriving'];
    if (!validos.includes(valor)) {
      throw new Error(`[QueueRepository] client_confirmed inválido: ${valor}`);
    }

    const { data, error } = await ApiService.from('queue_entries')
      .update({ client_confirmed: valor })
      .eq('id', entradaId)
      .select('id, client_confirmed')
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Adiciona um cliente à fila.
   * Valida UUIDs obrigatórios e aplica allowlist de campos.
   * @param {object} payload — { barbershop_id, client_id, professional_id?, chair_id?, position }
   * @returns {Promise<object>}
   */
  static async entrar(payload) {
    // Valida UUIDs obrigatórios
    const rShop = InputValidator.uuid(payload?.barbershop_id);
    if (!rShop.ok) throw new TypeError(`[QueueRepository] barbershop_id: ${rShop.msg}`);

    // client_id é opcional quando guest_name está definido (cliente walk-in sem cadastro)
    const clientIdPresente = payload?.client_id !== null && payload?.client_id !== undefined;
    if (clientIdPresente) {
      const rClient = InputValidator.uuid(payload.client_id);
      if (!rClient.ok) throw new TypeError(`[QueueRepository] client_id: ${rClient.msg}`);
    } else if (!payload?.guest_name?.trim()) {
      throw new TypeError('[QueueRepository] client_id ou guest_name é obrigatório.');
    }

    // Allowlist de campos — descarta campos extras silenciosamente
    const camposPermitidos = ['barbershop_id', 'client_id', 'professional_id', 'chair_id', 'position', 'guest_name'];
    const { ok, msg, valor: payloadFiltrado } = InputValidator.payload(payload, camposPermitidos);
    if (!ok) throw new TypeError(`[QueueRepository] ${msg}`);

    const { data, error } = await ApiService.from('queue_entries')
      .insert(payloadFiltrado)
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
