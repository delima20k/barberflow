'use strict';

const { randomUUID }          = require('crypto');
const { BaseUseCase }         = require('../shared/BaseUseCase');
const { Result }              = require('../../domain/shared/Result');
const { Agendamento }         = require('../../domain/agendamento/Agendamento');
const { CriarAgendamentoDto } = require('./dto/CriarAgendamentoDto');
const { AgendamentoResponseDto } = require('./dto/AgendamentoResponseDto');

/**
 * CriarAgendamentoUseCase — Orquestra a criação de um novo agendamento.
 *
 * Responsabilidades:
 *  1. Validar DTO de entrada.
 *  2. Verificar conflitos de horário.
 *  3. Criar o agregado.
 *  4. Persistir via repositório.
 *  5. Publicar eventos de domínio.
 *
 * @extends {BaseUseCase<CriarAgendamentoDto, object>}
 */
class CriarAgendamentoUseCase extends BaseUseCase {
  /** @type {import('../../domain/agendamento/ports/IAgendamentoRepository').IAgendamentoRepository} */
  #agendamentoRepository;

  /**
   * @param {{ agendamentoRepository: import('../../domain/agendamento/ports/IAgendamentoRepository').IAgendamentoRepository }} deps
   */
  constructor({ agendamentoRepository }) {
    super();
    this.#agendamentoRepository = agendamentoRepository;
  }

  /**
   * @param {import('./dto/CriarAgendamentoDto').CriarAgendamentoDtoProps} command
   * @returns {Promise<Result<object, string>>}
   */
  async execute(command) {
    // 1. Validar DTO
    const dtoResult = CriarAgendamentoDto.create(command);
    if (dtoResult.isFail()) return dtoResult;
    const dto = dtoResult.getValue();

    // 2. Verificar conflitos
    const conflitosResult = await this.#agendamentoRepository.findConflitos(
      dto.profissionalId,
      dto.scheduledAt,
      new Date(dto.scheduledAt.getTime() + 60 * 60 * 1000), // +1h como janela padrão
    );
    if (conflitosResult.isFail()) return conflitosResult;
    if (conflitosResult.getValue().length > 0) {
      return Result.fail('Profissional já possui agendamento neste horário');
    }

    // 3. Criar agregado
    const agendamentoResult = Agendamento.create({
      id:             randomUUID(),
      clienteId:      dto.clienteId,
      profissionalId: dto.profissionalId,
      barbershopId:   dto.barbershopId,
      serviceId:      dto.serviceId,
      scheduledAt:    dto.scheduledAt,
      notes:          dto.notes ?? undefined,
    });
    if (agendamentoResult.isFail()) return agendamentoResult;
    const agendamento = agendamentoResult.getValue();

    // 4. Persistir
    const saveResult = await this.#agendamentoRepository.save(agendamento);
    if (saveResult.isFail()) return saveResult;

    // 5. Publicar eventos (fire-and-forget — infra trata async)
    agendamento.pullDomainEvents();

    return Result.ok(AgendamentoResponseDto.fromDomain(agendamento));
  }
}

module.exports = { CriarAgendamentoUseCase };
