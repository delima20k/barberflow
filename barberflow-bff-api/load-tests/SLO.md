# SLOs da BFF BarberFlow — Service Level Objectives

## 1. Definição dos SLOs

| Endpoint                     | Métrica         | SLO       | Alerta (burn rate) |
|------------------------------|-----------------|-----------|-------------------|
| `POST /api/auth/login`       | p95 latência    | < 800ms   | > 2× por 5min     |
| `POST /api/auth/login`       | taxa de erro    | < 1%      | > 5% por 5min     |
| `GET /api/agendamentos`      | p95 latência    | < 500ms   | > 2× por 5min     |
| `POST /api/agendamentos`     | p95 latência    | < 1000ms  | > 2× por 5min     |
| `POST /api/v1/media/presigned` | p95 latência  | < 1500ms  | > 2× por 5min     |
| `POST /api/v1/chat/*/messages`  | p95 latência | < 600ms   | > 2× por 5min     |
| Todos os endpoints           | disponibilidade | > 99.9%   | < 99.5% por 1min  |
| Todos os endpoints           | error rate      | < 0.5%    | > 1% por 5min     |

## 2. Cenários k6

Localizados em `load-tests/k6/`:

| Arquivo              | Fluxo testado             | VUs (carga) | Duração total |
|----------------------|---------------------------|-------------|---------------|
| `auth.load.js`       | login → me → logout       | até 50 VU   | ~5min         |
| `agendamento.load.js`| login → listar → criar    | até 30 VU   | ~3min         |
| `chat.load.js`       | login → listar → enviar   | até 50 VU   | ~3min         |

### Como executar

```bash
# Smoke test (sanidade — 1 VU, 30s)
k6 run --env BASE_URL=https://api.barberflow.com \
       --env EMAIL=loadtest@barberflow.com \
       --env PASSWORD=senha-test \
       load-tests/k6/auth.load.js

# Suite completa de carga
for f in load-tests/k6/*.load.js; do
  k6 run --env BASE_URL=https://api.barberflow.com "$f"
done

# Com saída para Grafana/InfluxDB
k6 run -o influxdb=http://localhost:8086/k6 load-tests/k6/auth.load.js
```

## 3. SLIs (Service Level Indicators)

- **Disponibilidade**: `(requisições bem-sucedidas / total de requisições) × 100`
- **Latência (p95)**: 95º percentil do tempo de resposta HTTP
- **Taxa de erro**: `(respostas 5xx / total) × 100`
- **Throughput**: requisições por segundo por endpoint

## 4. Error Budget

Com SLO de 99.9% de disponibilidade mensal:
- Budget total = `30 dias × 24h × 60min × 0.1% = ~43.2 minutos/mês`
- Monitorar via `/metrics` (Prometheus) com dashboard Grafana

## 5. Alertas recomendados (Prometheus/Grafana)

```yaml
# Latência p95 > 800ms por 5 minutos
- alert: BffHighLatency
  expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 0.8
  for: 5m

# Taxa de erro > 1%
- alert: BffHighErrorRate
  expr: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.01
  for: 5m

# Disponibilidade < 99.5%
- alert: BffLowAvailability
  expr: rate(http_requests_total{status!~"5.."}[1m]) / rate(http_requests_total[1m]) < 0.995
  for: 1m
```
