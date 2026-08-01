# Contrato: `analytics.get_analytics_sources`

**Migration:** `20260731000005_create_analytics_rpcs.sql`
**Acesso:** `authenticated`, após `analytics.is_analytics_admin()`
**Retorno:** tabela `(source TEXT, campaign TEXT, total BIGINT)`.

Agrupa source/campaign no período; valores sem source são apresentados como
`direct`. Consulta exclusivamente `analytics.analytics_events`.

Chamada Supabase: `client.schema('analytics').rpc('get_analytics_sources', params)`.
