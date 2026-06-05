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
    ]);

    return this.#calculator.calcularDashboard({
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
    });
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

    const [
      transacoes,
      agreements,
      profissionais,
      taxasMetodoPagamento,
      payoutItems,
    ] = await Promise.all([
      this.#repo.listarTransacoes(barbershopId, periodo, professionalId),
      this.#repo.listarAgreements(barbershopId, periodo.fim, professionalId),
      this.#repo.listarProfissionais(barbershopId, professionalId),
      this.#repo.listarTaxasMetodoPagamento(barbershopId),
      this.#repo.listarPayoutItemsRegistrados(barbershopId, periodo, professionalId),
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
      payoutItems,
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
      periodo,
      items: calculado.items,
    });

    const dashboardAtualizado = this.#calculator.calcularDashboard({
      periodo,
      transacoes,
      agreements: agreementsComDono,
      profissionais,
      statusEquipe: {},
      isOwner: true,
      taxasMetodoPagamento,
      payoutItems: [
        ...payoutItems,
        ...calculado.items.map(item => ({
          transaction_id: item.transactionId,
          amount: item.amount,
          status: 'confirmed',
          barbershop_id: barbershopId,
          professional_id: professionalId,
        })),
      ],
    });

    const updatedBalance = dashboardAtualizado.barbeiros.find(item => item.professionalId === professionalId) || null;
    return {
      confirmado: true,
      payout,
      updatedBalance,
    };
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
}

module.exports = FinanceiroBffService;
