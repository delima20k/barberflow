'use strict';

const { CacheKeyBuilder } = require('../../../infrastructure/cache/CacheKeyBuilder');
const { CACHE_TTL }       = require('../../../config/cacheTtl');

/**
 * IdempotencyMiddleware — Garante que POST/PUT críticos sejam idempotentes.
 *
 * Protocolo:
 *   Cliente envia `Idempotency-Key: <uuid>` no header.
 *   Se a chave já existe no cache → retorna a resposta original armazenada.
 *   Se não existe → processa normalmente e armazena a resposta no cache.
 *
 * Segurança:
 *   - Chave UUID é validada (formato UUID v4).
 *   - Apenas respostas HTTP < 500 são cacheadas (erros de infra não são idempotentes).
 *   - TTL configurável via CACHE_TTL.IDEMPOTENCY (default: 24h).
 *
 * Uso:
 *   router.post('/agendamentos', idempotencyMiddleware.handler(), criarAgendamentoHandler);
 */
class IdempotencyMiddleware {
  /** @type {import('../../../infrastructure/cache/SingleFlightCache').SingleFlightCache} */
  #cache;
  /** @type {number} */
  #ttlSeconds;

  static #UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  /**
   * @param {{
   *   cache:       import('../../../infrastructure/cache/SingleFlightCache').SingleFlightCache,
   *   ttlSeconds?: number
   * }} deps
   */
  constructor({ cache, ttlSeconds }) {
    if (!cache) throw new TypeError('IdempotencyMiddleware: cache é obrigatório');
    this.#cache      = cache;
    this.#ttlSeconds = ttlSeconds ?? CACHE_TTL.IDEMPOTENCY;
  }

  /**
   * Retorna o handler Express para ser usado como middleware.
   * @returns {import('express').RequestHandler}
   */
  handler() {
    return async (req, res, next) => {
      const rawKey = req.headers['idempotency-key'];

      // Header ausente → não é requisição idempotente; continua normalmente
      if (!rawKey) return next();

      // Validar formato UUID
      if (!IdempotencyMiddleware.#UUID_RE.test(rawKey)) {
        return res.status(400).json({
          error: 'Idempotency-Key inválida. Use UUID v4.',
        });
      }

      const cacheKey = CacheKeyBuilder.idempotency(rawKey);

      // Verificar se já existe resposta para essa chave
      const cached = await this.#cache.get(cacheKey);
      if (cached) {
        res.setHeader('X-Idempotent-Replayed', 'true');
        return res.status(cached.status).json(cached.body);
      }

      // Interceptar a resposta para armazená-la no cache
      const originalJson = res.json.bind(res);

      res.json = async (body) => {
        // Só cachear respostas bem-sucedidas (não erros 5xx)
        if (res.statusCode < 500) {
          await this.#cache
            .set(cacheKey, { status: res.statusCode, body }, this.#ttlSeconds)
            .catch(err => {
              // Não bloquear a resposta se o cache falhar
              // eslint-disable-next-line no-console
              console.error('[IdempotencyMiddleware] Falha ao salvar no cache:', err?.message);
            });
        }
        return originalJson(body);
      };

      next();
    };
  }
}

module.exports = { IdempotencyMiddleware };
