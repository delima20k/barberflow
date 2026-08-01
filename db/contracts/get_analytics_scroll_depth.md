# Contrato: `analytics.get_analytics_scroll_depth`

**Migration:** `20260731000005_create_analytics_rpcs.sql`
**Acesso:** `authenticated`, após `analytics.is_analytics_admin()`
**Retorno:** tabela `(scroll_depth SMALLINT, total BIGINT)`.

Agrega exclusivamente os marcos permitidos 25, 50, 75 e 100 no período e
filtros recebidos.

Chamada Supabase: `client.schema('analytics').rpc('get_analytics_scroll_depth', params)`.
