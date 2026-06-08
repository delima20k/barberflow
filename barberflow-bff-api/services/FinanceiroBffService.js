'use strict';

const BaseService = require('./BaseService');
const AppError = require('../utils/AppError');
const FinanceiroCalculator = require('../domain/financeiro/FinanceiroCalculator');
const Money = require('../domain/financeiro/Money');

/**
 * FinanceiroBffService orquestra acesso, filtros e calculos financeiros.
 */
class FinanceiroBffService extends BaseService {
  #repo;
  #calculator;

  constructor(repo, calculator = new FinanceiroCalculator()) {
    super('FinanceiroBffService');
    this.#repo = repo;
    this.#calculator = calculator;
  }

  async dashboard(userId, filtros = {}) {
    const barbershopId = filtros.barbershop_id;
    if (!barbershopId) throw AppError.badRequest('barbershop_id e obrigatorio.');
    this._uuid('barbershop_id', barbershopId);

    const periodo = this.#resolverPeriodo(filtros);
    const acesso = await this.#repo.verificarAcesso(userId, barbershopId);
    const isOwner = acesso.papel === 'owner';
    const viewerProfessionalId = isOwner ? null : userId;

    const periodoAnterior = {
      ...periodo,
      inicio: periodo.inicioAnterior,
      fim: periodo.fimAnterior,
      de: periodo.anteriorDe,
      ate: periodo.anteriorAte,
    };

    const mensalistasPromise = isOwner
      ? Promise.resolve(null)
      : this.#repo.listarTotalMensalistas(barbershopId);
    const despesasPromise = isOwner
      ? this.#repo.listarDespesas(barbershopId, periodo)
      : Promise.resolve([]);
    const despesasAnterioresPromise = isOwner
      ? this.#repo.listarDespesas(barbershopId, periodoAnterior)
      : Promise.resolve([]);

    const [
      transacoes,
      transacoesAnteriores,
      agreements,
      profissionais,
      statusEquipe,
      mensalistas,
      despesas,
      despesasAnteriores,
      taxasMetodoPagamento,
      payoutItems,
      transacoesPayoutAberto,
      resumoHistoricoFinanceiro,
    ] = await Promise.all([
      this.#repo.listarTransacoes(barbershopId, periodo, viewerProfessionalId),
      this.#repo.listarTransacoes(barbershopId, periodoAnterior, viewerProfessionalId),
      this.#repo.listarAgreements(barbershopId, periodo.fim, viewerProfessionalId),
      this.#repo.listarProfissionais(barbershopId, viewerProfessionalId),
      this.#repo.listarStatusEquipe(barbershopId),
      mensalistasPromise,
      despesasPromise,
      despesasAnterioresPromise,
      this.#repo.listarTaxasMetodoPagamento(barbershopId),
      this.#repo.listarPayoutItemsRegistrados(barbershopId, periodo, viewerProfessionalId),
      this.#repo.listarTransacoesPayoutAberto(barbershopId, viewerProfessionalId),
      this.#repo.listarResumoHistoricoProfissionais(barbershopId, viewerProfessionalId),
    ]);

    const dashboard = this.#calculator.calcularDashboard({
      periodo,
      transacoes,
      transacoesAnteriores,
      agreements: this.#agreementsComDono(agreements, acesso, isOwner),
      profissionais,
      statusEquipe,
      isOwner,
      viewerProfessionalId,
      mensalistas,
      despesas,
      despesasAnteriores,
      taxasMetodoPagamento,
      payoutItems,
      transacoesPayoutAberto,
      resumoHistoricoFinanceiro,
    });

    if (!isOwner && viewerProfessionalId) {
      dashboard.acertoSemanal = await this.#montarAcertoSemanal({
        barbershopId,
        professionalId: viewerProfessionalId,
        acesso,
        taxasMetodoPagamento,
      });
    }

    return dashboard;
  }

  async extratoBarbeiro(userId, professionalId, filtros = {}) {
    const barbershopId = filtros.barbershop_id;
    if (!barbershopId) throw AppError.badRequest('barbershop_id e obrigatorio.');
    this._uuid('barbershop_id', barbershopId);
    this._uuid('professional_id', professionalId);

    const periodo = this.#resolverPeriodo(filtros);
    await this.#repo.verificarAcesso(userId, barbershopId);
    const transacoes = await this.#repo.listarTransacoes(barbershopId, periodo, professionalId);

    return { periodo, professionalId, transacoes };
  }

  async aplicarTaxaMetodo(userId, payload = {}) {
    const barbershopId = payload.barbershop_id;
    if (!barbershopId) throw AppError.badRequest('barbershop_id e obrigatorio.');
    this._uuid('barbershop_id', barbershopId);

    const metodo = this.#normalizarMetodoTaxavel(payload.metodo);

    const porcentagem = this.#normalizarPorcentagem(payload.porcentagem);
    if (!Number.isFinite(porcentagem) || porcentagem < 0 || porcentagem > 30) {
      throw AppError.badRequest('porcentagem deve estar entre 0 e 30.');
    }

    const acesso = await this.#repo.verificarAcesso(userId, barbershopId);
    if (acesso.papel !== 'owner') {
      throw AppError.forbidden('Apenas o dono da barbearia pode alterar taxas de pagamento.');
    }

    const taxa = await this.#repo.salvarTaxaMetodoPagamento(userId, barbershopId, metodo, porcentagem);
    return { aplicado: true, metodo, porcentagem, taxa };
  }

  async confirmarPagamentoBarbeiro(userId, payload = {}) {
    const barbershopId = payload.barbershop_id;
    const professionalId = payload.professional_id;
    if (!barbershopId) throw AppError.badRequest('barbershop_id e obrigatorio.');
    if (!professionalId) throw AppError.badRequest('professional_id e obrigatorio.');
    this._uuid('barbershop_id', barbershopId);
    this._uuid('professional_id', professionalId);

    const periodo = this.#resolverPeriodo(payload);
    const displayedAmount = Money.from(payload.displayed_amount);
    if (displayedAmount.cents < 0) throw AppError.badRequest('displayed_amount invalido.');

    const acesso = await this.#repo.verificarAcesso(userId, barbershopId);
    if (acesso.papel !== 'owner') {
      throw AppError.forbidden('Apenas o dono da barbearia pode registrar pagamento ao barbeiro.');
    }
    if (professionalId === acesso.shop?.owner_id) {
      throw AppError.forbidden('Nao e permitido registrar payout para o dono da barbearia.');
    }

    const [
      transacoes,
      agreements,
      profissionais,
      taxasMetodoPagamento,
    ] = await Promise.all([
      this.#repo.listarTransacoesPayoutAberto(barbershopId, professionalId),
      this.#repo.listarAgreements(barbershopId, periodo.fim, professionalId),
      this.#repo.listarProfissionais(barbershopId, professionalId),
      this.#repo.listarTaxasMetodoPagamento(barbershopId),
    ]);

    if (!profissionais.some(item => item.professionalId === professionalId)) {
      throw AppError.forbidden('Profissional sem vinculo com a barbearia.');
    }

    const agreementsComDono = this.#agreementsComDono(agreements, acesso, true);
    const calculado = this.#calculator.calcularPayoutProfissional({
      professionalId,
      transacoes,
      agreements: agreementsComDono,
      profissionais,
      taxasMetodoPagamento,
    });

    const amount = Money.from(calculado.amount);
    if (amount.cents <= 0 || calculado.items.length === 0) {
      throw AppError.conflict('Nao ha valor pendente para cortes finalizados/recebidos no periodo.');
    }
    if (displayedAmount.cents !== amount.cents) {
      throw AppError.conflict('Valor exibido desatualizado. Atualize o dashboard financeiro antes de confirmar.');
    }

    const payout = await this.#repo.criarPayoutComItens({
      createdBy: userId,
      barbershopId,
      professionalId,
      amount: amount.toNumber(),
      periodo: this.#periodoDoPayout(transacoes, calculado.items, periodo),
      items: calculado.items,
    });

    const [transacoesPayoutAberto, resumoHistoricoAtualizado] = await Promise.all([
      this.#repo.listarTransacoesPayoutAberto(barbershopId, professionalId),
      this.#repo.listarResumoHistoricoProfissionais(barbershopId, professionalId),
    ]);

    const dashboardAtualizado = this.#calculator.calcularDashboard({
      periodo,
      transacoes,
      agreements: agreementsComDono,
      profissionais,
      statusEquipe: {},
      isOwner: true,
      taxasMetodoPagamento,
      transacoesPayoutAberto,
      resumoHistoricoFinanceiro: resumoHistoricoAtualizado,
    });

    const updatedBalance = dashboardAtualizado.barbeiros.find(item => item.professionalId === professionalId) || null;
    return {
      confirmado: true,
      payout,
      updatedBalance,
    };
  }

  async confirmarAcertoSemanal(userId, payload = {}) {
    const barbershopId = payload.barbershop_id;
    if (!barbershopId) throw AppError.badRequest('barbershop_id e obrigatorio.');
    this._uuid('barbershop_id', barbershopId);

    const periodo = this.#resolverPeriodo({ periodo: 'semana' });
    const displayedAmount = Money.from(payload.displayed_amount);
    if (displayedAmount.cents < 0) throw AppError.badRequest('displayed_amount invalido.');

    const acesso = await this.#repo.verificarAcesso(userId, barbershopId);
    if (acesso.papel === 'owner') {
      throw AppError.forbidden('Dono da barbearia nao confirma acerto semanal de barbeiro.');
    }

    const acertoSemanal = await this.#montarAcertoSemanal({
      barbershopId,
      professionalId: userId,
      acesso,
      periodo,
    });
    const amount = Money.from(acertoSemanal.resumo.valorARepassarBarbearia);
    if (amount.cents <= 0) {
      throw AppError.conflict('Nao ha valor de repasse semanal para confirmar.');
    }
    if (displayedAmount.cents !== amount.cents) {
      throw AppError.conflict('Valor exibido desatualizado. Atualize o dashboard financeiro antes de confirmar.');
    }

    const settlement = await this.#repo.confirmarAcertoSemanal({
      confirmedBy: userId,
      barbershopId,
      professionalId: userId,
      periodo,
      resumo: acertoSemanal.resumo,
    });

    const atualizado = await this.#montarAcertoSemanal({
      barbershopId,
      professionalId: userId,
      acesso,
      periodo,
    });

    return {
      confirmado: true,
      settlement,
      acertoSemanal: atualizado,
    };
  }

  async #montarAcertoSemanal({
    barbershopId,
    professionalId,
    acesso,
    periodo = null,
    taxasMetodoPagamento = null,
    settlements = null,
  }) {
    const periodoSemanal = periodo || this.#resolverPeriodo({ periodo: 'semana' });
    const [
      transacoesSemana,
      agreementsSemana,
      profissionaisSemana,
      taxasSemana,
      settlementsSemana,
    ] = await Promise.all([
      this.#repo.listarTransacoes(barbershopId, periodoSemanal, professionalId),
      this.#repo.listarAgreements(barbershopId, periodoSemanal.fim, professionalId),
      this.#repo.listarProfissionais(barbershopId, professionalId),
      taxasMetodoPagamento ? Promise.resolve(taxasMetodoPagamento) : this.#repo.listarTaxasMetodoPagamento(barbershopId),
      settlements ? Promise.resolve(settlements) : this.#repo.listarAcertosSemanais(barbershopId, professionalId),
    ]);

    return this.#calculator.calcularAcertoSemanal({
      professionalId,
      periodo: periodoSemanal,
      transacoes: transacoesSemana,
      agreements: this.#agreementsComDono(agreementsSemana, acesso, false),
      profissionais: profissionaisSemana,
      taxasMetodoPagamento: taxasSemana,
      settlements: settlementsSemana,
    });
  }

  #resolverPeriodo(filtros) {
    try {
      return this.#calculator.resolverPeriodo(filtros.periodo || 'mes', filtros.de || null, filtros.ate || null);
    } catch (error) {
      throw AppError.badRequest(error.message);
    }
  }

  #agreementsComDono(agreements, acesso, isOwner) {
    if (!isOwner || !acesso?.shop?.owner_id) return agreements;

    const ownerId = acesso.shop.owner_id;
    const temAcordoPercentualDono = (agreements || []).some(agreement =>
      agreement?.professional_id === ownerId
      && String(agreement?.type || '').toLowerCase() === 'percentage'
    );
    if (temAcordoPercentualDono) return agreements;

    return [
      ...(agreements || []),
      {
        professional_id: ownerId,
        barbershop_id: acesso.shop.id,
        type: 'percentage',
        value: 100,
        is_active: true,
        origem: 'owner_default',
      },
    ];
  }

  #normalizarMetodoTaxavel(valor) {
    const metodo = String(valor || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const aliases = {
      credito: 'credit',
      credit: 'credit',
      credit_card: 'credit',
      debito: 'debit',
      debit: 'debit',
      debit_card: 'debit',
    };
    const normalizado = aliases[metodo];
    if (!normalizado) {
      throw AppError.badRequest('metodo deve ser debito ou credito.');
    }
    return normalizado;
  }

  #normalizarPorcentagem(valor) {
    const normalizado = String(valor ?? '').trim().replace(',', '.');
    if (normalizado === '') return Number.NaN;
    return Number(normalizado);
  }

  #periodoDoPayout(transacoes, items, fallbackPeriodo) {
    const ids = new Set((items || []).map(item => item.transactionId).filter(Boolean));
    const datas = (transacoes || [])
      .filter(tx => ids.has(tx.id))
      .map(tx => new Date(tx.paid_at || tx.created_at))
      .filter(date => !Number.isNaN(date.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());

    if (datas.length === 0) return fallbackPeriodo;

    return {
      ...fallbackPeriodo,
      inicio: datas[0],
      fim: datas[datas.length - 1],
      de: datas[0].toISOString().slice(0, 10),
      ate: datas[datas.length - 1].toISOString().slice(0, 10),
    };
  }
}

module.exports = FinanceiroBffService;
