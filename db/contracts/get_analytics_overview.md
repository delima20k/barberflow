# Contrato: `analytics.get_analytics_overview`

**Migration:** `20260731000005_create_analytics_rpcs.sql`
**Acesso:** `authenticated`, após `analytics.is_analytics_admin()`
**Retorno:** JSONB com `events`, `sessions` e `conversions`.

Recebe `p_start`, `p_end` e filtros opcionais `p_source`, `p_campaign` e
`p_device`. Consulta somente `analytics.analytics_events`; não retorna eventos
brutos nem dados pessoais.

Chamada Supabase: `client.schema('analytics').rpc('get_analytics_overview', params)`.
