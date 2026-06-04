# Chat canonico BFF

## Decisao arquitetural

O chat virou contexto proprio atras da BFF. A escrita segue `salvar -> realtime imediato best-effort -> outbox -> fila -> realtime/push`, mantendo a API sem bytes de midia e preservando o outbox como garantia quando worker/rede estiverem instaveis.

## Modelo

- `chat_conversations`: conversa e metadados leves.
- `chat_participants`: participantes ativos/inativos.
- `chat_messages`: mensagens idempotentes por `(sender_id, client_message_id)`.
- `chat_message_attachments`: referencias a `media_files` e variante; o modulo de midia continua dono de upload, processamento e URL assinada.
- `chat_message_statuses` e `chat_read_receipts`: estados e leitura.
- `chat_blocks` e `chat_mute_rules`: bloqueio bidirecional e mute de push.

Leitura por conversa usa o indice `idx_chat_messages_conversation_created_desc` em `(conversation_id, created_at desc, id desc)`. O cursor reverso usa a mesma tupla como ordenacao total estavel, inclusive com insercoes concorrentes.

## Contratos de eventos

| Evento | Canal | Payload |
|---|---|---|
| `events.v1.chat.message_created` | `chat.{userId}` | `{ message: { id, conversationId, senderId, clientMessageId, body, attachments, createdAt, deletedAt, retentionUntil, status, sortKey } }` |
| `events.v1.chat.conversation_read` | `chat.{userId}` | `{ conversationId, userId, lastReadMessageId, unreadCount }` |
| `events.v1.chat.typing_changed` | `chat.{userId}` | `{ conversationId, senderId, active }` |

O canal `chat.{userId}` e privado: somente o proprio usuario pode assinar. O servidor nunca publica em canal aberto por `conversation_id`, reduzindo risco de leak por subscribe indevido.

## Entrega e anti-spam

- `SendMessageUseCase` valida acesso, bloqueio, rate limit por par, flood de texto repetido e idempotencia.
- `MessageRealtimePublisher` publica `events.v1.chat.message_created` no canal privado do destinatario logo apos persistir no banco; falha nessa etapa nao desfaz o envio.
- `ChatDeliveryHandler` carrega o contexto de entrega pelo outbox e chama `MessageDispatcher`.
- `MessageDispatcher` revalida bloqueio bidirecional, publica realtime e envia push via `ChatPushGateway` quando `PresenceLink` indica offline.
- `MuteRule` suprime apenas push; a mensagem continua persistida e entregue via realtime.

## Impacto no realtime

Realtime recebe apenas eventos leves e versionados do chat. O payload nao carrega midia; anexos sao metadados com `mediaId`/`variant`. O replay foi habilitado para `chat.*` com os mesmos limites de buffer do gateway.

Em worker separado, `PresenceLink` precisa ser conectado a uma presenca compartilhada para evitar push extra quando o usuario esta online em outra instancia. O fallback atual e conservador: em duvida, pode enviar push, mas nunca deixa de persistir nem de publicar realtime.

## E2E

A porta `IMessageCipher` prepara criptografia ponta a ponta sem implementa-la agora. Quando ativada, `encrypted_payload` e `e2e_key_version` ja existem na tabela; o body pode ficar vazio.

## Retencao e garbage collection

Soft delete limpa o corpo, marca `deleted_at` e preenche `retention_until` conforme `CHAT_SOFT_DELETE_RETENTION_DAYS` (default 30 dias). Um job recorrente futuro pode apagar mensagens com `deleted_at is not null and retention_until < now()`. Attachments nao apagam midia diretamente; o GC do modulo de midia so remove blobs sem referencias ativas.

## Sharding por conversation_id

Gatilhos para revisitar:

- canal `chat.{userId}` com mais de 1.000 conexoes simultaneas por usuario corporativo;
- tabela `chat_messages` acima de centenas de milhoes de linhas;
- p95 de leitura de conversa acima de 150 ms.

Plano:

1. Particionar `chat_messages` por hash de `conversation_id`.
2. Manter indice local `(conversation_id, created_at desc, id desc)` em cada particao.
3. Distribuir workers de entrega por hash de `conversation_id` para preservar ordem por conversa.
4. Manter canal realtime por usuario para seguranca; sharding afeta storage/worker, nao contrato do cliente.
