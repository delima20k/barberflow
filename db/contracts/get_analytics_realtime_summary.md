# Contrato: `analytics.get_analytics_realtime_summary`

**Migration:** `20260731000005_create_analytics_rpcs.sql`
**Acesso:** `authenticated`, após `analytics.is_analytics_admin()`
**Janela padrão:** últimos 15 minutos.

Retorna JSONB agregado com `events`, `sessions` e `conversions`. O painel não
recebe IP, HMAC, user-agent, metadata ou eventos brutos.

Chamada Supabase: `client.schema('analytics').rpc('get_analytics_realtime_summary', params)`.
