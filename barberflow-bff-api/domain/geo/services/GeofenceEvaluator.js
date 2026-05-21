'use strict';

const { GeoFence }   = require('../entities/GeoFence');
const { Coordinate } = require('../value-objects/Coordinate');

// =============================================================
// GeofenceEvaluator — Domain Service puro para avaliação de geofences.
//
// Compara a nova posição do usuário com cada geofence e determina:
//   - entered: geofences onde o usuário acabou de entrar
//   - left:    geofences que o usuário acabou de deixar
//
// Baseado no presenceMap (estado anterior) + posição nova.
// Sem IO — testável em memória. Toda IO fica nos use cases.
// =============================================================

class GeofenceEvaluator {
  // ── Interface pública (estática — sem estado interno) ──────────

  /**
   * Avalia transições de geofence para um usuário.
   *
   * @param {object}                  params
   * @param {string}                  params.userId
   * @param {Coordinate}              params.newCoord          - Nova posição
   * @param {Coordinate|null}         params.prevCoord         - Posição anterior (null = primeira leitura)
   * @param {GeoFence[]}              params.geofences         - Geofences ativas a verificar
   * @param {Record<string, boolean>} params.presenceMap       - Estado anterior { geofenceId: true }
   *
   * @returns {{
   *   entered:             GeoFence[],
   *   left:                GeoFence[],
   *   updatedPresenceMap:  Record<string, boolean>,
   * }}
   */
  static evaluate({ userId, newCoord, prevCoord, geofences, presenceMap }) {
    if (!(newCoord instanceof Coordinate))
      throw new TypeError('GeofenceEvaluator: newCoord deve ser instância de Coordinate');

    const entered = [];
    const left    = [];
    const updated = { ...presenceMap };

    for (const fence of geofences) {
      if (!(fence instanceof GeoFence) || !fence.isActive) continue;

      const wasInside = Boolean(presenceMap[fence.id]);
      const isNowInside = fence.contains(newCoord);

      if (!wasInside && isNowInside) {
        entered.push(fence);
        updated[fence.id] = true;
      } else if (wasInside && !isNowInside) {
        left.push(fence);
        updated[fence.id] = false;
      }
    }

    return { entered, left, updatedPresenceMap: updated };
  }
}

module.exports = { GeofenceEvaluator };
