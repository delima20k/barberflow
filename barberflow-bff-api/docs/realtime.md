# Camada Realtime — BFF BarberFlow

## Decisão arquitetural: Redis Pub/Sub (não NATS)

| Critério | Redis Pub/Sub | NATS |
|---|---|---|
| Infra necessária | **zero** (ioredis já instalado) | nova infra |
| Throughput para 20 barbearias | suficiente | superdimensionado |
| JetStream / persistência | não precisa | sim, mas não necessário |
| Custo | incluso no plano Redis existente | custo adicional |
| Complexidade | baixa | média/alta |

**Conclusão**: Redis Pub/Sub atende completamente a escala atual (~100 clientes, 20 barbearias). Revisitar quando canal `fila.*` ultrapassar 1 000 conexões simultâneas.

---

## Restrição crítica de deployment

| Ambiente | HTTP REST | WebSocket |
|---|---|---|
| Vercel serverless | ✅ | ❌ timeout 30s, sem upgrade persistente |
| PM2 / Docker / Railway | ✅ | ✅ `WebSocketGateway.attach(httpServer)` |

O `server.js` já contém `if (!process.env.VERCEL)` que invoca `gateway.attach(httpServer)`.  
**Nunca mover o gateway para o path serverless.**

---

## Estrutura de diretórios criados

```
barberflow-bff-api/
├── config/
│   └── realtime.js                         # Constantes: limites, TTLs, prefixos Redis
├── domain/realtime/
│   ├── ports/IPubSubService.js             # Interface abstrata pub/sub
│   ├── RealtimeEvent.js                    # Value Object imutável (events.v1.*)
│   ├── ChannelPolicy.js                    # Regras de autorização por canal
│   ├── RoomManager.js                      # Map<channel, Set<connectionId>>
│   └── PresenceService.js                  # Map<channel, Map<userId, Set<connId>>>
├── application/realtime/
│   ├── SubscribeToRoomUseCase.js           # Valida, join, presença, replay
│   ├── UnsubscribeFromRoomUseCase.js       # Leave, presença, pub presence.saiu
│   ├── PublishToChannelUseCase.js          # Cria RealtimeEvent, publica, replay
│   └── ReplayEventsUseCase.js             # Busca eventos desde lastEventTimestamp
├── infrastructure/realtime/
│   ├── RedisPubSubAdapter.js               # IPubSubService via ioredis (2 conexões)
│   ├── EventReplayBuffer.js                # Redis sorted set bf:replay:{channel}
│   ├── RealtimeMetrics.js                  # Contadores + histograma de latência
│   └── InMemoryPubSubStub.js              # Stub para dev sem Redis e testes
└── interfaces/bff/realtime/
    ├── ConnectionRegistry.js               # Map<connId, { ws, userId, channels }>
    ├── ChannelRouter.js                    # type → use case (roteamento puro)
    └── WebSocketGateway.js                 # Auth JWT, rate limit, backpressure, ping
```

---

## Protocolo de mensagens WebSocket (JSON)

### Cliente → Servidor

```json
{ "type": "subscribe",   "channel": "fila.{shopId}",    "lastEventId": "2026-05-21T10:00:00.000Z" }
{ "type": "unsubscribe", "channel": "fila.{shopId}" }
{ "type": "ping" }
```

### Servidor → Cliente

```json
{ "type": "subscribed",   "channel": "fila.{shopId}", "ok": true }
{ "type": "unsubscribed", "channel": "fila.{shopId}", "ok": true }
{ "type": "event",        "eventId": "uuid", "channel": "...", "version": "v1", "type": "events.v1.fila.entrada_criada", "payload": {}, "occurredAt": "..." }
{ "type": "error",        "code": 403, "message": "Não autorizado" }
{ "type": "pong" }
```

---

## Canais suportados e autorização

| Canal | Tipo | Assinar | Publicar |
|---|---|---|---|
| `fila.{shopId}` | fila | qualquer autenticado | servidor apenas |
| `notificacoes.{userId}` | notificacoes | somente o próprio userId | servidor apenas |
| `chat.{userId}` | chat | somente o próprio userId | servidor apenas |
| `barbershop.status.{shopId}` | barbershop | qualquer autenticado | servidor apenas |
| `presence.{shopId}` | presence | qualquer autenticado | servidor apenas |

---

## Eventos versionados (events.v1.*)

| Tipo | Canal | Payload | Consumidores |
|---|---|---|---|
| `events.v1.fila.entrada_criada` | `fila.{shopId}` | `{ entradaId, clienteId, posicao }` | barbeiros + cliente |
| `events.v1.fila.entrada_atualizada` | `fila.{shopId}` | `{ entradaId, status, posicao }` | barbeiros + cliente |
| `events.v1.fila.entrada_removida` | `fila.{shopId}` | `{ entradaId }` | barbeiros + cliente |
| `events.v1.notificacao.nova` | `notificacoes.{userId}` | `{ notificacaoId, titulo, corpo }` | usuário |
| `events.v1.chat.message_created` | `chat.{userId}` | `{ message }` | participante destinatario |
| `events.v1.chat.conversation_read` | `chat.{userId}` | `{ conversationId, userId, lastReadMessageId, unreadCount }` | proprio usuario |
| `events.v1.chat.typing_changed` | `chat.{userId}` | `{ conversationId, senderId, active }` | participante destinatario |
| `events.v1.barbershop.status_alterado` | `barbershop.status.{shopId}` | `{ isOpen, closeReason? }` | clientes |
| `events.v1.presence.usuario_entrou` | `presence.{shopId}` | `{ userId }` | barbeiros |
| `events.v1.presence.usuario_saiu` | `presence.{shopId}` | `{ userId }` | barbeiros |

---

## Backpressure e rate limiting

| Limite | Valor padrão | Var de ambiente |
|---|---|---|
| Canais por conexão | 5 | `WS_MAX_CHANNELS_PER_CONN` |
| Conexões por canal | 1 000 | `WS_MAX_CONN_PER_CHANNEL` |
| Msgs/s por conexão | 10 | `WS_RATE_LIMIT_PER_SEC` |
| Threshold de buffer (bytes) | 1 MB | `WS_BACKPRESSURE_THRESHOLD_BYTES` |

Ao ultrapassar backpressure: `ws.close(1008, 'Backpressure: buffer cheio')`.

---

## Replay de eventos (last-event-id)

Canais com replay habilitado: `fila.*`, `notificacoes.*`, `chat.*`.

- Buffer Redis: sorted set `bf:replay:{channel}`, score = `occurredAt` em ms
- TTL: 5 minutos (configurável `WS_REPLAY_TTL_SECONDS`)
- Limite: 50 eventos por canal (configurável `WS_REPLAY_MAX_EVENTS`)
- Sem replay: `presence.*`, `barbershop.status.*` (estado sempre presente, sem histórico necessário)

No subscribe: passar `lastEventId` com o ISO timestamp do último evento recebido.

---

## Métricas expostas

`snapshot()` em `RealtimeMetrics`:

```json
{
  "activeConnections": 42,
  "totalMessages": 1500,
  "msgsPerSec": 8,
  "fanoutLatency": { "p50": 3, "p99": 12 },
  "errorsByChannel": { "fila.abc123": 1 }
}
```

Integrar em `/api/v1/health` para monitoramento.

---

## Análise de custo Redis

| Item | Impacto |
|---|---|
| Conexões adicionais | +2 por instância BFF (pub + sub dedicados) |
| 3 instâncias PM2 | +6 conexões (soma 12 com BullMQ) |
| Volume estimado | ~500 pub/sub msgs/dia a 100 clientes ativos |
| Custo Upstash | incluso no free tier (10k cmds/dia) |

---

## Canais que precisariam de sharding

**Nenhum no momento.** Trigger: canal com >1 000 conexões simultâneas.

Quando necessário: shard por `shopId % N_SHARDS`, configurável em `config/realtime.js`.

Canais candidatos em escala:
- `fila.{shopId}` — se barbearia atingir >1 000 clientes simultâneos
- `notificacoes.{userId}` — escala linear com usuários ativos, mas é 1:1 por design

---

## Escopo excluído

- Substituir Supabase Realtime no frontend (os canais Supabase existentes continuam; este gateway é paralelo)
- WebRTC signaling (`p2p-*` via Supabase broadcast — sem mudança)
- Chat E2E completo (criptografia ainda fica atras da porta `IMessageCipher`; entrega textual leve usa BFF/outbox/realtime)
- Autoscaling automático de Redis shards
