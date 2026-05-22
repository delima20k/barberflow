# Observabilidade — BFF BarberFlow

## Visão geral

A camada de observabilidade da BFF cobre os quatro pilares:

| Pilar | Ferramenta | Localização |
|---|---|---|
| **Logs** | pino (JSON estruturado) | `middlewares/logger.js` |
| **Métricas** | Prometheus + prom-client | `observability/Metrics.js` |
| **Traces** | OpenTelemetry (OTLP) | `observability/Tracer.js` + `sdk.js` |
| **Erros** | Sentry (sem PII) | `observability/SentryClient.js` |

### Propagação de correlação ponta-a-ponta

```
Request HTTP
  └─ ObservabilityMiddleware.handle()
       └─ CorrelationContext.run({ correlationId, traceId })
            ├─ Logger pino (mixin automático)
            ├─ OTel span ativo
            ├─ Job payload._meta.correlationId → BullMQ → Worker
            └─ Response headers: x-correlation-id, x-trace-id
```

---

## 1. Logs Estruturados (pino JSON)

### Campos obrigatórios em TODOS os logs

| Campo | Tipo | Descrição |
|---|---|---|
| `time` | ISO 8601 | Timestamp UTC |
| `level` | string | Nível semântico (ver tabela abaixo) |
| `service` / `name` | string | `"bff-barberflow"` |
| `env` | string | `development` / `staging` / `production` |
| `correlationId` | string UUID | Rastreabilidade cross-request (do cliente ou gerado) |
| `traceId` | string hex32 | Correlação com OTel trace |
| `requestId` | string UUID | Identificação única do request HTTP |
| `userId` | string \| null | ID opaco do usuário autenticado (sem email/CPF) |

### Níveis — Quando usar cada um

| Nível | Código | Quando usar | Exemplo |
|---|---|---|---|
| `trace` | 10 | Debugging de fluxo interno granular | Entrada/saída de cada método de repositório |
| `debug` | 20 | Informação útil para desenvolvimento local | Parâmetros de query, cache miss detail |
| `info` | 30 | **Eventos normais de negócio** (default em produção) | Agendamento criado, usuário autenticado |
| `warn` | 40 | **Situação anormal mas recuperável** | Rate limit atingido, retry de DB, dep degradada |
| `error` | 50 | **Falha que afeta o usuário** (todo 5xx) | Query falhou, fila inacessível |
| `fatal` | 60 | **Processo não pode continuar** | Variável de ambiente crítica ausente, OOM |

#### Regras obrigatórias

- ❌ **NUNCA usar `console.log`** — toda saída via `logger`
- ❌ **NUNCA logar `email`, `cpf`, `password`, `token`, `senha`, `telefone`** — redact configurado
- ✅ `logger.info` para fluxo normal de negócio
- ✅ `logger.warn` para retries, degradação, limites atingidos
- ✅ `logger.error` para toda exception que chega ao ErrorHandler
- ✅ Incluir `{ err }` no objeto de contexto (pino serializa stack trace)

#### Exemplo de log correto

```js
// ✅ Correto
logger.info({ agendamentoId, userId: ctx.userId }, 'Agendamento criado');
logger.error({ err, correlationId }, '[BFF] Falha ao criar agendamento');

// ❌ Errado
console.log('Agendamento criado');                    // console.log proibido
logger.info({ email: user.email }, 'Login');          // PII no log
logger.error('erro: ' + err.message);                 // string apenas, sem contexto
```

---

## 2. Métricas Prometheus (RED + USE)

### Endpoint de scraping

```
GET /metrics
```

> **Proteger em produção**: expor apenas para rede interna ou atrás de Basic Auth.

### Métricas RED por endpoint HTTP

| Métrica | Tipo | Labels |
|---|---|---|
| `bff_http_requests_total` | Counter | `method`, `route`, `status_code` |
| `bff_http_request_duration_ms` | Histogram | `method`, `route`, `status_code` |
| `bff_http_errors_total` | Counter | `method`, `route`, `status_code` |

### Métricas USE por fila

| Métrica | Tipo | Labels |
|---|---|---|
| `bff_queue_jobs_total` | Counter | `queue`, `status` |
| `bff_queue_size_current` | Gauge | `queue` |
| `bff_queue_errors_total` | Counter | `queue` |

### Métricas de negócio

| Métrica | Tipo | Labels | Descrição |
|---|---|---|---|
| `bff_uploads_total` | Counter | `type` | uploads/s por tipo de mídia |
| `bff_messages_sent_total` | Counter | `channel` | mensagens/s por canal |
| `bff_cache_hits_total` | Counter | `context` | taxa de acerto do cache |
| `bff_cache_misses_total` | Counter | `context` | taxa de miss do cache |
| `bff_ws_connections_current` | Gauge | — | conexões WebSocket ativas |

### Métricas default Node.js (prefixo `bff_node_`)

CPU, memória heap, event loop lag, GC — coletadas automaticamente.

---

## 3. Distributed Tracing (OpenTelemetry)

### Configuração

```bash
# .env (habilitar tracing)
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318/v1/traces
OTEL_SERVICE_NAME=bff-barberflow
APP_VERSION=1.0.0
```

### Cobertura automática (auto-instrumentação)

| Camada | Instrumentação |
|---|---|
| HTTP (incoming) | `@opentelemetry/instrumentation-http` |
| Express routes | `@opentelemetry/instrumentation-express` |
| ioredis | `@opentelemetry/instrumentation-ioredis` |
| HTTP (outgoing) | `@opentelemetry/instrumentation-http` |

### Cobertura manual (use case → repo → cache → fila)

```js
const { Tracer } = require('../observability/Tracer');

// Em use cases
async execute(cmd) {
  return Tracer.withSpan('AgendamentoBffService.criar', async (span) => {
    span.setAttribute('agendamento.clientId', cmd.clientId);
    return this.#repository.criar(cmd);
  });
}

// Em workers
async process(job) {
  return Tracer.withSpan('MediaProcessingHandler.process', async (span) => {
    span.setAttribute('job.id', job.id);
    span.setAttribute('queue.name', job.queueName);
    // ...
  });
}
```

### Propagação W3C

O `ObservabilityMiddleware` extrai o header `traceparent` W3C e o propaga via `CorrelationContext`. Headers de resposta:
- `x-trace-id` — traceId para correlação por log/client
- `x-correlation-id` — ID de correlação do cliente
- `x-request-id` — UUID único do request

---

## 4. Error Monitoring (Sentry)

### Configuração

```bash
SENTRY_DSN=https://...@sentry.io/...
SENTRY_SAMPLE_RATE=0.1   # 10% em produção
APP_VERSION=1.0.0
```

### Contexto de domínio enviado ao Sentry

| Campo | Tipo | Exemplo |
|---|---|---|
| `userId` | tag | ID opaco (hash, nunca email) |
| `role` | tag | `barber` / `client` |
| `command` | tag | `CriarAgendamento` |
| `domain` | tag | `agendamentos` / `bff` |
| `route` | tag | `POST /api/agendamentos` |
| `traceId` | tag | hex32 OTel trace ID |

### Campos NUNCA enviados ao Sentry (filtro beforeSend)

`email`, `password`, `senha`, `token`, `refreshToken`, `cpf`, `phone`, `telefone`, `ip_address`

---

## 5. Health Checks

| Endpoint | Propósito | SLO interno |
|---|---|---|
| `GET /health/live` | Liveness — processo está vivo | p99 < 5ms, disponibilidade 100% |
| `GET /health/ready` | Readiness — deps OK (Supabase + Redis) | p99 < 500ms |

### Resposta de readiness degradada

```json
{
  "ok": false,
  "status": "degraded",
  "version": "1.0.0",
  "timestamp": "2026-05-22T12:00:00.000Z",
  "dependencies": {
    "supabase": { "ok": true, "latencyMs": 45 },
    "redis":    { "ok": false, "latencyMs": null, "error": "ECONNREFUSED" }
  }
}
```

---

## 6. SLOs por Endpoint Crítico

| Endpoint | Latência p50 | Latência p99 | Taxa de erro | Disponibilidade |
|---|---|---|---|---|
| `POST /api/auth/login` | < 150ms | < 600ms | < 0,1% | 99,9% |
| `POST /api/auth/refresh` | < 50ms | < 300ms | < 0,1% | 99,9% |
| `GET /api/v1/barbearias` | < 200ms | < 800ms | < 0,1% | 99,9% |
| `POST /api/agendamentos` | < 300ms | < 1.200ms | < 0,5% | 99,5% |
| `PATCH /api/agendamentos/:id` | < 200ms | < 800ms | < 0,5% | 99,5% |
| `POST /api/v1/media` | < 500ms | < 5.000ms | < 1% | 99% |
| `GET /api/v1/feed` | < 200ms | < 800ms | < 0,1% | 99,9% |
| `GET /api/v1/chat` | < 100ms | < 400ms | < 0,1% | 99,9% |
| `WS upgrade` | < 200ms | < 500ms | < 0,5% | 99,5% |
| `GET /health/live` | < 1ms | < 5ms | 0% | 100% |
| `GET /health/ready` | < 100ms | < 500ms | < 1% | 99% |

---

## 7. Alertas Recomendados

Configurar no Grafana (ver `/ops/dashboards/queries.md`):

| Alerta | Condição | Severidade |
|---|---|---|
| Alta taxa de erro | `rate(bff_http_errors_total[5m]) / rate(bff_http_requests_total[5m]) > 0.05` | critical |
| Latência p99 elevada | `histogram_quantile(0.99, ...) > 2000` | warning |
| Fila travada | `bff_queue_size_current > 1000` por 5min | warning |
| Redis indisponível | `/health/ready` status 503 por 2min | critical |
| Supabase degradado | latência Supabase em `/health/ready` > 1000ms | warning |
| Event loop lag | `bff_node_eventloop_lag_seconds_mean > 0.1` | warning |
| Memória heap alta | `bff_node_heap_used_bytes / bff_node_heap_size_bytes > 0.85` | warning |

---

## 8. Gaps de Visibilidade Identificados

| Gap | Prioridade | Solução futura |
|---|---|---|
| Tracing manual em use cases | Alta | Adicionar `Tracer.withSpan()` em cada use case |
| Métricas de WebSocket (msg/s) | Média | Chamar `Metrics.recordMessage('ws')` no WebSocketGateway |
| Métricas de cache por use case | Média | Chamar `Metrics.recordCacheHit/Miss()` no CacheAsideStrategy |
| Métricas de jobs por fila | Alta | Chamar `Metrics.recordQueue()` no WorkerRegistry |
| Tracing de workers BullMQ | Alta | Adicionar `Tracer.withSpan()` nos handlers de worker |
| Uptime monitor externo | Baixa | UptimeRobot / Better Uptime apontando para `/health/live` |
