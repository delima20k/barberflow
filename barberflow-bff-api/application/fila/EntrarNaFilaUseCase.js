'use strict';

const { randomUUID }       = require('crypto');
const { BaseUseCase }      = require('../shared/BaseUseCase');
const { Result }           = require('../../domain/shared/Result');
const { FilaEntrada }      = require('../../domain/fila/FilaEntrada');
const { EntrarNaFilaDto }  = require('./dto/EntrarNaFilaDto');
const { FilaResponseDto }  = require('./dto/FilaResponseDto');

/**
 * EntrarNaFilaUseCase — Insere um cliente (com conta ou convidado) na fila
 * de espera de uma barbearia.
 *
 * Responsabilidades:
 *  1. Validar DTO de entrada.
 *  2. Verificar se a barbearia existe/está aberta e se o profissional
 *     (quando informado) está vinculado a ela — dependências opcionais,
 *     puladas se não injetadas (mantém compatibilidade com quem só
 *     precisa do fluxo puro de fila).
 *  3. Validar os serviços escolhidos (quando houver).
 *  4. Calcular a próxima posição disponível.
 *  5. Criar o agregado FilaEntrada e persistir.
 *  6. Vincular os serviços escolhidos à entrada.
 *  7. Publicar eventos de domínio.
 *
 * @extends {BaseUseCase<EntrarNaFilaDtoProps, object>}
 */
class EntrarNaFilaUseCase extends BaseUseCase {
  /** @type {import('../../domain/fila/ports/IFilaRepository').IFilaRepository} */
  #filaRepository;
  /** @type {import('../../repositories/BarbeariaRepository')|null} */
  #barbeariaRepository;

  /**
   * @param {{
   *   filaRepository: import('../../domain/fila/ports/IFilaRepository').IFilaRepository,
   *   barbeariaRepository?: import('../../repositories/BarbeariaRepository'),
   * }} deps
   */
  constructor({ filaRepository, barbeariaRepository = null }) {
    super();
    this.#filaRepository      = filaRepository;
    this.#barbeariaRepository = barbeariaRepository;
  }

  /**
   * @param {import('./dto/EntrarNaFilaDto').EntrarNaFilaDtoProps} command
   * @returns {Promise<Result<object, string>>}
   */
  async execute(command) {
    // 1. Validar DTO
    const dtoResult = EntrarNaFilaDto.create(command);
    if (dtoResult.isFail()) return dtoResult;
    const dto = dtoResult.getValue();

    // 2. Barbearia aberta + profissional vinculado (se o repositório foi injetado)
    if (this.#barbeariaRepository) {
      const guard = await this.#verificarBarbearia(dto);
      if (guard.isFail()) return guard;
    }

    // 3. Serviços escolhidos precisam existir e pertencer a essa barbearia
    if (dto.serviceIds.length > 0) {
      const servicosResult = await this.#filaRepository.servicosValidos(dto.barbershopId, dto.serviceIds);
      if (servicosResult.isFail()) return servicosResult;
      if (!servicosResult.getValue()) {
        return Result.fail('Um ou mais serviços selecionados são inválidos.');
      }
    }

    // 4. Calcular próxima posição (count + 1)
    const countResult = await this.#filaRepository.countAtivos(dto.barbershopId);
    if (countResult.isFail()) return countResult;
    const posicao = countResult.getValue() + 1;

    // 5. Criar agregado e persistir
    const entradaResult = FilaEntrada.create({
      id:             randomUUID(),
      clienteId:      dto.clienteId,
      guestName:      dto.guestName,
      guestPhone:     dto.guestPhone,
      barbershopId:   dto.barbershopId,
      profissionalId: dto.profissionalId,
      posicao,
    });
    if (entradaResult.isFail()) return entradaResult;
    const entrada = entradaResult.getValue();

    const saveResult = await this.#filaRepository.save(entrada);
    if (saveResult.isFail()) return saveResult;

    // 6. Vincular serviços escolhidos
    if (dto.serviceIds.length > 0) {
      const linkResult = await this.#filaRepository.linkServicos(entrada.id, dto.barbershopId, dto.serviceIds);
      if (linkResult.isFail()) return linkResult;
    }

    // 7. Publicar eventos (fire-and-forget)
    entrada.pullDomainEvents();

    return Result.ok(FilaResponseDto.fromDomain(entrada));
  }

  /**
   * @param {import('./dto/EntrarNaFilaDto').EntrarNaFilaDto} dto
   * @returns {Promise<Result<void, string>>}
   */
  async #verificarBarbearia(dto) {
    const shop = await this.#barbeariaRepository.getStatusOperacional(dto.barbershopId);
    if (!shop || !shop.is_active) return Result.fail('Barbearia não encontrada.');

    if (!shop.is_open) {
      const nome  = shop.name ?? 'A barbearia';
      const razao = (shop.close_reason ?? '').toLowerCase().trim();
      let msg = `${nome} está fechada no momento.`;
      if (razao === 'almoco') msg = `${nome} está em pausa para almoço.`;
      if (razao === 'janta')  msg = `${nome} está em pausa para janta.`;
      return Result.fail(msg);
    }

    if (dto.profissionalId) {
      const vinculado = await this.#barbeariaRepository.profissionalTemVinculoAtivo(dto.barbershopId, dto.profissionalId);
      if (!vinculado) return Result.fail('Profissional não está vinculado a esta barbearia.');
    }

    return Result.ok();
  }
}

module.exports = { EntrarNaFilaUseCase };
