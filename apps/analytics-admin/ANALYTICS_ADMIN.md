# Arquitetura do Analytics Admin

## Decisão arquitetural

O painel permanece separado como aplicação e deploy, mas reutiliza o mesmo
projeto Supabase, o mesmo Auth, a mesma URL e a publishable key do BarberFlow.
Os dados ficam exclusivamente no schema PostgreSQL `analytics`.

```text
Landing -> Edge Function collect-event -> analytics.collect_analytics_event
Admin   -> Supabase Auth compartilhado -> RPCs/tabelas RLS do schema analytics
```

Não existe segundo projeto Supabase. A landing não consulta tabelas nem RPCs:
ela envia apenas os eventos permitidos para `collect-event` quando
`analyticsEnabled` for explicitamente ativado.

## Segurança

- `analytics.analytics_admins.user_id` referencia `auth.users.id`.
- Login exige sessão válida, presença na allowlist e `active = true`.
- `anon` não recebe acesso ao schema nem às tabelas.
- Dashboard e funil usam RPCs guardadas por `analytics.is_analytics_admin()`.
- A leitura de eventos para o painel/Realtime possui RLS de administrador ativo.
- A Edge Function usa service role apenas no servidor e fixa o schema
  `analytics` no repositório.
- E-mail é aceito somente após submissão e persistido como HMAC; IP é persistido
  somente como hash HMAC.
- Origem, método, tamanho, allowlist, campos, rate limit e idempotência são
  validados antes da escrita.

## Eventos e sessões

O contrato existente é preservado: `landing_view`, `cta_click`,
`voucher_modal_opened`, `email_input_started`, `email_submitted`,
`voucher_generated`, marcos `scroll_*`, `session_started` e `session_ended`.
Eventos futuros de cadastro continuam preparados apenas para métricas.

O tracker mantém fila local limitada, idempotência, sessão de navegação, marcos
de scroll e encerramento por `pagehide`/inatividade. Nenhum conteúdo digitado é
capturado.

## Banco e RPCs

As migrations versionadas em `supabase/migrations/` criam o schema, tabelas,
índices, funções privadas, sete RPCs, RLS e retenção. Os agregados permanecem
permanentes; eventos e sessões têm retenção preparada para 90 e 180 dias.
Nenhum scheduler é ativado automaticamente.

O painel usa as RPCs `analytics.get_analytics_*` e o schema explícito no client.
O Realtime assina `analytics.analytics_events`.

## Configuração

Frontend público:

```text
ANALYTICS_ADMIN_MODE=supabase
ANALYTICS_ADMIN_PRODUCTION_URL=https://analistc.barberflow.live
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
ANALYTICS_COLLECTOR_URL=
```

Edge Function, somente no ambiente seguro:

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ANALYTICS_HMAC_SECRET=
ANALYTICS_ALLOWED_ORIGIN=https://barberflow.live
ANALYTICS_ENABLED=false
```

## Aplicação manual

1. Faça e valide um backup do banco compartilhado.
2. Revise as sete migrations e os comentários `-- rollback:`.
3. Execute `supabase db push --linked` somente após aprovação explícita.
4. Cadastre o UUID do administrador em `analytics.analytics_admins`.
5. Publique `supabase functions deploy collect-event --no-verify-jwt`.
6. Configure secrets no ambiente da função.
7. Valide Auth, RLS, RPCs, rate limit, idempotência e CORS.
8. Mantenha `ANALYTICS_ENABLED=false` até aprovação de ativação.

O rollback conservador está em `analytics/docs/rollback.sql`: ele revoga acessos
sem apagar dados. Remoção do schema exige backup validado e autorização separada.
