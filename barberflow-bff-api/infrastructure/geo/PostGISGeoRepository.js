'use strict';

const { IGeoRepository } = require('../../domain/geo/ports/IGeoRepository');
const { Result }         = require('../../domain/shared/Result');
const { GeoFence }       = require('../../domain/geo/entities/GeoFence');
const { Place, PlaceType } = require('../../domain/geo/entities/Place');
const { Coordinate }     = require('../../domain/geo/value-objects/Coordinate');

// =============================================================
// PostGISGeoRepository — Implementação do IGeoRepository via
// Supabase + PostGIS.
//
// Usa:
//   - RPC update_user_geo     → updateUserLocation
//   - RPC get_active_geofences_near_user → getActiveGeofencesNearUser
//   - RPC get_barbershops_nearby          → getNearbyPlaces
//   - SELECT profiles                     → getUserLocation
// =============================================================

class PostGISGeoRepository extends IGeoRepository {
  /** @type {import('@supabase/supabase-js').SupabaseClient} */
  #db;

  /**
   * @param {{ db: import('@supabase/supabase-js').SupabaseClient }} deps
   */
  constructor({ db }) {
    super();
    if (!db) throw new TypeError('PostGISGeoRepository: db é obrigatório');
    this.#db = db;
  }

  // ── IGeoRepository ──────────────────────────────────────────────

  /**
   * @param {string} userId
   * @param {number} lat
   * @param {number} lng
   * @returns {Promise<Result<{ prevLat: number|null, prevLng: number|null, prevLocationAt: Date|null }, string>>}
   */
  async updateUserLocation(userId, lat, lng) {
    try {
      const { data, error } = await this.#db.rpc('update_user_geo', {
        p_user_id: userId,
        p_lat:     lat,
        p_lng:     lng,
      });

      if (error) return Result.fail(`PostGISGeoRepository.updateUserLocation: ${error.message}`);

      const row = Array.isArray(data) ? data[0] : data;
      return Result.ok({
        prevLat:        row?.prev_lat        ?? null,
        prevLng:        row?.prev_lng        ?? null,
        prevLocationAt: row?.prev_location_at ? new Date(row.prev_location_at) : null,
      });
    } catch (err) {
      return Result.fail(`PostGISGeoRepository.updateUserLocation: ${err.message}`);
    }
  }

  /**
   * @param {string} userId
   * @returns {Promise<Result<{ lat: number, lng: number, locationAt: Date }|null, string>>}
   */
  async getUserLocation(userId) {
    try {
      const { data, error } = await this.#db
        .from('profiles')
        .select('last_lat, last_lng, last_location_at')
        .eq('id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return Result.ok(null); // not found
        return Result.fail(`PostGISGeoRepository.getUserLocation: ${error.message}`);
      }

      if (!data || data.last_lat == null) return Result.ok(null);

      return Result.ok({
        lat:        data.last_lat,
        lng:        data.last_lng,
        locationAt: new Date(data.last_location_at),
      });
    } catch (err) {
      return Result.fail(`PostGISGeoRepository.getUserLocation: ${err.message}`);
    }
  }

  /**
   * @param {string} userId
   * @param {number} radiusMeters
   * @returns {Promise<Result<GeoFence[], string>>}
   */
  async getActiveGeofencesNearUser(userId, radiusMeters) {
    try {
      const { data, error } = await this.#db.rpc('get_active_geofences_near_user', {
        p_user_id:     userId,
        p_raio_metros: radiusMeters,
      });

      if (error) return Result.fail(`PostGISGeoRepository.getActiveGeofencesNearUser: ${error.message}`);

      const geofences = (data ?? []).map(row => {
        const center = Coordinate.create({ lat: row.center_lat, lng: row.center_lng }).getValue();
        return new GeoFence({
          id:           row.id,
          name:         row.name,
          ownerId:      row.owner_id,
          center,
          radiusMeters: row.radius_m,
          isActive:     row.is_active,
        });
      });

      return Result.ok(geofences);
    } catch (err) {
      return Result.fail(`PostGISGeoRepository.getActiveGeofencesNearUser: ${err.message}`);
    }
  }

  /**
   * @param {number} lat
   * @param {number} lng
   * @param {number} radiusMeters
   * @param {number} limit
   * @returns {Promise<Result<Place[], string>>}
   */
  async getNearbyPlaces(lat, lng, radiusMeters, limit) {
    try {
      const { data, error } = await this.#db.rpc('get_barbershops_nearby', {
        lat,
        lng,
        raio_metros: radiusMeters,
        limit_val:   limit,
      });

      if (error) return Result.fail(`PostGISGeoRepository.getNearbyPlaces: ${error.message}`);

      const places = (data ?? []).map(row => {
        const coord = Coordinate.create({ lat: row.lat, lng: row.lng }).getValue();
        return new Place({
          id:             row.id,
          name:           row.nome ?? row.name,
          type:           PlaceType.BARBERSHOP,
          coordinate:     coord,
          distanceMeters: row.distancia_m ?? null,
          metadata: {
            foto_url:    row.foto_url    ?? null,
            endereco:    row.endereco    ?? null,
            servicos:    row.servicos    ?? [],
            avaliacao:   row.avaliacao   ?? null,
          },
        });
      });

      return Result.ok(places);
    } catch (err) {
      return Result.fail(`PostGISGeoRepository.getNearbyPlaces: ${err.message}`);
    }
  }
}

module.exports = { PostGISGeoRepository };
