'use strict';

let _client   = null;
let _registry = null;

// prom-client é lazy-loaded para evitar falha em testes sem a dep
function _load() {
  if (_client) return _client;
  try {
    _client   = require('prom-client');
    _registry = new _client.Registry();
  } catch {
    _client   = false;
    _registry = null;
  }
  return _client;
}

/**
 * Metrics — Métricas Prometheus para a BFF BarberFlow.
 *
 * Padrões implementados:
 *   RED (Rate, Errors, Duration) por endpoint HTTP
 *   USE (Utilization, Saturation, Errors) por fila e cache
 *
 * Métricas de negócio:
 *   uploads/s, mensagens/s, jobs por fila
 *
 * Uso:
 *   Metrics.init()                          // uma vez no startup
 *   Metrics.recordHttp('POST', '/auth', 200, 45)
 *   Metrics.recordQueue('media', 'completed')
 *   Metrics.metricsText()                   // para o /metrics endpoint
 */
class Metrics {
  static #initialized = false;

  // ── HTTP RED ───────────────────────────────────────────────────
  static #httpRequestsTotal  = null;
  static #httpDurationMs     = null;
  static #httpErrorsTotal    = null;

  // ── Queue USE ──────────────────────────────────────────────────
  static #queueJobsTotal  = null;
  static #queueSizeGauge  = null;
  static #queueErrorsTotal = null;

  // ── Business ───────────────────────────────────────────────────
  static #uploadsTotal    = null;
  static #messagesTotal   = null;
  static #cacheHitsTotal  = null;
  static #cacheMissesTotal = null;
  static #wsConnections   = null;

  /**
   * Inicializa todos os coletores. Idempotente.
   * Deve ser chamado uma vez antes de processar requisições.
   * @returns {object|null} Registry prom-client ou null se não disponível
   */
  static init() {
    if (Metrics.#initialized) return _registry;
    const c = _load();
    if (!c) return null;

    // Default metrics (CPU, memory, event loop lag, etc.)
    c.collectDefaultMetrics({ register: _registry, prefix: 'bff_node_' });

    // ── HTTP RED ───────────────────────────────────────────────
    Metrics.#httpRequestsTotal = new c.Counter({
      name:       'bff_http_requests_total',
      help:       'Total de requisições HTTP recebidas',
      labelNames: ['method', 'route', 'status_code'],
      registers:  [_registry],
    });

    Metrics.#httpDurationMs = new c.Histogram({
      name:       'bff_http_request_duration_ms',
      help:       'Duração das requisições HTTP em milissegundos',
      labelNames: ['method', 'route', 'status_code'],
      buckets:    [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
      registers:  [_registry],
    });

    Metrics.#httpErrorsTotal = new c.Counter({
      name:       'bff_http_errors_total',
      help:       'Total de requisições HTTP com erro (4xx + 5xx)',
      labelNames: ['method', 'route', 'status_code'],
      registers:  [_registry],
    });

    // ── Queue USE ──────────────────────────────────────────────
    Metrics.#queueJobsTotal = new c.Counter({
      name:       'bff_queue_jobs_total',
      help:       'Total de jobs processados por fila e status',
      labelNames: ['queue', 'status'],
      registers:  [_registry],
    });

    Metrics.#queueSizeGauge = new c.Gauge({
      name:       'bff_queue_size_current',
      help:       'Número de jobs aguardando em cada fila',
      labelNames: ['queue'],
      registers:  [_registry],
    });

    Metrics.#queueErrorsTotal = new c.Counter({
      name:       'bff_queue_errors_total',
      help:       'Total de jobs que falharam por fila',
      labelNames: ['queue'],
      registers:  [_registry],
    });

    // ── Business ───────────────────────────────────────────────
    Metrics.#uploadsTotal = new c.Counter({
      name:       'bff_uploads_total',
      help:       'Total de uploads processados por tipo de mídia',
      labelNames: ['type'],
      registers:  [_registry],
    });

    Metrics.#messagesTotal = new c.Counter({
      name:       'bff_messages_sent_total',
      help:       'Total de mensagens enviadas por canal',
      labelNames: ['channel'],
      registers:  [_registry],
    });

    Metrics.#cacheHitsTotal = new c.Counter({
      name:       'bff_cache_hits_total',
      help:       'Total de cache hits por contexto',
      labelNames: ['context'],
      registers:  [_registry],
    });

    Metrics.#cacheMissesTotal = new c.Counter({
      name:       'bff_cache_misses_total',
      help:       'Total de cache misses por contexto',
      labelNames: ['context'],
      registers:  [_registry],
    });

    Metrics.#wsConnections = new c.Gauge({
      name:      'bff_ws_connections_current',
      help:      'Número atual de conexões WebSocket ativas',
      registers: [_registry],
    });

    Metrics.#initialized = true;
    return _registry;
  }

  // ── HTTP RED ─────────────────────────────────────────────────

  /**
   * Registra métricas RED de uma requisição HTTP.
   * @param {string} method    — GET, POST, etc.
   * @param {string} route     — rota normalizada (ex: /api/v1/barbearias/:id)
   * @param {number} statusCode
   * @param {number} durationMs
   */
  static recordHttp(method, route, statusCode, durationMs) {
    const labels = { method, route, status_code: String(statusCode) };
    Metrics.#httpRequestsTotal?.inc(labels);
    Metrics.#httpDurationMs?.observe(labels, durationMs);
    if (statusCode >= 400) {
      Metrics.#httpErrorsTotal?.inc(labels);
    }
  }

  // ── Queue USE ────────────────────────────────────────────────

  /**
   * @param {string} queue  — nome da fila
   * @param {'completed'|'failed'|'delayed'|'active'} status
   */
  static recordQueue(queue, status) {
    Metrics.#queueJobsTotal?.inc({ queue, status });
    if (status === 'failed') {
      Metrics.#queueErrorsTotal?.inc({ queue });
    }
  }

  /** @param {string} queue @param {number} size */
  static setQueueSize(queue, size) {
    Metrics.#queueSizeGauge?.set({ queue }, size);
  }

  // ── Business ─────────────────────────────────────────────────

  /** @param {'logo'|'cover'|'video'|'audio'|string} type */
  static recordUpload(type) { Metrics.#uploadsTotal?.inc({ type }); }

  /** @param {'chat'|'push'|'ws'|string} channel */
  static recordMessage(channel) { Metrics.#messagesTotal?.inc({ channel }); }

  /** @param {string} context */
  static recordCacheHit(context) { Metrics.#cacheHitsTotal?.inc({ context }); }

  /** @param {string} context */
  static recordCacheMiss(context) { Metrics.#cacheMissesTotal?.inc({ context }); }

  /** @param {number} delta +1 connect / -1 disconnect */
  static adjustWsConnections(delta) { Metrics.#wsConnections?.inc(delta); }

  // ── Exposição ────────────────────────────────────────────────

  /** @returns {Promise<string>} texto Prometheus para scraping */
  static async metricsText() {
    if (!_registry) return '';
    return _registry.metrics();
  }

  /** @returns {string} Content-Type esperado pelo Prometheus */
  static get contentType() {
    return _load()?.Registry?.REGISTRY_CONTENT_TYPE ?? 'text/plain; version=0.0.4; charset=utf-8';
  }

  /** Expõe o registry para testes / inspeção */
  static get registry() { return _registry; }

  static get isEnabled() { return Boolean(_load()); }
}

module.exports = { Metrics };
