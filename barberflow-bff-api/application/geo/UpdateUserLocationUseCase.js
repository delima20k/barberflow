'use strict';

const { Result }                = require('../../domain/shared/Result');
const { Coordinate }            = require('../../domain/geo/value-objects/Coordinate');
const { Track }                 = require('../../domain/geo/entities/Track');
const { GeofenceEvaluator }     = require('../../domain/geo/services/GeofenceEvaluator');
const { UserLocationUpdated }   = require('../../domain/geo/events/UserLocationUpdated');
const { UserEnteredGeofence }   = require('../../domain/geo/events/UserEnteredGeofence');
const { UserLeftGeofence }      = require('../../domain/geo/events/UserLeftGeofence');
const GeoConfig                 = require('../../config/geo');

// =============================================================
// UpdateUserLocationUseCase — Atualiza localização do usuário.
//
// Fluxo:
//  1. Valida coordenada via Coordinate VO
//  2. Persiste via geoCache (Redis + PostGIS)
//  3. Reconstrói Track a partir do histórico Redis
//  4. Anti-spoof via Track.addPosition()
//  5. Avalia geofences (GeofenceEvaluator)
//  6. Publica eventos de domínio (UserLocationUpdated + entered/left)
// =============================================================

class UpdateUserLocationUseCase {
  /** @type {import('../../infrastructure/geo/RedisGeoCache').RedisGeoCache} */
  #geoCache;

  /** @type {import('../../infrastructure/geo/PostGISGeoRepository').PostGISGeoRepository} */
  #geoRepository;

  /** @type {{ publish: function }} */
  #eventBus;

  /**
   * @param {object} deps
   * @param {object} deps.geoRepository
   * @param {object} deps.geoCache
   * @param {object} deps.eventBus
   */
  constructor({ geoRepository, geoCache, eventBus }) {
    if (!geoRepository) throw new TypeError('UpdateUserLocationUseCase: geoRepository é obrigatório');
    if (!geoCache)      throw new TypeError('UpdateUserLocationUseCase: geoCache é obrigatório');
    if (!eventBus)      throw new TypeError('UpdateUserLocationUseCase: eventBus é obrigatório');

    this.#geoRepository = geoRepository;
    this.#geoCache      = geoCache;
    this.#eventBus      = eventBus;
  }

  /**
   * @param {object} cmd
   * @param {string} cmd.userId
   * @param {number} cmd.lat
   * @param {number} cmd.lng
   * @returns {Promise<Result<{ lat: number, lng: number, spoofFlagged: boolean }, string>>}
   */
  async execute({ userId, lat, lng } = {}) {
    // ── 1. Validar input ──────────────────────────────────────────
    if (!userId || typeof userId !== 'string')
      return Result.fail('UpdateUserLocationUseCase: userId inválido');

    const coordResult = Coordinate.create({ lat, lng });
    if (coordResult.isFail()) return Result.fail(coordResult.getError());

    const newCoord = coordResult.getValue();

    // ── 2. Persistir via cache (Redis + PostGIS) ──────────────────
    const saveResult = await this.#geoCache.updateUserLocation(userId, lat, lng);
    if (saveResult.isFail()) return saveResult;

    // ── 3. Reconstruir Track para anti-spoof ──────────────────────
    const rawTrack = await this.#geoCache.getTrack(userId);
    const track = this.#buildTrack(userId, rawTrack);
    const { isFlagged } = track.addPosition(newCoord, new Date());

    // Persistir nova leitura no track Redis (após anti-spoof)
    await this.#geoCache.appendTrack(userId, lat, lng, new Date());

    // ── 4. Avaliar geofences ──────────────────────────────────────
    const geofences = await this.#loadGeofences(userId);
    const presenceMap = await this.#geoCache.getPresenceMap(userId);
    const prevCoord = track.snapshots.length > 0
      ? track.snapshots[0].coordinate
      : null;

    const { entered, left, updatedPresenceMap } = GeofenceEvaluator.evaluate({
      userId, newCoord, prevCoord, geofences, presenceMap,
    });

    // Salvar presença atualizada
    await this.#geoCache.savePresenceMap(userId, updatedPresenceMap);

    // ── 5. Publicar eventos ───────────────────────────────────────
    await this.#eventBus.publish(
      new UserLocationUpdated({ userId, lat, lng, spoofFlagged: isFlagged })
    );

    for (const fence of entered) {
      await this.#eventBus.publish(
        new UserEnteredGeofence({ userId, geofenceId: fence.id, geofenceName: fence.name, lat, lng })
      );
    }

    for (const fence of left) {
      await this.#eventBus.publish(
        new UserLeftGeofence({ userId, geofenceId: fence.id, geofenceName: fence.name, lat, lng })
      );
    }

    return Result.ok({ lat, lng, spoofFlagged: isFlagged });
  }

  // ── Internos ───────────────────────────────────────────────────

  /**
   * Reconstrói Track a partir do histórico Redis.
   * @param {string} userId
   * @param {Array<{ lat: number, lng: number, ts: number }>} rawTrack
   * @returns {Track}
   */
  #buildTrack(userId, rawTrack) {
    const positions = rawTrack
      .map(entry => {
        const coordR = Coordinate.create({ lat: entry.lat, lng: entry.lng });
        if (coordR.isFail()) return null;
        return { coordinate: coordR.getValue(), timestamp: new Date(entry.ts) };
      })
      .filter(Boolean)
      .reverse(); // Redis retorna mais recente primeiro; Track espera cronológico

    return new Track({
      userId,
      positions,
      windowSize:  GeoConfig.TRACK_WINDOW_SIZE,
      maxSpeedKmh: GeoConfig.MAX_SPEED_KMH,
    });
  }

  /**
   * Carrega geofences próximas ao usuário via repositório.
   * Falha silenciosamente para não bloquear a atualização.
   * @param {string} userId
   * @returns {Promise<import('../../domain/geo/entities/GeoFence').GeoFence[]>}
   */
  async #loadGeofences(userId) {
    try {
      const r = await this.#geoRepository.getActiveGeofencesNearUser(
        userId,
        GeoConfig.DEFAULT_NEARBY_RADIUS_KM * 1000,
      );
      return r.isOk() ? r.getValue() : [];
    } catch {
      return [];
    }
  }
}

module.exports = { UpdateUserLocationUseCase };
