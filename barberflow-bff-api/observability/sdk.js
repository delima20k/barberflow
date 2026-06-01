'use strict';

/**
 * sdk.js — Inicialização do OpenTelemetry SDK.
 *
 * DEVE ser carregado ANTES de qualquer outro require para que a
 * auto-instrumentação funcione (monkey-patching de módulos Node.js).
 *
 * Modo de uso:
 *   node --require ./observability/sdk.js server.js
 *
 * Ou no topo do server.js (antes de outros requires):
 *   if (process.env.OTEL_ENABLED === 'true') require('./observability/sdk');
 *
 * Variáveis de ambiente:
 *   OTEL_ENABLED=true           — habilita o SDK (padrão: false em dev)
 *   OTEL_EXPORTER_OTLP_ENDPOINT — URL do collector OTLP HTTP
 *                                  (padrão: http://localhost:4318/v1/traces)
 *   OTEL_SERVICE_NAME           — nome do serviço (padrão: bff-barberflow)
 *   APP_VERSION                 — versão do serviço para atributo semconv
 *
 * Fail-open: se os pacotes OTel não estiverem instalados, o processo
 * não é interrompido — apenas o tracing fica desabilitado.
 */

'use strict';

function initOTelSDK() {
  // Não inicializa em testes — evita overhead e conflitos
  if (process.env.APP_ENV === 'test') return;

  // Exige habilitação explícita (opt-in)
  if (process.env.OTEL_ENABLED !== 'true') return;

  let NodeSDK, getNodeAutoInstrumentations, OTLPTraceExporter;
  let Resource, ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION;

  try {
    ({ NodeSDK }                    = require('@opentelemetry/sdk-node'));
    ({ getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node'));
    ({ OTLPTraceExporter }          = require('@opentelemetry/exporter-trace-otlp-http'));
    ({ Resource }                   = require('@opentelemetry/resources'));

    // semconv v1.27+ usa ATTR_*, versões anteriores usam SEMRESATTRS_*
    const semconv = require('@opentelemetry/semantic-conventions');
    ATTR_SERVICE_NAME    = semconv.ATTR_SERVICE_NAME    ?? semconv.SEMRESATTRS_SERVICE_NAME;
    ATTR_SERVICE_VERSION = semconv.ATTR_SERVICE_VERSION ?? semconv.SEMRESATTRS_SERVICE_VERSION;
  } catch {
    // Pacotes não instalados — tracing desabilitado silenciosamente
    return;
  }

  const exporterUrl = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    ?? 'http://localhost:4318/v1/traces';

  const sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]:    process.env.OTEL_SERVICE_NAME ?? 'bff-barberflow',
      [ATTR_SERVICE_VERSION]: process.env.APP_VERSION       ?? '1.0.0',
    }),
    traceExporter: new OTLPTraceExporter({ url: exporterUrl }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // fs é muito verboso e não agrega visibilidade útil
        '@opentelemetry/instrumentation-fs': { enabled: false },
        // DNS desnecessário para a BFF
        '@opentelemetry/instrumentation-dns': { enabled: false },
      }),
    ],
  });

  sdk.start();

  // Inicializa o Tracer depois que o SDK subiu
  const { Tracer } = require('./Tracer');
  Tracer.init(
    process.env.OTEL_SERVICE_NAME ?? 'bff-barberflow',
    process.env.APP_VERSION       ?? '1.0.0',
  );

  const shutdown = () =>
    sdk.shutdown().catch(err =>
      process.stderr.write(`[OTel] Erro no shutdown: ${err.message}\n`),
    );

  process.once('SIGTERM', shutdown);
  process.once('SIGINT',  shutdown);
}

initOTelSDK();
