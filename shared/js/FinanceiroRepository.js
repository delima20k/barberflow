'use strict';

// =============================================================
// FinanceiroRepository.js — Acesso à tabela `transactions`.
//
// Responsabilidade ÚNICA: CRUD financeiro sem regra de negócio.
//
// Dependências: ApiService.js, InputValidator.js, LoggerService.js
// Camada: infra
// =============================================================

class FinanceiroRepository {

  // ═══════════════════════════════════════════════════════════
  // ESCRITA
  // ═══════════════════════════════════════════════════════════

  /**
   * Insere uma transação de receita (type='revenue', status='paid').
   * @param {object} opts
   * @param {string}      opts.barbershopId
   * @param {string}      opts.professionalId
   * @param {string|null} opts.clientId
   * @param {string|null} opts.queueEntryId
   * @param {number}      opts.amount          valor em reais (ex: 35.00)
   * @param {string}      opts.paymentMethod   'pix' | 'dinheiro' | 'cartao'
   * @returns {Promise<object>}  transação criada
   */
  static async criarTransacao({ barbershopId, professionalId, clientId, queueEntryId, amount, paymentMethod }) {
    const rShop = InputValidator.uuid(barbershopId);
    const rProf = InputValidator.uuid(professionalId);
    if (!rShop.ok) throw new TypeError(`[FinanceiroRepository] barbershopId: ${rShop.msg}`);
    if (!rProf.ok) throw new TypeError(`[FinanceiroRepository] professionalId: ${rProf.msg}`);

    const payload = {
      barbershop_id:   barbershopId,
      professional_id: professionalId,
      amount:          Number(amount) || 0,
      type:            'revenue',
      status:          'paid',
      payment_method:  paymentMethod ?? null,
      paid_at:         new Date().toISOString(),
    };
    if (clientId)     payload.client_id       = clientId;
    if (queueEntryId) payload.queue_entry_id  = queueEntryId;

    const { data, error } = await ApiService.from('transactions').insert(payload).select().single();
    if (error) throw error;
    return data;
  }

  // ═══════════════════════════════════════════════════════════
  // LEITURA — RESUMO AGRUPADO
  // ═══════════════════════════════════════════════════════════

  /**
   * Retorna totais agrupados por barbeiro para um período.
   * Inclui nome via JOIN em profiles.
   * @param {string} barbershopId
   * @param {{de: string, ate: string}} periodo  ISO strings
   * @returns {Promise<{professionalId:string, nome:string, count:number, total:number}[]>}
   */
  static async getResumoPorPeriodo(barbershopId, { de, ate }) {
    const r = InputValidator.uuid(barbershopId);
    if (!r.ok) throw new TypeError(`[FinanceiroRepository] barbershopId: ${r.msg}`);

    const { data, error } = await ApiService.from('transactions')
      .select('professional_id, amount, professional:professionals!professional_id(profile:profiles!id(full_name))')
      .eq('barbershop_id', barbershopId)
      .eq('type', 'revenue')
      .eq('status', 'paid')
      .gte('paid_at', de)
      .lte('paid_at', ate);

    if (error) throw error;

    // Agrupa em memória — fila de atendimento pequena, custo mínimo
    const map = new Map();
    for (const t of (data ?? [])) {
      const id   = t.professional_id;
      const nome = t.professional?.profile?.full_name ?? 'Barbeiro';
      if (!map.has(id)) map.set(id, { professionalId: id, nome, count: 0, total: 0 });
      const g = map.get(id);
      g.count++;
      g.total += Number(t.amount) || 0;
    }

    return [...map.values()].sort((a, b) => b.total - a.total);
  }

  /**
   * Retorna o total geral da barbearia para o período.
   * @param {string} barbershopId
   * @param {{de: string, ate: string}} periodo
   * @returns {Promise<{count: number, total: number}>}
   */
  static async getTotalPeriodo(barbershopId, { de, ate }) {
    const r = InputValidator.uuid(barbershopId);
    if (!r.ok) throw new TypeError(`[FinanceiroRepository] barbershopId: ${r.msg}`);

    const { data, error } = await ApiService.from('transactions')
      .select('amount')
      .eq('barbershop_id', barbershopId)
      .eq('type', 'revenue')
      .eq('status', 'paid')
      .gte('paid_at', de)
      .lte('paid_at', ate);

    if (error) throw error;
    const rows = data ?? [];
    return {
      count: rows.length,
      total: rows.reduce((s, t) => s + (Number(t.amount) || 0), 0),
    };
  }

  // ═══════════════════════════════════════════════════════════
  // LEITURA — EXTRATO POR BARBEIRO
  // ═══════════════════════════════════════════════════════════

  /**
   * Lista as transações de um barbeiro específico em um período.
   * Inclui nome do cliente e serviços via JOIN.
   * @param {string} barbershopId
   * @param {string} professionalId
   * @param {{de: string, ate: string}} periodo
   * @returns {Promise<object[]>}
   */
  static async getTransacoesBarbeiro(barbershopId, professionalId, { de, ate }) {
    const rShop = InputValidator.uuid(barbershopId);
    const rProf = InputValidator.uuid(professionalId);
    if (!rShop.ok) throw new TypeError(`[FinanceiroRepository] barbershopId: ${rShop.msg}`);
    if (!rProf.ok) throw new TypeError(`[FinanceiroRepository] professionalId: ${rProf.msg}`);

    const { data, error } = await ApiService.from('transactions')
      .select(`
        id, amount, payment_method, paid_at, queue_entry_id,
        client:profiles!client_id(full_name)
      `)
      .eq('barbershop_id', barbershopId)
      .eq('professional_id', professionalId)
      .eq('type', 'revenue')
      .eq('status', 'paid')
      .gte('paid_at', de)
      .lte('paid_at', ate)
      .order('paid_at', { ascending: false });

    if (error) throw error;
    return data ?? [];
  }
}
