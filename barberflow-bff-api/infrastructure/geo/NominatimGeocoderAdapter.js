'use strict';

const { IReverseGeocoder } = require('../../domain/geo/ports/IReverseGeocoder');
const { Result }           = require('../../domain/shared/Result');

// =============================================================
// NominatimGeocoderAdapter — Adapter para OSM Nominatim API.
//
// Throttle obrigatório: 1 req/s (política de uso da Nominatim).
// User-Agent obrigatório: identifica a aplicação para a Nominatim.
//
// Em produção, o GeocodingCacheDecorator DEVE estar na frente
// para evitar chamadas desnecessárias e respeitar o rate limit.
// =============================================================

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const MIN_INTERVAL_MS = 1000; // 1 req/s — obrigatório pela política da Nominatim

class NominatimGeocoderAdapter extends IReverseGeocoder {
  /** @type {string} */
  #userAgent;

  /** @type {number} Timestamp da última requisição */
  #lastRequestAt;

  /**
   * @param {object} params
   * @param {string} params.userAgent - ex: "BarberFlow/1.0 (contact@barberflow.com)"
   */
  constructor({ userAgent = 'BarberFlow/1.0 (geocoder)' } = {}) {
    super();
    this.#userAgent    = userAgent;
    this.#lastRequestAt = 0;
  }

  /**
   * @param {number} lat
   * @param {number} lng
   * @returns {Promise<Result<{ display_name: string, city: string|null, country: string|null }|null, string>>}
   */
  async reverseGeocode(lat, lng) {
    await this.#throttle();

    try {
      const url = `${NOMINATIM_BASE}/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;

      const res = await fetch(url, {
        headers: {
          'User-Agent': this.#userAgent,
          'Accept':     'application/json',
        },
      });

      if (res.status === 404) return Result.ok(null);

      if (!res.ok) {
        return Result.fail(`NominatimGeocoderAdapter: HTTP ${res.status} para (${lat}, ${lng})`);
      }

      const data = await res.json();

      if (!data || !data.display_name) return Result.ok(null);

      return Result.ok({
        display_name: data.display_name,
        city:    data.address?.city   ?? data.address?.town  ?? data.address?.village ?? null,
        country: data.address?.country ?? null,
      });
    } catch (err) {
      return Result.fail(`NominatimGeocoderAdapter: ${err.message}`);
    }
  }

  /**
   * Geocodificação direta: endereço estruturado → coordenadas.
   * Tentativa 1: busca estruturada (street/city/state) — não exige bairro;
   *              bairros do ViaCEP frequentemente divergem dos nomes no OSM.
   * Tentativa 2: busca livre SEM bairro (logradouro, cidade, Brasil).
   * Tentativa 3 (fallback): busca estruturada por CEP (postalcode + country).
   *
   * @param {object} params
   * @param {string} [params.address]      — logradouro (sem número)
   * @param {string} [params.neighborhood] — bairro (aceito, mas não usado nas queries)
   * @param {string} [params.city]
   * @param {string} [params.state]        — UF
   * @param {string} [params.zipCode]      — CEP (com ou sem hífen)
   * @returns {Promise<Result<{ lat: number, lng: number }|null, string>>}
   */
  async forwardGeocode({ address, neighborhood, city, state, zipCode } = {}) {
    // Tentativa 1 — busca estruturada street/city/state
    if (address && city) {
      const p = new URLSearchParams({ street: address, city, country: 'br' });
      if (state) p.set('state', state);
      const r1 = await this.#search(p.toString());
      if (r1.isOk() && r1.getValue()) return r1;
    }

    // Tentativa 2 — query livre sem bairro
    const partes = [address, city, 'Brasil'].filter(Boolean);
    if (partes.length > 1) {
      const r2 = await this.#search(`q=${encodeURIComponent(partes.join(', '))}&countrycodes=br`);
      if (r2.isOk() && r2.getValue()) return r2;
    }

    // Tentativa 3 — CEP estruturado
    const cepLimpo = String(zipCode ?? '').replace(/\D/g, '');
    if (cepLimpo.length === 8) {
      return this.#search(`postalcode=${cepLimpo}&country=br`);
    }

    return Result.ok(null);
  }

  /**
   * Executa busca /search na Nominatim e extrai o primeiro resultado.
   * @param {string} queryString — parâmetros já codificados (sem format/limit)
   * @returns {Promise<Result<{ lat: number, lng: number }|null, string>>}
   */
  async #search(queryString) {
    await this.#throttle();

    try {
      const url = `${NOMINATIM_BASE}/search?${queryString}&format=json&limit=1`;

      const res = await fetch(url, {
        headers: {
          'User-Agent': this.#userAgent,
          'Accept':     'application/json',
        },
      });

      if (!res.ok) {
        return Result.fail(`NominatimGeocoderAdapter: HTTP ${res.status} (forward)`);
      }

      const lista = await res.json();
      if (!Array.isArray(lista) || !lista.length) return Result.ok(null);

      const lat = parseFloat(lista[0].lat);
      const lng = parseFloat(lista[0].lon);
      if (!isFinite(lat) || !isFinite(lng)) return Result.ok(null);

      return Result.ok({ lat, lng });
    } catch (err) {
      return Result.fail(`NominatimGeocoderAdapter: ${err.message}`);
    }
  }

  // ── Throttle ───────────────────────────────────────────────────

  /**
   * Garante que no máximo 1 requisição por segundo seja feita.
   * @returns {Promise<void>}
   */
  async #throttle() {
    const now    = Date.now();
    const elapsed = now - this.#lastRequestAt;

    if (elapsed < MIN_INTERVAL_MS) {
      await new Promise(resolve => setTimeout(resolve, MIN_INTERVAL_MS - elapsed));
    }

    this.#lastRequestAt = Date.now();
  }
}

module.exports = { NominatimGeocoderAdapter };
