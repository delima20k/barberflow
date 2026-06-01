# Dashboards Grafana — BFF BarberFlow

## Como importar

1. Abrir Grafana → **Dashboards → Import**
2. Fazer upload do arquivo `bff.json` (mesma pasta)
3. Selecionar o datasource Prometheus configurado
4. Salvar

---

## Queries PromQL salvas

### RED — HTTP

#### Taxa de requests por segundo (total)
```promql
sum(rate(bff_http_requests_total[1m]))
```

#### Taxa de requests por endpoint (top 10)
```promql
topk(10, sum by (method, route) (rate(bff_http_requests_total[1m])))
```

#### Taxa de erro geral (%)
```promql
100 * sum(rate(bff_http_errors_total[5m]))
  / sum(rate(bff_http_requests_total[5m]))
```

#### Taxa de erro por endpoint
```promql
100 * sum by (method, route) (rate(bff_http_errors_total[5m]))
  / sum by (method, route) (rate(bff_http_requests_total[5m]))
```

#### Latência p50 por endpoint
```promql
histogram_quantile(
  0.50,
  sum by (le, method, route) (
    rate(bff_http_request_duration_ms_bucket[5m])
  )
)
```

#### Latência p99 por endpoint
```promql
histogram_quantile(
  0.99,
  sum by (le, method, route) (
    rate(bff_http_request_duration_ms_bucket[5m])
  )
)
```

#### SLO: % de requests abaixo de 500ms
```promql
100 * sum(rate(bff_http_request_duration_ms_bucket{le="500"}[5m]))
  / sum(rate(bff_http_request_duration_ms_count[5m]))
```

#### SLO: % de requests abaixo de 1200ms (agendamentos)
```promql
100 * sum(
  rate(bff_http_request_duration_ms_bucket{route="/api/agendamentos",le="1200"}[5m])
)
/ sum(
  rate(bff_http_request_duration_ms_count{route="/api/agendamentos"}[5m])
)
```

---

### USE — Filas

#### Jobs completados por fila (req/s)
```promql
sum by (queue) (rate(bff_queue_jobs_total{status="completed"}[1m]))
```

#### Jobs com falha por fila (req/s)
```promql
sum by (queue) (rate(bff_queue_errors_total[1m]))
```

#### Tamanho atual das filas
```promql
bff_queue_size_current
```

#### Taxa de falha por fila (%)
```promql
100 * sum by (queue) (rate(bff_queue_errors_total[5m]))
  / sum by (queue) (rate(bff_queue_jobs_total[5m]))
```

---

### Métricas de negócio

#### Uploads por segundo por tipo
```promql
sum by (type) (rate(bff_uploads_total[1m]))
```

#### Mensagens enviadas por segundo por canal
```promql
sum by (channel) (rate(bff_messages_sent_total[1m]))
```

#### Conexões WebSocket ativas
```promql
bff_ws_connections_current
```

#### Cache hit rate (%)
```promql
100 * sum(rate(bff_cache_hits_total[5m]))
  / (sum(rate(bff_cache_hits_total[5m])) + sum(rate(bff_cache_misses_total[5m])))
```

---

### Node.js — USE de recursos

#### CPU utilization
```promql
rate(bff_node_process_cpu_seconds_total[1m]) * 100
```

#### Heap utilization (%)
```promql
100 * bff_node_heap_used_bytes / bff_node_heap_size_bytes
```

#### Event loop lag médio (ms)
```promql
bff_node_eventloop_lag_seconds_mean * 1000
```

#### GC pause total (s/min)
```promql
rate(bff_node_gc_duration_seconds_sum[1m])
```

#### Handles ativos (connections abertas)
```promql
bff_node_active_handles_total
```

---

## Alertas (Grafana Alerting)

### Alta taxa de erro HTTP
```promql
sum(rate(bff_http_errors_total[5m]))
  / sum(rate(bff_http_requests_total[5m])) > 0.05
```
- **Severidade:** critical
- **For:** 2min
- **Notificação:** PagerDuty + Slack #incidentes

### Latência p99 elevada (qualquer endpoint)
```promql
histogram_quantile(
  0.99,
  sum by (le) (rate(bff_http_request_duration_ms_bucket[5m]))
) > 2000
```
- **Severidade:** warning
- **For:** 5min

### Fila travada
```promql
bff_queue_size_current > 1000
```
- **Severidade:** warning
- **For:** 5min

### Heap memory crítico
```promql
bff_node_heap_used_bytes / bff_node_heap_size_bytes > 0.85
```
- **Severidade:** warning
- **For:** 5min

### Event loop lag crítico
```promql
bff_node_eventloop_lag_seconds_mean > 0.1
```
- **Severidade:** warning
- **For:** 3min

---

## Panels recomendados no Dashboard

| Panel | Tipo | Query key |
|---|---|---|
| Requests/s (total) | Stat | `rate(bff_http_requests_total[1m])` |
| Error rate (%) | Stat (threshold: >1% warn, >5% crit) | `bff_http_errors_total / bff_http_requests_total` |
| Latência p50/p99 (ms) | Time series | histogram_quantile |
| Top endpoints por volume | Bar chart | `topk(10, sum by route ...)` |
| Fila: jobs em progresso | Gauge | `bff_queue_size_current` |
| Heap usage (%) | Gauge | heap_used / heap_size |
| WS connections | Stat | `bff_ws_connections_current` |
| Cache hit rate (%) | Stat | hits / (hits + misses) |
| Event loop lag (ms) | Time series | eventloop_lag_seconds_mean |
| Uploads/s | Stat | `rate(bff_uploads_total[1m])` |
