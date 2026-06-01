'use strict';

// =============================================================
// FinanceiroService.js — Regras de negócio financeiras.
//
// Responsabilidade ÚNICA: orquestrar registro de corte,
// consultas de resumo e extrato por período.
//
// Dependências: FinanceiroRepository.js, ApiService.js,
//               InputValidator.js, LoggerService.js
// Camada: application
// =============================================================

class FinanceiroService {

  // Períodos disponíveis
  static PERIODOS = Object.freeze(['hoje', 'semana', 'mes', 'total']);

  // ═══════════════════════════════════════════════════════════
  // ESCRITA
  // ═══════════════════════════════════════════════════════════

  /**
   * Registra um corte finalizado na tabela transactions.
   * 1. Busca os serviços da entrada e soma os preços.
   * 2. Se amount = 0 (sem serviços ou sem preço), encerra sem inserir — constraint amount > 0.
   * 3. Insere a transação e despacha CustomEvent `barberflow:transacao-criada`.
   *
   * @param {object} opts
   * @param {string}      opts.entradaId
   * @param {string}      opts.barbershopId
   * @param {string}      opts.professionalId
   * @param {string|null} opts.clientId
   * @param {string}      opts.paymentMethod  'pix' | 'dinheiro' | 'cartao'
   * @returns {Promise<void>}
   */
  static async registrarCorte({ entradaId, barbershopId, professionalId, clientId, paymentMethod }) {
    const rId   = InputValidator.uuid(entradaId);
    const rShop = InputValidator.uuid(barbershopId);
    const rProf = InputValidator.uuid(professionalId);
    if (!rId.ok)   throw new TypeError(`[FinanceiroService] entradaId: ${rId.msg}`);
    if (!rShop.ok) throw new TypeError(`[FinanceiroService] barbershopId: ${rShop.msg}`);
    if (!rProf.ok) throw new TypeError(`[FinanceiroService] professionalId: ${rProf.msg}`);

    const amount = await FinanceiroService.#calcularTotal(entradaId);

    if (amount <= 0) {
      LoggerService.warn('[FinanceiroService] registrarCorte: amount=0, transação não registrada (entrada sem serviços com preço).');
      return;
    }

    await FinanceiroRepository.criarTransacao({
      barbershopId,
      professionalId,
      clientId:      clientId ?? null,
      queueEntryId:  entradaId,
      amount,
      paymentMethod: paymentMethod ?? null,
    });

    document.dispatchEvent(
      new CustomEvent('barberflow:transacao-criada', { detail: { barbershopId } }),
    );
  }

  // ═══════════════════════════════════════════════════════════
  // LEITURA
  // ═══════════════════════════════════════════════════════════

  /**
   * Retorna resumo geral + por barbeiro para o período.
   * @param {string} barbershopId
   * @param {string} periodo  'hoje' | 'semana' | 'mes' | 'total'
   * @returns {Promise<{geral:{count:number,total:number}, barbeiros:object[]}>}
   */
  static async getResumo(barbershopId, periodo) {
    const r = InputValidator.uuid(barbershopId);
    if (!r.ok) throw new TypeError(`[FinanceiroService] barbershopId: ${r.msg}`);

    const { de, ate } = FinanceiroService.#periodoParaDatas(periodo);
    const [geral, barbeiros] = await Promise.all([
      FinanceiroRepository.getTotalPeriodo(barbershopId, { de, ate }),
      FinanceiroRepository.getResumoPorPeriodo(barbershopId, { de, ate }),
    ]);
    return { geral, barbeiros };
  }

  /**
   * Retorna as transações de um barbeiro em um período.
   * @param {string} barbershopId
   * @param {string} professionalId
   * @param {string} periodo
   * @returns {Promise<object[]>}
   */
  static async getTransacoesBarbeiro(barbershopId, professionalId, periodo) {
    const { de, ate } = FinanceiroService.#periodoParaDatas(periodo);
    return FinanceiroRepository.getTransacoesBarbeiro(barbershopId, professionalId, { de, ate });
  }

  /**
   * Retorna totais agrupados por método de pagamento para o período.
   * @param {string} barbershopId
   * @param {string} periodo  'hoje' | 'semana' | 'mes' | 'total'
   * @returns {Promise<{
   *   credito: {total:number,grossTotal:number,count:number},
   *   debito:  {total:number,grossTotal:number,count:number},
   *   pixDinheiro: {total:number,grossTotal:number,count:number},
   *   totalGeral: number
   * }>}
   */
  static async getResumoPorMetodoPagamento(barbershopId, periodo) {
    const r = InputValidator.uuid(barbershopId);
    if (!r.ok) throw new TypeError(`[FinanceiroService] barbershopId: ${r.msg}`);

    const { de, ate } = FinanceiroService.#periodoParaDatas(periodo);
    return FinanceiroRepository.getResumoPorMetodoPagamento(barbershopId, { de, ate });
  }

  /**
   * Aplica desconto percentual de maquininha a todas as transações
   * do método/período. O banco recalcula amount = gross_amount * (1 - pct/100).
   * Apenas 'credito' e 'debito' são aceitos (cartão parcelado/débito).
   * @param {string} barbershopId
   * @param {string} periodo
   * @param {string} metodo       'credito' | 'debito'
   * @param {number} porcentagem  0 < x < 100
   * @returns {Promise<void>}
   */
  static async aplicarDescontoMetodo(barbershopId, periodo, metodo, porcentagem) {
    const r = InputValidator.uuid(barbershopId);
    if (!r.ok) throw new TypeError(`[FinanceiroService] barbershopId: ${r.msg}`);

    if (metodo !== 'credito' && metodo !== 'debito') {
      throw new TypeError('[FinanceiroService] metodo deve ser "credito" ou "debito"');
    }

    const pct = Number(porcentagem);
    if (Number.isNaN(pct) || pct <= 0 || pct >= 100) {
      throw new TypeError('[FinanceiroService] porcentagem deve ser > 0 e < 100');
    }

    const { de, ate } = FinanceiroService.#periodoParaDatas(periodo);
    await FinanceiroRepository.aplicarDescontoMetodo(barbershopId, metodo, { de, ate }, pct);

    document.dispatchEvent(
      new CustomEvent('barberflow:transacao-atualizada', { detail: { barbershopId } }),
    );
  }

  // ═══════════════════════════════════════════════════════════
  // HELPERS PRIVADOS
  // ═══════════════════════════════════════════════════════════

  /**
   * Soma os preços dos serviços de uma entrada via queue_entry_services JOIN services.
   * Retorna 0 se sem serviços ou sem preço cadastrado.
   * @param {string} entradaId
   * @returns {Promise<number>}
   */
  static async #calcularTotal(entradaId) {
    try {
      const { data, error } = await ApiService.from('queue_entry_services')
        .select('service:services!service_id(price)')
        .eq('queue_entry_id', entradaId);

      if (error) {
        LoggerService.warn('[FinanceiroService] erro ao buscar serviços:', error?.message);
        return 0;
      }
      return (data ?? []).reduce((s, r) => s + (Number(r.service?.price) || 0), 0);
    } catch (err) {
      LoggerService.warn('[FinanceiroService] #calcularTotal falhou:', err?.message);
      return 0;
    }
  }

  /**
   * Converte período nomeado em intervalo ISO de datas.
   * @param {string} periodo
   * @returns {{de: string, ate: string}}
   */
  static #periodoParaDatas(periodo) {
    const agora = new Date();
    const ate   = agora.toISOString();

    let de;
    switch (periodo) {
      case 'hoje': {
        const inicio = new Date(agora);
        inicio.setHours(0, 0, 0, 0);
        de = inicio.toISOString();
        break;
      }
      case 'semana': {
        const inicio = new Date(agora);
        inicio.setDate(agora.getDate() - 6);
        inicio.setHours(0, 0, 0, 0);
        de = inicio.toISOString();
        break;
      }
      case 'mes': {
        const inicio = new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0, 0);
        de = inicio.toISOString();
        break;
      }
      case 'total':
      default:
        de = new Date(0).toISOString(); // epoch
        break;
    }

    return { de, ate };
  }
}
