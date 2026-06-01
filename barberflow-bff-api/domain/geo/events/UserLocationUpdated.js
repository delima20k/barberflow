'use strict';

const { randomUUID } = require('crypto');

// =============================================================
// UserLocationUpdated — Evento emitido quando a posição de um
// usuário é atualizada com sucesso.
//
// Não estende DomainEvent diretamente pois o construtor do pai
// faz Object.freeze(this) antes de o filho poder atribuir props.
// Segue o mesmo contrato (eventId, eventName, aggregateId,
// occurredAt) mas é um DTO simples + freeze no final.
// =============================================================

class UserLocationUpdated {
  /**
   * @param {object} params
   * @param {string} params.userId
   * @param {number} params.lat
   * @param {number} params.lng
   * @param {boolean} params.spoofFlagged
   */
  constructor({ userId, lat, lng, spoofFlagged }) {
    this.eventId      = randomUUID();
    this.eventName    = 'UserLocationUpdated';
    this.aggregateId  = userId;
    this.occurredAt   = new Date();
    this.userId       = userId;
    this.lat          = lat;
    this.lng          = lng;
    this.spoofFlagged = Boolean(spoofFlagged);
    Object.freeze(this);
  }
}

module.exports = { UserLocationUpdated };
