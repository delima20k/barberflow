'use strict';

// =============================================================
// config/geo.js — Constantes do bounded context de geolocalização.
//
// Centraliza todos os parâmetros configuráveis via env vars.
// Nenhum outro arquivo do módulo geo define valores mágicos.
// =============================================================

/** Velocidade máxima plausível para um ser humano (km/h). Acima disso → anti-spoof flag. */
const MAX_SPEED_KMH = Number(process.env.GEO_MAX_SPEED_KMH ?? 1000);

/** Número de leituras mantidas na janela deslizante do Track (Redis). */
const TRACK_WINDOW_SIZE = Number(process.env.GEO_TRACK_WINDOW_SIZE ?? 3);

/** TTL do cache de geocoding reverso (7 dias em segundos). */
const GEOCODE_TTL_SECONDS = Number(process.env.GEO_GEOCODE_TTL_SECONDS ?? 604800);

/** Janela de rate-limit para atualização de localização (ms). */
const GEO_RL_WINDOW_MS = Number(process.env.GEO_RL_WINDOW_MS ?? 5000);

/** Número máximo de atualizações por usuário dentro da janela de rate-limit. */
const GEO_RL_MAX = Number(process.env.GEO_RL_MAX ?? 1);

/** TTL do cache Redis Geo de barbearias próximas (segundos). */
const REDIS_GEO_TTL_SECONDS = Number(process.env.GEO_REDIS_TTL_SECONDS ?? 60);

/** TTL do estado de presença em geofences por usuário no Redis (segundos = 24h). */
const GEO_PRESENCE_TTL_SECONDS = Number(process.env.GEO_PRESENCE_TTL_SECONDS ?? 86400);

/** TTL do sliding window de track no Redis (segundos = 24h). */
const TRACK_REDIS_TTL_SECONDS = Number(process.env.GEO_TRACK_TTL_SECONDS ?? 86400);

// ── Prefixos de chaves Redis ──────────────────────────────────

/** Prefixo do sliding window de track por usuário: bf:track:{userId} */
const REDIS_TRACK_PREFIX = 'bf:track:';

/** Prefixo do cache de geocoding reverso: bf:geocode:{geohash} */
const REDIS_GEOCODE_PREFIX = 'bf:geocode:';

/** Chave da sorted set Redis Geo de barbearias: bf:geo:barbershops */
const REDIS_GEO_KEY = 'bf:geo:barbershops';

/** Prefixo do estado de presença em geofences: bf:geo-presence:{userId} */
const REDIS_GEO_PRESENCE_PREFIX = 'bf:geo-presence:';

/** Prefixo do rate-limit de atualização de localização: bf:geo-rl:{userId} */
const REDIS_GEO_RL_PREFIX = 'bf:geo-rl:';

// ── Raio padrão para queries de proximidade ───────────────────

/** Raio padrão para "nearby" quando não especificado (km). */
const DEFAULT_NEARBY_RADIUS_KM = Number(process.env.GEO_DEFAULT_NEARBY_RADIUS_KM ?? 5);

/** Raio máximo permitido para queries de proximidade (km). */
const MAX_NEARBY_RADIUS_KM = Number(process.env.GEO_MAX_NEARBY_RADIUS_KM ?? 50);

/** Número máximo de resultados para queries de proximidade. */
const MAX_NEARBY_LIMIT = Number(process.env.GEO_MAX_NEARBY_LIMIT ?? 50);

module.exports = {
  MAX_SPEED_KMH,
  TRACK_WINDOW_SIZE,
  GEOCODE_TTL_SECONDS,
  GEO_RL_WINDOW_MS,
  GEO_RL_MAX,
  REDIS_GEO_TTL_SECONDS,
  GEO_PRESENCE_TTL_SECONDS,
  TRACK_REDIS_TTL_SECONDS,
  REDIS_TRACK_PREFIX,
  REDIS_GEOCODE_PREFIX,
  REDIS_GEO_KEY,
  REDIS_GEO_PRESENCE_PREFIX,
  REDIS_GEO_RL_PREFIX,
  DEFAULT_NEARBY_RADIUS_KM,
  MAX_NEARBY_RADIUS_KM,
  MAX_NEARBY_LIMIT,
};
