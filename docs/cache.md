# Cache Distribuído — BarberFlow BFF

## Arquitetura

```
Request → Controller → CachedUseCaseDecorator ──hit──→ resposta rápida
                              │ miss
                              ↓
                      SingleFlightCache ──in-flight?──→ coalescimento
                              │ novo miss
                              ↓
                     CacheAsideStrategy
                              │
                 ┌────────────┴────────────┐
                 ↓                         ↓
            RedisCache               DB (Supabase)
           (ioredis)              via Repository
```

## Classes implementadas

| Classe | Camada | Responsabilidade |
|--------|--------|-----------------|
| `ICacheService` | domain/port | Port de alto nível; define contrato sem acoplamento a infra |
| `CacheKeyBuilder` | infra | Gera chaves padronizadas `bf:context:entity:id:version` |
| `CacheMetrics` | infra | Contadores in-process: hits, misses, evictions, latência |
| `SingleFlightCache` | infra | Decorator de ICache com proteção contra cache stampede |
| `CacheAsideStrategy` | infra | Lazy-load: lê do cache, busca no DB em miss, popula cache |
| `WriteThroughStrategy` | infra | Escreve em cache + DB simultaneamente |
| `WriteBehindStrategy` | infra | Escreve no cache imediatamente, persiste no DB assincronamente |
| `DomainEventPublisher` | infra | Bus singleton de eventos de domínio (pub/sub em memória) |
| `CacheInvalidationSubscriber` | infra | Invalida chaves de cache ao receber eventos de domínio |
| `CachedUseCaseDecorator` | application | Envolve use cases de leitura com cache sem poluir a camada |
| `IdempotencyMiddleware` | interfaces | POST/PUT idempotentes via `Idempotency-Key` → Redis TTL 24h |

---

## TTL por contexto

| Contexto | TTL | Justificativa | Risco de stale |
|----------|-----|---------------|----------------|
| `AGENDAMENTO_SINGLE` | 60 s | Status muda várias vezes ao dia | Baixo — máx. 1 min defasado |
| `AGENDAMENTO_LIST` | 30 s | Listagens mudam com novos agendamentos | Baixo |
| `FILA_LIST` | 10 s | Posição de fila é quasi-realtime | Médio — até 10 s atrás |
| `FILA_COUNT` | 5 s | Usado para calcular posição; alta mutação | Médio |
| `BARBEARIA_PROFILE` | 300 s | Perfil raramente muda (nome, logo) | Mínimo |
| `BARBEARIA_NEARBY` | 60 s | Depende da geo do usuário (cache por parâmetro) | Baixo |
| `SERVICOS_LIST` | 600 s | Catálogo de serviços — poucas alterações/dia | Mínimo |
| `IDEMPOTENCY` | 86 400 s | Janela de retry HTTP padrão (24h) | N/A |

---

## Use cases com cache (via CachedUseCaseDecorator)

| Use Case | Estratégia | TTL | Chave |
|----------|-----------|-----|-------|
| `BuscarAgendamentoUseCase` | Cache-aside | 60 s | `bf:agendamento:agendamento:{id}:v1` |
| `ListarFilaUseCase` | Cache-aside | 10 s | `bf:fila:entrada:list:barbershopId={id}:v1` |

### Use cases de escrita (cache via invalidação por evento)

| Use Case | Evento disparado | Chaves invalidadas |
|----------|-----------------|-------------------|
| `CriarAgendamentoUseCase` | `AgendamentoCriado` | Listas do cliente e profissional |
| `AtualizarStatusAgendamentoUseCase` | `AgendamentoAtualizado` | Item individual + listas |
| `EntrarNaFilaUseCase` | `FilaEntradaCriada` | Lista + contagem da barbearia |
| `AtualizarStatusFilaUseCase` | `FilaEntradaAtualizada` | Item + lista + contagem |

---

## Benchmark e hit ratio esperado

### Metodologia

Simulado com base em padrões de uso de barbearias urbanas (~100 clientes/dia, 10 barbeiros, pico de 10-20 req/s em horário de abertura).

### Resultados estimados

| Contexto | Requisições/min | Hit ratio esperado | Redução de latência |
|----------|----------------|-------------------|---------------------|
| Perfil barbearia | ~200 | 95% | ~120ms → ~1ms |
| Lista de serviços | ~150 | 97% | ~80ms → ~1ms |
| Buscar agendamento | ~80 | 70% | ~50ms → ~1ms |
| Listar fila | ~400 | 60% | ~40ms → ~1ms |
| Fila count | ~600 | 40% | ~30ms → ~1ms |

**Nota:** Fila e count têm hit ratio menor porque o TTL é curto (5-10s) para minimizar stale. O ganho principal é na proteção contra burst simultâneo (single-flight), não na taxa de hit.

### Como medir em produção

```js
// Expor métricas via endpoint interno
app.get('/internal/metrics/cache', (req, res) => {
  const cacheService = req.container.resolve('cache');
  res.json(cacheService.getMetrics());
});
```

Exemplo de saída:
```json
{
  "hits":         1420,
  "misses":        380,
  "evictions":      45,
  "hitRatio":     0.789,
  "avgLatencyMs": 0.84
}
```

---

## Proteção contra cache stampede

**Problema:** Quando o cache expira, N requisições simultâneas chegam ao mesmo tempo, todas detectam miss e disparam a mesma query cara ao banco.

**Solução implementada — Single-flight (request coalescing):**

```
Request 1 ──miss──→ inFlight.set('key', promise)
Request 2 ──miss──→ inFlight.get('key') → aguarda a mesma promise
Request 3 ──miss──→ inFlight.get('key') → aguarda a mesma promise
DB query: executada apenas 1 vez
Resultado: distribuído para as 3 requests
```

Implementado em `SingleFlightCache.getOrCompute()`. Efetivo contra bursts simultâneos no mesmo processo. Para deployments multi-instância, considerar Redis `SET NX EX` (mutex distribuído) como evolução futura.

---

## Riscos de inconsistência

### R1 — Stale read após escrita (Médio)

**Cenário:** Use case de escrita atualiza o banco mas o cache ainda tem o dado antigo.
**Mitigação:** `CacheInvalidationSubscriber` ouve eventos de domínio e invalida chaves correlatas imediatamente após a escrita.
**Janela residual:** Tempo entre `save()` e o handler do subscriber ser executado (~1ms no mesmo processo).

### R2 — Write-through falha parcial (Baixo)

**Cenário:** Cache escreve com sucesso mas o DB falha (ou vice-versa).
**Mitigação:** Em caso de erro, `WriteThroughStrategy.write()` remove a chave do cache para forçar re-fetch fresco.

### R3 — Write-behind perda de dados (Alto — uso limitado)

**Cenário:** Processo crasha entre a escrita no cache e a persistência assíncrona no DB.
**Mitigação:** `WriteBehindStrategy` deve ser usado APENAS para dados não-críticos (contagens, logs).
**Nunca usar para:** agendamentos, pagamentos, status de fila.

### R4 — Invalidação em instâncias múltiplas (Médio)

**Cenário:** `DomainEventPublisher` é singleton in-process. Em deploy com múltiplas instâncias (workers), cada processo tem seu próprio bus — a invalidação não propaga entre pods.
**Mitigação atual:** TTL curto minimiza a janela de inconsistência.
**Evolução:** Pub/sub via Redis (`PUBLISH`/`SUBSCRIBE`) para invalidação cross-process.

### R5 — Explosão de chaves (Baixo)

**Cenário:** `buildList` com muitos parâmetros únicos gera chaves que nunca expiram juntas.
**Mitigação:** Usar TTL e `delByPrefix` ao invés de invalidação por chave específica.

---

## Testes de integração com Redis real

Para rodar com Redis real (requer Docker):

```bash
# Subir Redis local
docker run -d -p 6379:6379 --name bf-redis redis:7-alpine

# Configurar env e rodar
CACHE_DRIVER=redis REDIS_URL=redis://localhost:6379 \
  NODE_ENV=test node --test tests/integration/cache.integration.test.js
```

O arquivo `tests/integration/cache.integration.test.js` usa `MemoryCache` por padrão (zero deps extras). Para usar `RedisCache`, substituir `MemoryCache` por `RedisCache` + `ioredis` client no `buildPipeline()` do arquivo de teste.
