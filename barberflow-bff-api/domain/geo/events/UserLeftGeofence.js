'use strict';

const { randomUUID } = require('crypto');

// =============================================================
// UserLeftGeofence — Evento emitido quando um usuário sai
// de uma geofence (transição inside → outside).
// =============================================================

class UserLeftGeofence {
  /**
   * @param {object} params
   * @param {string} params.userId
   * @param {string} params.geofenceId
   * @param {string} params.geofenceName
   * @param {number} params.lat
   * @param {number} params.lng
   */
  constructor({ userId, geofenceId, geofenceName, lat, lng }) {
    this.eventId      = randomUUID();
    this.eventName    = 'UserLeftGeofence';
    this.aggregateId  = userId;
    this.occurredAt   = new Date();
    this.userId       = userId;
    this.geofenceId   = geofenceId;
    this.geofenceName = geofenceName;
    this.lat          = lat;
    this.lng          = lng;
    Object.freeze(this);
  }
}

module.exports = { UserLeftGeofence };
