# Scheduler Canonico da BFF

## Decisao de lock distribuido

O Scheduler usa Redis lock com `SET key token NX PX ttl` e release atomico por Lua. A escolha foi Redis em vez de advisory lock Postgres porque a BFF acessa Supabase via PostgREST/JS SDK: locks de sessao do Postgres nao ficam presos de forma confiavel durante toda a execucao Node.js da task. Redis ja e dependencia operacional da BFF para BullMQ/cache e entrega um lease simples, barato e com TTL contra worker morto.

## Modelo

- `ScheduledTask`: nome canonico, cron, timeout, retry, ownership e skew protection.
- `CronExpression`: VO com validacao de 5 campos e timezone via `Intl.DateTimeFormat`.
- `TaskExecution`: historico imutavel de inicio, fim, status, erro e tentativas.
- `RetryPolicy`: tentativas e backoff de dominio, sem depender de BullMQ.
- `TaskRegistry`: registro explicito de classes; nomes ficam centralizados, sem string magica espalhada.
- `SchedulerRunner`: executa due tasks, aplica lock, timeout, retry, metricas e eventos.

## Tarefas registradas

| Task | Contexto dono | Cron | Timezone | Janela/timeout | Retry | Origem |
|---|---|---|---|---:|---:|---|
| `messaging.outbox-relay` | `messaging` | `* * * * *` | UTC | 20s | 2 | Migrou de `OutboxRelay.start()` com `setInterval(5s)` no worker para Scheduler central. |
| `notifications.digest-flush` | `notifications` | `*/5 * * * *` | UTC | 30s | 2 | Nova task declarada para liberar digests quando o repository suportar `flushDueDigests`. |

## Skew protection

Por padrao, se uma execucao atrasar mais de 60s em relacao ao slot planejado, ela e marcada como `skipped` e a proxima janela e calculada a partir do horario atual. Isso evita acumulacao apos deploy, pausa de worker ou backlog.

## Observabilidade

Cada execucao grava em `scheduler_task_executions`:

- `scheduled_for`, `started_at`, `finished_at`
- `status`: `running`, `success`, `failed`, `timeout`, `skipped`
- `attempts`, `error`, `duration_ms`, `instance_id`

Cada finalizacao gera evento em `scheduler_events` e metricas em memoria por processo (`SchedulerMetrics`).

## Endpoint admin

- `GET /api/v1/scheduler/tasks`
- `POST /api/v1/scheduler/tasks/:taskName/trigger`

Protecao: JWT normal da BFF mais `SCHEDULER_ADMIN_USER_IDS` ou header `x-scheduler-admin-token` igual a `SCHEDULER_ADMIN_TOKEN`.

## Cron externo / setInterval migrado

- `OutboxRelay.start()` deixou de ser iniciado diretamente em `workers/worker.js`; o worker agora inicia `SchedulerService`, que chama `outboxRelay.runOnce()` pela task `messaging.outbox-relay`.
- Timers de UI/clientes (`setTimeout` de modais, polling local e timeouts de fetch) nao migraram porque nao sao tarefas de dominio server-side.
