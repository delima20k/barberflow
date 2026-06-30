'use strict';

/**
 * IEmailService - Port de alto nivel para emails transacionais.
 *
 * A camada de auth depende apenas deste contrato. Implementacoes concretas
 * podem usar Resend, SMTP ou fila, sem mudar os use cases/services.
 */
class IEmailService {
  /**
   * Envia confirmacao de cadastro.
   * @param {string} userEmail
   * @param {string} userName
   * @param {string} confirmationLink
   * @returns {Promise<{ ok: boolean, skipped?: boolean, providerId?: string|null, error?: string }>}
   */
  async sendSignupConfirmation(userEmail, userName, confirmationLink) {
    throw new Error(`${this.constructor.name}.sendSignupConfirmation() nao implementado`);
  }

  /**
   * Envia recuperacao de senha.
   * @param {string} userEmail
   * @param {string} userName
   * @param {string} resetLink
   * @param {number} expiresInMinutes
   * @returns {Promise<{ ok: boolean, skipped?: boolean, providerId?: string|null, error?: string }>}
   */
  async sendPasswordReset(userEmail, userName, resetLink, expiresInMinutes) {
    throw new Error(`${this.constructor.name}.sendPasswordReset() nao implementado`);
  }

  /**
   * Notifica troca de senha realizada.
   * @param {string} userEmail
   * @param {string} userName
   * @returns {Promise<{ ok: boolean, skipped?: boolean, providerId?: string|null, error?: string }>}
   */
  async sendPasswordChangedNotification(userEmail, userName) {
    throw new Error(`${this.constructor.name}.sendPasswordChangedNotification() nao implementado`);
  }
}

module.exports = { IEmailService };
