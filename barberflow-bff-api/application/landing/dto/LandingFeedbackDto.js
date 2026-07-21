'use strict';

const AppError = require('../../../utils/AppError');

class LandingFeedbackDto {
  static #ALLOWED_TYPES = new Set([
    'Sugestão',
    'Melhoria',
    'Dúvida',
    'Problema',
    'Parceria',
    'Outro',
  ]);

  #data;

  constructor(payload = {}) {
    this.#data = Object.freeze({
      name: LandingFeedbackDto.#normalize(payload.name, 80),
      email: LandingFeedbackDto.#normalize(payload.email, 160).toLowerCase(),
      type: LandingFeedbackDto.#normalize(payload.type, 24),
      subject: LandingFeedbackDto.#normalize(payload.subject, 120),
      message: LandingFeedbackDto.#normalize(payload.message, 1000),
      privacyConsent: payload.privacyConsent === true,
      company: LandingFeedbackDto.#normalize(payload.company, 120),
    });
    this.#validate();
  }

  static from(payload) {
    return new LandingFeedbackDto(payload);
  }

  get isBot() {
    return this.#data.company.length > 0;
  }

  toJSON() {
    return { ...this.#data };
  }

  #validate() {
    if (this.#data.name.length < 2) {
      throw AppError.badRequest('Informe um nome válido.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.#data.email)) {
      throw AppError.badRequest('Informe um e-mail válido.');
    }
    if (!LandingFeedbackDto.#ALLOWED_TYPES.has(this.#data.type)) {
      throw AppError.badRequest('Selecione um tipo de mensagem válido.');
    }
    if (this.#data.subject.length < 3) {
      throw AppError.badRequest('Informe um assunto válido.');
    }
    if (this.#data.message.length < 10) {
      throw AppError.badRequest('A mensagem deve ter pelo menos 10 caracteres.');
    }
    if (!this.#data.privacyConsent) {
      throw AppError.badRequest('Aceite a política de privacidade para continuar.');
    }
  }

  static #normalize(value, maxLength) {
    return Array.from(String(value ?? ''))
      .filter((character) => {
        const codePoint = character.codePointAt(0);
        return codePoint > 31 && codePoint !== 127;
      })
      .join('')
      .trim()
      .slice(0, maxLength);
  }
}

module.exports = { LandingFeedbackDto };
