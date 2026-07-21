'use strict';

const AppError = require('../../../utils/AppError');
const { LandingFeedbackDto } = require('../dto/LandingFeedbackDto');

class SubmitLandingFeedbackUseCase {
  static #DESTINATION = 'contato@barberflow.live';
  static #ORIGIN = 'Landing Page BarberFlow';

  #emailService;
  #clock;

  constructor(emailService, { clock = null } = {}) {
    if (!emailService?.sendLandingFeedback) {
      throw new TypeError('SubmitLandingFeedbackUseCase.emailService é obrigatório.');
    }
    this.#emailService = emailService;
    this.#clock = clock;
  }

  async execute(payload) {
    const dto = LandingFeedbackDto.from(payload);
    if (dto.isBot) return { accepted: true };

    const { company: _company, ...feedback } = dto.toJSON();
    const result = await this.#emailService.sendLandingFeedback(
      SubmitLandingFeedbackUseCase.#DESTINATION,
      {
        ...feedback,
        submittedAt: this.#now().toISOString(),
        origin: SubmitLandingFeedbackUseCase.#ORIGIN,
      },
    );

    if (!result?.ok) {
      throw AppError.unavailable('Não foi possível enviar sua sugestão agora. Tente novamente mais tarde.');
    }

    return { accepted: true };
  }

  #now() {
    const value = this.#clock?.now?.() ?? new Date();
    return value instanceof Date ? value : new Date(value);
  }
}

module.exports = { SubmitLandingFeedbackUseCase };
