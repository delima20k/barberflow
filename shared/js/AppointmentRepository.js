'use strict';

// =============================================================
// AppointmentRepository.js — Repositório de agendamentos.
// Abstrai todas as queries Supabase da tabela appointments.
// Nenhuma lógica de negócio aqui — apenas acesso a dados.
//
// Reutilizável pelos apps cliente e profissional.
// Dependências: SupabaseService.js
// =============================================================

class AppointmentRepository {

  // Campos retornados nas listagens (cliente + serviço via join)
  static #SELECT_LIST =
    `id, scheduled_at, duration_min, status, notes, price_charged,
     client:profiles!client_id(id, full_name, avatar_path),
     professional:professionals!professional_id(id,
       profile:profiles!id(full_name, avatar_path)),
     service:services!service_id(name, category, duration_min, price),
     barbershop:barbershops!barbershop_id(id, name, address)`;

  // ═══════════════════════════════════════════════════════════
  // LEITURA — Profissional
  // ═══════════════════════════════════════════════════════════

  /**
   * Retorna agendamentos de um profissional para um período.
   * @param {string} professionalId
   * @param {Date} inicio  — início do período
   * @param {Date} fim     — fim do período
   * @returns {Promise<object[]>}
   */
  static async getByProfessional(professionalId, inicio, fim) {
    const { data, error } = await SupabaseService.appointments()
      .select(AppointmentRepository.#SELECT_LIST)
      .eq('professional_id', professionalId)
      .gte('scheduled_at', inicio.toISOString())
      .lte('scheduled_at', fim.toISOString())
      .order('scheduled_at', { ascending: true });

    if (error) throw error;
    return data ?? [];
  }

  /**
   * Retorna agendamentos de hoje de um profissional.
   * @param {string} professionalId
   * @returns {Promise<object[]>}
   */
  static async getHoje(professionalId) {
    const inicio = new Date();
    inicio.setHours(0, 0, 0, 0);
    const fim = new Date();
    fim.setHours(23, 59, 59, 999);
    return AppointmentRepository.getByProfessional(professionalId, inicio, fim);
  }

  /**
   * Retorna agendamentos de amanhã de um profissional.
   * @param {string} professionalId
   * @returns {Promise<object[]>}
   */
  static async getAmanha(professionalId) {
    const inicio = new Date();
    inicio.setDate(inicio.getDate() + 1);
    inicio.setHours(0, 0, 0, 0);
    const fim = new Date(inicio);
    fim.setHours(23, 59, 59, 999);
    return AppointmentRepository.getByProfessional(professionalId, inicio, fim);
  }

  /**
   * Retorna agendamentos dos próximos 7 dias de um profissional.
   * @param {string} professionalId
   * @returns {Promise<object[]>}
   */
  static async getSemana(professionalId) {
    const inicio = new Date();
    inicio.setHours(0, 0, 0, 0);
    const fim = new Date();
    fim.setDate(fim.getDate() + 7);
    fim.setHours(23, 59, 59, 999);
    return AppointmentRepository.getByProfessional(professionalId, inicio, fim);
  }

  /**
   * Retorna agendamentos do mês corrente de um profissional.
   * @param {string} professionalId
   * @returns {Promise<object[]>}
   */
  static async getMes(professionalId) {
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59, 999);
    return AppointmentRepository.getByProfessional(professionalId, inicio, fim);
  }

  // ═══════════════════════════════════════════════════════════
  // LEITURA — Cliente
  // ═══════════════════════════════════════════════════════════

  /**
   * Retorna agendamentos futuros de um cliente.
   * @param {string} clientId
   * @returns {Promise<object[]>}
   */
  static async getByCliente(clientId) {
    const { data, error } = await SupabaseService.appointments()
      .select(AppointmentRepository.#SELECT_LIST)
      .eq('client_id', clientId)
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(50);

    if (error) throw error;
    return data ?? [];
  }

  // ═══════════════════════════════════════════════════════════
  // ESCRITA
  // ═══════════════════════════════════════════════════════════

  /**
   * Atualiza o status de um agendamento.
   * O RLS do banco garante que o profissional só altera os seus.
   * @param {string} id         — UUID do agendamento
   * @param {string} status     — 'pending' | 'confirmed' | 'in_progress' | 'done' | 'cancelled' | 'no_show'
   * @returns {Promise<object>}
   */
  static async updateStatus(id, status) {
    // Valida UUID antes de qualquer acesso ao banco
    const rId = InputValidator.uuid(id);
    if (!rId.ok) throw new TypeError(`[AppointmentRepository] id: ${rId.msg}`);

    const validos = ['pending', 'confirmed', 'in_progress', 'done', 'cancelled', 'no_show'];
    if (!validos.includes(status)) throw new Error(`Status inválido: ${status}`);

    const { data, error } = await SupabaseService.appointments()
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, status')
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Cria um novo agendamento.
   * Valida UUIDs obrigatórios, sanitiza notas e aplica allowlist de campos
   * para prevenir mass assignment.
   * @param {object} payload — { client_id, professional_id, barbershop_id, service_id,
   *                              scheduled_at, duration_min, price_charged, notes? }
   * @returns {Promise<object>}
   */
  static async criar(payload) {
    // Valida UUIDs obrigatórios (rejeita SQL injection e IDs malformados)
    for (const campo of ['client_id', 'professional_id', 'barbershop_id', 'service_id']) {
      if (campo in (payload ?? {})) {
        const r = InputValidator.uuid(payload[campo]);
        if (!r.ok) throw new TypeError(`[AppointmentRepository] ${campo}: ${r.msg}`);
      }
    }

    // Sanitiza notas: remove null-bytes e verifica comprimento máximo
    let notasSanitizadas = payload?.notes;
    if ('notes' in (payload ?? {})) {
      const rNotes = InputValidator.textoLivre(payload.notes, 500);
      if (!rNotes.ok) throw new TypeError(`[AppointmentRepository] notes: ${rNotes.msg}`);
      notasSanitizadas = rNotes.valor;
    }

    // Allowlist de campos — descarta campos extras silenciosamente (previne mass assignment)
    const camposPermitidos = [
      'client_id', 'professional_id', 'barbershop_id', 'service_id',
      'scheduled_at', 'duration_min', 'price_charged', 'notes', 'status',
    ];
    const { ok, msg, valor: payloadFiltrado } = InputValidator.payload(payload, camposPermitidos);
    if (!ok) throw new TypeError(`[AppointmentRepository] ${msg}`);

    // Substitui notes pela versão sanitizada
    if ('notes' in (payload ?? {})) payloadFiltrado.notes = notasSanitizadas;

    const { data, error } = await SupabaseService.appointments()
      .insert(payloadFiltrado)
      .select('id')
      .single();

    if (error) throw error;
    return data;
  }
}
