'use strict';

const BaseService = require('./BaseService');
const AppError = require('../utils/AppError');
const FinanceiroCalculator = require('../domain/financeiro/FinanceiroCalculator');

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

    const [transacoes, transacoesAnteriores, agreements, profissionais, statusEquipe] = await Promise.all([
      this.#repo.listarTransacoes(barbershopId, periodo),
      this.#repo.listarTransacoes(barbershopId, periodoAnterior),
      this.#repo.listarAgreements(barbershopId, periodo.fim),
      this.#repo.listarProfissionais(barbershopId),
      this.#repo.listarStatusEquipe(barbershopId),
    ]);

    return this.#calculator.calcularDashboard({
      periodo,
      transacoes,
      transacoesAnteriores,
      agreements,
      profissionais,
      statusEquipe,
      isOwner,
      viewerProfessionalId,
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

    const metodo = String(payload.metodo || '').trim().toLowerCase();
    this._enum('metodo', metodo, ['credito', 'credit', 'debito', 'debit', 'pix', 'dinheiro', 'cash']);

    const porcentagem = Number(payload.porcentagem);
    if (!Number.isFinite(porcentagem) || porcentagem < 0 || porcentagem > 100) {
      throw AppError.badRequest('porcentagem deve estar entre 0 e 100.');
    }

    const periodo = this.#resolverPeriodo(payload);
    await this.#repo.verificarAcesso(userId, barbershopId);

    const resultado = await this.#repo.aplicarTaxaMetodo(barbershopId, metodo, periodo, porcentagem);
    return { aplicado: true, metodo, porcentagem, periodo, resultado };
  }

  #resolverPeriodo(filtros) {
    try {
      return this.#calculator.resolverPeriodo(filtros.periodo || 'mes', filtros.de || null, filtros.ate || null);
    } catch (error) {
      throw AppError.badRequest(error.message);
    }
  }
}

module.exports = FinanceiroBffService;
