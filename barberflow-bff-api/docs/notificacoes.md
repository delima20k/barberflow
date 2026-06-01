# Centro Canonico de Notificacoes

## Decisao

Notificacoes ficam atras da BFF Canonica em um contexto proprio. A regra de negocio cria `Notification`, aplica `NotificationPreferences`, renderiza `NotificationTemplate` com i18n, roteia canais no `NotificationRouter` e enfileira a entrega em `notifications.high` ou `notifications.default`.

Providers sao adapters: `PushChannel` usa `PushProvider` (`WebPushProviderAdapter`, FCM/APNs futuros, sandbox em teste), enquanto `EmailChannel`, `InAppChannel` e `SmsChannel` dependem apenas de portas injetadas. Trocar provider nao altera dominio nem roteador.

## Matriz canal x evento

| Evento | Push | In-app | Email | SMS |
|---|---:|---:|---:|---:|
| Fila: cliente chegou | alta prioridade se profissional offline | online | nao default | emergencia |
| Agendamento confirmado/cancelado | default | sim | sim | opt-in |
| Chat offline | default | sim | nao | nao |
| Sistema/seguranca | high | sim | sim | opt-in |
| Marketing/digest | opt-in digest | sim | opt-in digest | nao |

## Filas e entrega

- `bf:queue:notifications.high`: alertas urgentes, quiet hours ignorado para `priority=high`.
- `bf:queue:notifications.default`: notificacoes comuns, digest e fallback de chat.
- Dedupe: `(user_id, template_id, dedupe_key)` com janela configuravel, default 15 minutos.
- Quiet hours: adia canais externos (`push`, `email`, `sms`) para notificacoes default.
- Digest: agrega por categoria/tipo antes da entrega quando a preferencia do usuario habilita.
- Tracking: `NotificationDeliveryTracked`, `NotificationDeliveryFailed`, `NotificationOpened`, `NotificationClicked`.
- Webhooks de feedback/bounce: falha permanente suprime endpoint e invalida push subscription; falha retryable volta para fila de retry.

## Taxa de entrega esperada

| Canal | Entrega esperada | Observacao |
|---|---:|---|
| In-app | 99%+ | depende do banco/realtime; sem provider externo |
| Web Push | 85-95% | perda por permission revogada, endpoint expirado e navegador fechado |
| Email | 95-98% | depende de reputacao e bounce management |
| SMS | 90-98% | maior custo; usar apenas opt-in e prioridade real |

## Custo estimado

Base de 10k notificacoes/dia:

- In-app: custo marginal de Postgres, baixo; retenha metadados compactos.
- Web Push: sem custo direto de envio; custo Redis/BullMQ + banda pequena.
- Email: ~US$1 a US$10 por 10k dependendo do provider.
- SMS: ~US$400 a US$800 por 10k no Brasil; usar com parcimonia.
- Redis: duas filas dedicadas reaproveitam infra existente; volume de 10k/dia fica abaixo de um worker simples.

## Retencao e GC

- `notification_events` e `notification_deliveries`: manter 90 dias para auditoria operacional.
- `notification_in_app`: manter 180 dias ou ate usuario limpar notificacoes.
- `notification_dedup`: limpar entradas acima da maior janela configurada + 24h.
- `notification_suppressions`: manter enquanto endpoint estiver ativo/invalido; remover somente se subscription for recriada.
