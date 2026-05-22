# Camada de Mensageria — BarberFlow BFF

> Última atualização: 2026-05-21
> Autor: Alan Lima

---

## 1. Escolha de tecnologia

### Candidatos avaliados

| Critério | BullMQ + Redis | RabbitMQ | AWS SQS |
|---|---|---|---|
| Infra já existente | ✅ Redis já usado para cache | ❌ novo serviço | ❌ requer AWS |
| Deploy | zero config extra | Docker/Helm extra | conta AWS + IAM |
| Priority queues nativas | ✅ por job | ⚠️ por fila | ❌ FIFO/Standard apenas |
| DLQ integrada | ✅ `getFailedJobs()` | ✅ dead-letter exchange | ✅ redrive policy |
| SDK Node.js | ✅ first-class | ✅ amqplib (verboso) | ✅ SDK AWS |
| Testabilidade sem deps | ✅ InMemoryQueueService | ❌ precisa de broker | ❌ precisa de mock |
| Custo mensal (~100 clientes) | ~$0 (Redis já pago) | ~$15-40/mês (instância) | ~$0,40/milhão msgs |
| Visibilidade/observabilidade | Bull Dashboard | RabbitMQ UI | CloudWatch |

**Decisão: BullMQ**

Redis já é infraestrutura do projeto (cache distribuído, rate-limit, idempotência). BullMQ roda sobre o mesmo Redis sem custo adicional, tem suporte first-class a Node.js, prioridade por job nativa, DLQ via `failed` jobs, e permite testes determinísticos com `InMemoryQueueService` (zero deps extras).

---

## 2. Arquitetura de filas

```
┌─────────────────────────────────────────────────────────────────────┐
│  Domain Layer                                                        │
│  IQueueService (port)          ICache (port)                        │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ implements
┌───────────────────────────▼─────────────────────────────────────────┐
│  Infrastructure Layer                                                │
│                                                                      │
│  BullMQAdapter ──────────────── Redis ─────── InMemoryQueueService  │
│  (produção)                                   (testes)              │
│                                                                      │
│  OutboxRepository (Supabase)                                        │
│  OutboxRelay (polling loop, 5s)                                     │
│  DeadLetterQueue (cache-backed, TTL 7d)                             │
│  RetryPolicy (exponential backoff + jitter)                         │
└──────────────────────────────────────────────────────────────────────┘

Filas e workers:

  bf:queue:high          → jobs prioritários do sistema
  bf:queue:default       → jobs gerais
  bf:queue:low           → jobs de baixa urgência
  bf:queue:media         → processamento de imagens (sharp)
  bf:queue:notifications → push notifications (web-push) e fallback de chat
  bf:queue:feed          → geração de feed de barbearia
  bf:queue:analytics     → rastreamento de eventos
  bf:queue:webhooks      → entregas HTTP para integrações externas
  bf:queue:dlq           → dead-letter — jobs esgotados (observabilidade)

Workers correm em processo separado: workers/worker.js
```

### Fluxo de um job

```
Use Case
  │
  ├─ (caminho síncrono) ─ escrita principal (Supabase)
  │                         └─ outboxRepository.save(event) ← idealmente atômico
  │
OutboxRelay (polling 5s)
  │
  └─ queueService.enqueue(queue, jobType, payload, { jobId: outbox.id })
           │
           ▼
     InMemoryQueueService / BullMQAdapter
           │
           ▼
     WorkerRegistry → JobHandler.handle(job)
           │
     ┌─────┴──────┐
     │ ok          │ fail
     │             ▼
     │          retry (backoff exponencial + jitter)
     │             │
     │          maxAttempts esgotado?
     │             │
     │             ▼
     ▼          DeadLetterQueue.push(job)
  onSuccess()  onFailure()
```

### Garantia de entrega

- **At-least-once**: OutboxRelay persiste o evento antes de enfileirar. Se o processo reiniciar antes do `markDone`, o job é reenfileirado na próxima iteração do relay.
- **Idempotência**: `jobId = outbox.id` (UUID estável) garante deduplicação no consumer. Jobs já processados são descartados pelo `#processedIds` set (InMemory) ou pelo BullMQ `removeOnComplete`.
- **Limitação atual**: A escrita no outbox não é atômica com a escrita principal no Supabase JS SDK (sem transações multi-tabela). Mitigação: use cases chamam `outboxRepository.save()` após sucesso da escrita principal. Evolução planejada: Supabase Edge Function + `pg_notify` para trigger transacional.

---

## 3. Tarefas migradas para async

### Antes (síncrono, bloqueante)

| Tarefa | Local anterior | Problema |
|---|---|---|
| Processamento de imagem (sharp) | `BarbeariaMediaService` na rota `POST /api/barbearia/media` | p99 latência > 2s, bloqueava thread |
| Push notification | `NotificacoesController` em `POST /api/notificacoes/push-barbeiro` | falha de VAPID derrubava o response |
| Geração de feed | inline no controller de barbearia | N+1 queries, sem cache de escrita |
| Webhooks / integrações | inline no handler de agendamento | timeout 30s causava retry duplo do cliente |
| Analytics / tracking | inline em múltiplos controllers | sem retry em falha de rede |

### Depois (assíncrono, filas)

| Handler | Fila | JobType | RetryPolicy |
|---|---|---|---|
| `MediaProcessingHandler` | `bf:queue:media` | `process_media` | `defaultPolicy()` (3×, 1s→30s) |
| `NotificationHandler` | `bf:queue:notifications` | `send_notification` | `criticalPolicy()` (5×, 1s→30s) |
| `ChatDeliveryHandler` | `bf:queue:notifications` | `deliver_chat_message` | `criticalPolicy()` (5×, 1s→30s) |
| `FeedGenerationHandler` | `bf:queue:feed` | `generate_feed` | `defaultPolicy()` (3×) |
| `WebhookHandler` | `bf:queue:webhooks` | `deliver_webhook` | `webhookPolicy()` (5×, 5s→5min) |
| `AnalyticsHandler` | `bf:queue:analytics` | `track_analytics` | `analyticsPolicy()` (2×, 500ms) |

---

## 4. Estimativa de throughput

Base: ~100 clientes ativos/dia, ~20 barbearias, operação 10h/dia.

| Fila | Volume estimado/dia | Pico (jobs/s) | Notas |
|---|---|---|---|
| `notifications` | ~500 | ~1/s | client_arrived + confirmações |
| `media` | ~40 | ~0,1/s | uploads de logo/fotos de serviço |
| `feed` | ~100 | ~0,3/s | invalidação + regeneração |
| `analytics` | ~2.000 | ~5/s | eventos de navegação + conversão |
| `webhooks` | ~50 | ~0,1/s | integrações externas |

**Capacidade atual**: 1 worker por fila, BullMQ suporta ~1.000 jobs/s por worker com Redis. Margem atual: 200× acima do pico. Sem necessidade de escalonamento horizontal até ~20.000 clientes ativos/dia.

---

## 5. Gargalos identificados

### 5.1 Processamento de mídia (CPU-bound)
`sharp` executa em thread Node.js. Para volumes > 10 uploads simultâneos, considerar:
- `worker_threads` com pool de workers sharp
- Ou delegar a serviço dedicado (Cloudflare Images, Imgix)

### 5.2 Push notifications (I/O-bound, fan-out)
Cada `enviarAoBarbeiro` pode ter N tokens de dispositivo. Para >50 tokens/profissional:
- Paralelizar com `Promise.allSettled` dentro do handler (já feito)
- Batching via Web Push Protocol `urgency` header

### 5.3 OutboxRelay — window de 5s
O polling de 5s cria um delay máximo de 5s entre o evento de domínio e o enfileiramento. Para casos que exigem <1s (ex: `client_arrived`):
- Reduzir `intervalMs` para 1.000ms apenas para a fila `notifications`
- Ou usar `pg_notify` + Supabase Edge Function para trigger instantâneo

### 5.4 DLQ sem alertas automáticos
Jobs na DLQ não disparam nenhum alerta. Evolução necessária:
- Webhook/Slack notification quando `dlq.push()` é chamado
- Dashboard (Bull Board) para visualização em produção

---

## 6. Candidatos a autoscaling

| Fila | Gatilho | Estratégia |
|---|---|---|
| `notifications` | backlog > 200 jobs | Aumentar concurrency do worker (BullMQ `concurrency`) |
| `media` | backlog > 50 jobs | worker_threads pool ou instância extra |
| `webhooks` | taxa de falha > 20% | Circuit breaker + redução de concurrency |
| `analytics` | backlog > 5.000 jobs | Batch insert (agrupar antes de persistir) |

Com Redis Upstash (Serverless), o Redis em si não é gargalo — scale no worker process.

---

## 7. Banco de dados — migration do Outbox

```sql
-- Executar uma vez, em produção via Supabase SQL Editor
CREATE TABLE IF NOT EXISTS domain_events_outbox (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name   TEXT        NOT NULL,
  payload      JSONB       NOT NULL DEFAULT '{}',
  queue        TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','processing','done','failed')),
  attempts     INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_outbox_status_created
  ON domain_events_outbox (status, created_at)
  WHERE status IN ('pending', 'failed');

-- RLS: apenas service_role pode ler/escrever (nunca expor ao cliente)
ALTER TABLE domain_events_outbox ENABLE ROW LEVEL SECURITY;
-- Nenhuma policy pública = apenas service_role tem acesso
```

---

## 8. Estrutura de arquivos criada

```
barberflow-bff-api/
├── config/
│   └── queues.js                          # QUEUES, JOB_TYPES, RETRY_CONFIG
├── domain/shared/ports/
│   └── IQueueService.js                   # Port (domain) — interface abstrata
├── application/
│   ├── shared/
│   │   ├── Job.js                         # Value Object imutável
│   │   └── JobHandler.js                  # Classe base abstrata para handlers
│   └── handlers/
│       ├── MediaProcessingHandler.js
│       ├── NotificationHandler.js
│       ├── FeedGenerationHandler.js
│       ├── WebhookHandler.js
│       └── AnalyticsHandler.js
├── infrastructure/
│   ├── queue/
│   │   ├── RetryPolicy.js                 # Backoff exponencial + jitter
│   │   ├── DeadLetterQueue.js             # DLQ cache-backed (TTL 7d)
│   │   ├── InMemoryQueueService.js        # Adapter para testes (zero deps)
│   │   ├── BullMQAdapter.js               # Adapter de produção (BullMQ)
│   │   └── JobScheduler.js                # Jobs recorrentes (repeat.every)
│   └── outbox/
│       ├── OutboxRepository.js            # CRUD da tabela domain_events_outbox
│       └── OutboxRelay.js                 # Polling loop → enqueue
├── workers/
│   ├── WorkerRegistry.js                  # BullMQ Worker por fila
│   └── worker.js                          # Entry point do processo worker
└── docs/
    └── filas.md                           # Este arquivo
```

---

## 9. Variáveis de ambiente necessárias

```env
# Já existentes (reaproveitadas)
REDIS_URL=redis://...           # ou UPSTASH_REDIS_REST_URL
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...

# Novas (opcionais — workers usam defaults)
WORKER_CONCURRENCY=5            # jobs simultâneos por worker (default: 5)
OUTBOX_POLL_INTERVAL_MS=5000    # frequência do OutboxRelay (default: 5000)
```

---

## 10. Testes

| Suite | Arquivo | Tipo | Cobertura |
|---|---|---|---|
| Job VO | `tests/unit/domain/Job.test.js` | unit | 12 casos — create, mutações, isExhausted, imutabilidade |
| RetryPolicy | `tests/unit/infrastructure/RetryPolicy.test.js` | unit | 9 casos — delays, jitter, toBullMQOptions |
| DeadLetterQueue | `tests/unit/infrastructure/DeadLetterQueue.test.js` | unit | 6 casos — push/get/remove/purge |
| MediaProcessingHandler | `tests/unit/application/handlers/MediaProcessingHandler.test.js` | unit | 7 casos |
| NotificationHandler | `tests/unit/application/handlers/NotificationHandler.test.js` | unit | 6 casos |
| Pipeline de filas | `tests/integration/queue.integration.test.js` | integration | 7 suites: pipeline, dedup, retry, DLQ, prioridade, OutboxRelay, DLQ+cache |

Total: 50 testes, todos passando. Executar com:
```bash
node --test tests/unit/domain/Job.test.js \
             tests/unit/infrastructure/RetryPolicy.test.js \
             tests/unit/infrastructure/DeadLetterQueue.test.js \
             tests/unit/application/handlers/NotificationHandler.test.js \
             tests/unit/application/handlers/MediaProcessingHandler.test.js \
             tests/integration/queue.integration.test.js
```

## 11. Notificacoes canonicas

O contexto de notificacoes usa filas dedicadas:

| Handler | Fila | JobType | RetryPolicy |
|---|---|---|---|
| `NotificationHandler` | `bf:queue:notifications.high` | `send_notification` | `criticalPolicy()` |
| `NotificationHandler` | `bf:queue:notifications.default` | `send_notification` | `criticalPolicy()` |

`bf:queue:notifications.default` tambem preserva compatibilidade com o alias legado `QUEUES.NOTIFICATIONS` e com fallback de chat. O payload novo usa `{ notificationId, channels }`; o payload antigo de `push-barbeiro` continua aceito para nao quebrar clientes existentes.
