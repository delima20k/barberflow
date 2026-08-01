# Contrato: `analytics.get_analytics_funnel`

**Migration:** `20260731000005_create_analytics_rpcs.sql`
**Acesso:** `authenticated`, após `analytics.is_analytics_admin()`
**Retorno:** tabela `(event_name TEXT, total BIGINT)`.

Agrega o funil no intervalo `p_start`/`p_end`, com filtros opcionais de source,
campaign e device. Consulta exclusivamente `analytics.analytics_events`.

Chamada Supabase: `client.schema('analytics').rpc('get_analytics_funnel', params)`.
