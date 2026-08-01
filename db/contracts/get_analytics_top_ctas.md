# Contrato: `analytics.get_analytics_top_ctas`

**Migration:** `20260731000005_create_analytics_rpcs.sql`
**Acesso:** `authenticated`, após `analytics.is_analytics_admin()`
**Retorno:** tabela `(cta_id TEXT, total BIGINT)`.

Agrega apenas eventos `cta_click` com `button_name` estável, retornado como
`cta_id`, dentro do período e dos filtros opcionais. Nenhum dado sensível é
incluído.

Chamada Supabase: `client.schema('analytics').rpc('get_analytics_top_ctas', params)`.
