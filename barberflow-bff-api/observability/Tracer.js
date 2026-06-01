'use strict';

/**
 * Tracer — Wrapper sobre OpenTelemetry API para a BFF BarberFlow.
 *
 * Padrão: fail-open. Se @opentelemetry/api não estiver instalado ou o SDK
 * não estiver inicializado, todas as operações retornam no-ops silenciosamente.
 *
 * Cobertura declarada:
 *   HTTP request → Express middleware (auto)
 *   Use case     → Tracer.withSpan('UseCase.executar', fn)
 *   Repository   → Tracer.withSpan('Repo.query', fn)
 *   Cache        → Tracer.withSpan('Cache.get', fn)
 *   Fila         → Tracer.withSpan('Queue.enqueue', fn)
 *   Worker       → Tracer.withSpan('Worker.process', fn)
 *
 * Auto-instrumentação (HTTP, Express, ioredis, BullMQ) é configurada
 * via sdk.js que deve ser carregado antes da app.
 */
class Tracer {
  static #tracer = null;
  static #api    = null;

  /**
   * Inicializa o tracer com nome do serviço. Chamado pelo sdk.js.
   * @param {string} [name='bff-barberflow']
   * @param {string} [version='1.0.0']
   */
  static init(name = 'bff-barberflow', version = '1.0.0') {
    const api = Tracer.#loadApi();
    if (!api) return;
    Tracer.#tracer = api.trace.getTracer(name, version);
  }

  /**
   * Cria e inicia um span manualmente. O chamador é responsável por span.end().
   * Prefira withSpan() para spans com escopo automático.
   * @param {string} name
   * @param {object} [attributes={}]
   * @returns {import('@opentelemetry/api').Span}
   */
  static startSpan(name, attributes = {}) {
    const api = Tracer.#loadApi();
    if (!api || !Tracer.#tracer) return Tracer.#noopSpan();

    const ctx  = api.context.active();
    const span = Tracer.#tracer.startSpan(name, { attributes }, ctx);
    return span;
  }

  /**
   * Executa fn dentro de um span com escopo automático.
   * O span é encerrado ao fim da execução (sucesso ou erro).
   *
   * @template T
   * @param {string}                          name       — nome do span
   * @param {(span: object) => Promise<T>}    fn         — async fn que recebe o span
   * @param {object}                          [attrs={}] — atributos iniciais
   * @returns {Promise<T>}
   */
  static async withSpan(name, fn, attrs = {}) {
    const api = Tracer.#loadApi();
    if (!api || !Tracer.#tracer) return fn(Tracer.#noopSpan());

    const span = Tracer.startSpan(name, attrs);
    const ctx  = api.trace.setSpan(api.context.active(), span);

    try {
      const result = await api.context.with(ctx, () => fn(span));
      span.setStatus({ code: api.SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: api.SpanStatusCode.ERROR, message: err.message });
      throw err;
    } finally {
      span.end();
    }
  }

  /**
   * Retorna o traceId do span ativo (contexto OTel).
   * Usado para enriquecer logs e headers de resposta.
   * @returns {string|null}
   */
  static currentTraceId() {
    const api = Tracer.#loadApi();
    if (!api) return null;
    return api.trace.getActiveSpan()?.spanContext()?.traceId ?? null;
  }

  /** @returns {boolean} */
  static get isEnabled() {
    return Boolean(Tracer.#loadApi() && Tracer.#tracer);
  }

  // ── Privados ────────────────────────────────────────────────

  static #loadApi() {
    if (Tracer.#api !== null) return Tracer.#api;
    try {
      Tracer.#api = require('@opentelemetry/api');
    } catch {
      Tracer.#api = false;
    }
    return Tracer.#api || null;
  }

  /** Span no-op para quando OTel não está disponível */
  static #noopSpan() {
    return {
      setAttribute:  () => {},
      setAttributes: () => {},
      setStatus:     () => {},
      recordException: () => {},
      addEvent:      () => {},
      end:           () => {},
      spanContext:   () => ({ traceId: '', spanId: '', traceFlags: 0 }),
      isRecording:   () => false,
    };
  }
}

module.exports = { Tracer };
